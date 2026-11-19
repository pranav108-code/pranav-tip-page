

import { useEffect, useRef, useState } from "react";

import "./App.css";



const currencies = {

  IN: {

    country: "India",

    currency: "INR",

    symbol: "₹",

    locale: "en-IN",

    amounts: [5, 10, 20, 50, 100, 300, 500, 1000],

  },

};



const CATEGORIES = [

  "Japanese & Anime",

  "Valorant",

  "Special Voices",

];



const CATEGORY_ICONS = {

  "Japanese & Anime": "🇯🇵",

  Valorant: "🎯",

  "Special Voices": "🎤",

};



function loadRazorpayScript() {

  return new Promise((resolve) => {

    if (window.Razorpay) {

      resolve(true);

      return;

    }



    const existing = document.querySelector(

      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'

    );



    if (existing) {

      existing.addEventListener(

        "load",

        () => resolve(true),

        { once: true }

      );

      existing.addEventListener(

        "error",

        () => resolve(false),

        { once: true }

      );

      return;

    }



    const script = document.createElement("script");

    script.src =

      "https://checkout.razorpay.com/v1/checkout.js";



    script.onload = () => resolve(true);

    script.onerror = () => resolve(false);



    document.body.appendChild(script);

  });

}



// Requests go through the Vite proxy.

async function apiRequest(url, options = {}) {

  const response = await fetch(url, options);



  const contentType =

    response.headers.get("content-type") || "";



  if (!contentType.includes("application/json")) {

    throw new Error(

      `API returned an unexpected response (${response.status}). Check the backend and Vite proxy.`

    );

  }



  const data = await response.json();



  if (!response.ok) {

    throw new Error(

      data.error || `Server error: ${response.status}`

    );

  }



  return data;

}



