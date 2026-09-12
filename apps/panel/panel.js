/* REPRO DevTools panel. Plain JS, no build step. Talks to the REPRO server; replays in the inspected page. */
(function () {
  var SERVER = localStorage.getItem("repro.server") || "http://localhost:8787";
  var DEMO = localStorage.getItem("repro.demo") || "http://localhost:3000";
  var state = { rows: [], selectedId: null, busy: false, ui: {} };   // ui[id] = { analysis, source, replay, replayObs, issue, fix, pr, notify, log }
  var $list = document.getElementById("list"), $detail = document.getElementById("detail"), $server = document.getElementById("server");

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ui(id) { return state.ui[id] || (state.ui[id] = { log: [] }); }
  function log(id, m) { ui(id).log.unshift(new Date().toLocaleTimeString() + "  " + m); render(); }
  function api(path, body, method) {
    return fetch(SERVER + path, { method: method || (body ? "POST" : "GET"), headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { j.__status = r.status; return j; }); });
  }
  function evalInPage(code) {
    return new Promise(function (resolve, reject) {
      if (!window.chrome || !chrome.devtools || !chrome.devtools.inspectedWindow) return reject(new Error("not inside DevTools"));
      chrome.devtools.inspectedWindow.eval(code, function (result, err) { err ? reject(new Error(err.value || err.description || "eval failed")) : resolve(result); });
    });
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---------- polling ----------
  function poll() {
    api("/incidents?limit=30").then(function (j) {
      $server.textContent = "server: connected";
      var first = state.rows.length === 0;
      state.rows = j.incidents || [];
      if (first && state.rows.length) state.selectedId = state.rows[0].incident.id;
      if (!state.selectedId && state.rows.length) state.selectedId = state.rows[0].incident.id;
      render();
    }).catch(function () { $server.textContent = "server: offline (" + SERVER + ")"; });
  }
  setInterval(poll, 2000); poll();
  api("/health").catch(function () {});

  // ---------- actions ----------
  function selected() { return state.rows.find(function (r) { return r.incident.id === state.selectedId; }); }

  function analyze(row) {
    var id = row.incident.id, u = ui(id);
    state.busy = true; log(id, "Analyzing with OpenAI (15s timeout, deterministic fallback)…");
    return api("/analyze", row.incident).then(function (j) {
      if (j.analysis) { u.analysis = j.analysis; u.source = j.source; log(id, "Analysis ready (source: " + j.source + ")"); api("/incidents/" + id, { analysis: j.analysis, analysisSource: j.source }, "PATCH").catch(function () {}); }
      else log(id, "Analyze failed: " + (j.reason || j.__status));
    }).catch(function (e) { log(id, "Analyze error: " + e.message); }).finally(function () { state.busy = false; render(); });
  }

  // Replay the recorded actions in the inspected page. The page's own sensor reports any new failure to the server.
  function replay(row) {
    var id = row.incident.id, u = ui(id), inc = row.incident;
    state.busy = true; u.replay = "running"; log(id, "Replaying " + inc.actions.length + " recorded actions in the page…");
    var startedAt = Date.now();
    var chain = fetch(DEMO + "/api/reset", { method: "POST" }).catch(function () {})
      .then(function () { return evalInPage("(window.__repro && window.__repro.flush && window.__repro.flush(), true)"); });
    var incomplete = null;
    inc.actions.forEach(function (a, i) {
      chain = chain.then(function () {
        if (incomplete) return;
        if (a.kind === "navigate") return evalInPage("location.pathname").then(function (p) { if (p !== a.locator) log(id, "step " + (i + 1) + ": on " + p + ", expected " + a.locator + " (continuing)"); });
        var code = "(function(){var l=" + JSON.stringify(a.locator) + ";var el=document.querySelector('[data-testid=\"'+l+'\"]')||document.getElementById(l);if(!el)return false;" +
          (a.kind === "input"
            ? "el.focus();el.value=" + JSON.stringify(a.value === "[REDACTED]" ? "" : (a.value || "")) + ";el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;"
            : "el.click();return true;") + "})()";
        return evalInPage(code).then(function (ok) {
          if (!ok) { incomplete = "locator not found: " + a.locator; log(id, "step " + (i + 1) + " " + a.label + " → locator missing"); }
          else log(id, "step " + (i + 1) + " " + a.label);
          return sleep(350);
        });
      });
    });
    return chain.then(function () { return sleep(1800); }).then(function () { return api("/incidents?limit=10"); }).then(function (j) {
      var fresh = (j.incidents || []).filter(function (r) { return r.incident.id !== id && new Date(r.receivedAt).getTime() >= startedAt - 500; })[0];
      var obs = { completed: !incomplete, failedRequest: fresh ? fresh.incident.failedRequest : null, runtimeError: fresh ? fresh.incident.runtimeError : undefined };
      var outcome = window.reproVerify(inc, obs);
      u.replay = outcome; u.replayObs = obs;
      log(id, "Verifier says: " + outcome + (incomplete ? " (" + incomplete + ")" : fresh ? " — same signature observed again" : " — flow completed with no failure"));
      api("/incidents/" + id, { replayOutcome: outcome }, "PATCH").catch(function () {});
      return outcome;
    }).catch(function (e) { u.replay = "inconclusive"; log(id, "Replay error: " + e.message); }).finally(function () { state.busy = false; render(); });
  }

  function createIssue(row) {
    var id = row.incident.id, u = ui(id);
    if (!u.analysis) return;
    state.busy = true; log(id, "Creating GitHub issue…");
    return api("/issue", { incident: row.incident, analysis: u.analysis, replay: { outcome: u.replay || "inconclusive", observed: u.replayObs } }).then(function (j) {
      u.issue = j;
      if (j.ok) { log(id, "Issue created: " + j.url); api("/incidents/" + id, { issueUrl: j.url }, "PATCH").catch(function () {}); }
      else log(id, "GitHub failed: " + j.reason + " — markdown preserved, use Copy Markdown");
    }).catch(function (e) { u.issue = { ok: false, reason: e.message, markdown: "" }; log(id, "Issue error: " + e.message); }).finally(function () { state.busy = false; render(); });
  }

  function proposeFix(row) {
    var id = row.incident.id, u = ui(id);
    state.busy = true; log(id, "Asking the implementer for the smallest safe edit…");
    return api("/fix", { incident: row.incident, analysis: u.analysis }).then(function (j) {
      u.fix = j; log(id, j.ok ? "Fix proposed: " + j.changedLines + " changed lines in " + j.path : "No fix: " + j.reason);
    }).catch(function (e) { log(id, "Fix error: " + e.message); }).finally(function () { state.busy = false; render(); });
  }

  function applyAndVerify(row) {
    var id = row.incident.id, u = ui(id);
    state.busy = true; log(id, "Applying fix (demo app restarts)…");
    u.before = u.replay;
    return api("/fix/apply", { proposalId: u.fix.proposalId }).then(function (j) {
      if (!j.ok) { log(id, "Apply refused: " + j.reason); return; }
      u.fix.applied = true; log(id, "Applied. Waiting for restart, then replaying the same actions…");
      return sleep(2500).then(function () { return replay(row); }).then(function (outcome) {
        u.after = outcome;
        if (outcome === "not_reproduced") { u.fixVerified = true; log(id, "FIX VERIFIED by replay. Bug no longer reproduces."); }
        else { u.fixVerified = false; log(id, "Fix rejected (" + outcome + "). Reverting…"); return api("/fix/revert", { proposalId: u.fix.proposalId }).then(function () { u.fix.applied = false; log(id, "Reverted."); }); }
      });
    }).catch(function (e) { log(id, "Apply error: " + e.message); }).finally(function () { state.busy = false; render(); });
  }

  function openPr(row) {
    var id = row.incident.id, u = ui(id);
    state.busy = true; log(id, "Opening pull request with before/after evidence…");
    return api("/fix/pr", { proposalId: u.fix.proposalId, before: u.before, after: u.after, issueUrl: u.issue && u.issue.ok ? u.issue.url : undefined }).then(function (j) {
      u.pr = j; log(id, j.ok ? "PR opened: " + j.url : "PR refused: " + j.reason);
      if (j.ok) api("/incidents/" + id, { prUrl: j.url }, "PATCH").catch(function () {});
    }).catch(function (e) { log(id, "PR error: " + e.message); }).finally(function () { state.busy = false; render(); });
  }

  function notifyTeam(row) {
    var id = row.incident.id, u = ui(id);
    state.busy = true; log(id, "Notifying the team…");
    var fix = u.fix ? { status: u.fixVerified === true ? "verified" : u.fixVerified === false ? "rejected" : u.fix.ok ? "proposed" : "not_attempted", prUrl: u.pr && u.pr.ok ? u.pr.url : undefined } : undefined;
    return api("/notify", { incident: row.incident, analysis: u.analysis, replay: { outcome: u.replay || "inconclusive" }, issueUrl: u.issue && u.issue.ok ? u.issue.url : undefined, fix: fix }).then(function (j) {
      u.notify = j; log(id, !j.configured ? "No Slack/Telegram configured; message shown below" : j.ok ? "Sent to " + j.sent.join(", ") : "Some channels failed: " + JSON.stringify(j.failed));
    }).catch(function (e) { log(id, "Notify error: " + e.message); }).finally(function () { state.busy = false; render(); });
  }

  function copy(text) { navigator.clipboard.writeText(text).catch(function () { var t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }); }

  document.getElementById("reset").onclick = function () { fetch(DEMO + "/api/reset", { method: "POST" }).then(function () { $server.textContent = "server: connected · demo reset"; }).catch(function () {}); };

  // ---------- render ----------
  function badge(text, cls) { return '<span class="badge ' + (cls || "") + '">' + esc(text) + "</span>"; }
  function outcomeBadge(o) { return !o ? "" : o === "running" ? badge("replaying…", "info") : o === "reproduced" ? badge("reproduced", "bad") : o === "not_reproduced" ? badge("not reproduced", "ok") : o === "diverged" ? badge("diverged", "warn") : badge("inconclusive", "warn"); }
  function diffHtml(d) { return d.split("\n").map(function (l) { var c = l[0] === "+" ? "add" : l[0] === "-" ? "del" : l[0] === "@" ? "hunk" : ""; return '<span class="' + c + '">' + esc(l) + "</span>"; }).join("\n"); }

  function render() {
    // sidebar
    if (!state.rows.length) $list.innerHTML = '<div class="empty">Waiting for a failure…<br><span class="muted">Use the app. REPRO is watching.</span></div>';
    else $list.innerHTML = state.rows.map(function (r) {
      var i = r.incident, u = ui(i.id), sev = (u.analysis || r.analysis || {}).severity;
      return '<div class="item' + (i.id === state.selectedId ? " sel" : "") + '" data-id="' + esc(i.id) + '">' +
        '<div class="t">' + esc(i.failedRequest.method + " " + i.failedRequest.endpoint) + ' <span class="badge bad">' + i.failedRequest.status + "</span>" + (sev ? ' <span class="sev-' + sev + '">' + sev + "</span>" : "") + "</div>" +
        '<div class="m">' + esc(new Date(r.receivedAt).toLocaleTimeString()) + " · " + i.actions.length + " actions · " + esc(r.source) + (u.replay && u.replay !== "running" ? " · " + u.replay.replace("_", " ") : "") + "</div></div>";
    }).join("");
    Array.prototype.forEach.call($list.querySelectorAll(".item"), function (el) { el.onclick = function () { state.selectedId = el.getAttribute("data-id"); render(); }; });

    var row = selected();
    if (!row) { $detail.innerHTML = '<div class="empty">Select an incident</div>'; return; }
    var i = row.incident, u = ui(i.id), a = u.analysis || row.analysis, b = state.busy ? " disabled" : "";
    if (a && !u.analysis) { u.analysis = a; u.source = row.analysisSource; }
    var h = "";
    h += '<div class="card"><h2>Witnessed</h2><div class="row">' + badge(i.failedRequest.method + " " + i.failedRequest.endpoint, "bad") + badge("HTTP " + i.failedRequest.status, "bad") +
      '<span class="muted">' + esc(i.page.title) + " · " + esc(new Date(i.capturedAt).toLocaleTimeString()) + "</span></div>" +
      (i.runtimeError ? '<pre>' + esc(i.runtimeError.message) + "</pre>" : "") +
      '<h2 style="margin-top:8px">Actions before the failure</h2><ol>' + i.actions.map(function (x) { return "<li>" + esc(x.label) + (x.value ? ' <span class="muted">= ' + esc(x.value) + "</span>" : "") + ' <span class="muted">[' + esc(x.locator) + "]</span></li>"; }).join("") + "</ol>" +
      '<div class="row" style="margin-top:8px"><button id="b-analyze"' + b + ">" + (a ? "Re-analyze" : "Analyze") + '</button><button id="b-verify"' + b + ">Verify by replay</button>" + outcomeBadge(u.replay) + "</div></div>";

    if (a) {
      h += '<div class="card"><h2>Reconstructed ' + (u.source ? badge(u.source === "model" ? "OpenAI" : "deterministic fallback", u.source === "model" ? "info" : "warn") : "") + "</h2>" +
        '<div><strong>' + esc(a.title) + '</strong> &nbsp; <span class="sev-' + esc(a.severity) + '">● ' + esc(a.severity) + "</span></div>" +
        '<div class="muted">' + esc(a.impact) + "</div>" +
        "<h2 style=\"margin-top:8px\">Steps to reproduce</h2><ol>" + a.reproductionSteps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" +
        '<h2 style="margin-top:8px">Hypothesis (' + esc(a.confidence) + ")</h2><div>" + esc(a.hypothesis) + "</div>" +
        (a.evidenceGaps.length ? '<div class="muted" style="margin-top:4px">Gaps: ' + esc(a.evidenceGaps.join("; ")) + "</div>" : "") +
        '<div class="row" style="margin-top:8px"><button id="b-issue"' + b + (u.replay === "reproduced" ? ' class="good"' : "") + ">Create GitHub issue</button>" +
        (u.issue ? (u.issue.ok ? '<a href="' + esc(u.issue.url) + '" target="_blank">' + esc(u.issue.url) + "</a>" : badge("GitHub failed: " + u.issue.reason, "bad") + '<button id="b-copy" class="secondary">Copy Markdown</button><button id="b-issue-retry" class="secondary"' + b + ">Retry</button>") : "") +
        "</div></div>";

      h += '<div class="card"><h2>Fix (agent proposes, replay verifies, human merges)</h2><div class="row">' +
        '<button id="b-fix"' + (u.replay === "reproduced" ? b : " disabled") + ">Propose fix</button>" +
        (u.fix && u.fix.ok ? '<button id="b-apply"' + (u.fix.applied ? " disabled" : b) + ">Apply &amp; verify</button>" : "") +
        (u.fixVerified === true ? badge("fix verified by replay", "ok") : u.fixVerified === false ? badge("fix rejected, reverted", "bad") : "") +
        (u.fixVerified === true ? '<button id="b-pr"' + (u.pr && u.pr.ok ? " disabled" : b) + ">Open PR</button>" : "") +
        (u.pr ? (u.pr.ok ? '<a href="' + esc(u.pr.url) + '" target="_blank">' + esc(u.pr.url) + "</a>" : badge(u.pr.reason, "bad")) : "") +
        "</div>" + (u.replay !== "reproduced" && !u.fix ? '<div class="muted" style="margin-top:4px">Verify must say <em>reproduced</em> before a fix can be proposed.</div>' : "") +
        (u.fix ? (u.fix.ok ? '<div style="margin-top:6px">' + esc(u.fix.explanation) + '</div><pre class="diff">' + diffHtml(u.fix.diff) + "</pre>" : '<div class="muted" style="margin-top:6px">' + esc(u.fix.reason) + "</div>") : "") + "</div>";

      h += '<div class="card"><h2>Notify</h2><div class="row"><button id="b-notify" class="secondary"' + b + ">Notify team</button>" +
        (u.notify ? (u.notify.configured ? (u.notify.ok ? badge("sent: " + u.notify.sent.join(", "), "ok") : badge("failed", "bad")) : badge("no channel configured", "warn")) : "") + "</div>" +
        (u.notify ? "<pre>" + esc(u.notify.message) + "</pre>" : "") + "</div>";
    }
    h += '<div class="card"><h2>Log</h2><pre>' + esc(u.log.slice(0, 12).join("\n") || "—") + "</pre></div>";
    $detail.innerHTML = h;

    var on = function (id, fn) { var el = document.getElementById(id); if (el) el.onclick = function () { fn(row); }; };
    on("b-analyze", analyze); on("b-verify", replay); on("b-issue", createIssue); on("b-issue-retry", createIssue);
    on("b-copy", function () { copy(u.issue.markdown); log(i.id, "Markdown copied"); });
    on("b-fix", proposeFix); on("b-apply", applyAndVerify); on("b-pr", openPr); on("b-notify", notifyTeam);
  }
})();
