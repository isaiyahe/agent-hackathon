// Plain-JS mirror of packages/core/verify.ts. Keep in sync. The model never calls this.
(function (g) {
  function normalizeEndpoint(urlOrPath) {
    var path = urlOrPath;
    try { path = new URL(urlOrPath, "http://x").pathname; } catch (e) {}
    return path.replace(/\/+$/, "").replace(/\/\d+(?=\/|$)/g, "/:id")
      .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, "/:id") || "/";
  }
  function normalizeErrorMessage(m) { return m.toLowerCase().replace(/\s+/g, " ").replace(/:\d+:\d+/g, "").trim(); }
  function sameSignature(t, o) {
    if (normalizeEndpoint(t.failedRequest.endpoint) !== normalizeEndpoint(o.failedRequest.endpoint)) return false;
    if (t.failedRequest.method.toUpperCase() !== o.failedRequest.method.toUpperCase()) return false;
    if (t.failedRequest.status !== o.failedRequest.status) return false;
    if (t.runtimeError && o.runtimeError) return normalizeErrorMessage(t.runtimeError.message) === normalizeErrorMessage(o.runtimeError.message);
    return true;
  }
  g.reproVerify = function (target, observed) {
    if (!observed.completed) return "inconclusive";
    if (!observed.failedRequest) return "not_reproduced";
    return sameSignature(target, observed) ? "reproduced" : "diverged";
  };
})(window);
