
import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Razorpay from 'razorpay';
import Database from 'better-sqlite3';
import { catalog, byId } from './catalog.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '24kb' }));

const port = Number(process.env.PORT || 3001);
const keyId = process.env.RAZORPAY_KEY_ID;
const secret = process.env.RAZORPAY_KEY_SECRET;
const obsToken = process.env.OBS_ALERT_TOKEN;

if (!keyId || !secret || !obsToken || obsToken.length < 32) {
  throw new Error(
    'Set Razorpay keys and OBS_ALERT_TOKEN (32+ characters) in .env'
  );
}

const razorpay = new Razorpay({
  key_id: keyId,
  key_secret: secret
});

const db = new Database(
  process.env.DB_PATH || './pranav.sqlite'
);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    wallet_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    items_json TEXT NOT NULL,
    amount INTEGER NOT NULL,
    payment_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'created'
  );

  CREATE TABLE IF NOT EXISTS credits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_id TEXT NOT NULL,
    sound_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    credit_id INTEGER UNIQUE NOT NULL,
    sound_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    lease_until INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

const walletHash = token =>
  crypto.createHash('sha256').update(token).digest('hex');

const validWallet = token =>
  typeof token === 'string' &&
  /^[a-f0-9]{64}$/.test(token);

const safeCompare = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a.length === b.length &&
  crypto.timingSafeEqual(
    Buffer.from(a),
    Buffer.from(b)
  );

const error = (res, status, message) =>
  res.status(status).json({ error: message });

const here = path.dirname(fileURLToPath(import.meta.url));

app.use(
  '/sounds',
  express.static(
    path.resolve(here, '../public/sounds'),
    { fallthrough: false }
  )
);

app.get('/obs.html', (_req, res) => {
  res.sendFile(
    path.resolve(here, '../public/obs.html')
  );
});

// ===============================
// MEME SOUND CATALOG
// ===============================

const getSounds = () =>
  catalog.map(({ id, name, category, price, file }) => ({
    id,
    name,
    category,
    price,
    preview: `/sounds/${encodeURIComponent(file)}`
  }));

app.get('/api/sounds', (_req, res) => {
  res.json(getSounds());
});

// Frontend compatibility route
app.get('/api/catalog', (_req, res) => {
  res.json(getSounds());
});

// ===============================
// WALLET
// ===============================

app.post('/api/wallet', (_req, res) => {
  const token = crypto.randomBytes(32).toString('hex');

  db.prepare(
    'INSERT INTO wallets(id) VALUES(?)'
  ).run(walletHash(token));

  res.json({ token });
});

function requireWallet(req, res, next) {
  const token =
    req.get('x-wallet-token') ||
    req.body?.walletToken;

  if (!validWallet(token)) {
    return error(res, 401, 'Wallet token required');
  }

  const id = walletHash(token);

  const wallet = db.prepare(
    'SELECT 1 FROM wallets WHERE id=?'
  ).get(id);

  if (!wallet) {
    return error(res, 401, 'Unknown wallet');
  }

  req.walletId = id;
  next();
}

// ===============================
// RAZORPAY CREATE ORDER
// ===============================

app.post(
  '/api/create-order',
  requireWallet,
  async (req, res) => {
    try {
      const { items, amount } = req.body || {};

      let kind;
      let lines;
      let total;

      if (Array.isArray(items)) {
        if (!items.length || items.length > 40) {
          return error(
            res,
            400,
            'Cart must contain 1–40 items'
          );
        }

        lines = items.map(item => ({
          soundId: item.soundId,
          quantity: item.quantity
        }));

        if (
          lines.some(
            item =>
              !byId[item.soundId] ||
              !Number.isInteger(item.quantity) ||
              item.quantity < 1 ||
              item.quantity > 20
          )
        ) {
          return error(res, 400, 'Invalid cart item');
        }

        total = lines.reduce(
          (sum, item) =>
            sum +
            byId[item.soundId].price *
              item.quantity *
              100,
          0
        );

        kind = 'cart';
      } else {
        if (
          !Number.isSafeInteger(amount) ||
          amount < 100 ||
          amount > 10000000
        ) {
          return error(res, 400, 'Invalid tip amount');
        }

        total = amount;
        lines = [];
        kind = 'tip';
      }

      const order = await razorpay.orders.create({
        amount: total,
        currency: 'INR',
        receipt: crypto.randomUUID().slice(0, 36)
      });

      db.prepare(`
        INSERT INTO orders(
          id, wallet_id, kind, items_json, amount
        )
        VALUES(?,?,?,?,?)
      `).run(
        order.id,
        req.walletId,
        kind,
        JSON.stringify(lines),
        total
      );

      res.json({
        keyId,
        orderId: order.id,
        amount: total,
        currency: 'INR'
      });
    } catch (e) {
      console.error('order', e);

      error(
        res,
        502,
        'Unable to create order. Check Razorpay amount limits.'
      );
    }
  }
);

// ===============================
// PAYMENT VERIFICATION
// ===============================

