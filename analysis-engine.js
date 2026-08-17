"use strict";

/**
 * PriceEdge price-action engine.
 *
 * Input candles must contain: open, high, low, close, datetime.
 * The engine is intentionally indicator-light: structure, momentum,
 * volatility, support/resistance and candle quality are derived from price.
 */

function finite(n) {
  return Number.isFinite(Number(n));
}

function normalizeCandles(candles) {
  return (Array.isArray(candles) ? candles : [])
    .map((c) => ({
      datetime: c.datetime,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close)
    }))
    .filter((c) => [c.open, c.high, c.low, c.close].every(finite) && c.high >= c.low)
    .filter((c) => c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close));
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function range(c) { return Math.max(0, c.high - c.low); }
function body(c) { return Math.abs(c.close - c.open); }
function direction(c) { return c.close > c.open ? 1 : c.close < c.open ? -1 : 0; }

function slope(values) {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = average(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xMean;
    num += dx * (values[i] - yMean);
    den += dx * dx;
  }
  return den ? num / den : 0;
}

function findPivots(candles, wing = 2) {
  const highs = [];
  const lows = [];
  for (let i = wing; i < candles.length - wing; i++) {
    let high = true;
    let low = true;
    for (let j = 1; j <= wing; j++) {
      high = high && candles[i].high >= candles[i - j].high && candles[i].high >= candles[i + j].high;
      low = low && candles[i].low <= candles[i - j].low && candles[i].low <= candles[i + j].low;
    }
    if (high) highs.push({ index: i, price: candles[i].high, datetime: candles[i].datetime });
    if (low) lows.push({ index: i, price: candles[i].low, datetime: candles[i].datetime });
  }
  return { highs, lows };
}

function classifyStructure(pivots) {
  const highs = pivots.highs.slice(-4);
  const lows = pivots.lows.slice(-4);
  if (highs.length < 2 || lows.length < 2) return { label: "Developing", bias: 0 };

  const hh = highs[highs.length - 1].price > highs[highs.length - 2].price;
  const hl = lows[lows.length - 1].price > lows[lows.length - 2].price;
  const lh = highs[highs.length - 1].price < highs[highs.length - 2].price;
  const ll = lows[lows.length - 1].price < lows[lows.length - 2].price;

  if (hh && hl) return { label: "Higher highs / higher lows", bias: 1 };
  if (lh && ll) return { label: "Lower highs / lower lows", bias: -1 };
  return { label: "Range / mixed structure", bias: 0 };
}

function levels(candles, pivots, lastPrice) {
  const supports = pivots.lows.map((p) => p.price).filter((p) => p < lastPrice).sort((a, b) => b - a);
  const resistances = pivots.highs.map((p) => p.price).filter((p) => p > lastPrice).sort((a, b) => a - b);
  const lookback = candles.slice(-30);
  const fallbackSupport = Math.min(...lookback.map((c) => c.low));
  const fallbackResistance = Math.max(...lookback.map((c) => c.high));
  return {
    support: supports[0] ?? fallbackSupport,
    resistance: resistances[0] ?? fallbackResistance
  };
}

function analyze(candles) {
  const data = normalizeCandles(candles).slice(-200);
  if (data.length < 30) {
    return { ready: false, reason: "At least 30 valid candles are required.", candles: data.length };
  }

  const closes = data.map((c) => c.close);
  const last = data[data.length - 1];
  const recent = data.slice(-20);
  const short = average(closes.slice(-8));
  const long = average(closes.slice(-21));
  const recentSlope = slope(closes.slice(-12));
  const ranges = recent.map(range).filter((v) => v > 0);
  const atrProxy = average(ranges);
  const currentRange = range(last);
  const currentBody = body(last);
  const bodyRatio = currentRange ? currentBody / currentRange : 0;
  const pivots = findPivots(data, 2);
  const structure = classifyStructure(pivots);
  const { support, resistance } = levels(data, pivots, last.close);

  const momentumScore = (short > long ? 1 : short < long ? -1 : 0) +
    (recentSlope > atrProxy * 0.03 ? 1 : recentSlope < -atrProxy * 0.03 ? -1 : 0) +
    (direction(last));

  const trendScore = structure.bias * 2 + (short > long ? 1 : short < long ? -1 : 0);
  const trend = trendScore >= 2 ? "Bullish" : trendScore <= -2 ? "Bearish" : "Sideways";
  const momentum = momentumScore >= 2 ? "Strong bullish" : momentumScore <= -2 ? "Strong bearish" : momentumScore > 0 ? "Bullish" : momentumScore < 0 ? "Bearish" : "Neutral";

  const distanceToSupport = last.close - support;
  const distanceToResistance = resistance - last.close;
  const nearSupport = distanceToSupport >= 0 && distanceToSupport <= atrProxy * 0.8;
  const nearResistance = distanceToResistance >= 0 && distanceToResistance <= atrProxy * 0.8;
  const quality = Math.max(0, Math.min(100,
    50 + trendScore * 10 + momentumScore * 7 + (bodyRatio >= 0.55 ? 8 : 0) - (nearSupport && nearResistance ? 15 : 0)
  ));

  let action = "WAIT";
  let reason = "Structure and location are not aligned strongly enough for a clean setup.";
  if (trend === "Bullish" && momentumScore > 0 && !nearResistance) {
    action = "BUY";
    reason = nearSupport ? "Bullish structure with price holding near support." : "Bullish structure and momentum are aligned.";
  } else if (trend === "Bearish" && momentumScore < 0 && !nearSupport) {
    action = "SELL";
    reason = nearResistance ? "Bearish structure with price rejecting near resistance." : "Bearish structure and momentum are aligned.";
  }

  return {
    ready: true,
    price: last.close,
    trend,
    structure: structure.label,
    momentum,
    action,
    reason,
    setupQuality: Math.round(quality),
    support,
    resistance,
    volatility: atrProxy,
    candle: { direction: direction(last), bodyRatio: Number(bodyRatio.toFixed(3)), range: currentRange },
    pivots: { highs: pivots.highs.slice(-6), lows: pivots.lows.slice(-6) },
    dataPoints: data.length,
    asOf: last.datetime
  };
}

module.exports = { analyze, normalizeCandles };
