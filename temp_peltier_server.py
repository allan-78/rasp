#!/usr/bin/env python3
"""
Water temperature / Peltier monitoring server.
Separate from the pH server (that one is on :3000, this one is :3001).

Run with:   python3 temp_peltier_server.py
Requires:   pip3 install flask

The ESP32 POSTs JSON like {"temp": 24.87, "peltier": true} to /update.
Open http://<this-pi's-ip>:3001/ in a browser for a live status page.
"""

from flask import Flask, request, jsonify, render_template_string
from datetime import datetime
import threading

app = Flask(__name__)

PORT = 3001

lock = threading.Lock()
latest = {
    "temp": None,
    "peltier": None,
    "last_updated": None,
}

DASHBOARD_HTML = """
<!DOCTYPE html>
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
    <div class="temp">{{ temp if temp is not none else "--" }} &deg;C</div>
    <div class="peltier {{ 'on' if peltier else 'off' }}">
        Peltier: {{ "ON" if peltier else "OFF" }}
    </div>
    <div class="updated">Last updated: {{ last_updated or "no data yet" }}</div>
</body>
</html>
"""


@app.route("/update", methods=["POST"])
def update():
    data = request.get_json(silent=True)

    if not data or "temp" not in data:
        return jsonify({"error": "expected JSON body with a 'temp' field"}), 400

    with lock:
        latest["temp"] = data.get("temp")
        latest["peltier"] = bool(data.get("peltier", False))
        latest["last_updated"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        snapshot = dict(latest)

    print(f"[{snapshot['last_updated']}] temp={snapshot['temp']}  "
          f"peltier={'ON' if snapshot['peltier'] else 'OFF'}")

    return jsonify({"status": "ok"}), 200


@app.route("/status")
def status():
    with lock:
        return jsonify(latest)


@app.route("/")
def dashboard():
    with lock:
        data = dict(latest)
    return render_template_string(DASHBOARD_HTML, **data)


if __name__ == "__main__":
    # host="0.0.0.0" is required so the ESP32 can reach this over the LAN -
    # the default 127.0.0.1 only accepts connections from the Pi itself.
    app.run(host="0.0.0.0", port=PORT, debug=False)
