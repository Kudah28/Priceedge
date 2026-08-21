"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { analyze, multiTimeframe } = require("./analysis-engine");

function candlesFromCloses(closes) {
  return closes.map((close, i) => {
    const open = i === 0 ? close - 0.2 : closes[i - 1];
    return {
      datetime: `2026-01-01T00:${String(i).padStart(2, "0")}:00Z`,
      open,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      close
    };
  });
}

function seriesFromCloses(closes) {
  return Object.fromEntries([
    "5min", "15min", "1h", "4h", "1day"
  ].map(tf => [tf, candlesFromCloses(closes)]));
}

test("rejects insufficient candle history", () => {
  const result = analyze(candlesFromCloses(Array.from({ length: 20 }, (_, i) => 100 + i)));
  assert.equal(result.ready, false);
});

test("detects a sustained bullish move", () => {
  const result = analyze(candlesFromCloses(Array.from({ length: 80 }, (_, i) => 100 + i * 0.8)));
  assert.equal(result.ready, true);
  assert.equal(result.trend, "Bullish");
  assert.equal(result.action, "BUY");
  assert.ok(result.support < result.price);
  assert.ok(result.resistance >= result.price);
});

test("detects a sustained bearish move", () => {
  const result = analyze(candlesFromCloses(Array.from({ length: 80 }, (_, i) => 160 - i * 0.8)));
  assert.equal(result.ready, true);
  assert.equal(result.trend, "Bearish");
  assert.equal(result.action, "SELL");
  assert.ok(result.resistance > result.price);
});

test("returns WAIT for a low-direction range", () => {
  const closes = Array.from({ length: 80 }, (_, i) => 100 + (i % 4 === 0 ? 0.3 : i % 4 === 2 ? -0.3 : 0));
  const result = analyze(candlesFromCloses(closes));
  assert.equal(result.ready, true);
  assert.equal(result.action, "WAIT");
});

test("requires strict confirmation before multi-timeframe BUY", () => {
  const bullish = Array.from({ length: 80 }, (_, i) => 100 + i * 0.8);
  const result = multiTimeframe(seriesFromCloses(bullish));
  assert.equal(result.direction, "Bullish");
  assert.equal(result.confluenceCount, 5);
  assert.equal(result.h4d1Aligned, true);
  assert.equal(result.action, "BUY");
  assert.equal(result.setup.valid, true);
  assert.ok(result.setup.checks.qualityConfirmed);
  assert.ok(result.setup.checks.m5Aligned);
});
