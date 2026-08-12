require("dotenv").config();

const express = require("express");

const cors = require("cors");

const bcrypt = require("bcryptjs");

const jwt = require("jsonwebtoken");

const Database = require("better-sqlite3");

const path = require("path");

const app = express();

/* =========================================================

   CONFIGURATION

========================================================= */

const PORT = process.env.PORT || 3000;

const JWT_SECRET =

  process.env.JWT_SECRET || "CHANGE_ME";

const TWELVE_DATA_API_KEY =

  process.env.TWELVE_DATA_API_KEY ||

  process.env.TWELVEDATA_API_KEY ||

  process.env.TWELVE_DATA_KEY ||

  "";

const TWELVE_DATA_URL =

  "https://api.twelvedata.com/time_series";

const DEFAULT_SYMBOL = "XAU/USD";

const DEFAULT_INTERVAL = "5min";

/*

  The browser can request every 5 seconds,

  but we don't need to hit Twelve Data

  every 5 seconds.

*/

const MARKET_REFRESH_MS = 15000;

/*

  Maximum age of cached data that we are

  willing to return during a temporary

  provider problem.

*/

const CACHE_MAX_AGE_MS = 10 * 60 * 1000;

/*

  Provider request timeout.

*/

const PROVIDER_TIMEOUT_MS = 10000;

/*

  Number of attempts for temporary errors.

*/

const MAX_RETRIES = 3;

/* =========================================================

   APP SETUP

========================================================= */

app.use(cors());

app.use(express.json());

app.use(

  express.urlencoded({

    extended: true

  })

);

app.use(

  express.static(

    path.join(__dirname, "public")

  )

);

/* =========================================================

   DATABASE

========================================================= */

const db = new Database(

  path.join(__dirname, "priceedge.db")

);

db.pragma("journal_mode = WAL");

db.exec(`

  CREATE TABLE IF NOT EXISTS users (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    email TEXT NOT NULL UNIQUE,

    password_hash TEXT NOT NULL,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP

  );

  CREATE TABLE IF NOT EXISTS trades (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,

    pair TEXT NOT NULL,

    side TEXT NOT NULL,

    entry REAL,

    stop REAL,

    target REAL,

    result REAL DEFAULT 0,

    notes TEXT,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)

      REFERENCES users(id)

      ON DELETE CASCADE

  );

`);

/* =========================================================

   HEALTH CHECK

========================================================= */

app.get("/api/health", (req, res) => {

  res.json({

    status: "ok",

    service: "PriceEdge",

    marketData:

      TWELVE_DATA_API_KEY

        ? "configured"

        : "missing API key",

    market: DEFAULT_SYMBOL,

    interval: DEFAULT_INTERVAL,

    time: new Date().toISOString()

  });

});

/* =========================================================

   JWT

========================================================= */

function tokenFor(user) {

  return jwt.sign(

    {

      id: user.id,

      email: user.email

    },

    JWT_SECRET,

    {

      expiresIn: "7d"

    }

  );

}

/* =========================================================

   AUTH MIDDLEWARE

========================================================= */

function authRequired(req, res, next) {

  const header =

    req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {

    return res.status(401).json({

      error: "Authentication required."

    });

  }

  const token =

    header.slice(7);

  try {

    const decoded =

      jwt.verify(

        token,

        JWT_SECRET

      );

    req.user = decoded;

    next();

  } catch (error) {

    return res.status(401).json({

      error: "Invalid or expired token."

    });

  }

}

/* =========================================================

   REGISTER

========================================================= */

app.post(

  "/api/register",

  async (req, res) => {

    try {

      const email =

        String(

          req.body.email || ""

        )

          .trim()

          .toLowerCase();

      const password =

        String(

          req.body.password || ""

        );

      if (!email) {

        return res.status(400).json({

          error: "Email is required."

        });

      }

      if (!password) {

        return res.status(400).json({

          error: "Password is required."

        });

      }

      if (password.length < 6) {

        return res.status(400).json({

          error:

            "Password must be at least 6 characters."

        });

      }

      const existing =

        db.prepare(

          "SELECT id FROM users WHERE email = ?"

        ).get(email);

      if (existing) {

        return res.status(409).json({

          error:

            "An account with that email already exists."

        });

      }

      const passwordHash =

        await bcrypt.hash(

          password,

          10

        );

      const result =

        db.prepare(`

          INSERT INTO users

          (email, password_hash)

          VALUES (?, ?)

        `).run(

          email,

          passwordHash

        );

      const user = {

        id: result.lastInsertRowid,

        email

      };

      const token =

        tokenFor(user);

      res.status(201).json({

        token,

        user

      });

    } catch (error) {

      console.error(

        "REGISTER ERROR:",

        error

      );

      res.status(500).json({

        error:

          "Unable to create account."

      });

    }

  }

);

