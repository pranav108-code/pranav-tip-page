
import Razorpay from "razorpay";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { amount, currency = "INR" } = req.body || {};

    if (currency !== "INR") {
      return res.status(400).json({
        error: "Only INR payments are enabled right now.",
      });
    }

    if (
      !Number.isInteger(amount) ||
      amount < 100 ||
      amount > 10000000
    ) {
      return res.status(400).json({
        error: "Invalid payment amount.",
      });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return res.status(500).json({
        error: "Payment configuration is missing.",
      });
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `tip_${Date.now()}`,
    });

    return res.status(200).json({
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error("Razorpay order error:", error);

    return res.status(500).json({
      error: "Unable to create payment order.",
    });
  }
}
