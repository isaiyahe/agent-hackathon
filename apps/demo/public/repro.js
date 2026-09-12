/* REPRO in-app sensor. Include once:
 *   <script src="/repro.js" data-endpoint="http://localhost:8787/incidents"></script>
 * Captures the last 20 semantic actions, failed fetches (status >= 400), and
 * runtime errors, and posts a sanitized Incident to the REPRO server.
 * Never sends cookies, headers, page HTML, or password values.
 */
(function () {
  var script = document.currentScript;
  var ENDPOINT = (script && script.getAttribute("data-endpoint")) || "http://localhost:8787/incidents";
  var MIN_STATUS = Number((script && script.getAttribute("data-min-status")) || 400);
  var MAX_ACTIONS = 20;
  var SENSITIVE = /pass(word|wd|code)?|secret|token|api[-_]?key|cvv|cvc|card|ssn|otp|pin\b|auth/i;
  var origFetch = window.fetch;
  var start = Date.now();
  var actions = [];
  var lastError = null;
  var lastSent = {};

  function locatorFor(el) {
    if (!el || !el.getAttribute) return "";
    return el.getAttribute("data-testid") || el.id || (el.name ? "[name=" + el.name + "]" : "") ||
      ((el.textContent || "").trim().slice(0, 40) || el.tagName.toLowerCase());
  }
  function fieldName(el) {
    var lbl = el.id ? document.querySelector('label[for="' + el.id + '"]') : null;
    if (!lbl && el.closest) lbl = el.closest("label");
    var text = lbl ? (lbl.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40) : "";
    return text || el.getAttribute("aria-label") || el.name || el.getAttribute("placeholder") || locatorFor(el);
  }
  function labelFor(kind, el) {
    if (kind === "input") return "Type " + fieldName(el);
    var text = el.getAttribute("aria-label") || (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40) || locatorFor(el);
    return "Click " + text;
  }
  function push(a) {
    actions.push(a);
    if (actions.length > MAX_ACTIONS) actions.shift();
  }
  function isSensitive(el) {
    return el.type === "password" || SENSITIVE.test(el.name || "") || SENSITIVE.test(el.id || "") ||
      SENSITIVE.test(el.getAttribute("data-testid") || "") || (el.autocomplete || "").indexOf("cc-") === 0;
  }

  push({ t: 0, kind: "navigate", locator: location.pathname, label: "Open " + location.pathname });
  window.addEventListener("popstate", function () {
    push({ t: Date.now() - start, kind: "navigate", locator: location.pathname, label: "Open " + location.pathname });
  });
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest("button, a, [role=button], input[type=submit], [data-testid]") : null;
    if (!el) return;
    push({ t: Date.now() - start, kind: "click", locator: locatorFor(el), label: labelFor("click", el) });
  }, true);
  document.addEventListener("change", function (e) {
    var el = e.target;
    if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    var a = { t: Date.now() - start, kind: "input", locator: locatorFor(el), label: labelFor("input", el) };
    a.value = isSensitive(el) ? "[REDACTED]" : String(el.value || "").slice(0, 80);
    push(a);
  }, true);
  window.addEventListener("error", function (e) {
    lastError = { message: String(e.message || "").slice(0, 300), stack: e.error && e.error.stack ? String(e.error.stack).slice(0, 1000) : undefined, at: Date.now() };
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason || {};
    lastError = { message: String(r.message || r).slice(0, 300), stack: r.stack ? String(r.stack).slice(0, 1000) : undefined, at: Date.now() };
  });

  function report(method, url, status) {
    var u;
    try { u = new URL(url, location.href); } catch (err) { return; }
    var endpoint = u.pathname;
    var key = method + " " + endpoint + " " + status;
    if (lastSent[key] && Date.now() - lastSent[key] < 5000) return;
    lastSent[key] = Date.now();
    // Give a related runtime error 300ms to surface, then send.
    setTimeout(function () {
      var incident = {
        id: "inc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
        capturedAt: new Date().toISOString(),
        page: { url: location.origin + location.pathname, title: document.title || location.pathname },
        actions: actions.slice(),
        failedRequest: { method: method, url: u.origin + u.pathname, endpoint: endpoint, status: status }
      };
      if (lastError && Date.now() - lastError.at < 3000) {
        incident.runtimeError = { message: lastError.message, stack: lastError.stack };
      }
      try {
        origFetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(incident), keepalive: true })
          .then(function (r) { if (window.REPRO_DEBUG) console.log("[repro] sent", incident.id, r.status); })
          .catch(function () {});
      } catch (err) { /* never break the host app */ }
    }, 300);
  }

  window.fetch = function (input, init) {
    var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    var url = typeof input === "string" ? input : input && input.url;
    return origFetch.apply(this, arguments).then(function (res) {
      if (res.status >= MIN_STATUS && url && url.indexOf(ENDPOINT) !== 0) report(method, url, res.status);
      return res;
    });
  };

  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.addEventListener("loadend", function () {
      if (this.status >= MIN_STATUS && url && String(url).indexOf(ENDPOINT) !== 0) report(String(method).toUpperCase(), String(url), this.status);
    });
    return origOpen.apply(this, arguments);
  };

  window.__repro = { actions: actions, endpoint: ENDPOINT };
})();