export default function App() {

  const country = "IN";

  const selectedCurrency = currencies[country];

  const symbol = selectedCurrency.symbol;

  const amounts = selectedCurrency.amounts;



  const [sounds, setSounds] = useState([]);

  const [cart, setCart] = useState({});

  const [category, setCategory] = useState("All");



  const [shopError, setShopError] = useState("");

  const [shopNotice, setShopNotice] = useState("");

  const [walletToken, setWalletToken] = useState("");



  const previewAudioRef = useRef(null);

  const walletPromiseRef = useRef(null);



  const [amount, setAmount] = useState(20);

  const [custom, setCustom] = useState("");

  const [name, setName] = useState("");

  const [message, setMessage] = useState("");



  const [consent, setConsent] = useState(false);

  const [submitted, setSubmitted] = useState(false);

  const [showPrivacy, setShowPrivacy] = useState(false);



  const [paymentLoading, setPaymentLoading] =

    useState(false);

  const [paymentError, setPaymentError] = useState("");



  useEffect(() => {

    let active = true;



    apiRequest("/api/sounds")

      .then((data) => {

        if (active) {

          setSounds(

            Array.isArray(data)

              ? data

              : Array.isArray(data.sounds)

                ? data.sounds

                : []

          );

        }

      })

      .catch((error) => {

        if (active) {

          setShopError(error.message);

        }

      });



    return () => {

      active = false;

    };

  }, []);



  useEffect(() => {

    return () => {

      previewAudioRef.current?.pause();

    };

  }, []);



  const cartItems = Object.entries(cart)

    .filter(([, quantity]) => quantity > 0)

    .map(([soundId, quantity]) => ({

      soundId,

      quantity,

    }));



  const cartCount = cartItems.reduce(

    (sum, item) => sum + item.quantity,

    0

  );



  const cartTotal = cartItems.reduce((sum, item) => {

    const sound = sounds.find(

      (s) => String(s.id) === item.soundId

    );



    return (

      sum + (Number(sound?.price) || 0) * item.quantity

    );

  }, 0);



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

    return new Intl.NumberFormat(

      selectedCurrency.locale,

      {

        style: "currency",

        currency: selectedCurrency.currency,

        maximumFractionDigits: 0,

      }

    ).format(value);

  }



  async function getWallet() {

    if (walletToken) return walletToken;



    if (!walletPromiseRef.current) {

      walletPromiseRef.current = apiRequest(

        "/api/wallet",

        { method: "POST" }

      )

        .then((result) => {

          if (!result.token) {

            throw new Error(

              "Wallet token was not returned."

            );

          }



          setWalletToken(result.token);

          return result.token;

        })

        .finally(() => {

          walletPromiseRef.current = null;

        });

    }



    return walletPromiseRef.current;

  }



  function updateCart(soundId, difference) {

    setCart((previous) => ({

      ...previous,

      [soundId]: Math.max(

        0,

        Math.min(

          20,

          (previous[soundId] || 0) + difference

        )

      ),

    }));

  }



  function preview(sound) {

    setShopError("");



    if (previewAudioRef.current) {

      previewAudioRef.current.pause();

      previewAudioRef.current.currentTime = 0;

    }



    if (!sound.preview) {

      setShopError(

        "Preview is unavailable for this sound."

      );

      return;

    }



    const audio = new Audio(sound.preview);

    audio.volume = 0.5;

    previewAudioRef.current = audio;



    audio.play().catch(() => {

      setShopError(

        "Unable to preview this sound."

      );

    });

  }



  async function checkoutCart() {

    if (!cartItems.length || paymentLoading) return;



    if (!consent) {

      setShopError(

        "Accept the privacy and payment notice first."

      );

      return;

    }



    setPaymentLoading(true);

    setShopError("");

    setShopNotice("");



    try {

      const token = await getWallet();



      const headers = {

        "Content-Type": "application/json",

        "x-wallet-token": token,

      };



      const loaded = await loadRazorpayScript();



      if (!loaded) {

        throw new Error(

          "Unable to load Razorpay Checkout."

        );

      }



      const order = await apiRequest(

        "/api/create-order",

        {

          method: "POST",

          headers,

          body: JSON.stringify({

            items: cartItems,

          }),

        }

      );



      if (

        !order.keyId ||

        !order.orderId ||

        !order.amount

      ) {

        throw new Error(

          "Invalid payment order returned by server."

        );

      }



      const checkout = new window.Razorpay({

        key: order.keyId,

        order_id: order.orderId,

        amount: order.amount,

        currency: order.currency || "INR",

        name: "PRANAV",

        description: "Meme sound alerts",

        theme: {

          color: "#00d9f5",

        },



        handler: async (payment) => {

          try {

            const result = await apiRequest(

              "/api/verify-payment",

              {

                method: "POST",

                headers,

                body: JSON.stringify(payment),

              }

            );



            if (result.success !== true) {

              throw new Error(

                "Payment verification failed."

              );

            }



            setCart({});

            setShopNotice(

              "Payment verified! Sounds queued for OBS playback."

            );

          } catch (error) {

            setShopError(

              error.message +

                " If charged, contact the creator before paying again."

            );

          } finally {

            setPaymentLoading(false);

          }

        },



        modal: {

          ondismiss: () => {

            setPaymentLoading(false);

          },

        },

      });



      checkout.on("payment.failed", (event) => {

        setShopError(

          event.error?.description ||

            "Payment failed."

        );

        setPaymentLoading(false);

      });



      checkout.open();

    } catch (error) {

      setShopError(error.message);

      setPaymentLoading(false);

    }

  }



  async function handleContinue() {

    if (!valid || !consent || paymentLoading) {

      return;

    }



    setPaymentError("");

    setPaymentLoading(true);



    try {

      const loaded = await loadRazorpayScript();



      if (!loaded) {

        throw new Error(

          "Unable to load Razorpay Checkout."

        );

      }



      const token = await getWallet();



      const headers = {

        "Content-Type": "application/json",

        "x-wallet-token": token,

      };



      const orderData = await apiRequest(

        "/api/create-order",

        {

          method: "POST",

          headers,

          body: JSON.stringify({

            amount: Math.round(finalAmount * 100),

            currency: "INR",

          }),

        }

      );



      if (

        !orderData.keyId ||

        !orderData.orderId ||

        !orderData.amount

      ) {

        throw new Error(

          "Invalid payment order returned by server."

        );

      }



      const checkout = new window.Razorpay({

        key: orderData.keyId,

        amount: orderData.amount,

        currency: orderData.currency || "INR",

        name: "PRANAV",

        description: "Creator support tip",

        order_id: orderData.orderId,



        theme: {

          color: "#19c9ed",

        },



        handler: async (response) => {

          try {

            const verifyData = await apiRequest(

              "/api/verify-payment",

              {

                method: "POST",

                headers,

                body: JSON.stringify(response),

              }

            );



            if (verifyData.success !== true) {

              throw new Error(

                "Payment verification failed."

              );

            }



            setSubmitted(true);

            window.scrollTo({

              top: 0,

              behavior: "smooth",

            });

          } catch (error) {

            setPaymentError(

              error.message +

                " If charged, contact support before paying again."

            );

          } finally {

            setPaymentLoading(false);

          }

        },



        modal: {

          ondismiss: () => {

            setPaymentLoading(false);

          },

        },

      });



      checkout.on("payment.failed", (response) => {

        setPaymentError(

          response.error?.description ||

            "Payment failed. Please try again."

        );

        setPaymentLoading(false);

      });



      checkout.open();

    } catch (error) {

      setPaymentError(

        error.message ||

          "Something went wrong. Please try again."

      );

      setPaymentLoading(false);

    }

  }



  function resetPage() {

    setSubmitted(false);

    setConsent(false);

    setShowPrivacy(false);

    setPaymentError("");



    window.scrollTo({

      top: 0,

      behavior: "smooth",

    });

  }



  return (

    <main className="page">

      <div className="scene scene-one" />

      <div className="scene scene-two" />

      <div className="ice-particles" />



      <section

        className="meme-shop"

        aria-label="Meme sound shop"

      >

        <div className="meme-heading">

          <div className="creator-tag">

            ✦ LIVE STREAM ALERTS ✦

          </div>



          <h2>🔊 PRANAV MEME SOUND SHOP</h2>



          <p className="helper">

            Preview sounds, add to cart, and pay once.

            Verified purchases play in OBS.

          </p>

        </div>



        <nav

          className="meme-tabs"

          aria-label="Sound categories"

        >

          {["All", ...CATEGORIES].map((c) => (

            <button

              type="button"

              key={c}

              className={

                category === c ? "selected" : ""

              }

              onClick={() => setCategory(c)}

            >

              {c === "All"

                ? "All Sounds"

                : `${CATEGORY_ICONS[c]} ${c}`}

            </button>

          ))}

        </nav>



        {CATEGORIES.filter(

          (c) => category === "All" || c === category

        ).map((c) => (

          <div className="meme-category" key={c}>

            <h3>

              {CATEGORY_ICONS[c]} {c}

            </h3>



            <div className="meme-grid">

              {sounds

                .filter((s) => s.category === c)

                .map((sound) => (

                  <article

                    className="meme-item"

                    key={sound.id}

                  >

                    <strong>{sound.name}</strong>



                    <div className="meme-item-bottom">

                      <span className="meme-price">

                        ₹{sound.price}

                      </span>



                      <button

                        type="button"

                        onClick={() => preview(sound)}

                        aria-label={`Preview ${sound.name}`}

                      >

                        ▶ Preview

                      </button>



                      <button

                        type="button"

                        onClick={() =>

                          updateCart(sound.id, 1)

                        }

                        disabled={

                          (cart[sound.id] || 0) >= 20

                        }

                      >

                        ＋ Add

                      </button>

                    </div>

                  </article>

                ))}

            </div>

          </div>

        ))}



        <div className="meme-cart">

          <h3>🛒 Your Cart ({cartCount})</h3>



          {cartItems.length === 0 && (

            <p className="helper">

              Choose a sound above to add it to your cart.

            </p>

          )}



          {cartItems.map((item) => {

            const sound = sounds.find(

              (s) =>

                String(s.id) === item.soundId

            );



            if (!sound) return null;



            return (

              <div

                className="meme-cart-row"

                key={item.soundId}

              >

                <span>

                  {sound.name} · ₹{sound.price}

                </span>



                <div className="meme-qty">

                  <button

                    type="button"

                    onClick={() =>

                      updateCart(sound.id, -1)

                    }

                  >

                    −

                  </button>



                  <span>{item.quantity}</span>



                  <button

                    type="button"

                    onClick={() =>

                      updateCart(sound.id, 1)

                    }

                    disabled={item.quantity >= 20}

                  >

                    +

                  </button>

                </div>

              </div>

            );

          })}



          <div className="meme-cart-total">

            <strong>Total</strong>

            <strong>₹{cartTotal}</strong>

          </div>



          <p className="helper">

            Pay Now only · No saved sounds · Sounds

            play in order after verified payment.

          </p>

<p style={{
  color: "#00e5ff",
  textAlign: "center",
  fontWeight: "bold",
  marginTop: "12px",
  fontSize: "15px"
}}>
  👇 Please scroll down, tick the Privacy Consent checkbox,
  and then click Pay Now of this box to complete your payment.(come back here after ticking consent checkbox)
</p>



          <button

            type="button"

            className="support-button"

            onClick={checkoutCart}

            disabled={

              !cartCount ||

              !consent ||

              paymentLoading

            }

          >

            {paymentLoading

              ? "Processing…"

              : `🛒 Pay Now · ₹${cartTotal}`}

          </button>



          {!consent && (

            <p className="helper">

              Tick the privacy consent checkbox

              in the support form above to enable

              checkout.

            </p>

          )}



          {shopError && (

            <p className="error" role="alert">

              {shopError}

            </p>

          )}



          {shopNotice && (

            <p

              className="meme-notice"

              role="status"

            >

              {shopNotice}

            </p>

          )}

        </div>

      </section>

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



            <div className="creator-tag">

              ✦ PRANAV ✦

            </div>



            <div className="success-icon">♡</div>



            <h1>YOU'RE AMAZING!</h1>



            <p className="subtitle">

              Thank you for supporting my journey.

              <br />

              Your love means everything! 💙

            </p>



            <div className="thank-amount">

              {formatAmount(finalAmount)}

            </div>



            <div className="thank-message">

              {name && (

                <strong>

                  Thank you, {name}! 🥹

                </strong>

              )}



              <p>

                {message ||

                  "Sending you lots of love!"}

              </p>

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

              Made with <span>♡</span> by{" "}

              <strong>PRANAV</strong>

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



            <h2>🇮🇳 Supported Country</h2>



            <div className="field country-display">

              🇮🇳 India — INR (₹)

            </div>



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



                  {value === amounts[3] && (

                    <span className="popular">

                      POPULAR

                    </span>

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

                  CUSTOM AMOUNT (

                  {selectedCurrency.currency})

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

                    onChange={(e) =>

                      setCustom(e.target.value)

                    }

                  />

                </div>



                <p className="custom-hint">

                  Minimum: {symbol}501

                </p>



                {custom !== "" && !valid && (

                  <p className="error">

                    Enter a whole amount above{" "}

                    {symbol}500 and no more than{" "}

                    {symbol}100000.

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

              onChange={(e) =>

                setName(e.target.value)

              }

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

              onChange={(e) =>

                setMessage(e.target.value)

              }

            />



            <label className="consent-box">

              <input

                type="checkbox"

                checked={consent}

                onChange={(e) =>

                  setConsent(e.target.checked)

                }

              />



              <span>

                I consent to the processing of my name,

                message, and transaction details to

                process this tip and display stream

                alerts, as per the{" "}



                <button

                  type="button"

                  className="privacy-link"

                  onClick={() =>

                    setShowPrivacy(!showPrivacy)

                  }

                >

                  Privacy Policy

                </button>

                .

              </span>

            </label>



            {showPrivacy && (

              <div className="privacy-panel">

                <button

                  className="close-privacy"

                  type="button"

                  onClick={() =>

                    setShowPrivacy(false)

                  }

                  aria-label="Close privacy policy"

                >

                  ×

                </button>



                <h3>Privacy Policy</h3>



                <p>

                  Your name and message are optional.

                  Transaction details are processed

                  to complete and verify payments.

                </p>



                <p>

                  Your name and message may be displayed

                  in stream alerts only with consent.

                </p>



                <p>

                  A complete privacy policy explaining

                  data collection, retention, sharing,

                  and contact details must be published

                  before accepting real payments.

                </p>

              </div>

            )}



            <p className="tip-hint">

              ❄ Your support keeps me motivated!

            </p>



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

                paymentLoading

              }

              onClick={handleContinue}

            >

              {paymentLoading

                ? "Opening secure checkout..."

                : `♡ Continue with ${formatAmount(

                    finalAmount

                  )}`}

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
