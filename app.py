from flask import Flask, jsonify, render_template, request
from engine import simulate_all, DEFAULTS

app = Flask(__name__)
LIM = {"clients": (5, 60, int), "rate": (0.2, 3, float), "capacity": (20, 150, int),
       "outage_start": (10, 200, int), "outage_len": (5, 120, int), "warmup": (1, 60, int),
       "seed": (0, 99999, int)}

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/simulate")
def api():
    p = dict(DEFAULTS)
    for k, (lo, hi, ty) in LIM.items():
        try: p[k] = min(hi, max(lo, ty(request.args.get(k, p[k]))))
        except ValueError: pass
    return jsonify(simulate_all(p))

if __name__ == "__main__":
    print("RetryBudget dashboard: http://127.0.0.1:5000")
    app.run(port=5000)
