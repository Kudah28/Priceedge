/* PriceEdge live XAU/USD tick client.
   Twelve Data stays server-side. The browser receives real ticks over
   the same-origin /ws/live socket and uses them to continuously form the
   current 5-minute candle without inventing market prices.
*/
(function () {
  "use strict";

  let socket = null;
  let reconnectTimer = null;
  let frameQueued = false;
  let analysisTimer = null;
  let lastTick = 0;
  let lastTickTime = 0;

  const $id = id => document.getElementById(id);

  function setStatus(text, type) {
    const candidates = ["liveStatusText", "streamText"];
    for (const id of candidates) {
      const el = $id(id);
      if (el) el.textContent = text;
    }

    const wrappers = ["liveStatus", "stream"];
    for (const id of wrappers) {
      const el = $id(id);
      if (!el) continue;
      el.className = type === "error"
        ? "status off"
        : type === "cached"
          ? "status"
          : "status";
    }

    const dot = $id("dot");
    if (dot) dot.className = "dot" + (type === "error" ? " off" : "");
  }

  function ensureTickMeta() {
    let el = $id("liveTickMeta");
    if (el) return el;

    const parent = $id("streamText")?.parentElement || $id("liveStatus")?.parentElement;
    if (!parent) return null;

    el = document.createElement("div");
    el.id = "liveTickMeta";
    el.style.cssText = "margin-top:3px;font-size:10px;opacity:.72;font-variant-numeric:tabular-nums;";
    parent.appendChild(el);
    return el;
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

  function formatCandleClock(ms) {
    const elapsed = Date.now() - ms;
    const left = Math.max(0, 300000 - elapsed);
    const total = Math.ceil(left / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function updatePriceUi(price, previousPrice) {
    const priceEl = $id("price");
    if (priceEl) {
      const direction = previousPrice == null
        ? ""
        : price > previousPrice ? " ▲" : price < previousPrice ? " ▼" : "";
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
    if (!Array.isArray(window.candles)) return;

    const list = window.candles;
    const bucket = candleBucket(time);
    let last = list[list.length - 1];
    let lastBucket = candleStartMs(last);

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

    const meta = ensureTickMeta();
    if (meta) {
      meta.textContent = `LIVE TICK • ${price.toFixed(2)} • CANDLE CLOSES IN ${formatCandleClock(bucket)}`;
    }

    if (!frameQueued) {
      frameQueued = true;
      requestAnimationFrame(() => {
        frameQueued = false;
        if (typeof window.drawChart === "function") window.drawChart();
      });
    }

    if (!analysisTimer) {
      analysisTimer = setTimeout(() => {
        analysisTimer = null;
        if (typeof window.analyze === "function") window.analyze();
      }, 500);
    }
  }

  function handleTick(msg) {
    if (msg.symbol && msg.symbol !== "XAU/USD") return;

    const price = Number(msg.price);
    if (!Number.isFinite(price) || price <= 0) return;

    const previousPrice = lastTick || null;
    lastTick = price;
    lastTickTime = Number(msg.time) || Date.now();

    updatePriceUi(price, previousPrice);
    updateFormingCandle(price, lastTickTime);

    const received = $id("dataReceived");
    if (received) {
      received.textContent = `Live tick received • ${new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })}`;
    }

    const updated = $id("lastUpdated");
    if (updated) updated.textContent = "LIVE TICK STREAM";

    setStatus("LIVE TICK STREAM", "live");
  }

  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${location.host}/ws/live`);

    socket.addEventListener("open", () => {
      setStatus("LIVE TICK STREAM", "live");
    });

    socket.addEventListener("message", event => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (_) {
        return;
      }

      if (msg.type === "status") {
        if (msg.status === "connected") {
          setStatus("LIVE TICK STREAM", "live");
        } else if (msg.status === "reconnecting") {
          setStatus("RECONNECTING LIVE TICKS", "cached");
        } else if (msg.status === "error") {
          setStatus("LIVE TICK ERROR", "error");
        } else if (msg.status === "disabled") {
          setStatus("LIVE STREAM UNAVAILABLE", "error");
        }
        return;
      }

      if (msg.type === "tick") handleTick(msg);
    });

    socket.addEventListener("close", () => {
      setStatus("RECONNECTING LIVE TICKS", "cached");
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 3000);
    });

    socket.addEventListener("error", () => {
      setStatus("LIVE TICK ERROR", "error");
    });
  }

  function countdownRefresh() {
    const meta = $id("liveTickMeta");
    if (!meta || !lastTick || !lastTickTime || !Array.isArray(window.candles) || !window.candles.length) return;

    const bucket = candleStartMs(window.candles[window.candles.length - 1]);
    if (Number.isFinite(bucket)) {
      meta.textContent = `LIVE TICK • ${lastTick.toFixed(2)} • CANDLE CLOSES IN ${formatCandleClock(bucket)}`;
    }
  }

  connect();
  setInterval(countdownRefresh, 1000);
})();
