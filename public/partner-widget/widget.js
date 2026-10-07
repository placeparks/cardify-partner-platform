/** TCGPlaytest: public-code uploads, plus backwards-compatible server launchers. */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) return;
  var platformOrigin = new URL(script.src).origin;
  var settings = script.dataset || {};
  var checkoutOrigin = settings.checkoutOrigin ? new URL(settings.checkoutOrigin).origin : platformOrigin;
  var defaults = { cartEndpoint: settings.cartEndpoint || "/api/tcgplaytest/cart", statusEndpoint: settings.cartStatusEndpoint };
  var activeRequest = null;
  var standaloneConfig = {}, attempt = null;
  var savedKey = "tcgp-widget:" + platformOrigin + ":" + settings.partnerKey + ":" + (settings.mode || "live");

  function saveAttempt() {
    // Persist only a submitted cart attempt, never card bytes or partner secrets.
    if (!attempt || !attempt.payload) return;
    try { sessionStorage.setItem(savedKey, JSON.stringify({ token: attempt.token, expires: attempt.expires, payload: attempt.payload })); } catch (_) {}
  }
  function reset() {
    if (activeRequest) throw new Error("Wait for the current checkout to finish.");
    attempt = null;
    try { sessionStorage.removeItem(savedKey); } catch (_) {}
  }
  async function widgetRequest(path, method, body, token) {
    for (var retry = 0; ; retry++) {
      var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 30000);
      try {
        var headers = { "Content-Type": "application/json" };
        if (token) headers.Authorization = "Bearer " + token;
        var response = await fetch(platformOrigin + "/api/widget/" + path, { method: method, headers: headers,
          body: body === undefined ? undefined : JSON.stringify(body), credentials: "omit", redirect: "error", cache: "no-store", signal: controller.signal });
        var value = await response.json().catch(function () { return {}; });
        if (!response.ok) {
          var failure = new Error(value.error && value.error.message || "The widget service is unavailable. Please retry.");
          failure.status = response.status;
          failure.retryAfter = Number(response.headers.get("Retry-After")) || 60;
          throw failure;
        }
        return value;
      } catch (error) {
        // Same request IDs/payloads make retries safe. Quotas and authorization
        // failures need a visible outcome instead of an endless retry loop.
        if (retry >= 1 || (error.status && error.status < 500)) throw error;
        await new Promise(function (resolve) { setTimeout(resolve, 1000); });
      } finally { clearTimeout(timer); }
    }
  }
  function progressDialog() {
    var dialog = document.createElement("dialog"), title = document.createElement("h2"), message = document.createElement("p"), close = document.createElement("button");
    dialog.style.cssText = "box-sizing:border-box;width:min(440px,calc(100vw - 32px));max-height:85vh;overflow:auto;padding:24px;border:1px solid #626b80;border-radius:16px;background:#111827;color:#fff;font:16px/1.6 system-ui";
    title.textContent = "Print with TCGPlaytest"; title.style.cssText = "font-size:22px;margin:0 0 12px";
    message.setAttribute("role", "status"); message.setAttribute("aria-live", "polite");
    close.textContent = "Close"; close.type = "button"; close.disabled = true;
    close.style.cssText = "min-height:44px;padding:8px 20px;cursor:pointer";
    close.onclick = function () { dialog.close(); dialog.remove(); };
    dialog.addEventListener("cancel", function (event) { if (close.disabled) event.preventDefault(); });
    dialog.appendChild(title); dialog.appendChild(message); dialog.appendChild(close); document.body.appendChild(dialog); dialog.showModal();
    return { update: function (text) { message.textContent = text; }, finish: function () { close.disabled = false; } };
  }
  async function standalone(options) {
    var config = Object.assign({}, standaloneConfig, options || {});
    var dialog = config.showDialog === false ? null : progressDialog();
    function progress(text) { if (dialog) dialog.update(text); if (config.onProgress) config.onProgress(text); }
    try {
      if (!attempt) {
        try { var saved = JSON.parse(sessionStorage.getItem(savedKey) || "null"); if (saved && saved.payload && saved.token && saved.expires > Date.now()) attempt = saved; } catch (_) {}
      }
      if (attempt && attempt.expires <= Date.now()) { attempt = null; try { sessionStorage.removeItem(savedKey); } catch (_) {} }
      if (!attempt) {
        var items = config.getItems ? await config.getItems() : config.items;
        if (!Array.isArray(items) || !items.length) throw new Error("Connect your editor's finished front/back images using TCGPlaytest.configure({getItems}).");
        var total = 0;
        items.forEach(function (item) {
          if (!item || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !item.front || !item.back) throw new Error("Each design needs front/back images and a positive whole-number quantity.");
          total += item.quantity;
        });
        progress("Connecting to TCGPlaytest…");
        var session = await widgetRequest("sessions", "POST", { partner_key: settings.partnerKey, mode: settings.mode || "live" });
        if (total > session.max_cards || items.length > session.max_cards) throw new Error("This order exceeds the maximum of " + session.max_cards + " cards.");
        attempt = { token: session.token, expires: Date.parse(session.expires_at), items: items, uploaded: [], blobs: new Map(), externalRef: config.externalRef };
      }
      if (!attempt.payload) {
        async function upload(value) {
          var blob = typeof value === "function" ? await value() : value;
          if (!(blob instanceof Blob) || ["image/png", "image/jpeg"].indexOf(blob.type) === -1 || !blob.size || blob.size > 20 * 1024 * 1024) throw new Error("Use PNG/JPEG images up to 20 MiB.");
          if (attempt.blobs.has(blob)) return attempt.blobs.get(blob);
          var image = await createImageBitmap(blob);
          var tooBig = image.width * image.height > 40000000; image.close();
          if (tooBig) throw new Error("Images must be no larger than 40 megapixels.");
          var grant = await widgetRequest("uploads", "POST", { request_id: crypto.randomUUID(), content_type: blob.type, size: blob.size }, attempt.token);
          var url = new URL(grant.upload_url);
          if (url.protocol !== "https:" || url.username || url.password || grant.method !== "PUT") throw new Error("The service returned an invalid upload link.");
          var uploaded = await fetch(url.href, { method: "PUT", headers: { "Content-Type": blob.type }, body: blob, credentials: "omit", redirect: "error", signal: AbortSignal.timeout(120000) });
          if (!uploaded.ok) throw new Error("Image upload failed. Please retry checkout.");
          attempt.blobs.set(blob, grant.id);
          return grant.id;
        }
        for (var i = 0; i < attempt.items.length; i++) {
          if (attempt.uploaded[i] && attempt.uploaded[i].front_upload_id && attempt.uploaded[i].back_upload_id) continue;
          progress("Uploading design " + (i + 1) + " of " + attempt.items.length + "…");
          var item = attempt.items[i];
          var partial = attempt.uploaded[i] || (attempt.uploaded[i] = { quantity: item.quantity });
          if (!partial.front_upload_id) partial.front_upload_id = await upload(item.front);
          if (!partial.back_upload_id) partial.back_upload_id = await upload(item.back);
        }
        attempt.payload = { items: attempt.uploaded };
        if (attempt.externalRef) attempt.payload.external_ref = attempt.externalRef;
        saveAttempt();
      }
      progress("Submitting artwork for validation…");
      var result = await widgetRequest("cart", "POST", attempt.payload, attempt.token);
      var deadline = Date.now() + 10 * 60 * 1000;
      while (result.status === "validating") {
        progress("Checking artwork: " + (result.progress && result.progress.done || 0) + " / " + (result.progress && result.progress.total || 0) + " images");
        if (Date.now() > deadline) throw new Error("Artwork is still being checked. Click again to resume this checkout.");
        await new Promise(function (resolve) { setTimeout(resolve, 4000); });
        try { result = await widgetRequest("cart", "GET", undefined, attempt.token); }
        catch (error) {
          if (error.status !== 429) throw error;
          await new Promise(function (resolve) { setTimeout(resolve, Math.max(4, Math.min(error.retryAfter, 300)) * 1000); });
        }
      }
      if (result.status !== "open") {
        if (["failed", "expired", "cancelled", "converted"].indexOf(result.status) !== -1) { attempt = null; try { sessionStorage.removeItem(savedKey); } catch (_) {} }
        throw new Error((result.errors || []).map(function (item) { return "Item " + (item.item_index + 1) + " " + (item.side || "") + ": " + item.message; }).join(" ") || "Checkout is " + result.status + ". Start a new order if appropriate.");
      }
      progress("Artwork checked. Opening checkout…");
      window.location.assign(checkoutUrl(result.checkout_url));
    } catch (error) { progress(error.message); throw error; }
    finally { if (dialog) dialog.finish(); }
  }

  function checkoutUrl(value) {
    var url = new URL(value);
    var local = ["localhost", "127.0.0.1", "[::1]"].indexOf(url.hostname) !== -1;
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
        [platformOrigin, checkoutOrigin].indexOf(url.origin) === -1 || url.username || url.password ||
        !/^\/partner-checkout\/[A-Za-z0-9_-]{32,256}$/.test(url.pathname) || url.search || url.hash) {
      throw new Error("Your server returned an invalid TCGPlaytest checkout link.");
    }
    return url.href;
  }

  async function start(options) {
    if (settings.partnerKey) return standalone(options);
    var config = Object.assign({}, defaults, options || {});
    var result;
    if (typeof config.createCart === "function") {
      result = await config.createCart();
    } else {
      var endpoint = new URL(config.cartEndpoint, window.location.origin);
      if (endpoint.origin !== window.location.origin || endpoint.username || endpoint.password) {
        throw new Error("The cart endpoint must be on your own website.");
      }
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, 30000);
      try {
        // The partner endpoint authenticates its customer, loads that customer's cart,
        // calls POST /v1/carts with its server-only API key.
        var response = await fetch(endpoint.href, {
          method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store",
          headers: { "Content-Type": "application/json" }, body: "{}", signal: controller.signal,
        });
        result = await response.json().catch(function () { return null; });
        if (!response.ok) {
          throw new Error(result && (result.error && result.error.message || result.error) ||
            "Your shop's checkout connection is unavailable. Please contact the shop.");
        }
      } finally { clearTimeout(timeout); }
    }
    var deadline = Date.now() + 10 * 60 * 1000;
    while (result && result.status === "validating") {
      if (Date.now() > deadline) throw new Error("Artwork is still being checked. Try again to resume this cart.");
      if (typeof result.id !== "string" || !/^cart_[a-f0-9]{64}$/.test(result.id)) throw new Error("Your server returned an invalid cart ID.");
      await new Promise(function (resolve) { setTimeout(resolve, 3000); });
      if (typeof config.pollCart === "function") result = await config.pollCart(result.id);
      else {
        var statusUrl = new URL(config.statusEndpoint || config.cartEndpoint, window.location.origin);
        if (statusUrl.origin !== window.location.origin || statusUrl.username || statusUrl.password) throw new Error("The status endpoint must be on your own website.");
        statusUrl.searchParams.set("cart_id", result.id);
        var pollController = new AbortController();
        var pollTimeout = setTimeout(function () { pollController.abort(); }, 30000);
        try {
          var poll = await fetch(statusUrl.href, {credentials:"same-origin",redirect:"error",cache:"no-store",signal:pollController.signal});
          if (poll.status === 429) {
            var delay = Number(poll.headers.get("Retry-After")) || 60;
            await new Promise(function (resolve) { setTimeout(resolve, Math.max(3, delay) * 1000); });
            continue;
          }
          var next = await poll.json();
          if (!poll.ok) throw new Error(next.error && next.error.message || "Could not check artwork. Try again to resume.");
          result = next;
        } finally { clearTimeout(pollTimeout); }
      }
    }
    if (result && result.status === "failed") {
      throw new Error((result.errors || []).map(function (item) { return "Item " + (item.item_index + 1) + " " + (item.side || "") + ": " + item.message; }).join(" ") || "Artwork checks failed. Fix the files and create a new cart.");
    }
    if (!result || result.status && result.status !== "open" || typeof result.checkout_url !== "string") {
      throw new Error("Your server must return an open cart with its checkout_url after validation.");
    }
    // A redirect uses the normal checkout, including the customer's affiliate-code field.
    // Payment/production success must be confirmed with signed order webhooks.
    window.location.assign(checkoutUrl(result.checkout_url));
  }

  function open(options) {
    if (!activeRequest) {
      activeRequest = start(options).finally(function () { activeRequest = null; });
    }
    return activeRequest;
  }

  function install() {
    if (document.querySelector("[data-tcgplaytest-launcher]") || settings.autoButton === "false") return;
    var container = document.createElement("div");
    container.setAttribute("data-tcgplaytest-widget", "true");
    container.style.cssText = "position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));z-index:2147482900;width:max-content;max-width:calc(100vw - 32px - env(safe-area-inset-left) - env(safe-area-inset-right));font:14px Inter,Arial,sans-serif;box-sizing:border-box";
    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-tcgplaytest-launcher", "true");
    var label = settings.label || "Print with TCGPlaytest";
    button.style.cssText = "display:inline-flex;align-items:center;justify-content:center;gap:10px;max-width:100%;min-height:52px;box-sizing:border-box;border:0;border-radius:0;background:linear-gradient(100deg,#e06e53,#ed8427 48%,#f5af38);color:#2a1200;padding:14px 20px;font:800 14px/1.4 Inter,Arial,sans-serif;text-align:center;text-transform:none;letter-spacing:normal;cursor:pointer;box-shadow:0 12px 30px #0004;white-space:normal;overflow-wrap:anywhere";
    var logo = document.createElement("img");
    logo.src = platformOrigin + "/pwa-icons/favicon.svg";
    logo.alt = "";
    logo.width = 28; logo.height = 28;
    logo.style.cssText = "display:block;flex:none;width:28px;height:28px;object-fit:contain";
    logo.addEventListener("error", function () { logo.hidden = true; logo.style.display = "none"; });
    var labelText = document.createElement("span");
    labelText.textContent = label;
    labelText.style.cssText = "min-width:0";
    button.appendChild(logo); button.appendChild(labelText);
    button.addEventListener("focus", function () { button.style.outline = "3px solid #b6abd4"; button.style.outlineOffset = "4px"; });
    button.addEventListener("blur", function () { button.style.outline = ""; button.style.outlineOffset = ""; });
    var error = document.createElement("p");
    error.setAttribute("role", "alert");
    error.style.cssText = "box-sizing:border-box;max-width:320px;margin:0 0 12px;padding:14px;background:#061f3e;color:#f4efff;border:1px solid #b6abd4;border-radius:0;font:14px/1.5 Inter,Arial,sans-serif;overflow-wrap:anywhere";
    error.hidden = true;
    button.addEventListener("click", async function () {
      if (button.disabled) return;
      button.disabled = true; button.setAttribute("aria-busy", "true"); labelText.textContent = "Checking artwork…"; error.hidden = true;
      try { await open(); }
      catch (caught) { error.textContent = caught.name === "AbortError" ? "Checkout timed out. Please try again." : caught.message; error.hidden = false; }
      finally { button.disabled = false; button.setAttribute("aria-busy", "false"); labelText.textContent = label; }
    });
    container.appendChild(error); container.appendChild(button); document.body.appendChild(container);
  }
  window.TCGPlaytest = { open: open, reset: reset, configure: function (options) { standaloneConfig = Object.assign({}, standaloneConfig, options); }, standalone: Boolean(settings.partnerKey) };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
