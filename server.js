const express = require("express");
const crypto = require("crypto");

const {
  SHOPIFY_WEBHOOK_SECRET,
  STORE_NAME = "our store",
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM,
  CHANNEL = "sms",
  DEFAULT_COUNTRY_CODE = "92",
  MESSAGE_TEMPLATE = "Hi {name}, thanks for your order {order_number} at {store}! Total: {currency} {total}.",
  DRY_RUN = "true",
  PORT = 3000,
} = process.env;

const app = express();
const seen = new Set(); // dedupe retries (in-memory; use Redis/DB if you scale to multiple instances)

function verifyHmac(rawBody, header) {
  if (!SHOPIFY_WEBHOOK_SECRET || !header) return false;
  const digest = crypto.createHmac("sha256", SHOPIFY_WEBHOOK_SECRET).update(rawBody).digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function toE164(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/[\s\-().]/g, "");
  if (p.startsWith("+")) return p;
  if (p.startsWith("00")) return "+" + p.slice(2);
  if (p.startsWith("0")) return "+" + DEFAULT_COUNTRY_CODE + p.slice(1);
  if (p.startsWith(DEFAULT_COUNTRY_CODE)) return "+" + p;
  return "+" + DEFAULT_COUNTRY_CODE + p;
}

function pickPhone(order) {
  return toE164(
    order.phone ||
      order.shipping_address?.phone ||
      order.billing_address?.phone ||
      order.customer?.phone
  );
}

function buildMessage(order) {
  const name = order.customer?.first_name || order.shipping_address?.first_name || "there";
  const values = {
    name,
    order_number: order.name || `#${order.order_number}`,
    total: order.total_price,
    currency: order.currency,
    store: STORE_NAME,
  };
  return MESSAGE_TEMPLATE.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");
}

async function sendTwilio(to, body) {
  const wa = CHANNEL === "whatsapp";
  const params = new URLSearchParams({
    To: wa ? `whatsapp:${to}` : to,
    From: wa && !TWILIO_FROM.startsWith("whatsapp:") ? `whatsapp:${TWILIO_FROM}` : TWILIO_FROM,
    Body: body,
  });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${data.message || JSON.stringify(data)}`);
  return data.sid;
}

app.get("/", (_req, res) => res.send("Shopify order notifier is running."));

app.post("/webhooks/orders-create", express.raw({ type: "*/*", limit: "2mb" }), async (req, res) => {
  if (!verifyHmac(req.body, req.get("X-Shopify-Hmac-Sha256"))) {
    return res.status(401).send("Invalid signature");
  }
  res.sendStatus(200); // acknowledge fast; Shopify expects a response within 5 seconds

  const webhookId = req.get("X-Shopify-Webhook-Id");
  if (webhookId && seen.has(webhookId)) return;
  if (webhookId) seen.add(webhookId);

  try {
    const order = JSON.parse(req.body.toString("utf8"));
    const phone = pickPhone(order);
    if (!phone) return console.warn(`Order ${order.name}: no phone number, skipped`);

    const message = buildMessage(order);
    if (DRY_RUN === "true") return console.log(`[DRY RUN] To ${phone}: ${message}`);

    const sid = await sendTwilio(phone, message);
    console.log(`Order ${order.name}: sent to ${phone} (${sid})`);
  } catch (err) {
    console.error("Failed to process order webhook:", err.message);
  }
});

app.listen(PORT, () => console.log(`Listening on port ${PORT} (dry run: ${DRY_RUN})`));
