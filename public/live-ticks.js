/* PriceEdge live XAU/USD tick client.
   The server keeps the Twelve Data API key private and relays real ticks
   over the same-origin /ws/live socket. This script turns those ticks into
   a continuously forming 5-minute candle without inventing prices.
*/
(function () {
  "use strict";

  let socket = null;
  let reconnectTimer = null;
  let frameQueued = false;
  let analysisTimer = null;
  let lastTick = 0;

  const $id = id => document.getElementById(id);

  function status(text, type) {
    const el = $id("liveStatusText");
    if (el) el.textContent = text;
    const wrap = $id("liveStatus");
    if (wrap) {
      wrap.className = "live " + (type === "error" ? "error" : type === "cached" ? "cached" : "");
    }
  }

  function ensureTickMeta() {
    let el = $id("liveTickMeta");
    if (el) return el;
    const parent = $id("liveStatus")?.parentElement;
    if (!parent) return null;
    el = document.createElement("div");
    el.id = "liveTickMeta";
    el.style.cssText = "margin-top:4px;font-size:11px;opacity:.72;font-variant-numeric:tabular-nums;";
    parent.appendChild(el);
    return el;
  }

  function candleBucket(ms) {
    return Math.floor(ms / 300000) * 300000;
  }

  function candleStartMs(candle) {
    const raw = candle?.datetime;
    if (!raw) return NaN;
    let t = Date.parse(raw);
    if (!Number.isFinite(t)) return NaN;
    return candleBucket(t);
  }

  function formatCandleClock(ms) {
    const left = Math.max(0, 300000 - (Date.now() - ms));
    const total = Math.ceil(left / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function updatePriceUi(price, previousPrice) {
    const priceEl = $id("price");
    if (priceEl) {
      const trend = previousPrice == null
        ? ""
        : price > previousPrice ? " ▲" : price < previousPrice ? " ▼" : "";
      priceEl.innerHTML = `$${price.toFixed(2)} <span style="font-size:15px" class="${price >= (previousPrice ?? price) ? "green" : "red"}">${trend}</span>`;
    }

    const deltaEl = $id("priceMetaText");
    if (deltaEl && previousPrice != null) {
      const delta = price - previousPrice;
      deltaEl.textContent = `${delta > 0 ? "+" : ""}${delta.toFixed(2)} LIVE`;
      deltaEl.className = delta > 0 ? "green" : delta < 0 ? "red" : "gold";
    }

    const dot = $id("priceDot");
    if (dot) {
      dot.className = "price-dot " + (previousPrice != null && price < previousPrice ? "down" : previousPrice === price ? "flat" : "");
    }
  }

  function updateFormingCandle(price, time) {
    if (!Array.isArray(window.candles) && typeof candles === "undefined") return;

    const list = candles;
    if (!Array.isArray(list)) return;

    const bucket = candleBucket(time);
    let last = list[list.length - 1];
    let lastBucket = candleStartMs(last);

    if (!Number.isFinite(lastBucket) || bucket > lastBucket) {
      const iso = new Date(bucket).toISOString();
      last = {
        datetime: iso,
        open: price,
        high: price,
        low: price,
        close: price,
        live: true
      };
      list.push(last);
      while (list.length > 250) list.shift();
    } else if (bucket < lastBucket) {
      return;
    } else {
      last.live = true;
      last.high = Math.max(Number(last.high), price);
      last.low = Math.min(Number(last.low), price);
      last.close = price;
    }

    const meta = ensureTickMeta();
    if (meta) {
      meta.textContent = `LIVE TICK • ${price.toFixed(2)} • NEW 5M CANDLE IN ${formatCandleClock(bucket)}`;
    }

    if (!frameQueued) {
      frameQueued = true;
      requestAnimationFrame(() => {
        frameQueued = false;
        if (typeof drawChart === "function") drawChart();
      });
    }

    if (!analysisTimer) {
      analysisTimer = setTimeout(() => {
        analysisTimer = null;
        if (typeof analyze === "function") analyze();
      }, 250);
    }
  }

  function handleTick(msg) {
    if (msg.symbol && msg.symbol !== "XAU/USD") return;
    const price = Number(msg.price);
    if (!Number.isFinite(price) || price <= 0) return;

    const previousPrice = lastTick || null;
    lastTick = price;
    const time = Number(msg.time) || Date.now();

    updatePriceUi(price, previousPrice);
    updateFormingCandle(price, time);

    const received = $id("dataReceived");
    if (received) received.textContent = `Live tick received • ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
    const updated = $id("lastUpdated");
    if (updated) updated.textContent = "Live tick stream";
    status("LIVE TICK STREAM", "live");
  }

  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${location.host}/ws/live`);

    socket.addEventListener("open", () => {
      status("LIVE TICK STREAM", "live");
    });

    socket.addEventListener("message", event => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }

      if (msg.type === "status") {
        if (msg.status === "connected") status("LIVE TICK STREAM", "live");
        else if (msg.status === "reconnecting") status("RECONNECTING LIVE TICKS", "cached");
        else if (msg.status === "error") status("LIVE TICK ERROR", "error");
        return;
      }

      if (msg.type === "tick") handleTick(msg);
    });

    socket.addEventListener("close", () => {
      status("RECONNECTING LIVE TICKS", "cached");
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 3000);
    });

    socket.addEventListener("error", () => {
      status("LIVE TICK ERROR", "error");
    });
  }

  function countdownRefresh() {
    const meta = $id("liveTickMeta");
    if (!meta || !lastTick || typeof candles === "undefined" || !candles.length) return;
    const bucket = candleStartMs(candles[candles.length - 1]);
    if (Number.isFinite(bucket)) {
      meta.textContent = `LIVE TICK • ${lastTick.toFixed(2)} • NEW 5M CANDLE IN ${formatCandleClock(bucket)}`;
    }
  }

  connect();
  setInterval(countdownRefresh, 1000);
})();