/* =========================================================

   LOGIN

========================================================= */

app.post(

  "/api/login",

  async (req, res) => {

    try {

      const email =

        String(

          req.body.email || ""

        )

          .trim()

          .toLowerCase();

      const password =

        String(

          req.body.password || ""

        );

      const user =

        db.prepare(`

          SELECT *

          FROM users

          WHERE email = ?

        `).get(email);

      if (!user) {

        return res.status(401).json({

          error:

            "Invalid email or password."

        });

      }

      const valid =

        await bcrypt.compare(

          password,

          user.password_hash

        );

      if (!valid) {

        return res.status(401).json({

          error:

            "Invalid email or password."

        });

      }

      const safeUser = {

        id: user.id,

        email: user.email

      };

      const token =

        tokenFor(safeUser);

      res.json({

        token,

        user: safeUser

      });

    } catch (error) {

      console.error(

        "LOGIN ERROR:",

        error

      );

      res.status(500).json({

        error:

          "Unable to log in."

      });

    }

  }

);

/* =========================================================

   CURRENT USER

========================================================= */

app.get(

  "/api/me",

  authRequired,

  (req, res) => {

    try {

      const user =

        db.prepare(`

          SELECT

            id,

            email,

            created_at

          FROM users

          WHERE id = ?

        `).get(req.user.id);

      if (!user) {

        return res.status(404).json({

          error: "User not found."

        });

      }

      res.json({

        user

      });

    } catch (error) {

      console.error(

        "ME ERROR:",

        error

      );

      res.status(500).json({

        error:

          "Unable to load account."

      });

    }

  }

);

/* =========================================================

   MARKET CACHE

========================================================= */

/*

  Cache is kept separately for each symbol + interval.

*/

const marketCache = new Map();

/*

  Prevent multiple simultaneous requests

  for the same market.

*/

const activeRequests = new Map();

/* =========================================================

   CLEAN CANDLES

========================================================= */

function cleanCandles(values) {

  if (!Array.isArray(values)) {

    return [];

  }

  return values

    .map(c => ({

      datetime: c.datetime,

      open: Number(c.open),

      high: Number(c.high),

      low: Number(c.low),

      close: Number(c.close)

    }))

    .filter(c =>

      c.datetime &&

      Number.isFinite(c.open) &&

      Number.isFinite(c.high) &&

      Number.isFinite(c.low) &&

      Number.isFinite(c.close)

    );

}

/* =========================================================

   BUILD TWELVE DATA URL

========================================================= */

function buildTwelveDataUrl(

  symbol,

  interval

) {

  const url =

    new URL(

      TWELVE_DATA_URL

    );

  url.searchParams.set(

    "symbol",

    symbol

  );

  url.searchParams.set(

    "interval",

    interval

  );

  url.searchParams.set(

    "outputsize",

    "200"

  );

  url.searchParams.set(

    "order",

    "asc"

  );

  url.searchParams.set(

    "apikey",

    TWELVE_DATA_API_KEY

  );

  return url;

}

/* =========================================================

   REQUEST TWELVE DATA

========================================================= */

