
import { useState } from "react";
import "./App.css";

const currencies = {
  IN: {
    country: "India",
    currency: "INR",
    symbol: "₹",
    locale: "en-IN",
    amounts: [5, 10, 20, 50, 100, 300, 500, 1000],
  },
  US: {
    country: "United States",
    currency: "USD",
    symbol: "$",
    locale: "en-US",
    amounts: [1, 2, 5, 10, 20, 50, 100, 200],
  },
  PH: {
    country: "Philippines",
    currency: "PHP",
    symbol: "₱",
    locale: "en-PH",
    amounts: [20, 50, 100, 200, 500, 1000, 2000, 5000],
  },
  JP: {
    country: "Japan",
    currency: "JPY",
    symbol: "¥",
    locale: "ja-JP",
    amounts: [100, 300, 500, 1000, 2000, 5000, 10000, 20000],
  },
  CN: {
    country: "China",
    currency: "CNY",
    symbol: "¥",
    locale: "zh-CN",
    amounts: [5, 10, 20, 50, 100, 200, 500, 1000],
  },
};

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function App() {
  const [country, setCountry] = useState("IN");
  const [amount, setAmount] = useState(20);
  const [custom, setCustom] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  const selectedCurrency = currencies[country];
  const symbol = selectedCurrency.symbol;
  const amounts = selectedCurrency.amounts;

  const finalAmount =
    amount === "custom" ? Number(custom) : amount;

  const valid =
    amount === "custom"
      ? custom.trim() !== "" &&
        Number.isSafeInteger(finalAmount) &&
        finalAmount > 500 &&
        finalAmount <= 100000
      : true;

  function formatAmount(value) {
    return new Intl.NumberFormat(selectedCurrency.locale, {
      style: "currency",
      currency: selectedCurrency.currency,
      maximumFractionDigits: 0,
    }).format(value);
  }

  function changeCountry(newCountry) {
    setCountry(newCountry);
    setAmount(currencies[newCountry].amounts[2]);
    setCustom("");
    setConsent(false);
    setPaymentError("");
  }

  async function handleContinue() {
    if (!valid || !consent || paymentLoading) return;

    setPaymentError("");

    if (country !== "IN") {
      setPaymentError(
        "International payments are not enabled yet. Please select India for now."
      );
      return;
    }

    setPaymentLoading(true);

    try {
      const scriptLoaded = await loadRazorpayScript();

      if (!scriptLoaded) {
        throw new Error("Unable to load Razorpay Checkout. Please try again.");
      }

      // Create a payment order on the secure server.
      const orderResponse = await fetch("/api/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: Math.round(finalAmount * 100),
          currency: "INR",
        }),
      });

      const orderData = await orderResponse.json();

      if (!orderResponse.ok) {
        throw new Error(orderData.error || "Could not create payment order.");
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "PRANAV",
        description: "Creator support tip",
        order_id: orderData.orderId,
        theme: {
          color: "#19c9ed",
        },

        handler: async function (response) {
          try {
            const verifyResponse = await fetch("/api/verify-payment", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(response),
            });

            const verifyData = await verifyResponse.json();

            if (!verifyResponse.ok || !verifyData.success) {
              throw new Error(
                verifyData.error || "Payment verification failed."
              );
            }

            setPaymentLoading(false);
            setSubmitted(true);
            window.scrollTo({ top: 0, behavior: "smooth" });
          } catch (error) {
            setPaymentLoading(false);
            setPaymentError(
              error.message || "Payment verification failed. Contact support before trying again."
            );
          }
        },

        modal: {
          ondismiss: function () {
            setPaymentLoading(false);
          },
        },
      };

      const checkout = new window.Razorpay(options);

      checkout.on("payment.failed", function (response) {
        setPaymentLoading(false);
        setPaymentError(
          response.error?.description || "Payment failed. Please try again."
        );
      });

      checkout.open();
    } catch (error) {
      setPaymentLoading(false);
      setPaymentError(
        error.message || "Something went wrong. Please try again."
      );
    }
  }

  function resetPage() {
    setSubmitted(false);
    setConsent(false);
    setShowPrivacy(false);
    setPaymentError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="page">
      <div className="scene scene-one" />
      <div className="scene scene-two" />
      <div className="ice-particles" />

      <section className="tip-card">
        {submitted ? (
          <div className="thank-you">
            <div className="avatar-ring">
              <img
                src="/pranav-pfp.jpeg"
                alt="Pranav's cat"
                className="profile-pic"
              />
            </div>

            <div className="creator-tag">✦ PRANAV ✦</div>

            <div className="success-icon">♡</div>

            <h1>YOU'RE AMAZING!</h1>

            <p className="subtitle">
              Thank you for supporting my journey.
              Your love means everything! 💙
            </p>

            <div className="thank-amount">
              {formatAmount(finalAmount)}
            </div>

            <div className="thank-message">
              {name && <strong>Thank you, {name}! 🥹</strong>}
              <p>{message || "Sending you lots of love!"}</p>
            </div>

            <p className="demo-note">
              Your payment signature has been verified.
            </p>

            <button
              type="button"
              className="support-button"
              onClick={resetPage}
            >
              Back to Tip Page
            </button>

            <p className="footer">
              Made with <span>♡</span> by <strong>PRANAV</strong>
            </p>
          </div>
        ) : (
          <>
            <header className="profile-section">
              <div className="avatar-ring">
                <img
                  src="/pranav-pfp.jpeg"
                  alt="Pranav's cat"
                  className="profile-pic"
                />
              </div>

              <div className="creator-tag">
                ✦ CREATOR SUPPORT ✦
              </div>

              <h1>
                HEY, I'M <span>PRANAV</span>
              </h1>

              <p className="subtitle">
                Enjoying my content? Support my journey!
                <br />
                Every little tip means a lot. ♡
              </p>
            </header>

            <div className="section-divider">
              <span>✦</span>
            </div>

            <h2>🌍 Choose your country</h2>

            <select
              className="field country-select"
              value={country}
              onChange={(e) => changeCountry(e.target.value)}
            >
              <option value="IN">🇮🇳 India — INR (₹)</option>
              <option value="US">🇺🇸 USA — USD ($)</option>
              <option value="PH">🇵🇭 Philippines — PHP (₱)</option>
              <option value="JP">🇯🇵 Japan — JPY (¥)</option>
              <option value="CN">🇨🇳 China — CNY (¥)</option>
            </select>

            <p className="helper">
              Select your country to see its currency.
            </p>

            <div className="section-divider">
              <span>✦</span>
            </div>

            <h2>♡ Choose your support</h2>

            <p className="helper">
              Pick an amount to send some love 💙
            </p>

            <div className="amount-grid">
              {amounts.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`amount-button ${
                    amount === value ? "active" : ""
                  }`}
                  onClick={() => {
                    setAmount(value);
                    setCustom("");
                    setPaymentError("");
                  }}
                >
                  {formatAmount(value)}

                  {value === amounts[6] && (
                    <span className="popular">POPULAR</span>
                  )}
                </button>
              ))}
            </div>

            <button
              type="button"
              className={`custom-button ${
                amount === "custom" ? "active" : ""
              }`}
              onClick={() => {
                setAmount("custom");
                setCustom("");
                setPaymentError("");
              }}
            >
              ＋ Choose a custom amount
            </button>

            {amount === "custom" && (
              <div className="custom-section">
                <label htmlFor="customAmount">
                  CUSTOM AMOUNT ({selectedCurrency.currency})
                </label>

                <div className="custom-wrapper">
                  <span>{symbol}</span>

                  <input
                    id="customAmount"
                    type="number"
                    min="501"
                    max="100000"
                    step="1"
                    placeholder={`Enter amount above ${symbol}500`}
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                  />
                </div>

                <p className="custom-hint">
                  Minimum: {symbol}501
                </p>

                {custom !== "" && !valid && (
                  <p className="error">
                    Enter a whole amount above {symbol}500 and no more than {symbol}100000.
                  </p>
                )}
              </div>
            )}

            <h2 className="message-heading">
              ♡ Leave a little message
            </h2>

            <div className="field-heading">
              <label htmlFor="supporterName">
                YOUR NAME (OPTIONAL)
              </label>
              <span>{name.length}/50</span>
            </div>

            <input
              id="supporterName"
              className="field"
              type="text"
              placeholder="Leave blank to stay anonymous"
              maxLength={50}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div className="field-heading">
              <label htmlFor="supportMessage">
                MESSAGE (OPTIONAL)
              </label>
              <span>{message.length}/100</span>
            </div>

            <textarea
              id="supportMessage"
              className="field message-field"
              placeholder="Write something nice..."
              maxLength={100}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />

            <label className="consent-box">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />

              <span>
                I consent to the processing of my name,
                message, and transaction details to process
                this tip and display stream alerts, as per the{" "}
                <button
                  type="button"
                  className="privacy-link"
                  onClick={() => setShowPrivacy(!showPrivacy)}
                >
                  Privacy Policy
                </button>.
              </span>
            </label>

            {showPrivacy && (
              <div className="privacy-panel">
                <button
                  className="close-privacy"
                  type="button"
                  onClick={() => setShowPrivacy(false)}
                  aria-label="Close privacy policy"
                >
                  ×
                </button>

                <h3>Privacy Policy</h3>

                <p>
                  Your name and message are optional.
                  If you make a real payment, transaction
                  details will be processed to complete
                  and verify the payment.
                </p>

                <p>
                  Your name and message may be displayed
                  in stream alerts only with your consent.
                </p>

                <p>
                  A complete privacy policy explaining
                  data collection, retention, sharing and
                  contact details must be published before
                  real payments are enabled.
                </p>
              </div>
            )}

            <p className="tip-hint">
              ❄ Your support keeps me motivated!
            </p>

            {country !== "IN" && (
              <p className="helper">
                International payments are not enabled yet.
                Please select India for the current test.
              </p>
            )}

            {paymentError && (
              <p className="error" role="alert">
                {paymentError}
              </p>
            )}

            <button
              type="button"
              className="support-button"
              disabled={
                !valid ||
                !consent ||
                paymentLoading ||
                country !== "IN"
              }
              onClick={handleContinue}
            >
              {paymentLoading
                ? "Opening secure checkout..."
                : `♡ Continue with ${formatAmount(finalAmount)}`}
            </button>

            <div className="footer-security">
              <span>
                ♡ Secure checkout powered by Razorpay
              </span>
            </div>

            <p className="footer">
              Made with <span>♡</span> by{" "}
              <strong>PRANAV</strong>
            </p>
          </>
        )}
      </section>
    </main>
  );
}
