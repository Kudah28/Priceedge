require("dotenv").config();

const express = require("express");

const cors = require("cors");

const bcrypt = require("bcryptjs");

const jwt = require("jsonwebtoken");

const Database = require("better-sqlite3");

const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const SECRET = process.env.JWT_SECRET || "CHANGE_ME";

const PUBLIC_DIR = path.join(__dirname, "public");

const DB_PATH = path.join(__dirname, "priceedge.db");

const db = new Database(DB_PATH);

app.use(cors());

app.use(express.json());

app.use(express.static(PUBLIC_DIR));

/* =========================

   DATABASE

========================= */

db.exec(`

CREATE TABLE IF NOT EXISTS users(

  id INTEGER PRIMARY KEY AUTOINCREMENT,

  email TEXT UNIQUE NOT NULL,

  password_hash TEXT NOT NULL,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP

);

CREATE TABLE IF NOT EXISTS trades(

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

  FOREIGN KEY(user_id) REFERENCES users(id)

);

`);

/* =========================

   AUTHENTICATION

========================= */

function tokenFor(user) {

  return jwt.sign(

    {

      id: user.id,

      email: user.email

    },

    SECRET,

    {

      expiresIn: "7d"

    }

  );

}

function auth(req, res, next) {

  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {

    return res.status(401).json({

      error: "Authentication required"

    });

  }

  try {

    req.user = jwt.verify(header.slice(7), SECRET);

    next();

  } catch (error) {

    return res.status(401).json({

      error: "Invalid or expired session"

    });

  }

}

/* =========================

   REGISTER

========================= */

app.post("/api/register", async (req, res) => {

  const { email, password } = req.body || {};

  if (!email || !password || password.length < 6) {

    return res.status(400).json({

      error: "Email and password (6+ characters) are required"

    });

  }

  try {

    const cleanEmail = email.toLowerCase().trim();

    const hash = await bcrypt.hash(password, 10);

    const info = db

      .prepare(

        "INSERT INTO users(email,password_hash) VALUES(?,?)"

      )

      .run(cleanEmail, hash);

    const user = {

      id: info.lastInsertRowid,

      email: cleanEmail

    };

    return res.json({

      token: tokenFor(user),

      user

    });

  } catch (error) {

    return res.status(409).json({

      error: "An account with that email already exists"

    });

  }

});

/* =========================

   LOGIN

========================= */

app.post("/api/login", async (req, res) => {

  const { email, password } = req.body || {};

  const cleanEmail = (email || "").toLowerCase().trim();

  const user = db

    .prepare("SELECT * FROM users WHERE email=?")

    .get(cleanEmail);

  if (

    !user ||

    !(await bcrypt.compare(password || "", user.password_hash))

  ) {

    return res.status(401).json({

      error: "Incorrect email or password"

    });

  }

  return res.json({

    token: tokenFor(user),

    user: {

      id: user.id,

      email: user.email

    }

  });

});

/* =========================

   CURRENT USER

========================= */

app.get("/api/me", auth, (req, res) => {

  res.json({

    user: {

      id: req.user.id,

      email: req.user.email

    }

  });

});

/* =========================

   GET TRADES

========================= */

app.get("/api/trades", auth, (req, res) => {

  const trades = db

    .prepare(

      "SELECT * FROM trades WHERE user_id=? ORDER BY created_at DESC"

    )

    .all(req.user.id);

  res.json(trades);

});

/* =========================

   CREATE TRADE

========================= */

app.post("/api/trades", auth, (req, res) => {

  const {

    pair,

    side,

    entry,

    stop,

    target,

    result,

    notes

  } = req.body || {};

  if (!pair || !side) {

    return res.status(400).json({

      error: "Pair and side are required"

    });

  }

  const info = db

    .prepare(

      `INSERT INTO trades(

        user_id,

        pair,

        side,

        entry,

        stop,

        target,

        result,

        notes

      )

      VALUES(?,?,?,?,?,?,?,?)`

    )

    .run(

      req.user.id,

      pair,

      side,

      entry || null,

      stop || null,

      target || null,

      result || 0,

      notes || ""

    );

  const trade = db

    .prepare("SELECT * FROM trades WHERE id=?")

    .get(info.lastInsertRowid);

  res.json(trade);

});

/* =========================

   LIVE XAU/USD MARKET DATA

========================= */

app.get("/api/candles", async (req, res) => {

  const symbol = req.query.symbol || "XAU/USD";

  const interval = req.query.interval || "5min";

  const key = process.env.TWELVE_DATA_API_KEY;

  if (!key) {

    return res.status(503).json({

      error:

        "TWELVE_DATA_API_KEY is missing from Render environment variables"

    });

  }

  try {

    const url =

      "https://api.twelvedata.com/time_series" +

      "?symbol=" +

      encodeURIComponent(symbol) +

      "&interval=" +

      encodeURIComponent(interval) +

      "&outputsize=120" +

      "&format=JSON" +

      "&apikey=" +

      encodeURIComponent(key);

    const response = await fetch(url);

    const data = await response.json();

    console.log(

      "Twelve Data response:",

      JSON.stringify(data).slice(0, 1000)

    );

    if (!response.ok) {

      return res.status(502).json({

        error: "Market-data provider HTTP error"

      });

    }

    if (data.status === "error") {

      return res.status(502).json({

        error:

          data.message ||

          "Twelve Data returned an error"

      });

    }

    if (!Array.isArray(data.values)) {

      return res.status(502).json({

        error:

          "Market-data provider returned no candle values"

      });

    }

    return res.json({

      status: "ok",

      values: data.values

    });

  } catch (error) {

    console.error(

      "Candle API error:",

      error

    );

    return res.status(502).json({

      error:

        "Unable to reach market-data provider"

    });

  }

});

/* =========================

   FRONTEND FALLBACK

========================= */

app.use((req, res, next) => {

  if (req.path.startsWith("/api/")) {

    return next();

  }

  res.sendFile(

    path.join(PUBLIC_DIR, "index.html")

  );

});

/* =========================

   START SERVER

========================= */

app.listen(PORT, () => {

  console.log(

    `PriceEdge running on port ${PORT}`

  );

});
