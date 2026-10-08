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
  var estimates = new Map();
  // Blobs are immutable. A successful preview decode can serve upload preflight
  // too; WeakSet entries do not retain old card files after a reset/close.
  var checkedBlobs = new WeakSet();
  function estimate(quantity) {
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) return Promise.reject(new Error("Choose 1–1,000 cards."));
    if (estimates.has(quantity) && estimates.get(quantity).expires <= Date.now()) estimates.delete(quantity);
    if (!estimates.has(quantity)) {
      var pending = fetch(platformOrigin + "/v1/estimate?quantity=" + quantity, { credentials: "omit", signal: AbortSignal.timeout(10000) })
        .then(async function (response) {
          var value = await response.json();
          if (!response.ok || value.currency !== "USD" || value.quantity !== quantity || !Number.isSafeInteger(value.subtotal_amount) || value.subtotal_amount < 0) throw new Error("Price estimate unavailable");
          return value;
        }).catch(function (error) { estimates.delete(quantity); throw error; });
      estimates.set(quantity, { pending: pending, expires: Date.now() + 60000 });
    }
    return estimates.get(quantity).pending;
  }
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
  function restoreAttempt() {
    if (!attempt) {
      try { var saved = JSON.parse(sessionStorage.getItem(savedKey) || "null"); if (saved && saved.payload && saved.token && saved.expires > Date.now()) attempt = saved; } catch (_) {}
    }
    if (attempt && attempt.expires <= Date.now()) { attempt = null; try { sessionStorage.removeItem(savedKey); } catch (_) {} }
  }

  // Resolve shared backs centrally for preview and upload; retain per-design arrays.
  function snapshotItems(input) {
    var sharedBack = !Array.isArray(input) && input ? input.sharedBack : undefined;
    var items = Array.isArray(input) ? input : input && input.items;
    if (!Array.isArray(items) || !items.length) throw new Error("Connect your editor's finished front/back images using TCGPlaytest.configure({getItems}).");
    var factories = new Map();
    function cached(value) {
      if (typeof value !== "function") return value;
      if (!factories.has(value)) {
        var pending;
        factories.set(value, function () {
          if (!pending) pending = Promise.resolve().then(value).catch(function (error) { pending = null; throw error; });
          return pending;
        });
      }
      return factories.get(value);
    }
    return items.map(function (item, index) {
      var back = item && item.back != null ? item.back : sharedBack;
      if (!item || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !item.front) throw new Error("Each design needs a front and a positive whole-number quantity.");
      return { label: typeof item.label === "string" ? item.label : "Card " + (index + 1), front: cached(item.front), back: cached(back), sharedBack: cached(sharedBack), canSeparate: item.back != null && item.back !== sharedBack, quantity: item.quantity };
    });
  }

  // The shared widget owns the review UI. Partners only supply finished images.
  function reviewDialog(config) {
    return new Promise(function (resolve) {
      var host = document.createElement("div"), root = host.attachShadow({ mode: "open" });
      host.setAttribute("data-tcgplaytest-review", "true");
      function element(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
      }
      var style = element("style");
      style.textContent = `
        :host{all:initial;color-scheme:dark}*{box-sizing:border-box}[hidden]{display:none!important}
        dialog{width:min(1080px,calc(100vw - 32px));height:min(860px,calc(100dvh - 32px));max-width:none;max-height:none;margin:auto;padding:0;border:1px solid #34445e;border-radius:20px;background:#0b1424;color:#f8fafc;font:15px/1.5 system-ui,sans-serif;box-shadow:0 30px 100px #0008;overflow:hidden}
        dialog::backdrop{background:#020817cc;backdrop-filter:blur(5px)}
        .shell{height:100%;display:flex;flex-direction:column}.header{padding:22px 28px 18px;background:#111e33;border-bottom:1px solid #293951}
        .brand-row,.brand,.steps,.summary,.pager,.footer,.actions{display:flex;align-items:center;gap:12px}.brand-row{justify-content:space-between}.brand{font-weight:800;font-size:22px;letter-spacing:-.6px}.brand img{width:46px;height:40px;object-fit:contain}.brand small{display:block;color:#99afcc;font-size:11px;font-weight:500;letter-spacing:.08em;text-transform:uppercase}
        button{font:inherit;border:1px solid #3a4c67;border-radius:9px;background:#17263e;color:#f8fafc;padding:10px 15px;cursor:pointer;min-height:44px;font-weight:650}button:hover:enabled{background:#243956}button:focus-visible{outline:3px solid #f5af38;outline-offset:3px}button:disabled{opacity:.45;cursor:not-allowed}.close{font-size:24px;line-height:1;padding:8px 14px}
        .steps{margin-top:20px;color:#9daec5;font-size:12px;gap:18px}.step-active{color:#f5af38;font-weight:750}.step-num{display:inline-grid;place-items:center;width:24px;height:24px;border:1px solid currentColor;border-radius:50%;margin-right:6px}.steps .divider{height:1px;background:#34445e;flex:1}
        .content{overflow-y:auto;flex:1;min-height:0;padding:24px 28px}.summary{justify-content:space-between;flex-wrap:wrap;margin-bottom:16px}h1{font-size:26px;line-height:1.2;letter-spacing:-.6px;margin:0 0 6px}p{margin:0}.muted{color:#a5b5cd;font-size:13px}.count{background:#23324a;padding:8px 12px;border-radius:8px;font-weight:700;white-space:nowrap}.notice{padding:12px 14px;background:#142b3b;border:1px solid #29536a;border-radius:9px;color:#c4e6f6;margin-bottom:20px;font-size:13px}
        .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.card{padding:12px;border:1px solid #2a3b54;border-radius:12px;background:#111e32;min-width:0}.card-heading{display:flex;gap:8px;justify-content:space-between;align-items:start;margin-bottom:12px}.card-title{font-size:13px;font-weight:700;overflow-wrap:anywhere}.quantity{font-size:11px;color:#f5c276;white-space:nowrap;background:#3a2c21;border-radius:5px;padding:3px 6px}.faces{display:grid;grid-template-columns:1fr 1fr;gap:10px}figure{margin:0;min-width:0}figcaption{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#9eb2cc;margin-bottom:6px}.image{display:grid;place-items:center;aspect-ratio:63/88;background:#080e19;border:1px solid #2d3d53;border-radius:7px;overflow:hidden}.image img{width:100%;height:100%;object-fit:contain;display:block}.placeholder{color:#7d92ae;font-size:11px;padding:10px;text-align:center}.empty{grid-column:1/-1;padding:26px;border:1px dashed #425672;border-radius:12px;color:#bccbe0;text-align:center}.pager{justify-content:center;margin-top:22px;font-size:12px}.pager button{font-size:12px;min-height:40px}.pager span{color:#b4c3d8}
        .footer{padding:18px 28px;border-top:1px solid #2b3c54;background:#111e33;justify-content:space-between;flex-wrap:wrap}.footer-copy{max-width:440px}.status{font-size:13px;color:#c4d5eb;margin-top:6px;overflow-wrap:anywhere}.error{color:#ffb3ae}.primary{background:linear-gradient(105deg,#e8774e,#f5af38);color:#241407;border:0;min-width:205px;font-weight:800}.primary:hover:enabled{background:#ffc36b}.secondary{font-size:12px;padding:8px 10px}.actions{flex-wrap:wrap}.busy{cursor:progress}
        @media(max-width:760px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.header,.content{padding:18px}.footer{padding:15px 18px}.brand{font-size:19px}.steps{gap:8px;font-size:11px}.footer-copy{max-width:none}}
        @media(max-width:460px){dialog{width:100vw;height:100dvh;border-radius:0;border:0}.grid{grid-template-columns:1fr}.faces{gap:14px}.brand img{width:38px}.steps .divider{display:none}.steps{justify-content:space-between}.steps .step-num{width:20px;height:20px;margin-right:3px}.footer{gap:10px}.actions,.primary{width:100%}.actions{justify-content:space-between}.footer .muted{font-size:11px}.content{padding:16px}.card{padding:14px}h1{font-size:23px}}
      `;
      root.appendChild(style);
      var dialog = element("dialog"), shell = element("div", "shell"), header = element("header", "header");
      dialog.setAttribute("aria-labelledby", "tcgp-review-title");
      var brandRow = element("div", "brand-row"), brand = element("div", "brand"), logo = element("img");
      logo.src = platformOrigin + "/pwa-icons/favicon.svg"; logo.alt = "";
      logo.addEventListener("error", function () { logo.hidden = true; });
      var brandText = element("div", "", "TCGPlaytest"); brandText.appendChild(element("small", "", "Custom card printing"));
      brand.appendChild(logo); brand.appendChild(brandText);
      var close = element("button", "close", "×"); close.type = "button"; close.setAttribute("aria-label", "Close card preview");
      brandRow.appendChild(brand); brandRow.appendChild(close); header.appendChild(brandRow);
      var steps = element("nav", "steps"); steps.setAttribute("aria-label", "Checkout steps");
      ["Review cards", "Your details", "Payment"].forEach(function (label, index) {
        if (index) steps.appendChild(element("span", "divider"));
        var step = element("span", index === 0 ? "step-active" : "");
        if (!index) step.setAttribute("aria-current", "step");
        step.appendChild(element("span", "step-num", String(index + 1))); step.appendChild(document.createTextNode(label)); steps.appendChild(step);
      });
      header.appendChild(steps); shell.appendChild(header);
      var content = element("main", "content"), summary = element("div", "summary"), intro = element("div");
      var title = element("h1", "", "Review your cards"); title.id = "tcgp-review-title";
      intro.appendChild(title); intro.appendChild(element("p", "muted", "Check each front, matching back, and quantity before checkout."));
      var count = element("span", "count", "Preparing previews…"); summary.appendChild(intro); summary.appendChild(count); content.appendChild(summary);
      var price = element("p", "notice", "Loading print estimate…"); content.appendChild(price);
      var quality = element("p", "notice", "Some images are below the recommended 744 × 1040 pixels and may print blurry or pixelated. You can still order them. Continuing means you accept their print quality.");
      quality.hidden = true; content.appendChild(quality);
      var grid = element("div", "grid"), pager = element("div", "pager");
      var previous = element("button", "", "Previous"), pageLabel = element("span"), next = element("button", "", "Next");
      previous.type = next.type = "button"; pager.appendChild(previous); pager.appendChild(pageLabel); pager.appendChild(next); pager.hidden = true;
      content.appendChild(grid); content.appendChild(pager); shell.appendChild(content);
      var footer = element("footer", "footer"), footerCopy = element("div", "footer-copy");
      footerCopy.appendChild(element("p", "muted", "Next: enter your details on TCGPlaytest. No payment is taken here."));
      var status = element("p", "status", "Preparing your card previews…"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
      footerCopy.appendChild(status); footer.appendChild(footerCopy);
      var actions = element("div", "actions"), fresh = element("button", "secondary", "Use current designs"), proceed = element("button", "primary", "Proceed to checkout");
      fresh.type = proceed.type = "button"; fresh.hidden = true; proceed.disabled = true;
      actions.appendChild(fresh); actions.appendChild(proceed); footer.appendChild(actions); shell.appendChild(footer); dialog.appendChild(shell); root.appendChild(dialog); document.body.appendChild(host);
      var done = false, busy = false, loading = true, items = null, sourceItems = null, page = 0, generation = 0, urls = [], pageSize = 6;
      var separated = new Set(), layoutButtons = [], estimateGeneration = 0;
      var previousFocus = document.activeElement;
      function revokeUrls() { urls.forEach(function (url) { URL.revokeObjectURL(url); }); urls = []; }
      function finish() {
        if (busy || done) return;
        done = true; generation++; revokeUrls(); dialog.close(); host.remove();
        if (previousFocus && previousFocus.isConnected) previousFocus.focus();
        resolve();
      }
      close.onclick = finish;
      dialog.addEventListener("cancel", function (event) { event.preventDefault(); finish(); });
      function update(text, failed) { status.textContent = text; status.className = "status" + (failed ? " error" : ""); }
      function controls() {
        proceed.disabled = loading || busy;
        close.disabled = busy; fresh.disabled = busy || loading;
        previous.disabled = busy || loading || page === 0;
        next.disabled = busy || loading || !items || (page + 1) * pageSize >= items.length;
        layoutButtons.forEach(function (button) { button.disabled = busy || loading || Boolean(attempt); });
        proceed.textContent = busy ? "Preparing checkout…" : attempt ? "Resume checkout" : "Proceed to checkout";
        dialog.setAttribute("aria-busy", String(busy || loading));
      }
      function refreshSummary() {
        var orderItems = items || attempt.payload.items;
        var quantity = orderItems.reduce(function (sum, item) { return sum + item.quantity; }, 0);
        var revision = ++estimateGeneration;
        count.textContent = quantity + " cards · " + orderItems.length + " designs";
        price.textContent = "Loading print estimate…";
        estimate(quantity).then(function (value) { if (!done && revision === estimateGeneration) price.textContent = "Estimated printing: $" + (value.subtotal_amount / 100).toFixed(2) + " USD. Shipping, tax and discounts are calculated at checkout."; })
          .catch(function () { if (!done && revision === estimateGeneration) price.textContent = "Price estimate unavailable. Your final price will be shown before payment."; });
      }
      function applyLayout() {
        items = [];
        sourceItems.forEach(function (item, index) {
          if (separated.has(index)) {
            items.push({ label: item.label, front: item.front, back: item.sharedBack, quantity: item.quantity, sourceIndex: index, layoutControl: "combine" });
            items.push({ label: item.label + " — reverse face", front: item.back, back: item.sharedBack, quantity: item.quantity });
          } else {
            items.push(Object.assign({}, item, { sourceIndex: index, layoutControl: item.canSeparate ? "separate" : undefined }));
          }
        });
        page = Math.min(page, Math.floor((items.length - 1) / pageSize));
        refreshSummary();
      }
      function layoutControl(item) {
        var separate = item.layoutControl === "separate";
        var section = element("div"), button = element("button", "secondary", separate ? "Print both faces separately" : "Print front and back together");
        section.style.marginTop = "12px";
        button.type = "button"; button.disabled = true;
        button.setAttribute("aria-label", button.textContent + ": " + item.label);
        var explanation = element("p", "muted", separate ? "Two cards, each with your shared back or the TCGPlaytest back." : "These faces print as two cards. Combine them to print one double-sided card.");
        explanation.style.marginTop = "8px";
        button.onclick = async function () {
          if (done || loading || busy || attempt) return;
          var quantity = items.reduce(function (sum, card) { return sum + card.quantity; }, 0);
          if (separate && quantity + item.quantity > 1000) { update("Printing these faces separately would exceed the 1,000-card limit.", true); return; }
          if (separate) separated.add(item.sourceIndex); else separated.delete(item.sourceIndex);
          applyLayout(); await renderPage();
        };
        layoutButtons.push(button); section.appendChild(button); section.appendChild(explanation);
        return section;
      }
      async function renderPage() {
        var current = ++generation;
        loading = true; controls(); revokeUrls(); grid.replaceChildren(); layoutButtons = []; content.scrollTop = 0;
        update("Preparing your card previews…");
        if (!items) {
          grid.appendChild(element("p", "empty", "A previously submitted checkout is saved. Its card previews are no longer available after reloading. Resume that order, or choose Use current designs to review a new one."));
          pager.hidden = true; loading = false; controls(); update("Resume the saved checkout or review your current designs."); return;
        }
        pager.hidden = items.length <= pageSize;
        pageLabel.textContent = "Designs " + (page * pageSize + 1) + "–" + Math.min((page + 1) * pageSize, items.length) + " of " + items.length;
        try {
          var jobs = [], nextPreview = 0, previewError = null;
          for (var i = page * pageSize; i < Math.min((page + 1) * pageSize, items.length); i++) {
            var item = items[i], card = element("article", "card"), heading = element("div", "card-heading");
            heading.appendChild(element("span", "card-title", (i + 1) + ". " + item.label));
            heading.appendChild(element("span", "quantity", "Qty " + item.quantity)); card.appendChild(heading);
            var faces = element("div", "faces"); card.appendChild(faces); grid.appendChild(card);
            for (var side of ["front", "back"]) {
              var figure = element("figure"), frame = element("div", "image"), img = element("img");
              figure.appendChild(element("figcaption", "", side)); figure.appendChild(frame); faces.appendChild(figure);
              img.alt = item.label + " — " + side; frame.appendChild(img);
              jobs.push({ item: item, side: side, img: img, figure: figure });
            }
            if (item.layoutControl && !attempt) card.appendChild(layoutControl(item));
          }
          async function previewWorker() {
            while (!previewError && !done && current === generation && nextPreview < jobs.length) {
              var job = jobs[nextPreview++];
              try {
                var value = job.item[job.side], blob = null;
                if (job.side === "back" && value == null) {
                  job.img.src = platformOrigin + "/partner-widget/default-card-back.jpg";
                  job.figure.appendChild(element("small", "muted", "TCGPlaytest default back"));
                } else {
                  blob = typeof value === "function" ? await value() : value;
                  if (done || current !== generation) return;
                  if (!(blob instanceof Blob) || ["image/png", "image/jpeg"].indexOf(blob.type) === -1 || !blob.size || blob.size > 20 * 1024 * 1024) throw new Error("Use PNG/JPEG images up to 20 MiB for every front and back.");
                  var url = URL.createObjectURL(blob); urls.push(url); job.img.src = url;
                }
                await job.img.decode();
                if (done || current !== generation) return;
                if (job.img.naturalWidth * job.img.naturalHeight > 40000000) throw new Error("Images must be no larger than 40 megapixels.");
                if (blob) checkedBlobs.add(blob);
                if (job.img.naturalWidth < 744 || job.img.naturalHeight < 1040) {
                  quality.hidden = false;
                  job.figure.appendChild(element("small", "muted", "Low resolution — may print blurry"));
                }
              } catch (error) { previewError = previewError || error; }
            }
          }
          // Keep card order stable while decoding/rendering up to three faces.
          await Promise.all([previewWorker(), previewWorker(), previewWorker()]);
          if (done || current !== generation) return;
          if (previewError) throw previewError;
          loading = false; controls(); update(attempt ? "This is your previous checkout. Resume it or use your current designs." : "Review your cards, then proceed when you’re ready.");
        } catch (error) {
          if (done || current !== generation) return;
          // Keep checkout disabled when a preview cannot be rendered.
          loading = false; controls(); proceed.disabled = true; fresh.hidden = false;
          update(error.message || "A card preview could not load. Please check your images.", true);
        }
      }
      async function load() {
        loading = true; controls(); fresh.hidden = !attempt;
        quality.hidden = true;
        try {
          sourceItems = attempt ? (attempt.items || null) : snapshotItems(config.getItems ? await config.getItems() : config.items);
          if (done) return;
          page = 0; separated.clear();
          if (attempt) { items = sourceItems; refreshSummary(); } else applyLayout();
          await renderPage();
        } catch (error) {
          if (done) return;
          loading = false; controls(); proceed.disabled = true; fresh.hidden = false;
          update(error.message || "Could not prepare your cards.", true);
        }
      }
      previous.onclick = function () { if (!loading && !busy && page > 0) { page--; void renderPage(); } };
      next.onclick = function () { if (!loading && !busy && items && (page + 1) * pageSize < items.length) { page++; void renderPage(); } };
      fresh.onclick = function () {
        if (busy || loading) return;
        attempt = null; try { sessionStorage.removeItem(savedKey); } catch (_) {}
        void load();
      };
      proceed.onclick = async function () {
        if (busy || loading || proceed.disabled) return;
        busy = true; controls();
        try {
          await submitStandalone(Object.assign({}, config, { items: items, getItems: undefined, showDialog: false, onProgress: function (text) {
            update(text); if (config.onProgress) config.onProgress(text);
          } }));
          busy = false; finish();
        } catch (error) {
          busy = false; controls(); fresh.hidden = false; update(error.message, true);
        }
      };
      dialog.showModal(); close.focus(); void load();
    });
  }

  function standalone(options) {
    var config = Object.assign({}, standaloneConfig, options || {});
    restoreAttempt();
    return config.showDialog === false ? submitStandalone(config) : reviewDialog(config);
  }

  async function submitStandalone(options) {
    var config = Object.assign({}, standaloneConfig, options || {});
    var dialog = config.showDialog === false ? null : progressDialog();
    function progress(text) { if (dialog) dialog.update(text); if (config.onProgress) config.onProgress(text); }
    try {
      restoreAttempt();
      if (!attempt) {
        var items = snapshotItems(config.getItems ? await config.getItems() : config.items);
        var total = items.reduce(function (sum, item) { return sum + item.quantity; }, 0);
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
          // Cache the in-flight promise too: concurrent designs share one back upload.
          var pending = (async function () {
            if (!checkedBlobs.has(blob)) {
              var image = await createImageBitmap(blob);
              var tooBig = image.width * image.height > 40000000; image.close();
              if (tooBig) throw new Error("Images must be no larger than 40 megapixels.");
              checkedBlobs.add(blob);
            }
            var grant = await widgetRequest("uploads", "POST", { request_id: crypto.randomUUID(), content_type: blob.type, size: blob.size }, attempt.token);
            var url = new URL(grant.upload_url);
            if (url.protocol !== "https:" || url.username || url.password || grant.method !== "PUT") throw new Error("The service returned an invalid upload link.");
            var uploaded = await fetch(url.href, { method: "PUT", headers: { "Content-Type": blob.type }, body: blob, credentials: "omit", redirect: "error", signal: AbortSignal.timeout(120000) });
            if (!uploaded.ok) throw new Error("Image upload failed. Please retry checkout.");
            return grant.id;
          })();
          attempt.blobs.set(blob, pending);
          try { return await pending; }
          catch (error) {
            // Retry only a failed transfer. Successful and in-flight images stay reusable.
            if (attempt.blobs.get(blob) === pending) attempt.blobs.delete(blob);
            throw error;
          }
        }
        var uploadTasks = new Map(), uploadError = null, nextTask = 0;
        function uploadedCount() { return attempt.uploaded.filter(function (item, index) { return item && item.front_upload_id && (!attempt.items[index].back || item.back_upload_id); }).length; }
        attempt.items.forEach(function (item, index) {
          var partial = attempt.uploaded[index] || (attempt.uploaded[index] = { quantity: item.quantity });
          ["front", "back"].forEach(function (side) {
            var field = side + "_upload_id", value = item[side];
            if (!value || partial[field]) return;
            if (!uploadTasks.has(value)) uploadTasks.set(value, []);
            uploadTasks.get(value).push({ partial: partial, field: field });
          });
        });
        var tasks = Array.from(uploadTasks.entries());
        progress("Uploaded " + uploadedCount() + " of " + attempt.items.length + " designs…");
        async function uploadWorker() {
          while (!uploadError && nextTask < tasks.length) {
            var task = tasks[nextTask++];
            try {
              var id = await upload(task[0]);
              task[1].forEach(function (target) { target.partial[target.field] = id; });
              progress("Uploaded " + uploadedCount() + " of " + attempt.items.length + " designs…");
            } catch (error) { uploadError = uploadError || error; }
          }
        }
        // Schedule unique faces rather than whole designs. One slow shared back
        // occupies only one slot, and a double-sided card uploads both faces at
        // once. Drain all three before allowing a retry/reset.
        await Promise.all([uploadWorker(), uploadWorker(), uploadWorker()]);
        if (uploadError) throw uploadError;
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
  window.TCGPlaytest = { open: open, reset: reset, estimate: estimate, configure: function (options) { standaloneConfig = Object.assign({}, standaloneConfig, options); }, standalone: Boolean(settings.partnerKey), review: true };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
