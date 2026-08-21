/* PriceEdge live XAU/USD tick client.
   Twelve Data stays server-side. The browser receives real ticks over
   the same-origin /ws/live socket and uses them to continuously form the
   current 5-minute candle without inventing market prices.
   The chart-interactions module owns the single live OHLC panel.
*/
(function () {
  "use strict";

  let socket = null;
  let reconnectTimer = null;
  let frameQueued = false;
  let analysisTimer = null;
  let lastTick = 0;
  let lastTickTime = 0;
  let previousTick = null;

  const $id = id => document.getElementById(id);

  function getCandles() {
    try {
      if (typeof candles !== "undefined" && Array.isArray(candles)) return candles;
    } catch (_) {}
    return Array.isArray(window.candles) ? window.candles : null;
  }

  function setStatus(text, type) {
    for (const id of ["liveStatusText", "streamText"]) {
      const el = $id(id);
      if (el) el.textContent = text;
    }
    const stream = $id("stream");
    if (stream) stream.className = type === "error" ? "status off" : "status";
    const dot = $id("dot");
    if (dot) dot.className = "dot" + (type === "error" ? " off" : "");
  }

  function candleBucket(ms) {
    return Math.floor(ms / 300000) * 300000;
  }

  function candleStartMs(candle) {
    const raw = candle?.datetime;
    if (!raw) return NaN;
    const t = Date.parse(raw);
    return Number.isFinite(t) ? candleBucket(t) : NaN;
  }

  function secondsRemaining(bucket) {
    return Math.max(0, Math.ceil((bucket + 300000 - Date.now()) / 1000));
  }

  function formatClock(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function updateCountdown() {
    const list = getCandles();
    if (!list?.length) return;
    const bucket = candleStartMs(list[list.length - 1]);
    if (!Number.isFinite(bucket)) return;
    const remaining = secondsRemaining(bucket);

    const meta = $id("liveTickMeta");
    if (meta && lastTick) {
      meta.textContent = `LIVE TICK • ${lastTick.toFixed(2)} • NEW 5M CANDLE IN ${formatClock(remaining)}`;
    }
  }

  function ensureTickMeta() {
    let el = $id("liveTickMeta");
    if (el) return el;
    const parent = $id("streamText")?.parentElement;
    if (!parent) return null;
    el = document.createElement("div");
    el.id = "liveTickMeta";
    el.style.cssText = "margin-top:3px;font-size:10px;opacity:.72;font-variant-numeric:tabular-nums;";
    parent.appendChild(el);
    return el;
  }

  function updatePriceUi(price, previousPrice) {
    const priceEl = $id("price");
    if (priceEl) {
      const direction = previousPrice == null ? "" : price > previousPrice ? " ▲" : price < previousPrice ? " ▼" : "";
      const cls = previousPrice == null || price >= previousPrice ? "green" : "red";
      priceEl.innerHTML = `$${price.toFixed(2)} <span style="font-size:15px" class="${cls}">${direction}</span>`;
    }
    const changeEl = $id("change") || $id("priceMetaText");
    if (changeEl && previousPrice != null) {
      const delta = price - previousPrice;
      changeEl.textContent = `${delta > 0 ? "+" : ""}${delta.toFixed(2)} LIVE`;
      changeEl.className = delta > 0 ? "green" : delta < 0 ? "red" : "gold";
    }
  }

  function updateFormingCandle(price, time) {
    const list = getCandles();
    if (!list) return;

    const bucket = candleBucket(time);
    let last = list[list.length - 1];
    const lastBucket = candleStartMs(last);

    if (!Number.isFinite(lastBucket) || bucket > lastBucket) {
      last = {
        datetime: new Date(bucket).toISOString(),
        open: price,
        high: price,
        low: price,
        close: price,
        live: true
      };
      list.push(last);
      while (list.length > 300) list.shift();
    } else if (bucket < lastBucket) {
      return;
    } else {
      last.live = true;
      last.high = Math.max(Number(last.high), price);
      last.low = Math.min(Number(last.low), price);
      last.close = price;
    }

    ensureTickMeta();
    updateCountdown();

    if (!frameQueued) {
      frameQueued = true;
      requestAnimationFrame(() => {
        frameQueued = false;
        if (typeof window.drawChart === "function") window.drawChart();
      });
    }

    // Do not run the heavier analysis on every tick. Once per second is enough.
    if (!analysisTimer) {
      analysisTimer = setTimeout(() => {
        analysisTimer = null;
        if (typeof window.analyze === "function") window.analyze();
      }, 1000);
    }
  }

  function handleTick(msg) {
    if (msg.symbol && msg.symbol !== "XAU/USD") return;
    const price = Number(msg.price);
    if (!Number.isFinite(price) || price <= 0) return;

    const previousPrice = lastTick || null;
    previousTick = previousPrice;
    lastTick = price;
    lastTickTime = Number(msg.time) || Date.now();

    updatePriceUi(price, previousPrice);
    updateFormingCandle(price, lastTickTime);

    const received = $id("dataReceived");
    if (received) {
      received.textContent = `Live tick received • ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
    }
    const updated = $id("lastUpdated");
    if (updated) updated.textContent = "LIVE TICK STREAM";

    setStatus("LIVE TICK STREAM", "live");
  }

  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${location.host}/ws/live`);

    socket.addEventListener("open", () => setStatus("LIVE TICK STREAM", "live"));
    socket.addEventListener("message", event => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }
      if (msg.type === "status") {
        if (msg.status === "connected") setStatus("LIVE TICK STREAM", "live");
        else if (msg.status === "reconnecting") setStatus("RECONNECTING LIVE TICKS", "cached");
        else if (msg.status === "error" || msg.status === "disabled") setStatus("LIVE STREAM UNAVAILABLE", "error");
        return;
      }
      if (msg.type === "tick") handleTick(msg);
    });

    socket.addEventListener("close", () => {
      setStatus("RECONNECTING LIVE TICKS", "cached");
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 3000);
    });
    socket.addEventListener("error", () => setStatus("LIVE TICK ERROR", "error"));
  }

  // Keep the small live metadata countdown alive without rebuilding any dashboard cards.
  setInterval(updateCountdown, 1000);
  connect();
})();