async function settle(orderId, paymentId, signature) {
  const order = db.prepare(
    'SELECT * FROM orders WHERE id=?'
  ).get(orderId);

  if (!order) {
    throw new Error('Unknown order');
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  if (!safeCompare(signature, expected)) {
    throw new Error('Invalid payment signature');
  }

  const payment = await razorpay.payments.fetch(paymentId);

  if (
    payment.order_id !== orderId ||
    payment.currency !== 'INR' ||
    Number(payment.amount) !== order.amount ||
    payment.status !== 'captured'
  ) {
    throw new Error(
      'Payment not captured or amount mismatch'
    );
  }

  db.transaction(() => {
    const current = db.prepare(
      'SELECT * FROM orders WHERE id=?'
    ).get(orderId);

    if (current.status === 'paid') {
      if (current.payment_id !== paymentId) {
        throw new Error('Payment conflict');
      }
      return;
    }

    const existing = db.prepare(
      'SELECT id FROM orders WHERE payment_id=?'
    ).get(paymentId);

    if (existing) {
      throw new Error('Payment already used');
    }

    db.prepare(`
      UPDATE orders
      SET status='paid', payment_id=?
      WHERE id=?
    `).run(paymentId, orderId);

    for (const item of JSON.parse(current.items_json)) {
      for (let j = 0; j < item.quantity; j++) {
        const result = db.prepare(`
          INSERT INTO credits(
            wallet_id, sound_id, order_id, status
          )
          VALUES(?,?,?,?)
        `).run(
          current.wallet_id,
          item.soundId,
          current.id,
          'queued'
        );

        db.prepare(`
          INSERT INTO alerts(credit_id, sound_id)
          VALUES(?,?)
        `).run(
          result.lastInsertRowid,
          item.soundId
        );
      }
    }
  })();

  return order;
}

app.post(
  '/api/verify-payment',
  requireWallet,
  async (req, res) => {
    try {
      const {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
      } = req.body || {};

      if (
        ![orderId, paymentId, signature].every(
          value =>
            typeof value === 'string' &&
            value.length > 0 &&
            value.length < 256
        )
      ) {
        return error(res, 400, 'Invalid payment data');
      }

      const order = db.prepare(
        'SELECT wallet_id FROM orders WHERE id=?'
      ).get(orderId);

      if (!order || order.wallet_id !== req.walletId) {
        return error(
          res,
          403,
          'Order does not belong to wallet'
        );
      }

      await settle(orderId, paymentId, signature);

      res.json({ success: true });
    } catch (e) {
      console.error('verify', e);

      error(
        res,
        409,
        e.message || 'Payment verification failed'
      );
    }
  }
);

// ===============================
// OBS AUTHENTICATION
// ===============================

function obsAuth(req, res, next) {
  const token =
    req.get('x-obs-token') ||
    req.query.token;

  if (!safeCompare(token, obsToken)) {
    return error(res, 401, 'Unauthorized');
  }

  next();
}

// ===============================
// OBS NEXT SOUND
// ===============================

app.get('/api/obs/next', obsAuth, (_req, res) => {
  const row = db.transaction(() => {
    const next = db.prepare(`
      SELECT id, sound_id
      FROM alerts
      WHERE status='pending'
         OR (
           status='leased'
           AND lease_until < unixepoch()
           AND attempts < 5
         )
      ORDER BY id
      LIMIT 1
    `).get();

    if (next) {
      db.prepare(`
        UPDATE alerts
        SET
          status='leased',
          lease_until=unixepoch()+35,
          attempts=attempts+1
        WHERE id=?
      `).run(next.id);
    }

    return next;
  })();

  res.json({
    alert: row
      ? {
          id: row.id,
          name: byId[row.sound_id].name,
          file: `/sounds/${encodeURIComponent(
            byId[row.sound_id].file
          )}`
        }
      : null
  });
});

// ===============================
// OBS ALERT ACKNOWLEDGEMENT
// ===============================

app.post('/api/obs/ack', obsAuth, (req, res) => {
  const id = req.body?.id;

  if (!Number.isSafeInteger(id)) {
    return error(res, 400, 'Invalid alert');
  }

  const updated = db.prepare(`
    UPDATE alerts
    SET status='played'
    WHERE id=? AND status='leased'
  `).run(id);

  res.json({
    success: updated.changes > 0
  });
});

// ===============================
// START SERVER
// ===============================


// LOCAL OBS SOUND TEST - NO PAYMENT
app.post("/api/test-sound", (req, res) => {
  try {
    const sound = Object.values(byId)[0];

    if (!sound) {
      return res.status(404).json({
        error: "No sounds found"
      });
    }

    const result = db.transaction(() => {
      const orderId = `test-${crypto.randomUUID()}`;
      const walletId = `test-${crypto.randomUUID()}`;

      db.prepare(`
        INSERT INTO orders
        (id, wallet_id, kind, items_json, amount, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        orderId,
        walletId,
        "test",
        JSON.stringify([sound.id]),
        0,
        "test"
      );

      const credit = db.prepare(`
        INSERT INTO credits
        (wallet_id, sound_id, order_id, status)
        VALUES (?, ?, ?, 'used')
      `).run(walletId, sound.id, orderId);

      const alert = db.prepare(`
        INSERT INTO alerts (credit_id, sound_id, status)
        VALUES (?, ?, 'pending')
      `).run(Number(credit.lastInsertRowid), sound.id);

      return Number(alert.lastInsertRowid);
    })();

    res.json({
      success: true,
      alertId: result,
      sound: sound.name
    });

  } catch (err) {
    console.error("Sound test error:", err);
    res.status(500).json({
      error: "Sound test failed"
    });
  }
});

app.listen(port, () => {
  console.log(
    `PRANAV backend: http://localhost:${port}`
  );
});

