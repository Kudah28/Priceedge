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

/*

   PriceEdge is designed around:

   XAU/USD

   5-minute candles

*/

const DEFAULT_SYMBOL = "XAU/USD";

const DEFAULT_INTERVAL = "5min";

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

   STATIC FRONTEND

========================================================= */

app.use(

  express.static(

    path.join(__dirname, "public")

  )

);

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

      return res.status(201).json({

        token,

        user

      });

    } catch (error) {

      console.error(

        "REGISTER ERROR:",

        error

      );

      return res.status(500).json({

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

      return res.json({

        token,

        user: safeUser

      });

    } catch (error) {

      console.error(

        "LOGIN ERROR:",

        error

      );

      return res.status(500).json({

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

    const user =

      db.prepare(`

        SELECT id, email, created_at

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

  }

);

/* =========================================================

   TWELVE DATA REQUEST

========================================================= */

/*

   This function handles temporary provider failures.

   Important:

   - HTTP errors are detected properly.

   - Twelve Data API errors are detected even when

     the HTTP status is 200.

   - Timeout is handled.

   - Provider error messages are preserved.

*/

async function requestTwelveData(params) {

  if (!TWELVE_DATA_API_KEY) {

    throw new Error(

      "Twelve Data API key is not configured on the server."

    );

  }

  const url =

    new URL(

      TWELVE_DATA_URL

    );

  Object.entries({

    ...params,

    apikey: TWELVE_DATA_API_KEY

  }).forEach(

    ([key, value]) => {

      url.searchParams.set(

        key,

        value

      );

    }

  );

  const controller =

    new AbortController();

  const timeout =

    setTimeout(

      () => controller.abort(),

      10000

    );

  try {

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

    let data = null;

    try {

      data =

        await response.json();

    } catch (jsonError) {

      throw new Error(

        "The market-data provider returned invalid JSON."

      );

    }

    /*

       HTTP-level error.

    */

    if (!response.ok) {

      const providerMessage =

        data &&

        (

          data.message ||

          data.code ||

          data.status

        );

      throw new Error(

        providerMessage

          ? `Market-data provider HTTP ${response.status}: ${providerMessage}`

          : `Market-data provider HTTP ${response.status}.`

      );

    }

    /*

       Twelve Data can return an API error

       inside a HTTP 200 response.

    */

    if (

      data &&

      (

        data.status === "error" ||

        data.code === "error" ||

        data.message &&

        !Array.isArray(data.values)

      )

    ) {

      throw new Error(

        data.message ||

        "Twelve Data returned a market-data error."

      );

    }

    return data;

  } catch (error) {

    if (

      error.name ===

      "AbortError"

    ) {

      throw new Error(

        "Market-data provider timed out."

      );

    }

    throw error;

  } finally {

    clearTimeout(timeout);

  }

}

/* =========================================================

   MARKET DATA CACHE

========================================================= */

/*

   This is important for your intermittent error.

   If Twelve Data temporarily fails, PriceEdge can return

   the most recent valid candles instead of destroying

   the chart.

*/

let marketCache = {

  key: null,

  values: [],

  updatedAt: 0,

  lastError: null

};

/* =========================================================

   CLEAN CANDLE DATA

========================================================= */

function cleanCandles(values) {

  if (!Array.isArray(values)) {

    return [];

  }

  return values

    .map(c => ({

      datetime:

        c.datetime,

      open:

        Number(c.open),

      high:

        Number(c.high),

      low:

        Number(c.low),

      close:

        Number(c.close)

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

   MARKET CANDLES

========================================================= */

app.get(

  "/api/candles",

  async (req, res) => {

    const symbol =

      String(

        req.query.symbol ||

        DEFAULT_SYMBOL

      );

    const interval =

      String(

        req.query.interval ||

        DEFAULT_INTERVAL

      );

    /*

       Only allow the intervals we actually need.

       This prevents accidental unsupported requests.

    */

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

        error:

          "Unsupported candle interval."

      });

    }

    const cacheKey =

      `${symbol}|${interval}`;

    try {

      const data =

        await requestTwelveData({

          symbol,

          interval,

          outputsize: 200,

          order: "asc"

        });

      const values =

        cleanCandles(

          data.values

        );

      if (!values.length) {

        throw new Error(

          "Market-data provider returned no candles."

        );

      }

      /*

         Save successful data.

      */

      marketCache = {

        key: cacheKey,

        values,

        updatedAt:

          Date.now(),

        lastError: null

      };

      return res.json({

        status: "ok",

        values,

        source: "Twelve Data",

        cached: false,

        updatedAt:

          new Date()

            .toISOString()

      });

    } catch (error) {

      console.error(

        "MARKET DATA ERROR:",

        error.message

      );

      /*

         If we have valid recent data,

         return it instead of failing the

         entire dashboard.

      */

      if (

        marketCache.key === cacheKey &&

        marketCache.values.length > 0

      ) {

        marketCache.lastError =

          error.message;

        return res.json({

          status: "ok",

          values:

            marketCache.values,

          source:

            "Twelve Data",

          cached: true,

          stale: true,

          warning:

            "Live market data temporarily unavailable. Showing the latest valid market data.",

          updatedAt:

            new Date(

              marketCache.updatedAt

            ).toISOString(),

          providerError:

            error.message

        });

      }

      /*

         No previous data exists yet.

         In that case send a clean 503.

      */

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

      res.json(rows);

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

        ).trim().toUpperCase();

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

    if (res.headersSent) {

      return next(error);

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

      "======================================"

    );

  }

);
