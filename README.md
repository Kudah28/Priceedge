# PriceEdge — Real App Starter

This is a production-oriented full-stack starter for the XAU/USD price-action app.

## Run it
1. Install Node.js 20+.
2. In this folder run: `npm install`
3. Copy `.env.example` to `.env`.
4. Put your Twelve Data API key into `TWELVE_DATA_API_KEY`.
5. Set a strong random `JWT_SECRET`.
6. Run: `npm start`
7. Open http://localhost:3000

## Included
- Real server-side market-data proxy
- XAU/USD 5-minute candle retrieval
- Basic price-action/structure scanner
- Responsive mobile UI / installable PWA shell
- User registration/login
- SQLite trading journal
- Risk calculator
- No API key exposed in browser code

## Before public launch
- Use HTTPS.
- Move SQLite to managed PostgreSQL for scale.
- Add rate limiting, email verification, password reset and audit logging.
- Add proper broker/market-data licensing.
- Add Stripe or another payment provider for subscriptions.
- Have legal/compliance review for financial services, signals and automated trading.
- Do not treat the demo analysis engine as a guaranteed trading strategy; backtest and validate it before exposing signals as a paid product.
