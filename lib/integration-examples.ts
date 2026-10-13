// Runnable server/terminal examples. All credentials and deployment settings
// come from the caller's environment, never from this public documentation.
export const integrationExamples = {
  curl: String.raw`#!/usr/bin/env bash
# Bash, curl and jq. Set API_BASE, TCGP_API_KEY, STORE_ORIGIN,
# FRONT_IMAGE_URL and a persisted IDEMPOTENCY_KEY before running.
set -euo pipefail
[ -n "$API_BASE" ] && [ -n "$TCGP_API_KEY" ] && [ -n "$STORE_ORIGIN" ] || exit 1
[ -n "$FRONT_IMAGE_URL" ] && [ -n "$IDEMPOTENCY_KEY" ] || exit 1
umask 077
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
request() {
  local method="$1" path="$2" code delay
  shift 2
  while true; do
    code=$(curl --silent --show-error --max-time 30 \
      --dump-header "$work/headers" --output "$work/response" \
      --write-out '%{http_code}' --request "$method" \
      --header "Authorization: Bearer $TCGP_API_KEY" \
      "$API_BASE$path" "$@")
    if [ "$code" = 429 ]; then
      delay=$(awk 'tolower($1)=="retry-after:" {gsub("\r", "", $2); print $2}' "$work/headers")
      [[ "$delay" =~ ^[0-9]+$ ]] || delay=60
      sleep "$delay"; continue
    fi
    case "$code" in 2??) cat "$work/response"; return;; esac
    echo "API request failed (HTTP $code); inspect the error and retry the SAME cart payload/key if uncertain." >&2
    return 1
  done
}
jq -n --arg image "$FRONT_IMAGE_URL" --arg ref "$IDEMPOTENCY_KEY" \
  --arg return "$STORE_ORIGIN/success" \
  '{external_ref:$ref,return_url:$return,items:[{image_url:$image,quantity:3}]}' > "$work/cart.json"
cart=$(request POST /v1/carts --header 'Content-Type: application/json' \
  --header "Idempotency-Key: $IDEMPOTENCY_KEY" --data-binary @"$work/cart.json")
id=$(jq -er .id <<< "$cart")
# Persist id against YOUR customer's order before starting this poll.
while [ "$(jq -r .status <<< "$cart")" = validating ]; do
  sleep 4
  cart=$(request GET "/v1/carts/$id")
done
case "$(jq -r .status <<< "$cart")" in
  open) jq -r .checkout_url <<< "$cart";; # Inspect in this script; web apps pass the owned cart to TCGPlaytest.checkout(cart).
  converted) order=$(jq -er .order_id <<< "$cart"); request GET "/v1/orders/$order";;
  *) jq '{status,errors}' <<< "$cart" >&2; exit 1;;
esac`,
  python: String.raw`# Python 3; pip install requests
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
# Only the order API or a verified webhook confirms payment.`,
  php: String.raw`<?php
// PHP 8+ with cURL. Run on your server, never in browser JavaScript.
$base = rtrim(getenv('API_BASE'), '/');
$key = getenv('TCGP_API_KEY');
$revision = getenv('IDEMPOTENCY_KEY'); // Persist one value per order revision.
function api(string $method, string $path, ?array $body = null, ?string $idempotency = null): array {
    global $base, $key;
    do {
        $retryAfter = 60;
        $headers = ['Authorization: Bearer ' . $key];
        if ($body !== null) $headers[] = 'Content-Type: application/json';
        if ($idempotency !== null) $headers[] = 'Idempotency-Key: ' . $idempotency;
        $curl = curl_init($base . $path);
        $options = [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => 30, CURLOPT_HTTPHEADER => $headers,
            CURLOPT_HEADERFUNCTION => function ($curl, $line) use (&$retryAfter) {
                if (preg_match('/^Retry-After:\s*(\d+)/i', $line, $match)) $retryAfter = max(1, (int)$match[1]);
                return strlen($line);
            }];
        if ($body !== null) $options[CURLOPT_POSTFIELDS] = json_encode($body, JSON_THROW_ON_ERROR);
        curl_setopt_array($curl, $options);
        $raw = curl_exec($curl);
        $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $error = curl_error($curl);
        curl_close($curl);
        if ($raw === false) throw new RuntimeException($error);
        if ($status === 429) sleep($retryAfter);
    } while ($status === 429);
    if ($status < 200 || $status >= 300) throw new RuntimeException('API error: ' . $raw);
    return json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
}
$payload = ['external_ref' => $revision,
    'return_url' => rtrim(getenv('STORE_ORIGIN'), '/') . '/success',
    'items' => [['image_url' => getenv('FRONT_IMAGE_URL'), 'quantity' => 3]]];
$cart = api('POST', '/v1/carts', $payload, $revision);
// Save $cart['id'] against YOUR authenticated customer's order before polling.
while ($cart['status'] === 'validating') {
    sleep(4);
    $cart = api('GET', '/v1/carts/' . rawurlencode($cart['id']));
}
if ($cart['status'] === 'open') {
    $checkoutUrl = $cart['checkout_url']; // Send this URL only to the owning customer.
} elseif ($cart['status'] === 'converted' && !empty($cart['order_id'])) {
    $order = api('GET', '/v1/orders/' . rawurlencode($cart['order_id']));
} else {
    throw new RuntimeException('Cart ended with status: ' . $cart['status']);
}
// Returning to /success does not prove payment; verify the order API or webhook.`,
  uploadCurl: String.raw`# Bash + curl + jq. This creates ONE upload grant; it does not create a cart or charge.
set -euo pipefail
[ -n "$API_BASE" ] && [ -n "$TCGP_API_KEY" ] || exit 1
FILE=./front.png
TYPE=image/png
umask 077
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
size=$(wc -c < "$FILE" | tr -d ' ')
jq -n --arg type "$TYPE" --argjson size "$size" \
  '{content_type:$type,size:$size}' > "$work/metadata.json"
curl --fail-with-body --silent --show-error --max-time 30 \
  "$API_BASE/v1/uploads" --header "Authorization: Bearer $TCGP_API_KEY" \
  --header 'Content-Type: application/json' --data-binary @"$work/metadata.json" > "$work/grant.json"
upload=$(jq -er .upload_url "$work/grant.json")
method=$(jq -er .method "$work/grant.json")
type=$(jq -er '.headers["Content-Type"]' "$work/grant.json")
# Use ONLY the returned storage headers: do not send the partner key or cookies.
status=$(curl --silent --show-error --max-time 120 --request "$method" \
  --header "Content-Type: $type" --data-binary @"$FILE" \
  --output "$work/storage-response" --write-out '%{http_code}' "$upload")
case "$status" in 2??) ;; *) echo 'Upload failed; request a fresh grant.' >&2; exit 1;; esac
export FRONT_IMAGE_URL=$(jq -er .image_url "$work/grant.json")
# Use this unchanged in the create-cart examples. Do not log or share the grant.
# If grant creation returns 429, wait Retry-After (normally 60 seconds), then retry.`,
}

