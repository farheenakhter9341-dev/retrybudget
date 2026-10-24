"""RetryBudget simulation engine (pure Python, discrete time: 1 tick = 1 second).

One server pool, N clients, an outage followed by a cold-start warm-up. All five
strategies replay the *same* seeded job arrivals so the comparison is fair.
Overload model: offered load > capacity reduces effective capacity (thrashing),
so retry storms genuinely hurt goodput instead of just queueing.
"""
import math, random

DEFAULTS = dict(clients=30, rate=1.2, capacity=60, duration=300, outage_start=60,
                outage_len=40, warmup=25, deadline=150, seed=7, target_util=0.85,
                bundle_max=5, heavy=0.15)
STRATS = ["immediate", "fixed", "exponential", "jitter", "retrybudget"]


class Job:
    __slots__ = ("c", "cost", "born", "att", "nxt")
    def __init__(s, c, cost, born):
        s.c, s.cost, s.born, s.att, s.nxt = c, cost, born, 0, born


def poisson(r, lam):
    L, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= r.random()
        if p <= L:
            return k
        k += 1


def load(g):  # bundling amortises connection/auth overhead: 1 + 0.5 per extra unit
    s = sum(j.cost for j in g)
    return s if len(g) == 1 else 0.5 + 0.5 * s


def simulate(strat, P, arr):
    rng = random.Random(P["seed"] + 17)
    T, cap0 = P["duration"], P["capacity"]
    os_, oe, n = P["outage_start"], P["outage_start"] + P["outage_len"], P["clients"]

    def cap(t):
        if os_ <= t < oe: return 0.0
        if oe <= t < oe + P["warmup"]: return cap0 * (0.3 + 0.7 * (t - oe + 1) / P["warmup"])
        return float(cap0)

    def eff(off, c):  # congestion collapse: capacity shrinks under overload
        if c <= 0: return 0.0
        r = off / c
        return c if r <= 1 else c * max(0.35, 1 - 0.3 * (r - 1))

    def backoff(a):
        if strat == "immediate": return 1
        if strat == "fixed": return 5
        if strat == "exponential": return min(32, 2 ** (a - 1))
        return max(1.0, rng.uniform(1, min(32, 2 ** a)))  # full jitter

    pend, lat = [], []
    done = expired = reqs_total = 0
    wasted = 0.0
    tokens, probe_wait, next_probe = 0.0, 1.0, 0
    S = {k: [] for k in ("offered", "goodput", "pending", "ready", "debt", "tokens", "cap", "rej", "bundles")}
    CL = []
    for t in range(T):
        c = cap(t)
        keep = [j for j in pend if t - j.born <= P["deadline"]]
        expired += len(pend) - len(keep); pend = keep
        fresh = [Job(ci, co, t) for ci, co in arr[t]]
        rej = nb = 0
        if strat != "retrybudget":
            due = [j for j in pend if j.nxt <= t] + fresh
            pend = [j for j in pend if j.nxt > t]
            rng.shuffle(due)
            groups = [[j] for j in due]
        else:
            hint = cap(t - 1) if t > 0 else cap0       # health signal from gateway, 1 tick old
            if hint <= 0:                               # circuit open: shed fresh, send 1 probe
                for j in fresh:
                    j.nxt = t + backoff(1); pend.append(j)
                rej = len(fresh); groups = []; tokens = 0.0
                if t >= next_probe:
                    el = [j for j in pend if j.nxt <= t]
                    if el:
                        p = min(el, key=lambda j: j.born); pend.remove(p); groups = [[p]]
            else:
                bc = P["target_util"] * hint            # admission-control ceiling
                admitted, used = [], 0.0
                for j in fresh:                         # fresh traffic has priority
                    if used + j.cost <= bc: admitted.append([j]); used += j.cost
                    else: j.nxt = t + backoff(1); pend.append(j); rej += 1
                spare = bc - used
                debt = sum(j.cost for j in pend)
                pace = 0.5 + 0.5 * min(1.0, debt / (4 * cap0))   # more debt -> drain faster
                tokens = min(tokens + spare * pace, 2 * spare * pace)
                el = sorted((j for j in pend if j.nxt <= t), key=lambda j: j.born)  # oldest first
                byc = {}
                for j in el: byc.setdefault(j.c, []).append(j)
                bundles = [l[i:i + P["bundle_max"]] for l in byc.values() for i in range(0, len(l), P["bundle_max"])]
                bundles.sort(key=lambda g: g[0].born)
                sel = []
                for g in bundles:
                    l = load(g)
                    if l <= tokens and used + l <= bc:
                        tokens -= l; used += l; sel.append(g)
                rel = {id(j) for g in sel for j in g}
                pend = [j for j in pend if id(j) not in rel]
                nb = sum(1 for g in sel if len(g) > 1)
                groups = admitted + sel
        offered = sum(load(g) for g in groups)
        e = eff(offered, c)
        used = good = 0.0
        for g in groups:
            l = load(g)
            if used + l <= e + 1e-9:
                used += l; good += sum(j.cost for j in g); done += len(g)
                lat.extend(t - j.born + 1 for j in g)
                ok = True
            else:
                ok = False; wasted += l
                for j in g:
                    j.att += 1; j.nxt = t + backoff(j.att); pend.append(j)
            if strat == "retrybudget" and len(groups) == 1 and len(g) == 1 and cap(t - 1) <= 0 and t > 0:
                if ok: probe_wait = 1.0
                else: probe_wait = min(16.0, probe_wait * 2); next_probe = t + rng.uniform(.5, 1) * probe_wait
        reqs_total += len(groups)
        pc = [0] * n
        for j in pend: pc[j.c] += 1
        CL.append(pc)
        r2 = lambda x: round(x, 2)
        S["offered"].append(r2(offered)); S["goodput"].append(r2(good)); S["pending"].append(len(pend))
        S["ready"].append(sum(1 for j in pend if j.nxt <= t + 1)); S["debt"].append(r2(sum(j.cost for j in pend)))
        S["tokens"].append(r2(tokens)); S["cap"].append(r2(c)); S["rej"].append(rej); S["bundles"].append(nb)

    total = sum(len(a) for a in arr)
    lat.sort()
    pct = lambda q: lat[min(len(lat) - 1, int(q * len(lat)))] if lat else None
    rec = next((t - oe for t in range(oe, T) if S["pending"][t] <= 15), None)
    off_sum = sum(S["offered"]); good_sum = sum(S["goodput"])
    summ = dict(total=total, completed=done, expired=expired, unfinished=len(pend),
                success=round(100 * done / max(1, total), 1), amp=round(reqs_total / max(1, total), 2),
                peak=round(max(S["offered"]) / cap0, 2), p50=pct(.5), p95=pct(.95), rec=rec,
                waste=round(100 * wasted / max(1, off_sum), 1), peak_pending=max(S["pending"]))
    return dict(series=S, cl=CL, summary=summ)


def simulate_all(P):
    P = dict(P)
    P["outage_len"] = min(P["outage_len"], P["duration"] - 40 - P["outage_start"])
    r = random.Random(P["seed"])
    arr = [[(c, 3 if r.random() < P["heavy"] else 1) for c in range(P["clients"]) for _ in range(poisson(r, P["rate"]))]
           for _ in range(P["duration"])]
    return dict(params=P, res={s: simulate(s, P, arr) for s in STRATS})
