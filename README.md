# Shopify Order Notifier

Sends an SMS or WhatsApp confirmation to the customer as soon as a Shopify order is placed.

## 1. Run locally
```bash
npm install
cp .env.example .env      # fill in values
export $(grep -v '^#' .env | xargs)
npm start
```
Keep `DRY_RUN=true` at first: messages are logged, not sent.

Expose it for testing: `ngrok http 3000` and copy the https URL.

## 2. Connect Shopify (no app review needed)
1. Shopify Admin > **Settings > Notifications > Webhooks > Create webhook**
2. Event: **Order creation** | Format: **JSON**
3. URL: `https://YOUR-HOST/webhooks/orders-create`
4. Copy the **signing secret** shown at the bottom of the Webhooks section into `SHOPIFY_WEBHOOK_SECRET`.
5. Place a test order. You should see the log line.

## 3. Go live
- Create a Twilio account, fill `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`.
- Set `CHANNEL=sms` or `whatsapp`, and `DRY_RUN=false`.
- Deploy to Render, Railway, Fly.io or any Node host and set the same env vars there. Update the webhook URL to the deployed address.

## Notes
- Phone numbers like `0300 1234567` are converted to `+92300...` using `DEFAULT_COUNTRY_CODE`.
- WhatsApp business-initiated messages require a pre-approved template; for SMS you can use any text. In Pakistan, check Twilio's SMS delivery support/sender rules, or swap `sendTwilio` for a local SMS gateway.
- Make sure your checkout requires a phone number (Settings > Checkout > Customer contact).
- Shopify already sends its own confirmation email; this adds a text on top.
