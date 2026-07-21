// Water temp / Peltier monitoring server - Node.js + Express + MariaDB
//
// Setup:
//   npm install
//   npm start
//
// Requires a MariaDB database + user already created (see setup guide).
// The 'readings' table is created automatically on first run if missing.

const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.json());

const PORT = 3001;

// TODO: update these to match the database/user you created in MariaDB
const DB_CONFIG = {
    host: 'localhost',
    user: 'water_monitor',
    password: 'CHANGE_ME',
    database: 'water_monitor',
};

let pool;

async function initDb() {
    pool = mysql.createPool(DB_CONFIG);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS readings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            temp FLOAT NOT NULL,
            peltier BOOLEAN NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log('Connected to MariaDB, readings table ready');
}

// =============================
// ESP32 posts new readings here
// =============================
app.post('/update', async (req, res) => {
    const { temp, peltier } = req.body;

    if (typeof temp !== 'number') {
        return res.status(400).json({ error: "expected JSON body with a numeric 'temp' field" });
    }

    try {
        await pool.query(
            'INSERT INTO readings (temp, peltier) VALUES (?, ?)',
            [temp, !!peltier]
        );

        console.log(`[${new Date().toISOString()}] temp=${temp}  peltier=${peltier ? 'ON' : 'OFF'}`);

        res.json({ status: 'ok' });
    } catch (err) {
        console.error('DB insert failed:', err.message);
        res.status(500).json({ error: 'database error' });
    }
});

// =============================
// Latest reading as JSON
// =============================
app.get('/status', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT temp, peltier, created_at FROM readings ORDER BY id DESC LIMIT 1'
        );
        res.json(rows[0] || { temp: null, peltier: null, created_at: null });
    } catch (err) {
        console.error('DB read failed:', err.message);
        res.status(500).json({ error: 'database error' });
    }
});

// =============================
// Last 100 readings as JSON
// =============================
app.get('/history', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT temp, peltier, created_at FROM readings ORDER BY id DESC LIMIT 100'
        );
        res.json(rows);
    } catch (err) {
        console.error('DB read failed:', err.message);
        res.status(500).json({ error: 'database error' });
    }
});

// =============================
// Live dashboard
// =============================
app.get('/', async (req, res) => {
    let latest = { temp: null, peltier: null, created_at: null };

    try {
        const [rows] = await pool.query(
            'SELECT temp, peltier, created_at FROM readings ORDER BY id DESC LIMIT 1'
        );
        if (rows[0]) latest = rows[0];
    } catch (err) {
        console.error('DB read failed:', err.message);
    }

    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Water Temp / Peltier Monitor</title>
    <meta http-equiv="refresh" content="5">
    <style>
        body { font-family: sans-serif; background: #111; color: #eee; text-align: center; padding-top: 60px; }
        .temp { font-size: 4em; margin: 10px 0; }
        .peltier { font-size: 1.5em; padding: 8px 20px; border-radius: 8px; display: inline-block; }
        .on  { background: #2e7d32; }
        .off { background: #444; }
        .updated { color: #999; margin-top: 20px; font-size: 0.9em; }
    </style>
</head>
<body>
    <h1>Water Temperature Monitor</h1>
    <div class="temp">${latest.temp !== null ? latest.temp : '--'} &deg;C</div>
    <div class="peltier ${latest.peltier ? 'on' : 'off'}">Peltier: ${latest.peltier ? 'ON' : 'OFF'}</div>
    <div class="updated">Last updated: ${latest.created_at || 'no data yet'}</div>
</body>
</html>`);
});

initDb()
    .then(() => {
        // host 0.0.0.0 is required so the ESP32 can reach this over the LAN
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server listening on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Failed to connect to database:', err.message);
        process.exit(1);
    });
