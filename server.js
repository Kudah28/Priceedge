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

// Use an absolute path so Render always finds the public folder

const PUBLIC_DIR = path.join(__dirname, "public");

const DB_PATH = path.join(__dirname, "priceedge.db");

const db = new Database(DB_PATH);

app.use(cors());

app.use(express.json());

// Serve frontend files from /public

app.use(express.static(PUBLIC_DIR));

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

  const h = req.headers.authorization || "";

  if (!h.startsWith("Bearer ")) {

    return res.status(401).json({

      error: "Authentication required"

    });

  }

  try {

    req.user = jwt.verify(h.slice(7), SECRET);

    next();

  } catch (e) {

    return res.status(401).json({

      error: "Invalid or expired session"

    });

  }

}

// =========================

// USER REGISTRATION

// =========================

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

    res.json({

      token: tokenFor(user),

      user

    });

  } catch (e) {

    res.status(409).json({

      error: "An account with that email already exists"

    });

  }

});

// =========================

// USER LOGIN

// =========================

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

  res.json({

    token: tokenFor(user),

    user: {

      id: user.id,

      email: user.email

    }

  });

});

// =========================

// CURRENT USER

// =========================

app.get("/api/me", auth, (req, res) => {

  res.json({

    user: {

      id: req.user.id,

      email: req.user.email

    }

  });

});

// =========================

// GET TRADES

// =========================

app.get("/api/trades", auth, (req, res) => {

  res.json(

    db

      .prepare(

        "SELECT * FROM trades WHERE user_id=? ORDER BY created_at DESC"

      )

      .all(req.user.id)

  );

});

// =========================

// CREATE TRADE

// =========================

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

  res.json(

    db

      .prepare("SELECT * FROM trades WHERE id=?")

      .get(info.lastInsertRowid)

  );

});

// =========================

// LIVE MARKET DATA

// =========================

app.get("/api/candles", async (req, res) => {

  const symbol = req.query.symbol || "XAU/USD";

  const interval = req.query.interval || "5min";

  const key = process.env.TWELVE_DATA_API_KEY;

  if (!key) {

    return res.status(503).json({

      error: "Market-data API key is not configured"

    });

  }

  try {

    const url =

      `https://api.twelvedata.com/time_series` +

      `?symbol=${encodeURIComponent(symbol)}` +

      `&interval=${encodeURIComponent(interval)}` +

      `&outputsize=120` +

      `&apikey=${encodeURIComponent(key)}`;

    const r = await fetch(url);

    const data = await r.json();

    if (data.status === "error") {

      return res.status(502).json({

        error: data.message || "Market-data provider error"

      });

    }

    res.json(data);

  } catch (e) {

    res.status(502).json({

      error: "Unable to reach market-data provider"

    });

  }

});

// =========================

// FRONTEND FALLBACK

// =========================

// Send index.html for frontend routes.

// API routes above are handled first.

app.use((req, res, next) => {

  if (req.path.startsWith("/api/")) {

    return next();

  }

  res.sendFile(path.join(PUBLIC_DIR, "index.html"));

});

// =========================

// START SERVER

// =========================

app.listen(PORT, () => {

  console.log(`PriceEdge running on port ${PORT}`);

});
