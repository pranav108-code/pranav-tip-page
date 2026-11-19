# PRANAV original tipping page + 20-sound meme shop (Pay Now)

This MERGES your uploaded App(1).jsx and App(1).css with the sound shop, preserving your original tipping form, INR-only amounts, avatar, background, and cyan theme. The cart has no save-for-later or sound credits UI. This is a LOCAL TEST STARTER, NOT PRODUCTION READY.

## Install
1. Back up MYTIPPAGE. Copy src/App.jsx and src/App.css, server/, public/obs.html, and public/sounds/ into your existing Vite React project. Keep existing public/gaming-bg.png and public/pranav-pfp.jpeg, src/main.jsx, and index.html.
2. `npm install express razorpay better-sqlite3 dotenv` and ensure package.json has `"type":"module"`.
3. Copy `.env.example` to `.env` and set Razorpay TEST keys and OBS_ALERT_TOKEN of at least 32 characters. Do not commit .env.
4. In vite.config.js add server proxy: `server: { proxy: { '/api': 'http://localhost:3001' } }` inside defineConfig.
5. Terminal 1: `node server/index.js`. Terminal 2: `npm run dev`.
6. OBS browser source: `http://localhost:3001/obs.html?token=YOUR_OBS_ALERT_TOKEN`, 800x250, Control audio via OBS enabled. Never share token.
7. Use Razorpay test mode. Verify payment and OBS sound playback end to end.

## Notes
- The backend retains an internal anonymous session token to bind orders to verification. It is not a purchased-sound wallet and there is no later redemption.
- Cart prices are computed on the server. Checkout callback must successfully verify before sounds queue. Interrupted checkout needs webhook reconciliation before real payments.
- The backend stores alerts in local SQLite. It cannot run unchanged on Vercel serverless; deploy the Node backend on a persistent service and configure HTTPS/reverse proxy or frontend API base URLs before launch.
- This version does not yet enforce OBS online status; do not accept payments when offline. Add a creator stream-enable switch and durable webhooks before going live.
- Razorpay may reject very small transactions; check account minimums, and test ₹2/₹5 cart checkouts.
- Name and message in the original tipping form are not currently persisted to server or OBS.
- Ensure you have permission to use and monetize each sound clip. Add complete privacy/terms pages before public launch.
