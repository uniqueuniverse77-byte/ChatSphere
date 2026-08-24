(function () {
  "use strict";

  function normalizeMinInterval(value, fallback) {
    var parsed = Number(value);
    var safeFallback = Number(fallback);
    if (!isFinite(safeFallback) || safeFallback < 5000) safeFallback = 30000;
    if (!isFinite(parsed) || parsed < 5000) return safeFallback;
    return Math.min(120000, Math.max(5000, Math.round(parsed)));
  }

  function shouldReportDiagnostic(eventName, detail, force, debugEnabled, lastByKey, nowMs) {
    var event = String(eventName || "unknown").slice(0, 80);
    var reason = String(detail && detail.reason ? detail.reason : "");
    var routineSkip =
      event === "capture_skipped" &&
      (reason === "no_match" ||
        reason === "client_interval" ||
        reason === "in_flight" ||
        reason === "loop_already_active");
    var routineSuccess =
      event === "capture_blob_ready" ||
      event === "capture_data_url_ready" ||
      event === "upload_ok";
    if (!force && !debugEnabled && (routineSkip || routineSuccess)) return false;
    var key = String(eventName || "") + ":" + reason;
    var minGap = debugEnabled ? 60000 : 5 * 60000;
    var last = lastByKey && lastByKey[key] ? Number(lastByKey[key]) : 0;
    return !!(force || !last || Number(nowMs || Date.now()) - last >= minGap);
  }

  function isValidDataUrl(value) {
    var s = "";
    try {
      s = typeof value === "string" ? value : "";
    } catch (_) {
      s = "";
    }
    if (!s || s === "data:,") return false;
    return /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+={0,2}$/i.test(s);
  }

  window.VideoModerationScreenshots = {
    normalizeMinInterval: normalizeMinInterval,
    shouldReportDiagnostic: shouldReportDiagnostic,
    isValidDataUrl: isValidDataUrl
  };
})();
