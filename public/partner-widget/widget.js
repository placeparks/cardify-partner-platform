/** TCGPlaytest checkout launcher. API credentials and artwork stay on the partner's server. */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) return;
  var platformOrigin = new URL(script.src).origin;
  var settings = script.dataset || {};
  var checkoutOrigin = settings.checkoutOrigin ? new URL(settings.checkoutOrigin).origin : platformOrigin;
  var defaults = { cartEndpoint: settings.cartEndpoint || "/api/tcgplaytest/cart" };
  var activeRequest = null;

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
        // certifies the artwork and calls POST /v1/carts with its server-only API key.
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
    if (!result || typeof result.checkout_url !== "string") {
      throw new Error("Your server must return checkout_url from POST /v1/carts.");
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
      button.disabled = true; button.setAttribute("aria-busy", "true"); labelText.textContent = "Opening checkout…"; error.hidden = true;
      try { await open(); }
      catch (caught) { error.textContent = caught.name === "AbortError" ? "Checkout timed out. Please try again." : caught.message; error.hidden = false; }
      finally { button.disabled = false; button.setAttribute("aria-busy", "false"); labelText.textContent = label; }
    });
    container.appendChild(error); container.appendChild(button); document.body.appendChild(container);
  }
  window.TCGPlaytest = { open: open };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
