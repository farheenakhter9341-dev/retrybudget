# RetryBudget – preventing retry storms after network outages
Run: `pip install -r requirements.txt && python app.py` then open http://127.0.0.1:5000
(Chart.js loads from a CDN, so the browser needs internet access the first time.)

## Algorithm (engine.py)
1. **Circuit/probe** – gateway health (1 tick old). During an outage fresh jobs are shed into a deferred queue
   (adds *recovery debt*); one probe is sent with exponential backoff + jitter.
2. **Admission control** – server load is capped at `target_util × capacity`; fresh traffic is admitted first.
3. **Recovery cost tokens** – unused capacity (`ceiling − fresh load`) is converted to tokens each tick.
   A retry costs tokens equal to its cost units. Refill is scaled by **recovery debt** (outstanding deferred cost):
   more debt → faster drain, but never above spare capacity.
4. **Deferred-work bundling** – eligible jobs of one client (oldest first) are merged into one request
   (load = 0.5 + 0.5·Σcost), saving per-request overhead.
5. **Exponential backoff + full jitter** on every failure, so releases de-synchronise.

Baselines: immediate retry, fixed 5 s, exponential backoff, exponential + full jitter — same seeded arrivals.
Server model: outage → warm-up ramp (30%→100%) → overload thrashing (effective capacity falls to as low as 35%).
Jobs expire after a 150 s deadline. Metrics are computed from the simulated per-job outcomes.
