"""End-to-end smoke test against a running stack (Jenkins 'Smoke Test' stage, or `docker compose up`).
Usage: python3 tests/api_smoke_test.py [http://localhost:5000/api]
Covers UR-2..UR-5: register -> balance -> deposit -> withdraw -> overdraft -> ERR_INSUFFICIENT_FUNDS."""
import json, sys, random, urllib.request, urllib.error, http.cookiejar

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5000/api"
jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def call(path, body=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    try:
        with op.open(req, timeout=10) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

def check(label, cond):
    print(("PASS " if cond else "FAIL ") + label)
    if not cond:
        sys.exit(1)

check("health", call("/health")[1].get("status") == "ok")
email = f"smoke{random.randint(1, 10**9)}@example.com"
s, _ = call("/auth/register", {"name": "Smoke Test", "email": email, "password": "Str0ng!Passw0rd", "accountType": "current"})
check("UR-2 register current account", s == 201)
s, acct = call("/accounts/me")
check("UR-3 balance inquiry (simulated $1,000.00)", s == 200 and acct["balance"] == 100000 and acct["type"] == "current")
s, r = call("/accounts/deposit", {"amount": 50})
check("UR-4 deposit $50 -> $1,050.00", s == 200 and r["balance"] == 105000)
s, r = call("/accounts/withdraw", {"amount": 20})
check("UR-5 withdraw $20 -> $1,030.00", s == 201 and r["balance"] == 103000)
s, r = call("/accounts/withdraw", {"amount": 1530})          # exactly balance + $500 overdraft
s2, r2 = call("/accounts/withdraw", {"amount": 5})           # now beyond L_max
check("SR-2.1 overdraft allowed down to -$500.00", s == 201)
check("SR-3.1 ERR_INSUFFICIENT_FUNDS beyond overdraft", s2 == 400 and r2.get("code") == "ERR_INSUFFICIENT_FUNDS")
s, _ = call("/auth/logout", {})
check("logout", s == 200)
s, _ = call("/accounts/me")
check("UR-1 session cleared after logout", s == 401)
print("smoke OK")
