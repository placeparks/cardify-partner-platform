# Python 3; pip install requests
import os, time, requests
base = os.environ["API_BASE"].rstrip("/")
headers = {"Authorization": "Bearer " + os.environ["TCGP_API_KEY"]}
revision = os.environ["IDEMPOTENCY_KEY"]  # Load a persisted order revision, not a new value on retry.
def api(method, path, **kwargs):
    while True:
        response = requests.request(method, base + path, headers=headers,
                                    timeout=30, allow_redirects=False, **kwargs)
        if response.status_code == 429:
            delay = response.headers.get("Retry-After", "60")
            time.sleep(max(1, int(delay)) if delay.isdigit() else 60)
            continue
        if not 200 <= response.status_code < 300:
            raise RuntimeError("API error: " + response.text)
        return response.json()
payload = {
    "external_ref": revision,
    "return_url": os.environ["STORE_ORIGIN"].rstrip("/") + "/success",
    "items": [{"image_url": os.environ["FRONT_IMAGE_URL"], "quantity": 3}]
}
headers["Idempotency-Key"] = revision
cart = api("POST", "/v1/carts", json=payload)
del headers["Idempotency-Key"]
# Save cart["id"] against the authenticated customer's order in YOUR database.
while cart["status"] == "validating":
    time.sleep(4)
    cart = api("GET", "/v1/carts/" + cart["id"])
if cart["status"] == "open":
    checkout_url = cart["checkout_url"]  # Return the owned cart to your UI; call TCGPlaytest.checkout(cart).
elif cart["status"] == "converted" and cart.get("order_id"):
    order = api("GET", "/v1/orders/" + cart["order_id"])
else:
    raise RuntimeError(str({"status": cart["status"], "errors": cart.get("errors")}))
# After the customer returns, reload their saved cart and retrieve its order_id.
# Only the order API or a verified webhook confirms payment.
