/* global window */
/**
 * common.js
 * - Creates a resilient WebSocket connection to /ws (Nginx proxies to edge :8001)
 * - Implements application-level ping/pong heartbeat
 * - Provides a safe JSON send helper
 *
 * Browser connects to: wss://ChatSphere.com/ws (same-origin)
 */

(function () {
  // --- Ad attribution (e.g. /?ad=fb) ---
  // Persist on page load so it survives navigation to /video or /chat even before a WS is created.
  function captureAdTag() {
    try {
      var sp = new URLSearchParams(String(window.location.search || ""));
      var qp = String(sp.get("ad") || "").trim();
      if (qp && /^[a-zA-Z0-9_-]{1,24}$/.test(qp)) {
        qp = String(qp).toLowerCase();
        try { localStorage.setItem("ChatSphere_ad_tag_v1", qp); } catch (_) {}
        return qp;
      }
    } catch (_) {}
    try {
      var v = String(localStorage.getItem("ChatSphere_ad_tag_v1") || "").trim();
      if (v && /^[a-zA-Z0-9_-]{1,24}$/.test(v)) return String(v).toLowerCase();
    } catch (_) {}
    return "";
  }
  var __adTag = captureAdTag();

  // --- Search engine attribution (best-effort, via document.referrer) ---
  // Persist on first landing so it survives refresh/navigation where referrer becomes same-origin.
  function detectSearchEngineFromUrl(raw) {
    try {
      var u = new URL(String(raw || ""));
      var host = String(u.hostname || "").toLowerCase();
      if (!host) return "";
      if (host.indexOf("google.") >= 0) return "google";
      if (host.indexOf("bing.") >= 0) return "bing";
      if (host.indexOf("yahoo.") >= 0) return "yahoo";
      if (host.indexOf("duckduckgo.") >= 0) return "duckduckgo";
      if (host.indexOf("yandex.") >= 0) return "yandex";
      if (host.indexOf("baidu.") >= 0) return "baidu";
      if (host.indexOf("ask.") >= 0) return "ask";
      if (host.indexOf("aol.") >= 0) return "aol";
      if (host.indexOf("ecosia.") >= 0) return "ecosia";
      if (host.indexOf("startpage.") >= 0) return "startpage";
      if (host.indexOf("qwant.") >= 0) return "qwant";
      if (host.indexOf("swisscows.") >= 0) return "swisscows";
      if (host.indexOf("metager.") >= 0) return "metager";
      // Brave search often uses search.brave.com
      if (host === "search.brave.com" || host.indexOf("brave.com") >= 0) return "brave";
      // Searx instances vary; include common pattern
      if (host.indexOf("searx") >= 0) return "searx";
    } catch (_) {}
    return "";
  }
  function captureSearchEngineTag() {
    var KEY = "ChatSphere_search_engine_v1";
    // If this navigation has a search referrer, prefer it and persist.
    try {
      var fromRef = detectSearchEngineFromUrl(String(document.referrer || ""));
      if (fromRef && /^[a-z0-9_-]{1,24}$/.test(fromRef)) {
        try { localStorage.setItem(KEY, fromRef); } catch (_) {}
        return fromRef;
      }
    } catch (_) {}
    // Otherwise, keep the last known attribution (so refresh doesn't clear it).
    try {
      var v = String(localStorage.getItem(KEY) || "").trim().toLowerCase();
      if (v && /^[a-z0-9_-]{1,24}$/.test(v)) return v;
    } catch (_) {}
    return "";
  }
  var __searchEngine = captureSearchEngineTag();

  function readCookie(name) {
    name = String(name || "").trim();
    if (!name) return "";
    try {
      var all = String(document.cookie || "");
      if (!all) return "";
      var parts = all.split(";");
      for (var i = 0; i < parts.length; i += 1) {
        var p = String(parts[i] || "").trim();
        if (!p) continue;
        var eq = p.indexOf("=");
        if (eq <= 0) continue;
        var k = String(p.slice(0, eq) || "").trim();
        if (k !== name) continue;
        var raw = String(p.slice(eq + 1) || "").trim();
        try { return decodeURIComponent(raw); } catch (_) { return raw; }
      }
    } catch (_) {}
    return "";
  }

  function writeCookie(name, value, maxAgeSec) {
    name = String(name || "").trim();
    value = String(value || "");
    if (!name) return false;
    try {
      var attrs = "; Path=/; SameSite=Lax";
      var maxAge = Number(maxAgeSec || 0);
      if (isFinite(maxAge) && maxAge > 0) attrs += "; Max-Age=" + String(Math.floor(maxAge));
      if (window.location && String(window.location.protocol || "") === "https:") attrs += "; Secure";
      document.cookie = name + "=" + encodeURIComponent(value) + attrs;
      var back = readCookie(name);
      return !!(back && back === value);
    } catch (_) {
      return false;
    }
  }

  function getOrCreateDeviceId() {
    var KEY = "ChatSphere_device_id_v1";
    var COOKIE_KEY = "ChatSphere_device_id_v1";
    var VALID = /^[a-zA-Z0-9._:-]{6,80}$/;

    function persistLocal(v) {
      try {
        localStorage.setItem(KEY, v);
        var back = String(localStorage.getItem(KEY) || "").trim();
        return !!(back && back === v);
      } catch (_) {
        return false;
      }
    }

    function persistedEither(v) {
      if (!v || !VALID.test(v)) return false;
      var okLocal = false;
      try {
        var lv = String(localStorage.getItem(KEY) || "").trim();
        okLocal = lv === v;
      } catch (_) {
        okLocal = false;
      }
      var okCookie = readCookie(COOKIE_KEY) === v;
      return !!(okLocal || okCookie);
    }

    try {
      var v = String(localStorage.getItem(KEY) || "").trim();
      if (v && VALID.test(v)) {
        try { writeCookie(COOKIE_KEY, v, 60 * 60 * 24 * 365); } catch (_) {}
        return v;
      }
    } catch (_) {}
    try {
      var c = String(readCookie(COOKIE_KEY) || "").trim();
      if (c && VALID.test(c)) {
        try { persistLocal(c); } catch (_) {}
        return c;
      }
    } catch (_) {}
    var id = "";
    try {
      if (window.crypto && typeof window.crypto.randomUUID === "function") id = window.crypto.randomUUID();
    } catch (_) {}
    if (!id) {
      // Fallback: not cryptographically strong, but fine for a UI/session identifier.
      id =
        "did-" +
        String(Math.random()).slice(2) +
        "-" +
        String(Date.now()) +
        "-" +
        String(Math.random()).slice(2);
      id = id.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 80);
    }
    try { persistLocal(id); } catch (_) {}
    try { writeCookie(COOKIE_KEY, id, 60 * 60 * 24 * 365); } catch (_) {}
    if (persistedEither(id)) return id;
    // Enforce: must be persistable via localStorage or cookie.
    return "";
  }

  function readStoredTheme() {
    try {
      var v = window.localStorage ? window.localStorage.getItem("theme") : null;
      if (v === "dark" || v === "light") return v;
      var legacy = window.localStorage ? window.localStorage.getItem("darkMode") : null;
      if (legacy === "true") return "dark";
      if (legacy === "false") return "light";
    } catch (_) {}
    return null;
  }

  function persistTheme(theme) {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem("theme", theme);
      // legacy key (for older builds)
      window.localStorage.setItem("darkMode", theme === "dark" ? "true" : "false");
    } catch (_) {}
  }

  function applyTheme(theme) {
    // This is what the CSS is already keyed off of:
    // - [data-theme="dark"]
    // - .dark-mode
    var root = document.documentElement;
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
      document.body && document.body.classList.add("dark-mode");
    } else {
      root.removeAttribute("data-theme");
      document.body && document.body.classList.remove("dark-mode");
    }
  }

  function wireThemeToggle() {
    var toggle = document.getElementById("dark-mode-toggle-compact");
    if (!toggle) return;

    var stored = readStoredTheme();
    var theme = stored || "light";
    toggle.checked = theme === "dark";
    applyTheme(theme);

    toggle.addEventListener("change", function () {
      var next = toggle.checked ? "dark" : "light";
      applyTheme(next);
      persistTheme(next);
    });
  }

  function injectFeedbackWidget() {
    try {
      if (document.getElementById("feedback-widget-root")) return;
      if (!document.body) return;
    } catch (_) {
      return;
    }

    // Live chat UIs (/video, /chat) still need the feedback modal (opened by links),
    // but we hide the floating button to avoid UI interference.
    var HIDE_FAB = false;
    try {
      var p = String(window.location && window.location.pathname ? window.location.pathname : "");
      if (p === "/" || p === "/index.html") HIDE_FAB = true;
      if (p === "/video" || p === "/video/" || p === "/video.html") HIDE_FAB = true;
      if (p === "/chat" || p === "/chat/" || p === "/chat.html") HIDE_FAB = true;
    } catch (_) {}

    function wire() {
      var fab = document.getElementById("feedback-fab");
      var modal = document.getElementById("feedback-modal");
      var closeBtn = document.getElementById("feedback-close");
      var sendBtn = document.getElementById("feedback-send");
      var txt = document.getElementById("feedback-text");
      var msg = document.getElementById("feedback-msg");
      var menuLink = document.getElementById("feedback-link");

      function setMsg(t) {
        if (msg) msg.textContent = t || "";
      }
      function open() {
        if (!modal) return;
        modal.style.display = "flex";
        modal.setAttribute("aria-hidden", "false");
        setMsg("");
        try {
          if (txt) txt.focus();
        } catch (_) {}
      }
      function close() {
        if (!modal) return;
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
      }

      // Allow other pages to open this modal (e.g., menu link).
      try {
        window.ChatSphereFeedback = window.ChatSphereFeedback || {};
        window.ChatSphereFeedback.open = open;
        window.ChatSphereFeedback.close = close;
      } catch (_) {}

      // Hide the floating button on live chat pages; modal remains available via window.ChatSphereFeedback.open().
      try {
        if (HIDE_FAB && fab) fab.style.display = "none";
      } catch (_) {}

      if (fab) fab.addEventListener("click", open);
      if (menuLink) {
        menuLink.addEventListener("click", function (ev) {
          try { if (ev) ev.preventDefault(); } catch (_) {}
          open();
        });
      }
      if (closeBtn) closeBtn.addEventListener("click", close);
      if (modal) {
        modal.addEventListener("click", function (e) {
          if (e && e.target === modal) close();
        });
      }

      if (sendBtn) {
        sendBtn.addEventListener("click", function () {
          var v = txt ? String(txt.value || "") : "";
          v = v.trim();
          if (v.length < 3) {
            setMsg("Please enter at least 3 characters.");
            return;
          }
          if (v.length > 2000) {
            setMsg("Please keep it under 2000 characters.");
            return;
          }

          sendBtn.disabled = true;
          setMsg("Sending...");
          window
            .fetch("/feedback", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ feedback: v })
            })
            .then(function (r) {
              return r
                .text()
                .then(function (t) {
                  var j = null;
                  try {
                    j = JSON.parse(t || "{}");
                  } catch (_) {}
                  if (!r.ok) {
                    var msgText =
                      (j && (j.message || j.error)) ||
                      (t && String(t).trim().slice(0, 160)) ||
                      ("HTTP " + r.status);
                    var err = new Error(String(msgText || "feedback_failed"));
                    err._code = j && j.error ? j.error : "feedback_failed";
                    err._status = r.status;
                    throw err;
                  }
                  return j || {};
                });
            })
            .then(function () {
              setMsg("Thanks! Your feedback was submitted.");
              if (txt) txt.value = "";
              window.setTimeout(close, 700);
            })
            .catch(function (e) {
              var code = e && e._code ? String(e._code) : "";
              if (code === "daily_limit") setMsg("Daily limit reached (max 10 per day). Try again tomorrow.");
              else {
                var st = e && e._status ? String(e._status) : "";
                var m = e && e.message ? String(e.message) : "";
                if (st === "404") setMsg("Feedback endpoint not reachable (HTTP 404). Check nginx proxy for /feedback.");
                else if (m) setMsg(m);
                else setMsg("Failed to send. Please try again.");
              }
            })
            .finally(function () {
              sendBtn.disabled = false;
            });
        });
      }
    }

    window
      .fetch("/partials/feedback.html", { cache: "no-store" })
      .then(function (r) {
        return r.ok ? r.text() : "";
      })
      .then(function (html) {
        if (!html) return;
        var wrap = document.createElement("div");
        wrap.innerHTML = String(html);
        while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
        wire();
      })
      .catch(function () {
        // ignore
      });
  }

  function wsPage() {
    var p = String(window.location.pathname || "");
    var page = "index";
    if (p === "/video" || p === "/video.html") page = "video";
    else if (p === "/chat" || p === "/chat.html" || p === "/text-chat" || p === "/text-chat.html") page = "chat";
    else if (p && p !== "/" && p.indexOf("/video") === 0) page = "video";
    else if (p && (p.indexOf("/chat") === 0 || p.indexOf("/text-chat") === 0)) page = "chat";
    return page;
  }

  function wsDid() {
    try {
      var did = String(getOrCreateDeviceId() || "").trim();
      return did && /^[a-zA-Z0-9._:-]{6,80}$/.test(did) ? did : "";
    } catch (_) {
      return "";
    }
  }

  function fetchWsToken(page, did) {
    if (!did) return Promise.reject(new Error("missing_did"));
    var url = "/api/ws-token?page=" + encodeURIComponent(page || "index") + "&did=" + encodeURIComponent(did);
    return window.fetch(url, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    }).then(function (res) {
      if (!res || !res.ok) throw new Error("token_http_" + String(res && res.status || 0));
      return res.json();
    }).then(function (body) {
      var token = body && body.token ? String(body.token) : "";
      if (!token) throw new Error("missing_token");
      return token;
    });
  }

  function wsUrl(wsToken) {
    var proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    var page = wsPage();
    // Include page in WS query string because browsers often omit Referer headers on WS upgrades.
    // Ad attribution: include persisted tag in WS connect so server can count clicks + active users.
    var ad = "";
    try { ad = String(__adTag || "").trim(); } catch (_) { ad = ""; }
    var u = proto + "//" + window.location.host + "/ws?page=" + encodeURIComponent(page);
    // Best-effort device id (first-party, localStorage). Used for admin/moderation visibility.
    var did = wsDid();
    if (did) u += "&did=" + encodeURIComponent(did);
    if (wsToken) u += "&wst=" + encodeURIComponent(String(wsToken));
    if (ad) u += "&ad=" + encodeURIComponent(ad);
    // Persisted search attribution (so refresh still counts as search traffic)
    try {
      var se = String(__searchEngine || "").trim().toLowerCase();
      if (se && /^[a-z0-9_-]{1,24}$/.test(se)) u += "&se=" + encodeURIComponent(se);
    } catch (_) {}
	    // Capture document.referrer and pass it as query param (fallback if HTTP Referer header is missing)
	    try {
	      var referer = String(document.referrer || "").trim();
	      if (referer) {
	        u += "&referer=" + encodeURIComponent(referer.substring(0, 500)); // Limit length
	      }
	    } catch (_) {}
	    // Best-effort client environment hints for admin/moderation UI.
	    // IMPORTANT: keep these coarse (buckets), not exact fingerprints.
	    try {
	      var tz = "";
	      try { tz = String(Intl.DateTimeFormat().resolvedOptions().timeZone || "").trim(); } catch (_) { tz = ""; }
	      if (tz && tz.length <= 80) u += "&tz=" + encodeURIComponent(tz);
	    } catch (_) {}
	    try {
	      var sb = "";
	      try {
	        var minDim = 0;
	        try {
	          if (window.screen && typeof window.screen.width === "number" && typeof window.screen.height === "number") {
	            minDim = Math.max(0, Math.min(window.screen.width, window.screen.height));
	          } else if (typeof window.innerWidth === "number" && typeof window.innerHeight === "number") {
	            minDim = Math.max(0, Math.min(window.innerWidth, window.innerHeight));
	          }
	        } catch (_) {}
	        if (minDim > 0 && minDim < 480) sb = "xs";
	        else if (minDim > 0 && minDim < 768) sb = "sm";
	        else if (minDim > 0 && minDim < 1024) sb = "md";
	        else if (minDim > 0 && minDim < 1440) sb = "lg";
	        else if (minDim > 0) sb = "xl";
	      } catch (_) { sb = ""; }
	      if (sb) u += "&sb=" + encodeURIComponent(sb);
	    } catch (_) {}
	    try {
	      var dc = "unknown";
	      try {
	        if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean") dc = navigator.userAgentData.mobile ? "mobile" : "desktop";
	        else {
	          var ua = String(navigator.userAgent || "").toLowerCase();
	          dc = ua.indexOf("mobi") >= 0 || ua.indexOf("android") >= 0 || ua.indexOf("iphone") >= 0 ? "mobile" : "desktop";
	        }
	      } catch (_) { dc = "unknown"; }
	      if (dc && /^(mobile|desktop|unknown)$/.test(dc)) u += "&dc=" + encodeURIComponent(dc);
	    } catch (_) {}
		    try {
		      var net = "";
		      try {
		        var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
		        net = c && c.effectiveType ? String(c.effectiveType || "").trim().toLowerCase() : "";
		      } catch (_) { net = ""; }
		      if (net && /^[a-z0-9-]{1,12}$/.test(net)) u += "&net=" + encodeURIComponent(net);
		    } catch (_) {}
		    // Optional WebGL hints (admin/moderation only). Best-effort; many browsers will return empty strings.
		    // Note: this is more specific than other buckets. If you want to disable it, remove these params.
		    try {
		      if (!window.__webglSig) {
		        window.__webglSig = (function () {
		          try {
		            var canvas = document.createElement("canvas");
		            var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
		            if (!gl) return { v: "", r: "" };
		            var vendor = "";
		            var renderer = "";
		            try {
		              var dbg = gl.getExtension("WEBGL_debug_renderer_info");
		              if (dbg) {
		                vendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || "");
		                renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "");
		              } else {
		                vendor = String(gl.getParameter(gl.VENDOR) || "");
		                renderer = String(gl.getParameter(gl.RENDERER) || "");
		              }
		            } catch (_) {}
		            vendor = String(vendor || "").trim();
		            renderer = String(renderer || "").trim();
		            if (vendor.length > 120) vendor = vendor.slice(0, 120);
		            if (renderer.length > 160) renderer = renderer.slice(0, 160);
		            return { v: vendor, r: renderer };
		          } catch (_) {
		            return { v: "", r: "" };
		          }
		        })();
		      }
		      var sig = window.__webglSig || { v: "", r: "" };
		      if (sig.v) u += "&wv=" + encodeURIComponent(String(sig.v));
		      if (sig.r) u += "&wr=" + encodeURIComponent(String(sig.r));
		    } catch (_) {}
		    return u;
		  }

  function wsUrlWithToken() {
    var page = wsPage();
    var did = wsDid();
    return fetchWsToken(page, did).then(function (token) {
      return wsUrl(token);
    });
  }

  function createChatSphereSocket(options) {
    options = options || {};
    var fixedUrl = options.url || "";
    var onStatus = options.onStatus || function () {};
    var onMessage = options.onMessage || function () {};
    var maxQueue = typeof options.maxQueue === "number" ? options.maxQueue : 50;
    var reconnectStatusDelayMs = typeof options.reconnectStatusDelayMs === "number" ? Math.max(0, options.reconnectStatusDelayMs) : 1200;

    var ws = null;
    var isClosedByUser = false;
    var backoff = 250;
    var maxBackoff = 5000;
    var pingTimer = null;
    var lastPongAt = Date.now();
    var outbox = [];
    // Terminal disconnect flag (e.g. policy block). When set, we stop reconnecting.
    var terminalCloseReason = "";
    // Throttle stats messages (online counter) to reduce UI churn.
    // IMPORTANT: allow decreases through immediately so refresh/connection churn doesn't leave the counter stuck high.
    var lastStatsEmitAt = 0;
    var pendingStats = null;
    var statsTimer = null;
    var STATS_THROTTLE_MS = 2500;
    var lastOnlineEmitted = null;
    var closeStatusTimer = null;

    function clearCloseStatusTimer() {
      if (!closeStatusTimer) return;
      try {
        window.clearTimeout(closeStatusTimer);
      } catch (_) {}
      closeStatusTimer = null;
    }

    function isControlMessage(obj) {
      return obj && (obj.type === "find_partner" || obj.type === "next" || obj.type === "cancel");
    }

    function enqueue(obj) {
      // Prevent unbounded memory growth.
      if (maxQueue <= 0) return;
      // Keep only the latest control intent (search/next/cancel) to avoid stale flushes.
      if (isControlMessage(obj)) {
        outbox = outbox.filter(function (m) {
          return !isControlMessage(m);
        });
      }
      if (outbox.length >= maxQueue) outbox.shift();
      outbox.push(obj);
    }

    function flushOutbox() {
      try {
        if (!ws || ws.readyState !== 1) return;
        while (outbox.length) {
          var obj = outbox.shift();
          ws.send(JSON.stringify(obj));
        }
      } catch (_) {
        // If a send fails mid-flush, leave remaining messages queued.
      }
    }

    function safeSend(obj) {
      try {
        if (!ws || ws.readyState !== 1) {
          // Queue non-heartbeat messages so "Start/Next" works even if the socket is reconnecting.
          if (obj && obj.type !== "ping") enqueue(obj);
          return false;
        }
        ws.send(JSON.stringify(obj));
        return true;
      } catch (_) {
        if (obj && obj.type !== "ping") enqueue(obj);
        return false;
      }
    }

    function startHeartbeat() {
      stopHeartbeat();
      pingTimer = window.setInterval(function () {
        if (!ws || ws.readyState !== 1) return;
        var t = Date.now();
        safeSend({ type: "ping", t: t });
        // if no pong for too long, force reconnect
        if (t - lastPongAt > 45000) {
          try {
            ws.close();
          } catch (_) {}
        }
      }, 20000);
    }

    function stopHeartbeat() {
      if (pingTimer) {
        window.clearInterval(pingTimer);
        pingTimer = null;
      }
    }

    function connect() {
      if (isClosedByUser) return;
      clearCloseStatusTimer();
      onStatus({ state: "connecting" });
      var urlPromise = fixedUrl ? Promise.resolve(fixedUrl) : wsUrlWithToken();
      urlPromise.then(function (url) {
      if (isClosedByUser) return;
      var socket = new WebSocket(url);
      ws = socket;

      socket.onopen = function () {
        if (ws !== socket) return;
        clearCloseStatusTimer();
        backoff = 250;
        lastPongAt = Date.now();
        flushOutbox();
        onStatus({ state: "open" });
        startHeartbeat();
      };

      socket.onclose = function () {
        if (ws !== socket) return;
        ws = null;
        stopHeartbeat();
        var code = 0;
        var reason = "";
        try {
          // CloseEvent is supported in all modern browsers; keep guards for safety.
          code = arguments && arguments[0] && typeof arguments[0].code === "number" ? arguments[0].code : 0;
        } catch (_) {
          code = 0;
        }
        try {
          reason = arguments && arguments[0] && arguments[0].reason ? String(arguments[0].reason || "") : "";
        } catch (_) {
          reason = "";
        }

	        // If the server indicates a terminal block, don't keep hammering reconnect.
	        // - vpn_blocked (edge)
	        // - connection_error (device blocks; generic)
	        var terminal = false;
	        try {
	          if (terminalCloseReason) terminal = true;
	          if (code === 1008 && (reason === "vpn_blocked" || reason === "connection_error" || reason === "did_required" || reason === "ws_token_required")) terminal = true;
	        } catch (_) {}
	        if (terminal && !terminalCloseReason) terminalCloseReason = reason || "terminal";
	        if (terminal) isClosedByUser = true;

        clearCloseStatusTimer();
        if (!isClosedByUser && reconnectStatusDelayMs > 0) {
          closeStatusTimer = window.setTimeout(function () {
            closeStatusTimer = null;
            if (isClosedByUser) return;
            if (ws && ws.readyState === 1) return;
            onStatus({ state: "closed", code: code, reason: reason, willReconnect: true });
          }, reconnectStatusDelayMs);
        } else {
          onStatus({ state: "closed", code: code, reason: reason, willReconnect: !isClosedByUser });
        }
        if (isClosedByUser) return;
        window.setTimeout(connect, backoff);
        backoff = Math.min(maxBackoff, Math.floor(backoff * 1.6));
      };

      socket.onerror = function () {
        // close will trigger reconnect
      };

      socket.onmessage = function (ev) {
        if (ws !== socket) return;
        var data = ev.data;
        var msg = null;
        try {
          msg = JSON.parse(data);
        } catch (_) {
          return;
        }
        if (msg && msg.type === "pong") {
          lastPongAt = Date.now();
        }
        // Throttle stats updates (but don't hold back decreases).
        if (msg && msg.type === "stats") {
          var now = Date.now();
          var since = now - lastStatsEmitAt;
          var nextOnline = null;
          try {
            nextOnline = typeof msg.online === "number" ? msg.online : Number(msg.online);
            if (!isFinite(nextOnline)) nextOnline = null;
          } catch (_) {
            nextOnline = null;
          }

          // Always emit immediately if this is the first stats, or if online decreased.
          if (nextOnline != null && lastOnlineEmitted != null && nextOnline < lastOnlineEmitted) {
            lastStatsEmitAt = now;
            lastOnlineEmitted = nextOnline;
            pendingStats = null;
            if (statsTimer) {
              try { window.clearTimeout(statsTimer); } catch (_) {}
              statsTimer = null;
            }
            onMessage(msg);
            return;
          }
          if (since >= STATS_THROTTLE_MS) {
            lastStatsEmitAt = now;
            if (nextOnline != null) lastOnlineEmitted = nextOnline;
            pendingStats = null;
            if (statsTimer) {
              try {
                window.clearTimeout(statsTimer);
              } catch (_) {}
              statsTimer = null;
            }
            onMessage(msg);
            return;
          }

          pendingStats = msg;
          if (!statsTimer) {
            var wait = Math.max(0, STATS_THROTTLE_MS - since);
            statsTimer = window.setTimeout(function () {
              statsTimer = null;
              if (!pendingStats) return;
              lastStatsEmitAt = Date.now();
              var m = pendingStats;
              pendingStats = null;
              try {
                var o = null;
                o = typeof m.online === "number" ? m.online : Number(m.online);
                if (isFinite(o)) lastOnlineEmitted = o;
              } catch (_) {}
              onMessage(m);
            }, wait);
          }
          return;
        }

	        // Treat known policy blocks as terminal so the UI doesn't enter a reconnect spam loop.
	        try {
	          if (
	            msg &&
	            msg.type === "error" &&
	            (String(msg.code || "") === "vpn_blocked" ||
                String(msg.code || "") === "connection error" ||
                String(msg.code || "") === "did_required" ||
                String(msg.code || "") === "ws_token_required")
	          ) {
	            terminalCloseReason =
	              String(msg.code || "") === "vpn_blocked"
	                ? "vpn_blocked"
	                : String(msg.code || "") === "did_required"
	                  ? "did_required"
                    : String(msg.code || "") === "ws_token_required"
                      ? "ws_token_required"
	                  : "connection_error";
	            isClosedByUser = true;
	            try { socket.close(); } catch (_) {}
	          }
	        } catch (_) {}

        onMessage(msg);
      };
      }).catch(function (err) {
        if (isClosedByUser) return;
        var tokenErr = "";
        try { tokenErr = String(err && err.message || ""); } catch (_) { tokenErr = ""; }
        if (tokenErr === "missing_did" || tokenErr.indexOf("token_http_400") === 0 || tokenErr.indexOf("token_http_403") === 0) {
          terminalCloseReason = "ws_token_required";
          isClosedByUser = true;
          onStatus({ state: "closed", code: 1008, reason: "ws_token_required", willReconnect: false });
          return;
        }
        onStatus({ state: "closed", code: 0, reason: "ws_token_fetch_failed", willReconnect: true });
        window.setTimeout(connect, backoff);
        backoff = Math.min(maxBackoff, Math.floor(backoff * 1.6));
      });
    }

    connect();

    return {
      send: safeSend,
      close: function () {
        isClosedByUser = true;
        clearCloseStatusTimer();
        stopHeartbeat();
        if (ws) {
          try {
            ws.close();
          } catch (_) {}
        }
      }
    };
  }

  // Expose a single namespace
  window.ChatSphereCommon = {
    createSocket: createChatSphereSocket
  };

  function getOrCreateSitePresenceId() {
    var key = "ChatSphere_site_presence_id_v1";
    try {
      var existing = String(sessionStorage.getItem(key) || "");
      if (/^[a-zA-Z0-9._:-]{12,80}$/.test(existing)) return existing;
    } catch (_) {}
    var id = "sp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 14);
    try {
      sessionStorage.setItem(key, id);
    } catch (_) {}
    return id;
  }

  function startSitePresenceHeartbeat() {
    if (window.__ChatSphereSitePresenceStarted) return;
    window.__ChatSphereSitePresenceStarted = true;
    try {
      if (/^\/admin(?:\/|$)/.test(String(location.pathname || ""))) return;
    } catch (_) {}
    var sessionId = getOrCreateSitePresenceId();
    var deviceId = "";
    try {
      deviceId = String(getOrCreateDeviceId() || "");
    } catch (_) {}
    var lastPresenceSentAt = 0;

    function sendPresence(force) {
      try {
        if (!force && document.visibilityState === "hidden") return;
        var nowMs = Date.now();
        var minGapMs = force ? 30000 : 60000;
        if (lastPresenceSentAt && nowMs - lastPresenceSentAt < minGapMs) return;
        lastPresenceSentAt = nowMs;
        var body = JSON.stringify({
          sessionId: sessionId,
          path: location.pathname || "/",
          title: document.title || "",
          deviceId: deviceId
        });
        if (navigator.sendBeacon) {
          var blob = new Blob([body], { type: "application/json" });
          navigator.sendBeacon("/api/site-presence", blob);
          return;
        }
        fetch("/api/site-presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          cache: "no-store",
          keepalive: true
        }).catch(function () {});
      } catch (_) {}
    }

    sendPresence(true);
    window.setInterval(function () {
      sendPresence(false);
    }, 60000);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") sendPresence(true);
    });
    window.addEventListener("pagehide", function () {
      sendPresence(true);
    });
  }

  // Theme toggle works on chat.html + video.html (and any page that includes it).
  // Keep it here so it's shared.
  if (typeof document !== "undefined") {
    function onIdle(fn) {
      try {
        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(fn, { timeout: 3000 });
          return;
        }
      } catch (_) {}
      window.setTimeout(fn, 1200);
    }

    document.addEventListener("DOMContentLoaded", function () {
      startSitePresenceHeartbeat();
      wireThemeToggle();
      onIdle(injectFeedbackWidget);
    });
  }
})();
