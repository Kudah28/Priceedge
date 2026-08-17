/* PriceEdge live tick bridge.
   Loaded before server.js with: node -r ./live-patch.js server.js
   Keeps the Twelve Data API key server-side and exposes browser ticks over
   a same-origin WebSocket at /ws/live.
*/

const fs = require("fs");
const path = require("path");
const Module = require("module");
const WebSocket = require("ws");

const ORIGINAL_EXPRESS = require("express");
const originalStatic = ORIGINAL_EXPRESS.static;
const originalExpress = ORIGINAL_EXPRESS;

const API_KEY =
  process.env.TWELVE_DATA_API_KEY ||
  process.env.TWELVEDATA_API_KEY ||
  process.env.TWELVE_DATA_KEY ||
  "";

const SYMBOL = "XAU/USD";
const UPSTREAM_URL =
  API_KEY
    ? `wss://ws.twelvedata.com/v1/quotes/price?apikey=${encodeURIComponent(API_KEY)}`
    : "";

let latest = null;
let upstream = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let browserWss = null;
let attached = false;

function broadcast(payload) {
  if (!browserWss) return;
  const message = JSON.stringify(payload);
  for (const client of browserWss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(message); } catch (_) {}
    }
  }
}

function scheduleReconnect() {
  if (reconnectTimer || !API_KEY) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectUpstream();
  }, 3000);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (upstream && upstream.readyState === WebSocket.OPEN) {
      try {
        upstream.send(JSON.stringify({ action: "heartbeat" }));
      } catch (_) {}
    }
  }, 10000);
}

function parseTick(raw) {
  let data;
  try { data = JSON.parse(raw); } catch (_) { return null; }

  if (data.event !== "price") return null;

  const price = Number(data.price);
  if (!Number.isFinite(price) || price <= 0) return null;

  const timestamp = Number(data.timestamp);
  const time = Number.isFinite(timestamp)
    ? timestamp * 1000
    : Date.now();

  return {
    type: "tick",
    symbol: data.symbol || SYMBOL,
    price,
    time,
    receivedAt: Date.now()
  };
}

function connectUpstream() {
  if (!API_KEY || !UPSTREAM_URL) {
    broadcast({
      type: "status",
      status: "disabled",
      message: "Twelve Data WebSocket API key is not configured."
    });
    return;
  }

  if (upstream && (
    upstream.readyState === WebSocket.OPEN ||
    upstream.readyState === WebSocket.CONNECTING
  )) return;

  try {
    upstream = new WebSocket(UPSTREAM_URL);

    upstream.on("open", () => {
      console.log("PriceEdge: Twelve Data WebSocket connected");
      startHeartbeat();
      upstream.send(JSON.stringify({
        action: "subscribe",
        params: { symbols: SYMBOL }
      }));
      broadcast({
        type: "status",
        status: "connected",
        message: "LIVE TICK STREAM"
      });
    });

    upstream.on("message", raw => {
      const tick = parseTick(raw.toString());
      if (!tick) return;
      latest = tick;
      broadcast(tick);
    });

    upstream.on("error", error => {
      console.error("PriceEdge live WebSocket error:", error.message);
      broadcast({
        type: "status",
        status: "error",
        message: "Live tick stream reconnecting"
      });
    });

    upstream.on("close", () => {
      stopHeartbeat();
      upstream = null;
      broadcast({
        type: "status",
        status: "reconnecting",
        message: "LIVE TICK STREAM RECONNECTING"
      });
      scheduleReconnect();
    });
  } catch (error) {
    console.error("PriceEdge live WebSocket connection failed:", error.message);
    upstream = null;
    scheduleReconnect();
  }
}

function patchExpressFactory() {
  function patchedExpress(...args) {
    const app = originalExpress(...args);
    const originalUse = app.use.bind(app);
    const originalListen = app.listen.bind(app);
    let injected = false;

    app.use = function patchedUse(...useArgs) {
      const middleware = useArgs[useArgs.length - 1];
      const looksLikeStatic =
        middleware && middleware.name === "serveStatic";

      if (looksLikeStatic && !injected) {
        injected = true;
        originalUse((req, res, next) => {
          if (req.path !== "/" && req.path !== "/index.html") {
            return next();
          }

          const file = path.join(__dirname, "public", "index.html");
          fs.readFile(file, "utf8", (err, html) => {
            if (err) return next();
            if (html.includes('/live-ticks.js')) {
              res.type("html").send(html);
              return;
            }
            const tag = '<script src="/live-ticks.js" defer></script>';
            const output = html.includes("</body>")
              ? html.replace("</body>", `${tag}</body>`)
              : `${html}${tag}`;
            res.type("html").send(output);
          });
        });
      }

      return originalUse(...useArgs);
    };

    app.listen = function patchedListen(...listenArgs) {
      const server = originalListen(...listenArgs);
      attachBrowserWebSocket(server);
      return server;
    };

    return app;
  }

  Object.assign(patchedExpress, originalExpress);
  patchedExpress.static = originalStatic;

  const expressPath = require.resolve("express");
  const cached = require.cache[expressPath];
  if (cached) cached.exports = patchedExpress;
}

function attachBrowserWebSocket(server) {
  if (attached) return;
  attached = true;

  browserWss = new WebSocket.Server({
    server,
    path: "/ws/live"
  });

  browserWss.on("connection", client => {
    client.send(JSON.stringify({
      type: "status",
      status: upstream && upstream.readyState === WebSocket.OPEN
        ? "connected"
        : "reconnecting",
      message: upstream && upstream.readyState === WebSocket.OPEN
        ? "LIVE TICK STREAM"
        : "WAITING FOR LIVE TICK STREAM"
    }));

    if (latest) client.send(JSON.stringify(latest));
  });

  connectUpstream();
}

patchExpressFactory();
