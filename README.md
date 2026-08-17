# PriceEdge

PriceEdge is an educational and analytical trading assistant for XAU/USD and EUR/USD, GBP/USD and USD/JPY. It is designed around transparent price action, multi-timeframe confluence and strict risk controls.

## Run locally

```bash
npm install
npm test -- --test-reporter=spec
npm start
```

Open `http://localhost:3000`.

Create a `.env` file from `.env.example` and add at minimum:

- `JWT_SECRET`
- `TWELVE_DATA_API_KEY`

For production email verification also configure SMTP. For Premium billing configure Stripe keys and `STRIPE_PREMIUM_PRICE_ID` plus the Stripe webhook secret.

## Market rules

PriceEdge enforces these decision-support rules in its premium setup engine:

1. M5, M15, H1, H4 and D1 are analysed together.
2. High-confidence direction requires at least 3 aligned timeframes.
3. H4 and D1 must agree before a directional setup is produced.
4. Setups require a minimum 1:2 risk/reward structure.
5. Risk calculator rejects risk above 2% per trade.
6. The journal blocks new entries after the configured daily loss limit.
7. The interface is designed to wait for candle-close confirmation rather than chase a live tick.

The engine also identifies HH/HL and LH/LL structure, pin bars, engulfing candles, inside bars, support/resistance, liquidity sweeps and ATR-based volatility context.

## Real-time data

The server keeps the Twelve Data key off the browser. The server-side WebSocket bridge streams XAU/USD and the supported major USD pairs to the mobile UI. A Twelve Data plan that permits the required market coverage and WebSocket usage is required for production/client-facing distribution.

## Premium

Stripe Checkout is wired for a recurring Premium plan. Create a monthly Stripe Price and put its ID in `STRIPE_PREMIUM_PRICE_ID`. Configure the Stripe webhook endpoint:

`/api/stripe/webhook`

Subscribe to checkout completion, subscription changes, invoice paid and invoice payment-failed events. The application provisions Premium from the server-side subscription status.

## Compliance

PriceEdge is an EDUCATIONAL & ANALYTICAL TOOL ONLY. NOT financial advice. NOT a trading signal service. NOT a guarantee of profit. All analysis is for learning purposes. Trade at your own risk. Past performance ≠ future results. CFDs and Forex carry high risk of loss. Always consult a licensed financial advisor.

Market-data licensing, redistribution and display rights depend on the data provider and plan. Verify that your Twelve Data commercial plan permits the way PriceEdge will display and distribute market data.