async function requestTwelveData(

  symbol,

  interval

) {

  if (!TWELVE_DATA_API_KEY) {

    throw new Error(

      "Twelve Data API key is not configured on the server."

    );

  }

  const url =

    buildTwelveDataUrl(

      symbol,

      interval

    );

  let lastError = null;

  for (

    let attempt = 1;

    attempt <= MAX_RETRIES;

    attempt++

  ) {

    const controller =

      new AbortController();

    const timeout =

      setTimeout(

        () => {

          controller.abort();

        },

        PROVIDER_TIMEOUT_MS

      );

    try {

      console.log(

        `Market request attempt ${attempt}/${MAX_RETRIES}: ${symbol} ${interval}`

      );

      const response =

        await fetch(

          url,

          {

            method: "GET",

            headers: {

              Accept:

                "application/json"

            },

            cache: "no-store",

            signal:

              controller.signal

          }

        );

      let data;

      try {

        data =

          await response.json();

      } catch (jsonError) {

        throw new Error(

          "Market-data provider returned invalid JSON."

        );

      }

      /* -----------------------------------------

         HTTP ERROR

      ----------------------------------------- */

      if (!response.ok) {

        let message =

          data?.message ||

          data?.code ||

          "Unknown provider error.";

        /*

          Give useful information for

          common provider failures.

        */

        if (

          response.status === 429

        ) {

          message =

            "Provider rate limit reached.";

        }

        lastError =

          new Error(

            `Market-data provider HTTP ${response.status}: ${message}`

          );

        /*

          Retry temporary errors.

        */

        if (

          response.status === 429 ||

          response.status >= 500

        ) {

          await delay(

            700 * attempt

          );

          continue;

        }

        throw lastError;

      }

      /* -----------------------------------------

         TWELVE DATA API ERROR INSIDE HTTP 200

      ----------------------------------------- */

      if (

        data &&

        (

          data.status === "error" ||

          (

            data.message &&

            !Array.isArray(

              data.values

            )

          )

        )

      ) {

        lastError =

          new Error(

            data.message ||

            "Twelve Data returned a market-data error."

          );

        /*

          Provider API errors may be temporary.

          Retry them.

        */

        if (

          attempt < MAX_RETRIES

        ) {

          await delay(

            700 * attempt

          );

          continue;

        }

        throw lastError;

      }

      /* -----------------------------------------

         VALIDATE VALUES

      ----------------------------------------- */

      if (

        !data ||

        !Array.isArray(

          data.values

        )

      ) {

        throw new Error(

          "Twelve Data returned no candle array."

        );

      }

      const values =

        cleanCandles(

          data.values

        );

      if (!values.length) {

        throw new Error(

          "Twelve Data returned no valid candles."

        );

      }

      console.log(

        `Market request successful: ${values.length} candles`

      );

      return values;

    } catch (error) {

      lastError = error;

      if (

        error.name ===

        "AbortError"

      ) {

        lastError =

          new Error(

            "Market-data provider timed out."

          );

      }

      console.error(

        `Market request attempt ${attempt} failed:`,

        lastError.message

      );

      /*

        Retry timeout/network failures.

      */

      if (

        attempt < MAX_RETRIES

      ) {

        await delay(

          700 * attempt

        );

        continue;

      }

    } finally {

      clearTimeout(

        timeout

      );

    }

  }

  throw (

    lastError ||

    new Error(

      "Market-data provider request failed."

    )

  );

}

/* =========================================================

   DELAY

========================================================= */

function delay(ms) {

  return new Promise(

    resolve =>

      setTimeout(

        resolve,

        ms

      )

  );

}

/* =========================================================

   FETCH MARKET DATA WITH CACHE

========================================================= */

async function getMarketData(

  symbol,

  interval

) {

  const key =

    `${symbol}|${interval}`;

  const now =

    Date.now();

  const cached =

    marketCache.get(key);

  /*

    If another request is already running,

    wait for it instead of starting another.

  */

  if (

    activeRequests.has(key)

  ) {

    return activeRequests.get(key);

  }

  /*

    If cache is fresh enough,

    return it immediately.

  */

  if (

    cached &&

    cached.values.length &&

    now - cached.updatedAt <

      MARKET_REFRESH_MS

  ) {

    return {

      values: cached.values,

      cached: true,

      stale: false,

      updatedAt:

        cached.updatedAt

    };

  }

  /*

    Start one provider request.

  */

  const requestPromise =

    (async () => {

      try {

        const values =

          await requestTwelveData(

            symbol,

            interval

          );

        const updatedAt =

          Date.now();

        marketCache.set(

          key,

          {

            values,

            updatedAt,

            lastError: null

          }

        );

        return {

          values,

          cached: false,

          stale: false,

          updatedAt

        };

      } catch (error) {

        console.error(

          "MARKET FETCH FAILED:",

          error.message

        );

        /*

          Return previous successful data

          if it is still reasonably recent.

        */

        const previous =

          marketCache.get(key);

        if (

          previous &&

          previous.values.length &&

          Date.now() -

            previous.updatedAt <=

            CACHE_MAX_AGE_MS

        ) {

          previous.lastError =

            error.message;

          return {

            values:

              previous.values,

            cached: true,

            stale: true,

            updatedAt:

              previous.updatedAt,

            providerError:

              error.message

          };

        }

        throw error;

      }

    })();

  activeRequests.set(

    key,

    requestPromise

  );

  try {

    return await requestPromise;

  } finally {

    activeRequests.delete(

      key

    );

  }

}

/* =========================================================

   MARKET CANDLES API

========================================================= */

