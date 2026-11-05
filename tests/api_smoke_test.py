import json, sys, urllib.request, http.cookiejar, random
BASE = "http://localhost:5000/api"
jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def call(path, body=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json"})
    return json.load(op.open(req, timeout=10))
assert call("/health")["status"] == "ok"
email = f"smoke{random.randint(1,10**8)}@example.com"
call("/auth/register", {"name": "Smoke Test", "email": email, "password": "Str0ng!Passw0rd"})
assert call("/accounts/me")["balance"] >= 0
print("smoke OK"); sys.exit(0)