app.get(

  "/api/candles",

  async (req, res) => {

    const symbol =

      String(

        req.query.symbol ||

        DEFAULT_SYMBOL

      ).trim();

    const interval =

      String(

        req.query.interval ||

        DEFAULT_INTERVAL

      ).trim();

    const allowedIntervals = [

      "1min",

      "5min",

      "15min",

      "30min",

      "1h",

      "4h",

      "1day"

    ];

    if (

      !allowedIntervals.includes(

        interval

      )

    ) {

      return res.status(400).json({

        status: "error",

        error:

          "Unsupported candle interval."

      });

    }

    try {

      const result =

        await getMarketData(

          symbol,

          interval

        );

      return res.json({

        status: "ok",

        values:

          result.values,

        source:

          "Twelve Data",

        cached:

          result.cached,

        stale:

          result.stale,

        updatedAt:

          new Date(

            result.updatedAt

          ).toISOString(),

        /*

          This is only informational.

          The frontend can continue using

          the candle data normally.

        */

        warning:

          result.stale

            ? "Live provider data temporarily unavailable. Showing the latest valid market data."

            : null

      });

    } catch (error) {

      console.error(

        "CANDLES ENDPOINT ERROR:",

        error.message

      );

      return res.status(503).json({

        status: "error",

        error:

          "Market data is temporarily unavailable. PriceEdge will retry automatically.",

        details:

          error.message,

        retryable: true

      });

    }

  }

);

/* =========================================================

   TRADING JOURNAL - GET

========================================================= */

app.get(

  "/api/trades",

  authRequired,

  (req, res) => {

    try {

      const rows =

        db.prepare(`

          SELECT

            id,

            pair,

            side,

            entry,

            stop,

            target,

            result,

            notes,

            created_at

          FROM trades

          WHERE user_id = ?

          ORDER BY id DESC

        `).all(

          req.user.id

        );

      res.json(

        rows

      );

    } catch (error) {

      console.error(

        "GET TRADES ERROR:",

        error

      );

      res.status(500).json({

        error:

          "Unable to load trades."

      });

    }

  }

);

/* =========================================================

   TRADING JOURNAL - POST

========================================================= */

app.post(

  "/api/trades",

  authRequired,

  (req, res) => {

    try {

      const pair =

        String(

          req.body.pair ||

          "XAU/USD"

        ).trim();

      const side =

        String(

          req.body.side ||

          ""

        )

          .trim()

          .toUpperCase();

      const entry =

        Number(

          req.body.entry

        );

      const stop =

        Number(

          req.body.stop

        );

      const target =

        Number(

          req.body.target

        );

      const result =

        Number(

          req.body.result || 0

        );

      const notes =

        String(

          req.body.notes ||

          ""

        );

      if (

        !["BUY", "SELL"].includes(

          side

        )

      ) {

        return res.status(400).json({

          error:

            "Side must be BUY or SELL."

        });

      }

      const inserted =

        db.prepare(`

          INSERT INTO trades

          (

            user_id,

            pair,

            side,

            entry,

            stop,

            target,

            result,

            notes

          )

          VALUES (?, ?, ?, ?, ?, ?, ?, ?)

        `).run(

          req.user.id,

          pair,

          side,

          Number.isFinite(entry)

            ? entry

            : null,

          Number.isFinite(stop)

            ? stop

            : null,

          Number.isFinite(target)

            ? target

            : null,

          Number.isFinite(result)

            ? result

            : 0,

          notes

        );

      const trade =

        db.prepare(`

          SELECT *

          FROM trades

          WHERE id = ?

        `).get(

          inserted.lastInsertRowid

        );

      res.status(201).json(

        trade

      );

    } catch (error) {

      console.error(

        "SAVE TRADE ERROR:",

        error

      );

      res.status(500).json({

        error:

          "Unable to save trade."

      });

    }

  }

);

/* =========================================================

   SPA FALLBACK

========================================================= */

app.get(

  "*",

  (req, res) => {

    if (

      req.path.startsWith(

        "/api/"

      )

    ) {

      return res.status(404).json({

        error:

          "API endpoint not found."

      });

    }

    res.sendFile(

      path.join(

        __dirname,

        "public",

        "index.html"

      )

    );

  }

);

/* =========================================================

   ERROR HANDLER

========================================================= */

app.use(

  (

    error,

    req,

    res,

    next

  ) => {

    console.error(

      "SERVER ERROR:",

      error

    );

    if (

      res.headersSent

    ) {

      return next(

        error

      );

    }

    res.status(500).json({

      error:

        "Internal PriceEdge server error."

    });

  }

);

/* =========================================================

   START SERVER

========================================================= */

app.listen(

  PORT,

  () => {

    console.log(

      "======================================"

    );

    console.log(

      "PriceEdge server started"

    );

    console.log(

      `Port: ${PORT}`

    );

    console.log(

      `Market API key: ${

        TWELVE_DATA_API_KEY

          ? "CONFIGURED"

          : "MISSING"

      }`

    );

    console.log(

      "Market: XAU/USD"

    );

    console.log(

      "Interval: 5min"

    );

    console.log(

      `Provider refresh: ${MARKET_REFRESH_MS / 1000}s`

    );

    console.log(

      "======================================"

    );

  }

);
