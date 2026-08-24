(function () {
  if (window.__ChatSphereVideoBooted) return;
  window.__ChatSphereVideoBooted = true;

  var VIDEO_CLIENT_VERSION = "20260824-screenshot-proof1";
  var COUNTRY_PREF_KEY = "video2_country_v1";
  var COUNTRY_PREF_SOURCE_KEY = "video2_country_source_v1";
  var $ = function (id) { return document.getElementById(id); };
  function translatedUiText(value) {
    try {
      return window.ChatSphereI18n && typeof window.ChatSphereI18n.t === "function" ? window.ChatSphereI18n.t(value) : value;
    } catch (_) {
      return value;
    }
  }
  var ws = null;
  var sendQueue = [];
  var wsReconnectTimer = 0;
  var pageExiting = false;
  var seq = 0;
  var matchId = "";
  var myUserId = "";
  var partnerUserId = "";
  var partnerCountryCode = "";
  var localStream = null;
  var mediaRecoveryTimer = 0;
  var mediaRecoveryPromise = null;
  var remoteStream = null;
  var pc = null;
  var pcGeneration = 0;
  var pendingIce = [];
  var sentIceCandidateKeys = {};
  var pendingIceCandidateBatch = [];
  var pendingIceCandidateBatchTimer = 0;
  var ICE_BATCH_DELAY_MS = 150;
  var ICE_BATCH_MAX = 24;
  var MAX_PENDING_REMOTE_ICE = 128;
  var MAX_CLIENT_WS_BUFFERED_BYTES = 512 * 1024;
  var CLIENT_WS_BACKPRESSURE_CLOSE_CODE = 4008;
  var SDP_DICT_VERSION = 1;
  var SDP_DEFLATE_VERSION = 1;
  var supportsSdpDeflate = !!(window.CompressionStream && window.DecompressionStream && window.TextEncoder && window.TextDecoder && window.Blob);
  var SDP_DICT = [
    "a=fingerprint:sha-256 ",
    "m=video 9 UDP/TLS/RTP/SAVPF ",
    "m=audio 9 UDP/TLS/RTP/SAVPF ",
    "a=rtcp:9 IN IP4 0.0.0.0",
    "c=IN IP4 0.0.0.0",
    "a=ice-options:trickle",
    "a=extmap-allow-mixed",
    "a=msid-semantic: WMS",
    "a=group:BUNDLE ",
    "a=rtcp-mux",
    "a=rtcp-rsize",
    "a=ice-ufrag:",
    "a=ice-pwd:",
    "a=setup:actpass",
    "a=setup:active",
    "a=setup:passive",
    "a=sendrecv",
    "a=rtcp-fb:",
    "a=rtpmap:",
    "a=fmtp:",
    "a=ssrc-group:FID ",
    "a=ssrc:",
    "a=msid:",
    "a=mid:",
    "a=extmap:"
  ];
  var sdpOfferSentByMatch = {};
  var sdpAnswerSentByMatch = {};
  var sdpOfferHandledByMatch = {};
  var webrtcNegoFailSentMatchId = "";
  var webrtcSelectedPairSentMatchId = "";
  var isSearching = false;
  var searchActionPending = false;
  var remoteVideoActive = false;
  var userStopped = false;
  var typingTimer = null;
  var proofToken = "";
  var proofExpAt = 0;
  var proofFailureRetries = 0;
  var PROOF_FAILURE_RETRY_MAX = 2;
  var wsToken = "";
  var wsTokenExpAt = 0;
  var wsTokenInFlight = null;
  var WS_TOKEN_REFRESH_HEADROOM_MS = 15000;
  var moderationScreenshotTimer = 0;
  var moderationScreenshotGeneration = 0;
  var moderationScreenshotStartedAt = 0;
  var moderationScreenshotInFlight = false;
  var moderationScreenshotController = null;
  var moderationScreenshotDiagLast = {};
  var moderationScreenshotNotReadyRetries = 0;
  var moderationScreenshotActiveMatchId = "";
  var moderationScreenshotNextAllowedAt = 0;
  var moderationScreenshotServerMinIntervalMs = 30000;
  var MODERATION_SCREENSHOT_RATE_LIMIT_PAD_MS = 2500;
  var moderationScreenshotThrottleDelayMs = 0;
  var moderationScreenshotLoggedSuccessMatchId = "";
  var moderationScreenshotDeferredDiagnosticMatchId = "";
  var moderationScreenshotDebugDiagnostics = /\bdiag=1\b/.test(String(window.location.search || ""));
  var moderationScreenshotBootDiagnosticSent = false;
  var moderationScreenshotMatchStartDiagnosticId = "";
  var FACE_BLINK_SESSION_KEY = "ChatSphere_face_blink_verified_session_v2";
  var FACE_BLINK_MODEL_BASE = "/assets/mediapipe/face_mesh/";
  var FACE_BLINK_MIN_FACE_FRAMES = 3;
  var FACE_BLINK_REQUIRED_BLINKS = 1;
  var FACE_BLINK_TIMEOUT_MS = 30000;
  var FACE_BLINK_LOOP_MS = 110;
  var faceBlinkConfig = { at: 0, enabled: true, inflight: null };
  var faceBlinkGate = {
    verified: false,
    promise: null,
    force: false,
    mesh: null,
    readyPromise: null,
    inFlight: false,
    pending: null,
    last: null,
    modal: null,
    video: null,
    status: null,
    faceDot: null,
    blinkDot: null,
    retryBtn: null,
    timer: 0
  };
  var lastOnlineDisplay = "";
  var pendingOnlineDisplay = "";
  var lastOnlineAppliedAt = 0;
  var onlineApplyTimer = 0;
  var lastMobileOnlineReplayAt = 0;
  var mobileSwipeHintFinishTimer = 0;
  var MOBILE_SWIPE_HINT_FINISH_MS = 18200;
  var temporaryStatusTimer = 0;
  var chatRateLimitedUntil = 0;
  var recentChatSendTimes = [];
  var searchWatchdogTimer = 0;
  var searchAttemptId = 0;
  var searchWatchdogMisses = 0;
  var searchStartedAt = 0;
  var searchHardRestarts = 0;
  var SEARCH_WATCHDOG_MS = 5000;
  var SEARCH_HARD_RESET_MISSES = 6;
  var SEARCH_HARD_RESTART_MAX = 2;
  var SEARCH_TIMEOUT_MS = 45000;
  var CONNECTING_NEXT_ESCAPE_MS = 7000;
  var CONNECT_WATCHDOG_MS = 10000;
  var CONNECT_WATCHDOG_RETRY_MS = 8000;
  var CONNECT_WATCHDOG_EXTEND_MS = 6000;
  var CONNECT_WATCHDOG_MEDIA_GRACE_MS = 8000;
  var CONNECT_WATCHDOG_MEDIA_GRACE_LIMIT = 3;
  var connectWatchdogTimer = 0;
  var connectWatchdogMatchId = "";
  var connectWatchdogExtended = false;
  var connectWatchdogRenegotiated = false;
  var connectWatchdogMediaGraceCount = 0;
  var PROOF_REFRESH_HEADROOM_MS = 5000;
  var matchConnectingSince = 0;
  var proofRefreshInFlight = false;
  var proofRefreshLastAt = 0;
  var wsReconnectAttempts = 0;
  var wsConnectPending = false;
  var resumeSearchOnOpen = false;
  // Signaling-only drop tolerance: when the websocket dies abnormally while
  // the P2P call is healthy, keep the match and try to resume the edge session
  // instead of tearing the call down.
  var SIGNALING_RESUME_GRACE_MS = 8000;
  var signalingResumeMatchId = "";
  var signalingResumeTimer = 0;
  var localNextCueSuppressUntil = 0;
  var searchRetryTimer = 0;
  var partnerVoteScore = { upvotes: 0, downvotes: 0, score: 0 };
  var userVoteByMatchId = {};
  var VOTE_CHANGE_WINDOW_MS = 5000;
  var votePanelHideTimer = 0;
  var votePanelHiddenMatchId = "";
  var blueStatusObserverStarted = false;
  var blueStatusDecorateFrame = 0;
  var gaMatchFoundSentId = "";
  var gaConnectedSentId = "";
  var REPORT_GRACE_MS = 5 * 60 * 1000;
  var reportGraceMatchId = "";
  var micLevelTimer = 0;
  var cameraCycleInFlight = false;
  var micLevelAudioCtx = null;
  var micLevelAnalyser = null;
  var micLevelSource = null;
  var reportGraceTimer = 0;
  var voteGraceMatchId = "";
  var voteGraceTimer = 0;
  var banModalActive = false;
  var vpnBlockedActive = false;
  var connectionErrorActive = false;
  var banStatusCache = null;
  var banStatusCacheAt = 0;
  var banStatusInflight = null;
  var strikeModalActive = false;
  var investigationLockActive = false;
  var strikeModalTimer = 0;
  var strikeModalRemaining = 0;
  var cmdFreezeToken = 0;
  var cmdFreezeTimer = 0;
  var urlCommandChatUnlocked = false;
  var premiumStatusCache = null;
  var premiumStatusCacheAt = 0;
  var premiumStatusInflight = null;
  var premiumAnalyticsFired = Object.create(null);
  var isAdminSession = false;
  var LOCAL_DEVICE_PREFS_KEY = "video2_local_devices_v1";
  var PEER_AUDIO_PREFS_KEY = "video2_peer_audio_v1";

  var iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ];
  var FORCE_TURN_RELAY = false;
  var iceFetchInflight = null;
  var iceLastFetchAt = 0;
  var iceServersTurn = null;
  var iceServersStun = null;
  var iceHasTurn = false;
  var turnFallbackOnly = false;
  var turnInitialGather = false;
  var TURN_INITIAL_GATHER_PERCENT = 20;
  var turnRetryMatchId = "";
  var turnBitrateAppliedMatchId = "";
  var TURN_VIDEO_CAP_ENABLED = true;
  var TURN_VIDEO_MAX_BITRATE_BPS = 300 * 1000;
  var TURN_VIDEO_MAX_FRAMERATE = 15;
  var TURN_VIDEO_SCALE_DOWN_BY = 1.5;
  try {
    FORCE_TURN_RELAY = String(new URLSearchParams(String(window.location.search || "")).get("forceTurn") || "") === "1";
  } catch (_) {
    FORCE_TURN_RELAY = false;
  }

  function stablePercent(value) {
    var hash = 2166136261;
    var input = String(value || "");
    for (var i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % 100;
  }

  function shouldGatherTurnInitially() {
    try {
      var override = new URLSearchParams(String(window.location.search || "")).get("turnGather");
      if (override === "1") return true;
      if (override === "0") return false;
    } catch (_) {}
    var did = "";
    try { did = String(getDeviceId() || ""); } catch (_) {}
    return !!did && stablePercent(did) < TURN_INITIAL_GATHER_PERCENT;
  }

  var MODERATION_SCREENSHOT_INTERVAL_MS = 30000;
  var MODERATION_SCREENSHOT_JITTER_MS = 5000;
  var MODERATION_SCREENSHOT_SESSION_CAP_MS = 3 * 60 * 60 * 1000;
  var MODERATION_SCREENSHOT_MAX_DIM = 640;
  var MODERATION_SCREENSHOT_JPEG_QUALITY = 0.42;

  function text(el, value) {
    if (el) el.textContent = value == null ? "" : String(value);
  }

  function show(el, display) {
    if (el) el.style.display = display || "";
  }

  function hide(el) {
    if (el) el.style.display = "none";
  }

  function safeJson(data) {
    try { return JSON.stringify(data); } catch (_) { return "{}"; }
  }

  function flushSendQueue() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    while (sendQueue.length) {
      if (ws.bufferedAmount > MAX_CLIENT_WS_BUFFERED_BYTES) {
        try { ws.close(CLIENT_WS_BACKPRESSURE_CLOSE_CODE, "client_backpressure"); } catch (_) { try { ws.close(); } catch (_) {} }
        return;
      }
      try { ws.send(safeJson(sendQueue.shift())); } catch (_) { break; }
    }
  }

  function clearWsReconnectTimer() {
    if (!wsReconnectTimer) return;
    window.clearTimeout(wsReconnectTimer);
    wsReconnectTimer = 0;
  }

  function scheduleSocketReconnect(delayMs) {
    if (pageExiting || banModalActive || vpnBlockedActive || connectionErrorActive) return;
    clearWsReconnectTimer();
    wsReconnectTimer = window.setTimeout(function () {
      wsReconnectTimer = 0;
      connectSocket();
    }, Math.max(100, Number(delayMs) || 0));
  }

  function send(data) {
    if (banModalActive || vpnBlockedActive || connectionErrorActive) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > MAX_CLIENT_WS_BUFFERED_BYTES) {
        sendQueue.push(data);
        if (sendQueue.length > 20) sendQueue.shift();
        try { ws.close(CLIENT_WS_BACKPRESSURE_CLOSE_CODE, "client_backpressure"); } catch (_) { try { ws.close(); } catch (_) {} }
        return;
      }
      ws.send(safeJson(data));
      return;
    }
    sendQueue.push(data);
    if (sendQueue.length > 20) sendQueue.shift();
    connectSocket();
  }

  function sendClientVersion(reason) {
    send({
      type: "client_version",
      clientVersion: VIDEO_CLIENT_VERSION,
      page: "video",
      reason: reason || "unknown",
      matchId: matchId || ""
    });
  }

  function compactIceCandidate(candidate) {
    try {
      if (!candidate || typeof candidate.candidate !== "string" || !candidate.candidate) return null;
      var out = { candidate: String(candidate.candidate) };
      if (candidate.sdpMid != null) out.sdpMid = String(candidate.sdpMid);
      if (candidate.sdpMLineIndex != null) out.sdpMLineIndex = Number(candidate.sdpMLineIndex);
      if (candidate.usernameFragment != null) out.usernameFragment = String(candidate.usernameFragment);
      return out;
    } catch (_) {
      return null;
    }
  }

  function resetIceCandidateSendState() {
    sentIceCandidateKeys = {};
    pendingIceCandidateBatch = [];
    if (pendingIceCandidateBatchTimer) {
      try { window.clearTimeout(pendingIceCandidateBatchTimer); } catch (_) {}
      pendingIceCandidateBatchTimer = 0;
    }
  }

  function encodeSdpForSignal(sdp) {
    var out = String(sdp || "");
    for (var i = 0; i < SDP_DICT.length; i++) {
      var token = String.fromCharCode(0xe000 + i);
      out = out.split(SDP_DICT[i]).join(token);
    }
    return out;
  }

  function decodeSdpFromSignal(sdpz) {
    var out = String(sdpz || "");
    for (var i = SDP_DICT.length - 1; i >= 0; i--) {
      var token = String.fromCharCode(0xe000 + i);
      out = out.split(token).join(SDP_DICT[i]);
    }
    return out;
  }

  function sendSdpSignal(typeName, matchIdValue, sdp) {
    if (!matchIdValue || !sdp) return;
    var raw = String(sdp || "");
    var packed = encodeSdpForSignal(raw);
    if (packed && packed.length + 16 < raw.length) {
      send({ type: typeName, matchId: matchIdValue, sdpz: packed, sdpv: SDP_DICT_VERSION });
      return;
    }
    send({ type: typeName, matchId: matchIdValue, sdp: raw });
  }

  function signalSdp(msg) {
    if (!msg) return "";
    if (msg.sdp) return String(msg.sdp || "");
    if (msg.sdpz) return decodeSdpFromSignal(msg.sdpz);
    return "";
  }

  function sdpSignalKey(sdp) {
    var raw = String(sdp || "");
    return String(raw.length) + ":" + raw.slice(0, 96) + ":" + raw.slice(-96);
  }

  function bytesToBase64(bytes) {
    var binary = "";
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(b64) {
    var binary = atob(String(b64 || ""));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function deflateSdpForSignal(sdp) {
    if (!supportsSdpDeflate) return Promise.resolve("");
    try {
      var stream = new Blob([new TextEncoder().encode(String(sdp || ""))]).stream().pipeThrough(new CompressionStream("deflate"));
      return new Response(stream).arrayBuffer().then(function (buf) {
        return bytesToBase64(new Uint8Array(buf));
      }).catch(function () { return ""; });
    } catch (_) {
      return Promise.resolve("");
    }
  }

  function inflateSdpFromSignal(sdpd) {
    if (!supportsSdpDeflate) return Promise.resolve("");
    try {
      var stream = new Blob([base64ToBytes(sdpd)]).stream().pipeThrough(new DecompressionStream("deflate"));
      return new Response(stream).arrayBuffer().then(function (buf) {
        return new TextDecoder().decode(buf);
      }).catch(function () { return ""; });
    } catch (_) {
      return Promise.resolve("");
    }
  }

  function sendSdpSignalAsync(typeName, matchIdValue, sdp) {
    if (!matchIdValue || !sdp) return Promise.resolve();
    var raw = String(sdp || "");
    return deflateSdpForSignal(raw).then(function (deflated) {
      if (deflated && deflated.length + 24 < raw.length) {
        send({ type: typeName, matchId: matchIdValue, sdpd: deflated, sdpv: SDP_DEFLATE_VERSION });
        return;
      }
      sendSdpSignal(typeName, matchIdValue, raw);
    });
  }

  function signalSdpAsync(msg) {
    if (!msg) return Promise.resolve("");
    if (msg.sdp) return Promise.resolve(String(msg.sdp || ""));
    if (msg.sdpd && Number(msg.sdpv) === SDP_DEFLATE_VERSION) return inflateSdpFromSignal(msg.sdpd);
    if (msg.sdpz) return Promise.resolve(decodeSdpFromSignal(msg.sdpz));
    return Promise.resolve("");
  }

  function flushIceCandidateBatch() {
    pendingIceCandidateBatchTimer = 0;
    if (!pendingIceCandidateBatch.length) return;
    var batchMatchId = String((pendingIceCandidateBatch[0] && pendingIceCandidateBatch[0].matchId) || "");
    if (!batchMatchId || batchMatchId !== String(matchId || "")) {
      pendingIceCandidateBatch = [];
      return;
    }
    var candidates = pendingIceCandidateBatch.map(function (item) { return item && item.candidate; }).filter(Boolean);
    pendingIceCandidateBatch = [];
    if (!candidates.length) return;
    send({ type: "webrtc_ice_candidates", matchId: batchMatchId, candidates: candidates });
  }

  function sendIceCandidate(matchIdValue, candidate) {
    var compact = compactIceCandidate(candidate);
    if (!compact || !matchIdValue) return;
    var key = String(matchIdValue) + "|" + compact.candidate;
    if (sentIceCandidateKeys[key]) return;
    sentIceCandidateKeys[key] = true;
    pendingIceCandidateBatch.push({ matchId: String(matchIdValue), candidate: compact });
    if (pendingIceCandidateBatch.length >= ICE_BATCH_MAX) {
      if (pendingIceCandidateBatchTimer) {
        try { window.clearTimeout(pendingIceCandidateBatchTimer); } catch (_) {}
        pendingIceCandidateBatchTimer = 0;
      }
      flushIceCandidateBatch();
      return;
    }
    if (!pendingIceCandidateBatchTimer) {
      pendingIceCandidateBatchTimer = window.setTimeout(flushIceCandidateBatch, ICE_BATCH_DELAY_MS);
    }
  }

  function normalizeUrlCommand(value) {
    var cmd = String(value || "").trim();
    if (!cmd) return "";
    if (/^cmd\s+/i.test(cmd)) cmd = "/" + cmd;
    return cmd;
  }

  function clearUrlCommandParam() {
    try {
      var url = new URL(window.location.href);
      if (!url.searchParams.has("cmd")) return;
      url.searchParams.delete("cmd");
      window.history.replaceState({}, "", url.pathname + (url.search || "") + (url.hash || ""));
    } catch (_) {}
  }

  function canUseUrlCommandChat() {
    return !!urlCommandChatUnlocked && !banModalActive && !vpnBlockedActive && !connectionErrorActive;
  }

  function focusChatInputNoScroll() {
    var input = $("message-input");
    if (!input) return;
    try { input.focus({ preventScroll: true }); }
    catch (_) {
      try { input.focus(); } catch (_) {}
    }
  }

  function isUrlCommandMode() {
    return !!urlCommandChatUnlocked;
  }

  function showReadyAfterDisconnect() {
    userStopped = true;
    clearSearchWatchdog();
    clearSearchRetryTimer();
    isSearching = false;
    searchActionPending = false;
    setStartLabel("Start");
    setLoader(false);
    setOverlay("ready", "");
    setStatus("");
    updateActionButtons();
  }

  function applyUrlCommand() {
    try {
      var url = new URL(window.location.href);
      var raw = url.searchParams.get("cmd");
      if (!raw) return;
      var cmd = normalizeUrlCommand(raw);
      if (!cmd) return;
      if (/^\/cmd(?:\s+|$)/i.test(cmd)) urlCommandChatUnlocked = true;
      var input = $("message-input");
      if (input) input.value = cmd;
      updateQuickEmojiControls();
      setChatControlsEnabled(quickEmojiActive());
      focusChatInputNoScroll();
      window.setTimeout(focusChatInputNoScroll, 0);
      if (!/^\/cmd\s+f(?:\s+|$)/i.test(cmd) && !/^\/cmd\s+[0-9A-Fa-f:.]+(?:\s+--lock)?\s*$/i.test(cmd)) {
        clearUrlCommandParam();
      }
    } catch (_) {}
  }

  function parseExpiresMs(value) {
    if (!value) return 0;
    if (typeof value === "number") return value > 1e12 ? value : value * 1000;
    var s = String(value || "").trim();
    if (!s) return 0;
    if (/^\d+$/.test(s)) {
      var n = Number(s);
      return n > 1e12 ? n : n * 1000;
    }
    var t = Date.parse(s);
    return isFinite(t) ? t : 0;
  }

  function fmtEst(value) {
    try {
      var t = parseExpiresMs(value);
      if (!t) return String(value || "");
      return new Date(t).toLocaleString("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      }) + " ET";
    } catch (_) {
      return String(value || "");
    }
  }

  function fmtRemaining(expiresAt) {
    if (!expiresAt) return "Permanent";
    var t = parseExpiresMs(expiresAt);
    if (!t) return "Temporary";
    var sec = Math.max(0, Math.floor((t - Date.now()) / 1000));
    var days = Math.floor(sec / 86400);
    sec -= days * 86400;
    var hrs = Math.floor(sec / 3600);
    sec -= hrs * 3600;
    var mins = Math.floor(sec / 60);
    if (days > 0) return days + "d " + hrs + "h " + mins + "m";
    if (hrs > 0) return hrs + "h " + mins + "m";
    if (mins > 0) return mins + "m";
    return sec + "s";
  }

  function fetchBanStatus(force) {
    try {
      var now = Date.now();
      if (!force && banStatusCache && now - banStatusCacheAt < 120000) return Promise.resolve(banStatusCache);
      if (banStatusInflight) return banStatusInflight;
      banStatusInflight = window.fetch("/api/unban/status?ts=" + Date.now(), { method: "GET", cache: "no-store" })
        .then(function (res) { return res.json(); })
        .then(function (json) {
          banStatusCache = json || { banned: false };
          banStatusCacheAt = Date.now();
          banStatusInflight = null;
          return banStatusCache;
        })
        .catch(function () {
          banStatusInflight = null;
          return banStatusCache || { banned: false };
        });
      return banStatusInflight;
    } catch (_) {
      return Promise.resolve(banStatusCache || { banned: false });
    }
  }

  function preflightBanCheck(force) {
    if (banModalActive) return Promise.resolve(true);
    return fetchBanStatus(force).then(function (status) {
      if (status && status.banned) {
        banModalActive = true;
        showBanModal(status);
        try { if (ws) ws.close(); } catch (_) {}
        return true;
      }
      return false;
    }).catch(function () {
      return false;
    });
  }

  function readJsonResponse(response) {
    return response.json().then(function (json) {
      if (!response.ok) throw new Error((json && json.error) || "request_failed");
      return json;
    });
  }

  function fetchPremiumStatusGlobal(force) {
    try {
      var now = Date.now();
      if (!force && premiumStatusCache && now - premiumStatusCacheAt < 5000) return Promise.resolve(premiumStatusCache);
      if (premiumStatusInflight) return premiumStatusInflight;
      premiumStatusInflight = window.fetch("/api/premium/status", { method: "GET", cache: "no-store" })
        .then(readJsonResponse)
        .then(function (status) {
          premiumStatusCache = status || {};
          premiumStatusCacheAt = Date.now();
          premiumStatusInflight = null;
          return premiumStatusCache;
        })
        .catch(function () {
          premiumStatusInflight = null;
          return premiumStatusCache || { premiumActive: false };
        });
      return premiumStatusInflight;
    } catch (_) {
      return Promise.resolve(premiumStatusCache || { premiumActive: false });
    }
  }

  function isPremiumActiveCached() {
    return !!(premiumStatusCache && premiumStatusCache.premiumActive);
  }

  function openPremiumDrawer() {
    var link = $("premiumUiBtn");
    if (link) {
      try { link.click(); return; } catch (_) {}
    }
    var drawer = $("premiumDrawer");
    if (drawer) {
      drawer.classList.add("open");
      drawer.setAttribute("aria-hidden", "false");
    }
  }

  function clearCountrySelection() {
    var select = $("countrySelect");
    if (select) {
      select.value = "";
      saveManualCountryPreference("");
      try { select.dispatchEvent(new Event("change", { bubbles: true })); } catch (_) {}
    }
  }

  function ensureCountryAllowed(country) {
    var cc = String(country || "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return Promise.resolve("");
    return fetchPremiumStatusGlobal(true).then(function (status) {
      if (status && status.premiumActive) return cc;
      var rem = Number(status && status.trialRemainingByFeature && status.trialRemainingByFeature.country);
      if (isFinite(rem) && rem > 0) return cc;
      clearCountrySelection();
      addMessage("system", "", "Specific country matching requires Premium. Matching Any Country instead.");
      openPremiumDrawer();
      return "";
    }).catch(function () {
      return cc;
    });
  }

  function showTerminalSystemState(message) {
    sendQueue = [];
    clearSearchWatchdog();
    isSearching = false;
    searchActionPending = false;
    setLoader(false);
    setStartLabel("Start");
    setOverlay("ready", "");
    var messages = $("messages");
    if (!messages) return;
    var div = document.createElement("div");
    div.className = "message message-system message-system-terminal";
    var span = document.createElement("span");
    span.className = "message-text";
    span.textContent = String(message || "Connection blocked.");
    div.appendChild(span);
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function showBanModal(payload) {
    if (document.getElementById("ban-modal-overlay")) return;
    payload = payload || {};
    banModalActive = true;
    sendQueue = [];
    clearSearchWatchdog();
    isSearching = false;
    searchActionPending = false;
    setLoader(false);
    setStartLabel("Start");
    closePeerConnection();
    try {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } catch (_) {}

    var overlay = document.createElement("div");
    overlay.id = "ban-modal-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Access restricted");

    var card = document.createElement("div");
    card.className = "ban-modal-card";

    var title = document.createElement("div");
    title.className = "ban-modal-title";
    title.textContent = "BANNED";
    card.appendChild(title);

    var reason = document.createElement("div");
    reason.className = "ban-modal-reason";
    var reasonLabel = document.createElement("div");
    reasonLabel.className = "ban-modal-reason-label";
    reasonLabel.textContent = "Ban reason";
    var reasonValue = document.createElement("div");
    reasonValue.className = "ban-modal-reason-value";
    reasonValue.textContent = String(payload.reason || payload.message || "Violation of community guidelines.");
    reason.appendChild(reasonLabel);
    reason.appendChild(reasonValue);
    var guidanceLink = document.createElement("a");
    guidanceLink.className = "ban-modal-reason-link video2-info-link";
    guidanceLink.href = "#rules";
    guidanceLink.setAttribute("data-info-panel", "rules");
    guidanceLink.textContent = "Review Rules";
    reason.appendChild(guidanceLink);
    card.appendChild(reason);

    var meta = document.createElement("div");
    meta.className = "ban-modal-panel";
    function appendMetaRow(labelText, valueText, valueId, extraValueClass) {
      var row = document.createElement("div");
      row.className = "ban-modal-meta-row";
      var label = document.createElement("span");
      label.className = "ban-modal-meta-label";
      label.textContent = labelText;
      var value = document.createElement("span");
      value.className = "ban-modal-meta-value" + (extraValueClass ? " " + extraValueClass : "");
      if (valueId) value.id = valueId;
      value.textContent = valueText;
      row.appendChild(label);
      row.appendChild(value);
      meta.appendChild(row);
    }
    appendMetaRow("Banned", payload.bannedAt ? fmtEst(payload.bannedAt) : "-");
    appendMetaRow("Expires", payload.expiresAt ? fmtEst(payload.expiresAt) : "Permanent");
    appendMetaRow("Remaining", fmtRemaining(payload.expiresAt), "ban-remaining", "ban-modal-mono");
    card.appendChild(meta);

    if (payload.lastScreenshot && payload.lastScreenshot.filename) {
      var imgWrap = document.createElement("div");
      imgWrap.className = "ban-modal-imgwrap";
      var img = document.createElement("img");
      var safe = encodeURIComponent(String(payload.lastScreenshot.filename || "")).replace(/%2F/g, "/").replace(/%5C/g, "/");
      img.src = "/view-images/" + safe;
      img.alt = "Last moderation screenshot";
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", function () {
        try { img.src = "/e/screenshots/" + safe; } catch (_) {}
      });
      imgWrap.appendChild(img);
      card.appendChild(imgWrap);
    }

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ban-modal-unban-btn";
    btn.textContent = "Pay $" + String(payload.unbanPrice || 10.99) + " to unban";
    btn.addEventListener("click", function () {
      btn.disabled = true;
      btn.textContent = "Redirecting to payment...";
      window.fetch("/api/unban/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          banId: payload.banId || "",
          ip: payload.ip || ""
        })
      })
        .then(function (res) {
          return res.json().then(function (json) {
            if (!res.ok) throw new Error((json && (json.error || json.reqId)) || "checkout_failed");
            return json;
          });
        })
        .then(function (json) {
          if (json && json.url) window.location.href = String(json.url);
          else throw new Error("missing_url");
        })
        .catch(function (e) {
          btn.disabled = false;
          btn.textContent = "Pay $" + String(payload.unbanPrice || 10.99) + " to unban";
          note.textContent = "Unable to start checkout" + (e && e.message ? ": " + e.message : "") + ". Please try again.";
        });
    });
    card.appendChild(btn);

    var footer = document.createElement("div");
    footer.className = "ban-modal-footer";
    var note = document.createElement("div");
    note.className = "ban-modal-note";
    note.textContent = "Secure checkout. Access updates automatically after payment.";
    footer.appendChild(note);
    var refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "ban-modal-secondary";
    refresh.textContent = "Refresh status";
    refresh.addEventListener("click", function () {
      refresh.disabled = true;
      refresh.textContent = "Checking...";
      fetchBanStatus(true).then(function (status) {
        if (status && status.banned === false) {
          window.location.href = "/video.html?unbanned=1";
          return;
        }
        note.textContent = "Still banned. Payment may take a moment to apply.";
      }).catch(function () {
        note.textContent = "Unable to refresh status. Try again.";
      }).then(function () {
        refresh.disabled = false;
        refresh.textContent = "Refresh status";
      });
    });
    footer.appendChild(refresh);
    card.appendChild(footer);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    if (payload.expiresAt) {
      var timer = window.setInterval(function () {
        var el = document.getElementById("ban-remaining");
        if (!el) {
          window.clearInterval(timer);
          return;
        }
        el.textContent = fmtRemaining(payload.expiresAt);
      }, 1000);
    }

    var pollDelay = 2500;
    function pollBanStatus() {
      if (!document.getElementById("ban-modal-overlay")) return;
      fetchBanStatus(true).then(function (status) {
        if (!status || status.banned !== false) return;
        try { window.location.href = "/video.html?unbanned=1"; } catch (_) {}
      }).catch(function () {}).then(function () {
        if (!document.getElementById("ban-modal-overlay")) return;
        pollDelay = document.visibilityState === "visible"
          ? Math.min(30000, Math.round(pollDelay * 1.75))
          : 30000;
        window.setTimeout(pollBanStatus, pollDelay);
      });
    }
    window.setTimeout(pollBanStatus, pollDelay);
  }

  function clearReportGrace() {
    if (reportGraceTimer) window.clearTimeout(reportGraceTimer);
    reportGraceTimer = 0;
    reportGraceMatchId = "";
  }

  function beginReportGrace(value) {
    var mid = String(value || "").trim();
    if (!mid) return;
    reportGraceMatchId = mid;
    if (reportGraceTimer) window.clearTimeout(reportGraceTimer);
    reportGraceTimer = window.setTimeout(clearReportGrace, REPORT_GRACE_MS);
  }

  function getReportTargetMatchId() {
    return String(matchId || reportGraceMatchId || "").trim();
  }

  function clearVoteGrace() {
    if (voteGraceTimer) window.clearTimeout(voteGraceTimer);
    voteGraceTimer = 0;
    voteGraceMatchId = "";
    updateVoteControls();
  }

  function beginVoteGrace(value) {
    var mid = String(value || "").trim();
    if (!mid) return;
    voteGraceMatchId = mid;
    if (voteGraceTimer) window.clearTimeout(voteGraceTimer);
    voteGraceTimer = window.setTimeout(clearVoteGrace, REPORT_GRACE_MS);
    updateVoteControls();
  }

  function getVoteTargetMatchId() {
    return String(matchId || voteGraceMatchId || "").trim();
  }

  function clearVotePanelExpiry() {
    if (votePanelHideTimer) window.clearTimeout(votePanelHideTimer);
    votePanelHideTimer = 0;
    votePanelHiddenMatchId = "";
    var panel = $("video2VotePanel");
    if (panel) {
      panel.classList.remove("is-hidden-after-vote", "is-vote-change-window");
      panel.removeAttribute("data-vote-hide-at");
    }
  }

  function beginVotePanelExpiry(value) {
    var mid = String(value || getVoteTargetMatchId() || "").trim();
    if (!mid) return;
    if (votePanelHideTimer) window.clearTimeout(votePanelHideTimer);
    votePanelHiddenMatchId = "";
    var panel = $("video2VotePanel");
    if (panel) {
      panel.classList.remove("is-hidden-after-vote");
      panel.classList.add("is-vote-change-window");
      panel.setAttribute("data-vote-hide-at", String(Date.now() + VOTE_CHANGE_WINDOW_MS));
    }
    votePanelHideTimer = window.setTimeout(function () {
      votePanelHideTimer = 0;
      var current = getVoteTargetMatchId();
      var votePanel = $("video2VotePanel");
      if (current && current === mid) {
        votePanelHiddenMatchId = mid;
        if (votePanel) votePanel.classList.add("is-hidden-after-vote");
      }
      if (votePanel) votePanel.classList.remove("is-vote-change-window");
      updateVoteControls();
    }, VOTE_CHANGE_WINDOW_MS);
  }

  function revealVotePanelForCurrentMatch() {
    var mid = getVoteTargetMatchId();
    if (!mid) return;
    votePanelHiddenMatchId = "";
    beginVotePanelExpiry(mid);
    updateVoteControls();
  }

  function disableSkipButtonForMs(ms) {
    var btn = $("skip-btn");
    if (!btn) return;
    cmdFreezeToken += 1;
    var token = cmdFreezeToken;
    if (cmdFreezeTimer) window.clearTimeout(cmdFreezeTimer);
    btn.disabled = true;
    btn.setAttribute("aria-disabled", "true");
    cmdFreezeTimer = window.setTimeout(function () {
      if (token !== cmdFreezeToken) return;
      cmdFreezeTimer = 0;
      updateActionButtons();
    }, Math.max(0, Number(ms) || 0));
  }

  function showModStrike(strikes, max, banText) {
    var messages = $("messages");
    if (!messages) return;
    var el = document.getElementById("modStrikeBadge");
    if (!el) {
      el = document.createElement("div");
      el.id = "modStrikeBadge";
      el.className = "mod-strike-badge";
      messages.insertBefore(el, messages.firstChild || null);
    }
    var s = Math.max(0, Math.floor(Number(strikes) || 0));
    var m = Math.max(1, Math.floor(Number(max) || 2));
    el.textContent = "Strike " + s + "/" + m;
    el.title = String(banText || "");
  }

  function setChatControlsEnabled(enabled) {
    var input = $("message-input");
    var sendBtn = $("send-btn");
    var canUseChat = ((!!enabled && quickEmojiActive()) || canUseUrlCommandChat()) && !strikeModalActive && !investigationLockActive;
    if (input) {
      input.disabled = !canUseChat;
      input.readOnly = !canUseChat;
      input.setAttribute("aria-disabled", canUseChat ? "false" : "true");
    }
    if (sendBtn) {
      sendBtn.disabled = !canUseChat;
      sendBtn.setAttribute("aria-disabled", canUseChat ? "false" : "true");
    }
  }

  function canSendChatNow() {
    var now = Date.now();
    if (now < chatRateLimitedUntil) {
      setTemporaryStatus("You're sending messages too fast.", 1600);
      return false;
    }
    recentChatSendTimes = recentChatSendTimes.filter(function (ts) {
      return now - ts < 4000;
    });
    if (recentChatSendTimes.length >= 7) {
      chatRateLimitedUntil = now + 2200;
      setTemporaryStatus("You're sending messages too fast.", 1800);
      return false;
    }
    recentChatSendTimes.push(now);
    return true;
  }

  function ensureStrikeModal() {
    var existing = document.getElementById("modStrikeModalBackdrop");
    if (existing) return existing;
    var backdrop = document.createElement("div");
    backdrop.id = "modStrikeModalBackdrop";
    backdrop.className = "mod-strike-modal-backdrop";
    backdrop.style.display = "none";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "Moderation warning");

    var modal = document.createElement("div");
    modal.className = "mod-strike-modal";
    modal.innerHTML =
      '<div class="mod-strike-modal-title">Moderation warning</div>' +
      '<div id="modStrikeModalRule" class="mod-strike-modal-rule"></div>' +
      '<div id="modStrikeModalText" class="mod-strike-modal-text"></div>' +
      '<div id="modStrikeModalQuote" class="mod-strike-modal-quote"></div>' +
      '<div class="mod-strike-modal-links"><a id="modStrikeModalGuidelinesLink" href="/community-guidelines.html" target="_blank" rel="noopener noreferrer">Review Community Guidelines</a></div>' +
      '<button id="modStrikeModalAckBtn" class="mod-strike-modal-ack" type="button" disabled>I understand</button>';
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    var btn = document.getElementById("modStrikeModalAckBtn");
    if (btn) {
      btn.addEventListener("click", function () {
        if (strikeModalRemaining > 0) return;
        hideStrikeModal();
      });
    }
    return backdrop;
  }

  function renderStrikeModalCountdown() {
    var btn = document.getElementById("modStrikeModalAckBtn");
    if (!btn) return;
    if (strikeModalRemaining > 0) {
      btn.disabled = true;
      btn.textContent = "I understand (" + strikeModalRemaining + ")";
    } else {
      btn.disabled = false;
      btn.textContent = "I understand";
    }
  }

  function showStrikeModal(triggerText, guidelinesUrl, ackTimeoutSec, strikes, max, banText, ruleKey) {
    strikeModalActive = true;
    showModStrike(strikes, max, banText);
    var backdrop = ensureStrikeModal();
    if (!backdrop) return;
    var rule = document.getElementById("modStrikeModalRule");
    var txt = document.getElementById("modStrikeModalText");
    var quote = document.getElementById("modStrikeModalQuote");
    var link = document.getElementById("modStrikeModalGuidelinesLink");
    if (rule) {
      rule.textContent = ruleKey ? ("Rule flagged: " + String(ruleKey)) : "Rule flagged";
      rule.style.display = "";
    }
    if (txt) txt.textContent = "You now have Strike " + (Math.max(0, Math.floor(Number(strikes) || 0))) + "/" + (Math.max(1, Math.floor(Number(max) || 2))) + ". Another strike may result in a ban.";
    if (quote) quote.textContent = triggerText ? ('"' + String(triggerText) + '"') : "(message unavailable)";
    if (link) link.href = String(guidelinesUrl || "/community-guidelines.html");
    setChatControlsEnabled(false);
    backdrop.style.display = "flex";
    strikeModalRemaining = Math.max(0, Math.floor(Number(ackTimeoutSec) || 10));
    renderStrikeModalCountdown();
    if (strikeModalTimer) window.clearInterval(strikeModalTimer);
    strikeModalTimer = window.setInterval(function () {
      strikeModalRemaining = Math.max(0, strikeModalRemaining - 1);
      renderStrikeModalCountdown();
      if (strikeModalRemaining <= 0) {
        window.clearInterval(strikeModalTimer);
        strikeModalTimer = 0;
      }
    }, 1000);
  }

  function hideStrikeModal() {
    strikeModalActive = false;
    if (strikeModalTimer) window.clearInterval(strikeModalTimer);
    strikeModalTimer = 0;
    strikeModalRemaining = 0;
    var backdrop = document.getElementById("modStrikeModalBackdrop");
    if (backdrop) backdrop.style.display = "none";
    setChatControlsEnabled(true);
  }

  function getDeviceId() {
    var key = "ChatSphere_device_id_v1";
    try {
      var existing = String(localStorage.getItem(key) || "");
      if (/^[a-zA-Z0-9._:-]{12,80}$/.test(existing)) return existing;
      var next = "d-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 16);
      localStorage.setItem(key, next);
      return next;
    } catch (_) {
      return "d-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 16);
    }
  }

  function getSitePresenceId() {
    var key = "ChatSphere_site_presence_id_v1";
    try {
      var existing = String(sessionStorage.getItem(key) || "");
      if (/^[a-zA-Z0-9._:-]{12,80}$/.test(existing)) return existing;
    } catch (_) {}
    var next = "sp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 14);
    try { sessionStorage.setItem(key, next); } catch (_) {}
    return next;
  }

  function sendAnalyticsEvent(name, params) {
    try {
      if (typeof window.gtag !== "function") return;
      params = params || {};
      params.event_category = params.event_category || "video_chat";
      params.transport_type = "beacon";
      if (lastOnlineDisplay) params.online_count_display = lastOnlineDisplay;
      window.gtag("event", name, params);
    } catch (_) {}
  }

  function sendVideoAnalyticsEvent(name, params) {
    params = params || {};
    params.chat_type = "video";
    params.chat_state = remoteVideoActive ? "connected" : (matchId ? "connecting" : (isSearching || searchActionPending ? "searching" : "idle"));
    sendAnalyticsEvent(name, params);
  }

  function premiumAnalyticsPayload(params) {
    params = params || {};
    params.event_category = "premium";
    params.flow = "premium";
    params.surface = params.surface || "video";
    params.page_path = window.location.pathname || "/video";
    if (premiumStatusCache) {
      params.premium_active = !!premiumStatusCache.premiumActive;
      if (premiumStatusCache.subscriptionStatus) params.subscription_status = String(premiumStatusCache.subscriptionStatus);
      if (premiumStatusCache.billingPeriod) params.billing_period = String(premiumStatusCache.billingPeriod);
      if (premiumStatusCache.priceUsd) params.price_usd = Number(premiumStatusCache.priceUsd) || 0;
    }
    return params;
  }

  function sendPremiumServerEvent(name, params) {
    try {
      var payload = Object.assign({}, params || {}, { event: name });
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon("/api/premium/event", blob)) return;
      }
      if (window.fetch) {
        window.fetch("/api/premium/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          keepalive: true,
          cache: "no-store"
        }).catch(function () {});
      }
    } catch (_) {}
  }

  function sendPremiumAnalyticsEvent(name, params, onceKey) {
    try {
      if (onceKey && premiumAnalyticsFired[onceKey]) return;
      if (onceKey) premiumAnalyticsFired[onceKey] = true;
      var payload = premiumAnalyticsPayload(params);
      sendPremiumServerEvent(name, payload);
      sendAnalyticsEvent(name, payload);
    } catch (_) {}
  }

  function premiumPurchaseParams(transactionId, status) {
    status = status || premiumStatusCache || {};
    var period = String(status.billingPeriod || "week").toLowerCase();
    var price = Number(status.priceUsd || 9.99) || 9.99;
    var itemId = period === "week" ? "premium_weekly" : "premium_monthly";
    return premiumAnalyticsPayload({
      transaction_id: transactionId || ("premium-" + Date.now()),
      currency: "USD",
      value: price,
      payment_provider: "stripe",
      billing_period: period,
      items: [{
        item_id: itemId,
        item_name: "Premium",
        item_category: "subscription",
        price: price,
        quantity: 1
      }]
    });
  }

  function sendPremiumPurchaseEvents(transactionId, status) {
    var key = String(transactionId || "status-" + Date.now());
    var params = premiumPurchaseParams(transactionId, status);
    sendPremiumAnalyticsEvent("premium_purchase", params, "premium_purchase_" + key);
    if (!status || !status.serverPurchaseTracking) {
      sendPremiumAnalyticsEvent("purchase", params, "purchase_" + key);
    }
  }

  function startSitePresenceHeartbeat() {
    if (window.__ChatSphereSitePresenceStarted) return;
    window.__ChatSphereSitePresenceStarted = true;
    var sessionId = getSitePresenceId();
    var deviceId = "";
    var lastPresenceSentAt = 0;
    try { deviceId = String(getDeviceId() || ""); } catch (_) {}
    function sendPresence(force) {
      try {
        if (!force && document.visibilityState === "hidden") return;
        var nowMs = Date.now();
        var minGapMs = force ? 30000 : 60000;
        if (lastPresenceSentAt && nowMs - lastPresenceSentAt < minGapMs) return;
        lastPresenceSentAt = nowMs;
        var body = JSON.stringify({
          sessionId: sessionId,
          path: location.pathname || "/video",
          title: document.title || "",
          deviceId: deviceId
        });
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/site-presence", new Blob([body], { type: "application/json" }));
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
    window.setInterval(function () { sendPresence(false); }, 60000);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") sendPresence(true);
    });
    window.addEventListener("pagehide", function () { sendPresence(true); });
  }

  function fetchWsToken() {
    var did = "";
    try { did = String(getDeviceId() || "").trim(); } catch (_) { did = ""; }
    if (!did || !/^[a-zA-Z0-9._:-]{6,80}$/.test(did)) return Promise.reject(new Error("missing_did"));
    if (wsToken && wsTokenExpAt && Date.now() + WS_TOKEN_REFRESH_HEADROOM_MS < wsTokenExpAt) {
      return Promise.resolve(wsToken);
    }
    if (wsTokenInFlight) return wsTokenInFlight;
    wsTokenInFlight = fetch("/api/ws-token?page=video&did=" + encodeURIComponent(did), {
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
      wsToken = token;
      wsTokenExpAt = Number(body && body.expAt || 0) || 0;
      wsTokenInFlight = null;
      return token;
    }).catch(function (err) {
      wsTokenInFlight = null;
      throw err;
    });
    return wsTokenInFlight;
  }

  function wsUrl(token) {
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    var url = proto + "//" + location.host + "/ws?page=video&did=" + encodeURIComponent(getDeviceId());
    if (token) url += "&wst=" + encodeURIComponent(String(token));
    try {
      if (document.referrer) url += "&ref=" + encodeURIComponent(document.referrer.slice(0, 500));
    } catch (_) {}
    return url;
  }

  function wsUrlWithToken() {
    return fetchWsToken().then(function (token) {
      return wsUrl(token);
    });
  }

  function readLocalDevicePrefs() {
    try {
      var raw = JSON.parse(localStorage.getItem(LOCAL_DEVICE_PREFS_KEY) || "{}");
      return {
        videoId: String(raw && raw.videoId || ""),
        audioId: String(raw && raw.audioId || "")
      };
    } catch (_) {
      return { videoId: "", audioId: "" };
    }
  }

  function saveLocalDevicePrefs(videoId, audioId) {
    try {
      localStorage.setItem(LOCAL_DEVICE_PREFS_KEY, JSON.stringify({
        videoId: String(videoId || ""),
        audioId: String(audioId || "")
      }));
    } catch (_) {}
  }

  function clearLocalDevicePrefs() {
    try { localStorage.removeItem(LOCAL_DEVICE_PREFS_KEY); } catch (_) {}
  }

  function readPeerAudioPrefs() {
    try {
      var raw = JSON.parse(localStorage.getItem(PEER_AUDIO_PREFS_KEY) || "{}");
      var volume = Math.max(0, Math.min(1, Number(raw && raw.volume)));
      if (!isFinite(volume)) volume = 1;
      return { volume: volume, muted: !!(raw && raw.muted) };
    } catch (_) {
      return { volume: 1, muted: false };
    }
  }

  function savePeerAudioPrefs(volume, muted) {
    try {
      localStorage.setItem(PEER_AUDIO_PREFS_KEY, JSON.stringify({
        volume: Math.max(0, Math.min(1, Number(volume) || 0)),
        muted: !!muted
      }));
    } catch (_) {}
  }

  function flagEmoji(cc) {
    var c = String(cc || "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) return "🌎";
    return String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65, 0x1f1e6 + c.charCodeAt(1) - 65);
  }

  function flagImageUrl(cc) {
    var c = String(cc || "").trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(c)) return "";
    return "https://flagcdn.com/w40/" + c + ".png";
  }

  function setCountryIcon(el, value) {
    if (!el) return;
    var useImage = !isMobileViewport() && !!flagImageUrl(value);
    el.classList.toggle("country-flag-image", useImage);
    if (useImage) {
      el.textContent = "";
      el.style.backgroundImage = 'url("' + flagImageUrl(value) + '")';
    } else {
      el.style.backgroundImage = "";
      el.textContent = flagEmoji(value);
    }
  }

  function setRemoteCountryFlag(cc) {
    partnerCountryCode = String(cc || "").trim().toUpperCase();
    var el = $("remoteCountryFlag");
    if (!el) return;
    var valid = /^[A-Z]{2}$/.test(partnerCountryCode);
    el.classList.toggle("has-country", valid);
    el.setAttribute("aria-label", valid ? ("Stranger country " + partnerCountryCode) : "Stranger country");
    if (valid) setCountryIcon(el, partnerCountryCode);
    else {
      el.classList.remove("country-flag-image");
      el.style.backgroundImage = "";
      el.textContent = "";
    }
  }

  function selectedCountry() {
    var sel = $("countrySelect");
    return sel ? String(sel.value || "").trim().toUpperCase() : "";
  }

  function normalizeCountryForSelect(value) {
    var cc = String(value || "").trim().toUpperCase();
    return /^[A-Z]{2}$/.test(cc) ? cc : "";
  }

  function hasSavedCountryPreference() {
    try {
      if (!window.localStorage || localStorage.getItem(COUNTRY_PREF_KEY) === null) return false;
      readSavedCountryPreference();
      return localStorage.getItem(COUNTRY_PREF_KEY) !== null;
    } catch (_) {
      return false;
    }
  }

  function readSavedCountryPreference() {
    try {
      if (!window.localStorage) return "";
      var raw = localStorage.getItem(COUNTRY_PREF_KEY);
      if (raw === null) return "";
      var saved = normalizeCountryForSelect(raw);
      var source = String(localStorage.getItem(COUNTRY_PREF_SOURCE_KEY) || "");
      if (saved && source !== "manual") {
        localStorage.removeItem(COUNTRY_PREF_KEY);
        localStorage.removeItem(COUNTRY_PREF_SOURCE_KEY);
        return "";
      }
      return saved;
    } catch (_) {
      return "";
    }
  }

  function saveManualCountryPreference(value) {
    try {
      if (!window.localStorage) return;
      localStorage.setItem(COUNTRY_PREF_KEY, normalizeCountryForSelect(value));
      localStorage.setItem(COUNTRY_PREF_SOURCE_KEY, "manual");
    } catch (_) {}
  }

  function syncCountryControlDisplay() {
    var select = $("countrySelect");
    var value = select ? String(select.value || "").trim().toUpperCase() : "";
    var countryTile = $("countryTile");
    if (countryTile) {
      countryTile.setAttribute("data-flag", flagEmoji(value));
      countryTile.setAttribute("data-icon", flagEmoji(value));
    }
    setCountryIcon($("countryTileEmoji"), value);
    document.querySelectorAll(".video2-country-option").forEach(function (btn) {
      btn.classList.toggle("is-selected", String(btn.getAttribute("data-country") || "") === value);
    });
  }

  function applyDefaultCountryFromGeo(value) {
    var select = $("countrySelect");
    if (!select || hasSavedCountryPreference() || selectedCountry()) return false;
    select.value = "";
    syncCountryControlDisplay();
    return false;
  }

  function fetchDefaultCountry() {
    applyDefaultCountryFromGeo("");
  }

  function normalizeIdentity(value) {
    var v = String(value || "").trim().toLowerCase();
    return v === "female" ? v : "male";
  }

  function selectedIdentity() {
    try {
      return normalizeIdentity(localStorage.getItem("video2_identity_v1") || "male");
    } catch (_) {
      return "male";
    }
  }

  function setGenderAvatarClass(el, value) {
    if (!el) return;
    var v = normalizeIdentity(value);
    el.classList.add("gender-avatar-icon");
    el.classList.toggle("gender-avatar-female", v === "female");
    el.classList.toggle("gender-avatar-male", v !== "female");
    if (el.tagName && String(el.tagName).toLowerCase() === "img") {
      el.src = v === "female" ? "/assets/gender-female-pink.svg" : "/assets/gender-male-blue.svg";
    }
  }

  function applyIdentityPrefs(prefs) {
    var target = prefs && typeof prefs === "object" ? prefs : {};
    target.identity = selectedIdentity();
    return target;
  }

  function normalizeInterests(value) {
    var raw = [];
    if (Array.isArray(value)) raw = value;
    else if (typeof value === "string") {
      try {
        var parsed = JSON.parse(value);
        raw = Array.isArray(parsed) ? parsed : value.split(/[\n,]+/);
      } catch (_) {
        raw = value.split(/[\n,]+/);
      }
    }
    var seen = Object.create(null);
    var out = [];
    raw.forEach(function (item) {
      var cleaned = String(item || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 32);
      var key = cleaned.toLowerCase();
      if (!cleaned || seen[key]) return;
      seen[key] = true;
      out.push(cleaned);
    });
    return out.slice(0, 10);
  }

  function savedInterests() {
    try {
      return normalizeInterests(localStorage.getItem("ChatSphere_interests_v1") || "[]");
    } catch (_) {
      return [];
    }
  }

  function saveInterests(list) {
    var clean = normalizeInterests(list);
    try {
      if (clean.length) localStorage.setItem("ChatSphere_interests_v1", JSON.stringify(clean));
      else localStorage.removeItem("ChatSphere_interests_v1");
    } catch (_) {}
    return clean;
  }

  function applySearchPrefs(prefs) {
    var target = applyIdentityPrefs(prefs);
    var interests = savedInterests();
    if (interests.length) target.interests = interests;
    return target;
  }

  function interestStatusSuffix() {
    var interests = savedInterests();
    if (!interests.length) return "";
    return " by " + interests.slice(0, 3).join(", ");
  }

  function cameraLabel() {
    try {
      var tracks = localStream ? localStream.getVideoTracks() : [];
      return tracks && tracks[0] && tracks[0].label ? String(tracks[0].label).slice(0, 120) : "";
    } catch (_) {
      return "";
    }
  }

  function isMobileViewport() {
    return !!(window.matchMedia && window.matchMedia("(max-width: 520px)").matches);
  }

  function isMobileTouchViewport() {
    return isMobileViewport() && !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  }

  function preferScreenshotDataUrlUpload() {
    return true;
  }

  function hasPopupKeyboard() {
    var touchLike = ("ontouchstart" in window) || (navigator.maxTouchPoints || 0) > 0;
    return touchLike && !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  }

  function dismissPopupKeyboard(input) {
    if (!hasPopupKeyboard()) return;
    if (!input) input = $("message-input");
    if (input && typeof input.blur === "function") {
      try { input.blur(); } catch (_) {}
    }
  }

  function setStatus(label) {
    if (temporaryStatusTimer) {
      window.clearTimeout(temporaryStatusTimer);
      temporaryStatusTimer = 0;
    }
    var el = $("connectStatus");
    if (!el) return;
    el.classList.remove("is-fading", "is-looking-status", "is-searching-status", "is-connecting-status");
    if (isMobileViewport() && /disconnected/i.test(String(label || ""))) {
      text(el, "");
      hide(el);
      scheduleBlueStatusDecorate();
      return;
    }
    if (!label) {
      text(el, "");
      hide(el);
      scheduleBlueStatusDecorate();
      return;
    }
    var statusText = String(label || "");
    if (/^(looking for people online|searching(?:\s|$)|(re)?connecting video)/i.test(statusText)) {
      text(el, "");
      hide(el);
      scheduleBlueStatusDecorate();
      return;
    }
    if (/^looking for people online/i.test(statusText)) el.classList.add("is-looking-status");
    else if (/^searching(?:\s|$)/i.test(statusText)) el.classList.add("is-searching-status");
    else if (/^(re)?connecting video/i.test(statusText)) el.classList.add("is-connecting-status");
    text(el, statusText.replace(/\.{3}\s*$/, ""));
    if (/^(looking for people online|searching(?:\s|$))/i.test(statusText)) {
      var dots = document.createElement("span");
      dots.className = "search-status-dots";
      dots.setAttribute("aria-hidden", "true");
      dots.innerHTML = "<span>.</span><span>.</span><span>.</span>";
      el.appendChild(dots);
    }
    show(el, "block");
    scheduleBlueStatusDecorate();
  }

  function setTemporaryStatus(label, durationMs) {
    setStatus(label);
    var expected = String(label || "");
    temporaryStatusTimer = window.setTimeout(function () {
      temporaryStatusTimer = 0;
      var el = $("connectStatus");
      if (!el || String(el.textContent || "") !== expected) return;
      el.classList.add("is-fading");
      window.setTimeout(function () {
        if (!el || String(el.textContent || "") !== expected) return;
        setStatus("");
      }, 240);
    }, durationMs || 1800);
  }

  var sessionTimerStart = 0;
  var sessionTimerInterval = 0;
  function formatSessionTime(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    function pad2(n) { return (n < 10 ? "0" : "") + n; }
    return (h ? pad2(h) + ":" : "") + pad2(m) + ":" + pad2(s);
  }
  function updateSessionTimer() {
    var el = $("video2SessionTimer");
    if (!el || !sessionTimerStart) return;
    el.textContent = formatSessionTime(Date.now() - sessionTimerStart);
  }
  function startSessionTimer() {
    if (sessionTimerInterval) return;
    sessionTimerStart = Date.now();
    updateSessionTimer();
    sessionTimerInterval = window.setInterval(updateSessionTimer, 1000);
  }
  function stopSessionTimer() {
    if (sessionTimerInterval) {
      window.clearInterval(sessionTimerInterval);
      sessionTimerInterval = 0;
    }
    sessionTimerStart = 0;
    var el = $("video2SessionTimer");
    if (el) el.textContent = "00:00";
  }

  function setRemoteVideoActive(active) {
    var wasActive = remoteVideoActive;
    remoteVideoActive = !!active;
    if (active) clearConnectWatchdog();
    if (active && !wasActive) startSessionTimer();
    if (active && !wasActive && matchId && gaConnectedSentId !== String(matchId)) {
      gaConnectedSentId = String(matchId);
      sendVideoAnalyticsEvent("video_connected", { match_id_present: 1 });
    }
    if (!active) stopSessionTimer();
    document.body.classList.toggle("video2-remote-active", !!active);
    document.body.classList.toggle("video2-connected", !!active);
    if (active) document.body.classList.remove("video2-ready", "video2-initial-screen");
    updateMobileSwipeHintVisibility();
    var peer = $("peer");
    if (peer) {
      peer.classList.toggle("remote-active", !!active);
      peer.classList.toggle("disconnected", !active);
    }
    updateActionButtons();
    updateQuickEmojiControls();
    // Auto-focus only where it won't pop an on-screen keyboard over the video.
    if (active && !wasActive && !hasPopupKeyboard()) {
      window.setTimeout(function () {
        var input = $("message-input");
        if (!input) return;
        try { input.focus({ preventScroll: true }); }
        catch (_) {
          try { input.focus(); } catch (_) {}
        }
      }, 0);
    }
  }

  function setStartIntent(active) {
    document.body.classList.toggle("video2-start-intent", !!active);
  }

  function setOverlay(state, subtext) {
    var peer = $("peer");
    var overlay = $("disconnected-overlay");
    var title = overlay ? overlay.querySelector(".disconnected-text") : null;
    var sub = $("disconnected-subtext");
    if (peer) peer.classList.toggle("disconnected", !!state || !remoteVideoActive);
    document.body.classList.toggle("video2-connected", !!remoteVideoActive);
    document.body.classList.toggle("video2-searching", state === "searching");
    document.body.classList.toggle("video2-ready", state === "ready");
    if (state === "ready") setStartIntent(false);
    if (state === "searching" || !state) document.body.classList.remove("video2-initial-screen");
    if (state) setRemoteVideoActive(false);
    if (overlay) {
      overlay.classList.toggle("active", !!state);
      overlay.setAttribute("aria-hidden", state ? "false" : "true");
      overlay.setAttribute("data-state", state ? String(state) : "");
    }
    var overlaySubtext = subtext || "";
    if (state === "searching" || state === "connecting") overlaySubtext = "";
    if (title) text(title, "");
    if (sub) text(sub, overlaySubtext);
    updateQuickEmojiControls();
    updateMobileSwipeHintVisibility();
    if (state === "ready") {
      window.setTimeout(animateOnlineCount, 80);
    }
    scheduleBlueStatusDecorate();
  }

  function mediaPermissionMessage(err) {
    var name = "";
    var message = "";
    try { name = String(err && err.name || ""); } catch (_) { name = ""; }
    try { message = String(err && err.message || ""); } catch (_) { message = ""; }
    var raw = (name + " " + message).toLowerCase();
    if (/notallowed|permissiondenied|security|denied|permission/.test(raw)) {
      return "Allow camera and microphone access in your browser, then tap Allow Camera.";
    }
    if (/notfound|devicesnotfound|overconstrained|constraint/.test(raw)) {
      return "Camera and microphone are required. Connect both devices, then tap Allow Camera.";
    }
    if (/notreadable|trackstart|in use|busy|hardware/.test(raw)) {
      return "Camera or microphone is already in use. Close other apps, then tap Allow Camera.";
    }
    if (/not available|unsupported|getusermedia/.test(raw)) {
      return "Camera and microphone are not available in this browser.";
    }
    return "Enable camera and microphone access to start video chat.";
  }

  function showMediaPermissionNotice(err) {
    var message = mediaPermissionMessage(err);
    setLoader(false);
    // Peer overlay keeps the ready-style branding (logo + online count); the
    // actionable message + Allow Camera button render on the local feed tile.
    setOverlay("media-permission", "");
    document.body.classList.add("video2-media-denied");
    var localNotice = $("local-media-permission");
    var localText = $("local-media-permission-text");
    if (localText) text(localText, message);
    if (localNotice) localNotice.hidden = false;
    updateMobileSwipeHintVisibility();
    var retryBtn = $("media-permission-retry");
    if (retryBtn && !retryBtn.getAttribute("data-bound")) {
      retryBtn.setAttribute("data-bound", "1");
      retryBtn.addEventListener("click", function () {
        clearMediaPermissionNotice();
        startSearch(false);
      });
    }
    var loaderText = $("peer-video-loader-text");
    if (loaderText) {
      loaderText.classList.remove("is-searching-label", "is-connecting-label");
      loaderText.removeAttribute("data-phase");
    }
  }

  function clearMediaPermissionNotice() {
    document.body.classList.remove("video2-media-denied");
    var localNotice = $("local-media-permission");
    if (localNotice) localNotice.hidden = true;
    updateMobileSwipeHintVisibility();
    var overlay = $("disconnected-overlay");
    if (overlay && overlay.getAttribute("data-state") === "media-permission") {
      setOverlay("ready", "");
    }
  }

  function streamHasLiveCameraAndMic(stream) {
    if (!stream) return false;
    try {
      var hasVideo = stream.getVideoTracks && stream.getVideoTracks().some(function (track) {
        return track && track.readyState === "live";
      });
      var hasAudio = stream.getAudioTracks && stream.getAudioTracks().some(function (track) {
        return track && track.readyState === "live";
      });
      return !!(hasVideo && hasAudio);
    } catch (_) {
      return false;
    }
  }

  function mobileSwipeHintShouldShow() {
    return isMobileTouchViewport() &&
      document.body.classList.contains("video2-ready") &&
      document.body.classList.contains("video2-initial-screen") &&
      !document.body.classList.contains("video2-media-denied") &&
      !document.body.classList.contains("video2-swipe-hint-finished") &&
      !document.body.classList.contains("video2-loading") &&
      !document.body.classList.contains("video2-searching") &&
      !document.body.classList.contains("video2-connected") &&
      !remoteVideoActive &&
      !isSearching &&
      !searchActionPending &&
      !matchId;
  }

  function finishMobileSwipeHint() {
    mobileSwipeHintFinishTimer = 0;
    document.body.classList.add("video2-swipe-hint-finished");
    updateMobileSwipeHintVisibility();
  }

  function setInitialFadeVisible(el, visible, displayValue) {
    if (!el) return;
    el.classList.add("video2-initial-fade");
    if (el.__video2InitialFadeTimer) {
      window.clearTimeout(el.__video2InitialFadeTimer);
      el.__video2InitialFadeTimer = 0;
    }
    if (visible) {
      el.style.display = displayValue || "";
      window.requestAnimationFrame(function () {
        el.classList.remove("video2-initial-fade-hidden");
      });
      return;
    }
    el.classList.add("video2-initial-fade-hidden");
    el.__video2InitialFadeTimer = window.setTimeout(function () {
      if (el.classList.contains("video2-initial-fade-hidden")) el.style.display = "none";
      el.__video2InitialFadeTimer = 0;
    }, 150);
  }

  function resetInitialFade(el) {
    if (!el) return;
    if (el.__video2InitialFadeTimer) {
      window.clearTimeout(el.__video2InitialFadeTimer);
      el.__video2InitialFadeTimer = 0;
    }
    el.classList.remove("video2-initial-fade", "video2-initial-fade-hidden");
  }

  function updateMobileSwipeHintVisibility() {
    var showHint = mobileSwipeHintShouldShow();
    var showReadyBrand = isMobileTouchViewport() &&
      (document.body.classList.contains("video2-ready") ||
        document.body.classList.contains("video2-media-denied")) &&
      !document.body.classList.contains("video2-loading") &&
      !document.body.classList.contains("video2-searching") &&
      !document.body.classList.contains("video2-connected") &&
      !remoteVideoActive &&
      !isSearching &&
      !searchActionPending &&
      !matchId;
    var cameraEnabled = document.body.classList.contains("video2-camera-enabled");
    var isInitialScreen = document.body.classList.contains("video2-initial-screen");
    var swipeHintFinished = document.body.classList.contains("video2-swipe-hint-finished");
    var showStaticLogo = showReadyBrand && (!cameraEnabled || !isInitialScreen || swipeHintFinished);
    var showStartBrand = showReadyBrand && cameraEnabled && isInitialScreen && !swipeHintFinished;
    document.querySelectorAll(".logo-image").forEach(function (el) {
      if (!isMobileTouchViewport()) {
        resetInitialFade(el);
        el.style.display = "";
        return;
      }
      setInitialFadeVisible(el, showStaticLogo, "block");
    });
    document.querySelectorAll(".mobile-cube-logo-main").forEach(function (el) {
      setInitialFadeVisible(el, showStartBrand, "inline-block");
      el.setAttribute("aria-hidden", showStartBrand ? "false" : "true");
    });
    document.querySelectorAll(".mobile-swipe-hint").forEach(function (el) {
      setInitialFadeVisible(el, showHint, "block");
      el.setAttribute("aria-hidden", showHint ? "false" : "true");
      el.classList.toggle("cube-logo--playing", showHint && document.body.classList.contains("video2-camera-enabled"));
    });
    document.querySelectorAll("#top-bar.app-header .online-counter").forEach(function (el) {
      if (!isMobileTouchViewport()) {
        resetInitialFade(el);
        el.style.display = "";
        return;
      }
      setInitialFadeVisible(el, showReadyBrand, "inline-flex");
    });
    document.querySelectorAll(".mobile-control-policy").forEach(function (el) {
      var showPolicy = isMobileViewport() &&
        document.body.classList.contains("video2-initial-screen") &&
        !document.body.classList.contains("video2-media-denied") &&
        !document.body.classList.contains("video2-loading") &&
        !document.body.classList.contains("video2-searching") &&
        !document.body.classList.contains("video2-connected") &&
        !remoteVideoActive &&
        !isSearching &&
        !searchActionPending &&
        !matchId;
      setInitialFadeVisible(el, showPolicy, "");
    });
    if (showReadyBrand) {
      var now = Date.now();
      if (now - lastMobileOnlineReplayAt > 1800) {
        lastMobileOnlineReplayAt = now;
        window.setTimeout(animateOnlineCount, 80);
      }
    }
  }

  var lastLocalSwipeAnimAt = 0;
  var cubeTurnCue = null;
  function markLocalNextCueSuppressed(ms) {
    localNextCueSuppressUntil = Math.max(localNextCueSuppressUntil, Date.now() + (Number(ms) || 2600));
  }
  function localNextCueSuppressed() {
    return Date.now() < localNextCueSuppressUntil;
  }
  function playRemoteSwipeCue(direction) {
    if (!isMobileTouchViewport()) return 0;
    if (localNextCueSuppressed()) return 0;
    if (Date.now() - lastLocalSwipeAnimAt < 900) return 0;
    if (!cubeTurnCue) return 0;
    return cubeTurnCue(Number(direction) < 0 ? -1 : 1);
  }

  function renderLoaderStatusLabel(el, label) {
    if (!el) return;
    var raw = String(label || "Searching for strangers...");
    var clean = raw.replace(/\.{3}\s*$/, "");
    var phase = loaderPhaseFromLabel(raw);
    text(el, clean);
    applyLoaderPhaseStyle(el, phase === "connecting" ? phase : "");
    if (phase) {
      el.setAttribute("data-phase", phase);
      var dots = document.createElement("span");
      dots.className = "loader-status-dots";
      dots.setAttribute("aria-hidden", "true");
      dots.innerHTML = "<span>.</span><span>.</span><span>.</span>";
      el.appendChild(dots);
    } else {
      el.removeAttribute("data-phase");
    }
  }

  function loaderPhaseFromLabel(label) {
    var raw = String(label || "");
    if (/^(connecting|reconnecting) video/i.test(raw)) return "connecting";
    if (/^searching(?:\s|$)/i.test(raw)) return "searching";
    return "";
  }

  function applyLoaderPhaseStyle(el, phase) {
    if (!el) return;
    var props = [
      "border",
      "background",
      "background-color",
      "background-image",
      "box-shadow",
      "color",
      "filter",
      "text-shadow"
    ];
    if (!phase) {
      props.forEach(function (prop) { el.style.removeProperty(prop); });
      return;
    }
    el.style.setProperty("border", "1px solid rgba(1,127,254,.96)", "important");
    el.style.setProperty("background", "rgba(1,127,254,.42)", "important");
    el.style.setProperty("background-color", "rgba(1,127,254,.42)", "important");
    el.style.setProperty("background-image", "none", "important");
    el.style.setProperty("box-shadow", "0 0 0 1px rgba(1,127,254,.22), 0 0 24px rgba(1,127,254,.50), 0 8px 24px rgba(0,0,0,.24)", "important");
    el.style.setProperty("color", "#fff", "important");
    el.style.setProperty("filter", "none", "important");
    el.style.setProperty("text-shadow", "none", "important");
  }

  function applyLoaderRingPhaseStyle(el, phase) {
    if (!el) return;
    if (!phase) {
      ["border-color", "border-top-color", "background", "box-shadow", "filter"].forEach(function (prop) {
        el.style.removeProperty(prop);
      });
      return;
    }
    el.style.setProperty("border-color", "rgba(1,127,254,.22)", "important");
    el.style.setProperty("border-top-color", "#017ffe", "important");
    el.style.setProperty("background", "rgba(1,127,254,.08)", "important");
    el.style.setProperty("box-shadow", "0 0 0 1px rgba(1,127,254,.16), 0 0 26px rgba(1,127,254,.46), 0 10px 28px rgba(0,0,0,.28)", "important");
    el.style.setProperty("filter", "none", "important");
  }

  function normalizeLoaderStatusText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/\.{3}\s*$/, "")
      .trim();
  }

  function makeLoaderDots() {
    var dots = document.createElement("span");
    dots.className = "loader-status-dots";
    dots.setAttribute("aria-hidden", "true");
    dots.innerHTML = "<span>.</span><span>.</span><span>.</span>";
    return dots;
  }

  function decorateBlueStatusLabels() {
    blueStatusDecorateFrame = 0;
    var root = $("videos") || $("peer") || document.body;
    if (!root) return;
    var nodes = root.querySelectorAll("div, span, p");
    Array.prototype.forEach.call(nodes, function (el) {
      if (!el || el.id === "connectStatus") return;
      var clean = normalizeLoaderStatusText(el.textContent);
      var isStatus = /^(connecting video|reconnecting video)$/i.test(clean);
      el.classList.toggle("video2-blue-status-text", isStatus);
      if (isStatus && !el.querySelector(".loader-status-dots")) el.appendChild(makeLoaderDots());
    });
  }

  function scheduleBlueStatusDecorate() {
    if (!blueStatusObserverStarted && window.MutationObserver) {
      blueStatusObserverStarted = true;
      window.setTimeout(function () {
        var root = $("videos") || $("peer");
        if (!root) return;
        try {
          var observer = new MutationObserver(scheduleBlueStatusDecorate);
          observer.observe(root, { childList: true, subtree: true, characterData: true });
        } catch (_) {}
      }, 0);
    }
    if (blueStatusDecorateFrame) return;
    blueStatusDecorateFrame = window.requestAnimationFrame ? window.requestAnimationFrame(decorateBlueStatusLabels) : window.setTimeout(decorateBlueStatusLabels, 16);
  }

  function setLoader(visible, label) {
    var loader = $("peer-video-loader");
    var loaderText = $("peer-video-loader-text");
    document.body.classList.toggle("video2-loading", !!visible);
    if (visible) document.body.classList.remove("video2-ready", "video2-initial-screen");
    updateMobileSwipeHintVisibility();
    updateActionButtons();
    if (loader) {
      var visiblePhase = visible ? loaderPhaseFromLabel(label || "Searching for strangers...") : "";
      applyLoaderRingPhaseStyle(loader, visiblePhase === "connecting" ? visiblePhase : "");
      // Phase-lock the ring to the document timeline so it lines up with
      // the cube turn's static spinner when one replaces the other. Only
      // on hidden->visible: re-setting the delay on a running animation
      // would shift its phase off the shared epoch instead.
      if (visible && loader.style.display !== "block") {
        loader.style.animationDelay = (-(performance.now() % 900)).toFixed(0) + "ms";
      }
      loader.style.display = visible ? "block" : "none";
    }
    if (loaderText) {
      var loaderLabel = label || "Searching for strangers...";
      loaderText.classList.remove("is-searching-label", "is-connecting-label");
      if (/^connecting video/i.test(loaderLabel)) loaderText.classList.add("is-connecting-label");
      else if (/^searching(?:\s|$)/i.test(loaderLabel)) loaderText.classList.add("is-searching-label");
      renderLoaderStatusLabel(loaderText, loaderLabel);
      loaderText.style.display = visible ? "block" : "none";
      if (!visible) {
        loaderText.classList.remove("is-searching-label", "is-connecting-label");
        loaderText.removeAttribute("data-phase");
      }
    }
    scheduleBlueStatusDecorate();
  }

  function setStartLabel(label) {
    var btn = $("skip-btn");
    if (!btn) return;
    var next = label || "Start";
    btn.setAttribute("data-label", next);
    btn.setAttribute("aria-label", next);
    var labelEl = btn.querySelector(".button-label");
    if (labelEl) labelEl.textContent = next;
    updateActionButtons();
  }

  function updateActionButtons() {
    var start = $("skip-btn");
    var stop = $("video2StopTile");
    if (start) {
      var label = String(start.getAttribute("data-label") || "");
      if (isMobileViewport()) {
        start.disabled = false;
      } else {
        start.disabled = label === "Next" ? !canUseNextAction() : !canUseStartAction();
      }
      start.setAttribute("aria-disabled", start.disabled ? "true" : "false");
      var loadingState = isSearching ||
        searchActionPending ||
        document.body.classList.contains("video2-searching") ||
        document.body.classList.contains("video2-loading");
      start.classList.toggle("is-loading", !!(!isMobileViewport() && start.disabled && loadingState));
    }
    if (stop) {
      stop.disabled = !canUseStopAction();
      stop.setAttribute("aria-disabled", stop.disabled ? "true" : "false");
    }
    updateQuickEmojiControls();
  }

  function connectingNextEscapeActive() {
    return !!matchId && matchConnectingSince > 0 && Date.now() - matchConnectingSince >= CONNECTING_NEXT_ESCAPE_MS;
  }

  function canUseNextAction() {
    if (!matchId || isSearching || searchActionPending) return false;
    if (remoteVideoActive && remoteVideoIsActuallyPlaying()) return true;
    return connectingNextEscapeActive();
  }

  function canUseStartAction() {
    return !matchId && !isSearching && !searchActionPending;
  }

  function canUseStopAction() {
    return !!(matchId || isSearching || searchActionPending);
  }

  function quickEmojiActive() {
    return !!(matchId && remoteVideoActive && remoteVideoIsActuallyPlaying() && !isSearching && !searchActionPending);
  }

  function remoteVideoIsActuallyPlaying() {
    var video = $("video-peer");
    if (!video) return false;
    var hasFrame = video.videoWidth > 0 && video.videoHeight > 0;
    var hasData = video.readyState >= 3;
    var playing = !video.paused && !video.ended;
    var stream = video.srcObject;
    var hasLiveVideoTrack = false;
    try {
      hasLiveVideoTrack = !!(stream && stream.getVideoTracks && stream.getVideoTracks().some(function (track) {
        return track.readyState === "live" && track.enabled !== false;
      }));
    } catch (_) {
      hasLiveVideoTrack = false;
    }
    return !!(hasFrame && hasData && playing && hasLiveVideoTrack);
  }

  function updateQuickEmojiControls() {
    var enabled = quickEmojiActive() && !strikeModalActive && !investigationLockActive;
    var chatEnabled = enabled || (canUseUrlCommandChat() && !strikeModalActive && !investigationLockActive);
    document.querySelectorAll(".mobile-quick-emoji").forEach(function (btn) {
      btn.disabled = !enabled;
      btn.setAttribute("aria-disabled", enabled ? "false" : "true");
    });
    var input = $("message-input");
    var sendBtn = $("send-btn");
    if (input) {
      input.disabled = !chatEnabled;
      input.readOnly = !chatEnabled;
      input.setAttribute("aria-disabled", chatEnabled ? "false" : "true");
    }
    if (sendBtn) {
      sendBtn.disabled = !chatEnabled;
      sendBtn.setAttribute("aria-disabled", chatEnabled ? "false" : "true");
    }
    if (isMobileViewport()) {
      if (!chatEnabled) document.body.classList.remove("mobile-chat-open");
    }
  }

  function onlineCountTargets() {
    return document.querySelectorAll("#peopleOnline .online-text > span, #remoteStartOnlineNumber");
  }

  function animateOnlineCount() {
    if (banModalActive) return;
    if (!lastOnlineDisplay) return;
    renderOnlineNumber(lastOnlineDisplay, 0);
  }

  function formatOnlineCount(value) {
    var online = Math.max(0, Math.floor(Number(value || 0) || 0));
    return online.toLocaleString("en-US");
  }

  function parseOnlineDisplay(value) {
    return Math.max(0, Math.floor(Number(String(value || "").replace(/[^\d]/g, "")) || 0));
  }

  function renderOnlineNumber(next, direction) {
    var prev = lastOnlineDisplay || "";
    var html = "";
    var directionClass = direction > 0 ? " online-number-up" : direction < 0 ? " online-number-down" : "";
    for (var i = 0; i < next.length; i += 1) {
      var ch = next.charAt(i);
      var prevIndex = prev.length - (next.length - i);
      var prevCh = prevIndex >= 0 ? prev.charAt(prevIndex) : "";
      var isDigit = /\d/.test(ch);
      var changed = !!directionClass && isDigit && ch !== prevCh;
      html += '<span class="online-number-char ' + (isDigit ? 'online-number-digit' : 'online-number-separator') + (changed ? ' online-number-change' + directionClass : '') + '">' + ch + '</span>';
    }
    onlineCountTargets().forEach(function (span) {
      span.innerHTML = html;
    });
  }

  function applyOnlineCount(next) {
    if (banModalActive) return;
    if (!next || next === lastOnlineDisplay) return;
    var prev = lastOnlineDisplay || "";
    var direction = prev ? parseOnlineDisplay(next) - parseOnlineDisplay(prev) : 0;
    renderOnlineNumber(next, direction);
    lastOnlineDisplay = next;
    lastOnlineAppliedAt = Date.now();
  }

  function updateOnlineCount(value) {
    if (banModalActive) return;
    var next = formatOnlineCount(value);
    if (next === lastOnlineDisplay) return;
    pendingOnlineDisplay = next;
    var now = Date.now();
    var wait = 10000 - (now - lastOnlineAppliedAt);
    if (wait <= 0 || !lastOnlineAppliedAt) {
      if (onlineApplyTimer) {
        window.clearTimeout(onlineApplyTimer);
        onlineApplyTimer = 0;
      }
      applyOnlineCount(pendingOnlineDisplay);
      pendingOnlineDisplay = "";
      return;
    }
    if (onlineApplyTimer) return;
    onlineApplyTimer = window.setTimeout(function () {
      onlineApplyTimer = 0;
      applyOnlineCount(pendingOnlineDisplay);
      pendingOnlineDisplay = "";
    }, wait);
  }

  function applyInitialOnlineCount() {
    var initial = typeof window.__initialOnlineCount !== "undefined" ? window.__initialOnlineCount : null;
    if (initial !== null && initial !== "" && typeof initial !== "undefined") {
      updateOnlineCount(initial);
      return;
    }
    var promise = window.__initialOnlineCountPromise;
    if (promise && typeof promise.then === "function") {
      promise.then(function (value) {
        if (value !== null && value !== "" && typeof value !== "undefined") {
          updateOnlineCount(value);
        }
      }).catch(function () {});
    }
  }

  renderOnlineNumber("");
  applyInitialOnlineCount();
  window.setTimeout(function () {
    if (!lastOnlineDisplay) applyInitialOnlineCount();
    else animateOnlineCount();
  }, 120);

  function addMessage(kind, who, body) {
    var messages = $("messages");
    if (!messages) return;
    var div = document.createElement("div");
    div.className = "message message-" + kind;
    if (who) {
      var strong = document.createElement("strong");
      strong.className = "message-author";
      if (kind === "you" || kind === "stranger") {
        var icon = document.createElement("img");
        icon.className = "message-author-icon gender-avatar-icon";
        icon.alt = "";
        icon.setAttribute("aria-hidden", "true");
        setGenderAvatarClass(icon, kind === "you" ? selectedIdentity() : "male");
        strong.appendChild(icon);
      }
      strong.appendChild(document.createTextNode(who + ": "));
      div.appendChild(strong);
    }
    var span = document.createElement("span");
    span.className = "message-text";
    span.textContent = String(body || "");
    div.appendChild(span);
    var typing = $("typing");
    if (typing && typing.parentNode === messages) messages.insertBefore(div, typing);
    else messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    if (isMobileViewport() && (kind === "system" || kind === "status")) {
      window.setTimeout(function () {
        div.style.opacity = "0";
        div.style.transition = "opacity 180ms ease";
        window.setTimeout(function () {
          if (div.parentNode) div.parentNode.removeChild(div);
        }, 200);
      }, 2800);
    }
  }

  function clearConversationMessages() {
    var messages = $("messages");
    if (!messages) return;
    document.body.classList.remove("video2-partner-typing");
    Array.prototype.forEach.call(messages.querySelectorAll(".message"), function (node) {
      if (node.id === "typing") {
        node.style.display = "none";
        return;
      }
      if (node.id === "postDisconnectActions") return;
      if (node.classList.contains("message-policy-notice")) return;
      if (node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function setPartnerVoteScore(score) {
    partnerVoteScore = {
      upvotes: Math.max(0, Number(score && score.upvotes) || 0),
      downvotes: Math.max(0, Number(score && score.downvotes) || 0),
      score: Number(score && score.score) || 0
    };
    var pill = $("video2PartnerScore");
    if (pill) {
      // The pill renders a flag icon (markup in video.html); color-only state.
      // Don't set textContent here — it would wipe the inline SVG.
      var good = partnerVoteScore.score > 0;
      var bad = partnerVoteScore.score < 0;
      pill.title = String(partnerVoteScore.upvotes) + " up / " + String(partnerVoteScore.downvotes) + " down";
      pill.setAttribute("aria-label", "Stranger reputation: " + (good ? "good" : bad ? "bad" : "no votes yet"));
      pill.classList.toggle("is-positive", good);
      pill.classList.toggle("is-negative", bad);
      pill.classList.toggle("is-neutral", !good && !bad);
    }
  }

  function updateVoteControls() {
    var targetMatchId = String(matchId || "").trim();
    var selected = targetMatchId ? Number(userVoteByMatchId[String(targetMatchId)] || 0) : 0;
    var panel = $("video2VotePanel");
    if (panel) {
      var hiddenForThisMatch = !!(targetMatchId && votePanelHiddenMatchId === String(targetMatchId));
      panel.classList.toggle("is-hidden-after-vote", hiddenForThisMatch);
      panel.classList.toggle("is-vote-change-window", !!(targetMatchId && selected && votePanelHideTimer && !hiddenForThisMatch));
      if (!targetMatchId) panel.removeAttribute("data-vote-hide-at");
    }
    var up = $("video2UpvoteBtn");
    var down = $("video2DownvoteBtn");
    if (up) up.classList.toggle("is-selected", selected === 1);
    if (down) down.classList.toggle("is-selected", selected === -1);
  }

  function playVotePressAnimation(vote) {
    var btn = vote === -1 ? $("video2DownvoteBtn") : $("video2UpvoteBtn");
    if (!btn) return;
    btn.classList.remove("is-vote-pressing");
    void btn.offsetWidth;
    btn.classList.add("is-vote-pressing");
    try { btn.blur(); } catch (_) {}
    window.setTimeout(function () {
      btn.classList.remove("is-vote-pressing");
    }, 320);
  }

  function sendUserVote(vote) {
    var targetMatchId = getVoteTargetMatchId();
    if (!targetMatchId) return;
    vote = Number(vote) === -1 ? -1 : 1;
    userVoteByMatchId[String(targetMatchId)] = vote;
    updateVoteControls();
    playVotePressAnimation(vote);
    send({ type: "user_vote", matchId: targetMatchId, vote: vote });
    beginVotePanelExpiry(targetMatchId);
  }

  function clearPeer() {
    setRemoteVideoActive(false);
    setRemoteCountryFlag("");
    remoteStream = null;
    var peerVideo = $("video-peer");
    var blur = $("video-peer-blur");
    if (peerVideo) {
      peerVideo.onloadedmetadata = null;
      peerVideo.onloadeddata = null;
      peerVideo.oncanplay = null;
      peerVideo.onplaying = null;
      peerVideo.ontimeupdate = null;
      peerVideo.onpause = null;
      peerVideo.onstalled = null;
      peerVideo.onwaiting = null;
      peerVideo.srcObject = null;
    }
    if (blur) blur.srcObject = null;
  }

  function closePeerConnection() {
    stopModerationScreenshots(true);
    var closingPc = pc;
    pc = null;
    pcGeneration += 1;
    if (closingPc) {
      try {
        closingPc.ontrack = null;
        closingPc.onicecandidate = null;
        closingPc.onconnectionstatechange = null;
        closingPc.oniceconnectionstatechange = null;
        closingPc.onsignalingstatechange = null;
        closingPc.onnegotiationneeded = null;
        closingPc.close();
      } catch (_) {}
    }
    turnBitrateAppliedMatchId = "";
    pendingIce = [];
    resetIceCandidateSendState();
    clearPeer();
  }

  function clearSearchWatchdogTimer() {
    if (searchWatchdogTimer) {
      window.clearTimeout(searchWatchdogTimer);
      searchWatchdogTimer = 0;
    }
  }

  function clearSearchWatchdog() {
    // Bumping the attempt id invalidates any in-flight search request whose
    // faceblink/proof step is still resolving.
    searchAttemptId += 1;
    clearSearchWatchdogTimer();
  }

  function clearSearchRetryTimer() {
    if (searchRetryTimer) {
      window.clearTimeout(searchRetryTimer);
      searchRetryTimer = 0;
    }
  }

  function scheduleSearchRetry(delayMs, resetProof) {
    clearSearchRetryTimer();
    searchRetryTimer = window.setTimeout(function () {
      searchRetryTimer = 0;
      if (userStopped || matchId || banModalActive || vpnBlockedActive || connectionErrorActive) return;
      if (resetProof) invalidateSearchProof();
      try {
        seq += 1;
        send({ type: "cancel", seq: seq, chatType: "video" });
      } catch (_) {}
      searchActionPending = false;
      isSearching = false;
      retrySearchRequest();
    }, Math.max(250, Number(delayMs) || 1500));
  }

  function resetSearchWatchdogMisses() {
    searchWatchdogMisses = 0;
  }

  function markSearchStarted(forceNew) {
    if (forceNew || !searchStartedAt) searchStartedAt = Date.now();
  }

  function clearSearchLifetime() {
    searchStartedAt = 0;
    searchHardRestarts = 0;
  }

  function searchTimedOut() {
    return !!(searchStartedAt && Date.now() - searchStartedAt >= SEARCH_TIMEOUT_MS);
  }

  function finishSearchTimeout() {
    clearSearchRetryTimer();
    clearSearchWatchdog();
    resetSearchWatchdogMisses();
    clearSearchLifetime();
    invalidateSearchProof();
    try {
      seq += 1;
      send({ type: "cancel", seq: seq, chatType: "video" });
    } catch (_) {}
    searchActionPending = false;
    isSearching = false;
    matchId = "";
    partnerUserId = "";
    closePeerConnection();
    updateVoteControls();
    setStartLabel("Start");
    setLoader(false);
    setOverlay("ready", "");
    setStatus("Search timed out. Press Start to try again.");
  }

  function cancelCurrentServerState() {
    try {
      seq += 1;
      send({ type: "cancel", seq: seq, chatType: "video" });
    } catch (_) {}
  }

  function hardRestartStuckSearch(reason) {
    if (userStopped || banModalActive || vpnBlockedActive || connectionErrorActive) return;
    cancelCurrentServerState();
    if (searchTimedOut() || searchHardRestarts >= SEARCH_HARD_RESTART_MAX) {
      finishSearchTimeout();
      return;
    }
    searchHardRestarts += 1;
    clearSearchRetryTimer();
    clearSearchWatchdog();
    invalidateSearchProof();
    searchActionPending = false;
    isSearching = false;
    matchId = "";
    partnerUserId = "";
    closePeerConnection();
    updateVoteControls();
    setStartLabel("Start");
    setLoader(false);
    setOverlay("ready", "");
    setStatus("");
    window.setTimeout(function () {
      if (userStopped || matchId || banModalActive || vpnBlockedActive || connectionErrorActive) return;
      resetSearchWatchdogMisses();
      startSearch(true);
    }, reason === "silent_search" ? 350 : 0);
  }

  function beginSearchWatchdog(preserveAttempt) {
    // preserveAttempt: restart the timer WITHOUT invalidating an in-flight
    // search request (used when partner_disconnected arrives while our own
    // next/find_partner is still waiting on its proof step).
    if (preserveAttempt) clearSearchWatchdogTimer();
    else clearSearchWatchdog();
    markSearchStarted(false);
    var attemptId = searchAttemptId;
    searchWatchdogTimer = window.setTimeout(function () {
      searchWatchdogTimer = 0;
      if (attemptId !== searchAttemptId || userStopped) return;
      if (matchId && !searchActionPending) return;
      if (!isSearching && !searchActionPending) return;
      if (searchTimedOut()) {
        finishSearchTimeout();
        return;
      }
      if (matchId && searchActionPending) {
        // A skip is stuck waiting on its proof step while the current match is
        // still alive. Don't kill a working chat over a slow proof upload:
        // drop the pending skip (clearSearchWatchdog invalidates the stale
        // request) and put the user back into the match to retry manually.
        clearSearchWatchdog();
        resetSearchWatchdogMisses();
        clearSearchLifetime();
        searchActionPending = false;
        isSearching = false;
        restoreActiveMatchUi("Skip failed. Tap Next to try again.");
        return;
      }
      searchWatchdogMisses += 1;
      if (searchWatchdogMisses >= SEARCH_HARD_RESET_MISSES) {
        hardRestartStuckSearch("silent_search");
        return;
      }
      cancelCurrentServerState();
      searchActionPending = false;
      setSearchingUi("Searching for strangers...");
      retrySearchRequest();
    }, SEARCH_WATCHDOG_MS);
    return attemptId;
  }

  function stopSearchUi(label, opts) {
    clearSearchRetryTimer();
    clearSearchWatchdog();
    resetSearchWatchdogMisses();
    if (!opts || !opts.preserveSearchLifetime) clearSearchLifetime();
    proofFailureRetries = 0;
    isSearching = false;
    searchActionPending = false;
    setStartLabel("Start");
    setLoader(false);
    setStatus(label || "");
  }

  function clearSignalingResume() {
    signalingResumeMatchId = "";
    if (signalingResumeTimer) {
      window.clearTimeout(signalingResumeTimer);
      signalingResumeTimer = 0;
    }
  }

  // Resume window expired or the edge refused: tear down like a partner
  // disconnect (respecting Stop and the auto-connect setting).
  function failSignalingResume() {
    var mid = signalingResumeMatchId;
    clearSignalingResume();
    if (!mid || String(matchId || "") !== mid) return;
    if (!isMobileViewport()) addMessage("system", "", "Disconnected from server.");
    beginReportGrace(mid);
    beginVoteGrace(mid);
    matchId = "";
    partnerUserId = "";
    closePeerConnection();
    if (isMobileViewport()) clearConversationMessages();
    updateVoteControls();
    if (userStopped || isUrlCommandMode() || !isAutoConnectEnabled()) {
      showReadyAfterDisconnect();
    } else {
      isSearching = false;
      startSearch();
    }
  }

  function canAttemptSignalingResume(event) {
    if (!matchId || userStopped || isSearching || searchActionPending) return false;
    if (!remoteVideoActive || !pc) return false;
    if (String(pc.connectionState || "") !== "connected") return false;
    // Only abnormal drops (no close frame, code 1006). Server-initiated
    // kicks send a proper close code and must tear down normally.
    return !event || Number(event.code) === 1006;
  }

  function connectSocket() {
    if (pageExiting || banModalActive || vpnBlockedActive || connectionErrorActive) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    if (wsConnectPending) return;
    wsConnectPending = true;
    wsUrlWithToken().then(function (url) {
    wsConnectPending = false;
    if (pageExiting || banModalActive || vpnBlockedActive || connectionErrorActive) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    var socket = new WebSocket(url);
    ws = socket;
    socket.addEventListener("open", function () {
      if (ws !== socket || pageExiting) return;
      clearWsReconnectTimer();
      wsReconnectAttempts = 0;
      setStatus("");
      // Resume must go out before any queued messages so the edge adopts our
      // previous identity before it processes them.
      if (signalingResumeMatchId && String(matchId || "") === signalingResumeMatchId) {
        send({ type: "resume_match", matchId: matchId });
      }
      send({ type: "client_caps", iceBatch: true, sdpDict: SDP_DICT_VERSION, sdpDeflate: supportsSdpDeflate ? SDP_DEFLATE_VERSION : 0, clientVersion: VIDEO_CLIENT_VERSION });
      sendClientVersion("socket_open");
      flushSendQueue();
      var resume = resumeSearchOnOpen;
      resumeSearchOnOpen = false;
      if (resume && !userStopped && !matchId && !isSearching && !searchActionPending &&
          !banModalActive && !vpnBlockedActive && !connectionErrorActive) {
        startSearch();
      }
    });
    socket.addEventListener("message", function (event) {
      if (ws !== socket || pageExiting) return;
      var msg = null;
      try { msg = JSON.parse(String(event.data || "{}")); } catch (_) { return; }
      handleSocketMessage(msg);
    });
    socket.addEventListener("close", function (event) {
      if (ws !== socket) return;
      ws = null;
      sendQueue = [];
      if (pageExiting) return;
      if (banModalActive || vpnBlockedActive || connectionErrorActive) return;
      try {
        if (event && String(event.reason || "") === "ws_token_required") {
          wsToken = "";
          wsTokenExpAt = 0;
        }
      } catch (_) {}
      // Signaling-only drop while the P2P call is healthy: keep the match and
      // media, reconnect fast, and ask the edge to resume the session.
      if (canAttemptSignalingResume(event)) {
        if (!signalingResumeMatchId) {
          signalingResumeMatchId = String(matchId);
          signalingResumeTimer = window.setTimeout(failSignalingResume, SIGNALING_RESUME_GRACE_MS);
        }
        setStatus("Reconnecting...");
        wsReconnectAttempts += 1;
        scheduleSocketReconnect(350 + Math.floor(Math.random() * 300));
        return;
      }
      var shouldResume = !userStopped && !!(matchId || isSearching || searchActionPending);
      if ((matchId || isSearching) && !isMobileViewport()) addMessage("system", "", "Disconnected from server.");
      matchId = "";
      partnerUserId = "";
      stopSearchUi(shouldResume ? "Reconnecting..." : "Disconnected", { preserveSearchLifetime: shouldResume });
      closePeerConnection();
      if (shouldResume) {
        resumeSearchOnOpen = true;
        setLoader(true, "Reconnecting...");
        setOverlay("searching", "Reconnecting...");
      } else {
        setOverlay("ready", "");
      }
      wsReconnectAttempts += 1;
      var reconnectDelay = Math.min(12000, 1500 * Math.pow(2, Math.min(wsReconnectAttempts - 1, 3))) +
        Math.floor(Math.random() * 600);
      scheduleSocketReconnect(reconnectDelay);
    });
    }).catch(function (err) {
      wsConnectPending = false;
      if (banModalActive || vpnBlockedActive || connectionErrorActive) return;
      var tokenErr = "";
      try { tokenErr = String(err && err.message || ""); } catch (_) { tokenErr = ""; }
      if (tokenErr === "missing_did" || tokenErr.indexOf("token_http_400") === 0 || tokenErr.indexOf("token_http_403") === 0) {
        connectionErrorActive = true;
        setStatus("Connection refresh required. Please reload the page.");
        setOverlay("ready", "Connection refresh required.");
        return;
      }
      setStatus("Connecting...");
      scheduleSocketReconnect(1500 + Math.floor(Math.random() * 500));
    });
  }

  function enableCameraAnimation() {
    if (document.body.classList.contains("video2-camera-enabled")) return;
    document.body.classList.add("video2-camera-enabled");
    document.body.classList.remove("video2-swipe-hint-finished");
    if (mobileSwipeHintFinishTimer) window.clearTimeout(mobileSwipeHintFinishTimer);
    mobileSwipeHintFinishTimer = window.setTimeout(finishMobileSwipeHint, MOBILE_SWIPE_HINT_FINISH_MS);
    if (isMobileTouchViewport()) {
      document.querySelectorAll(".mobile-cube-logo-main").forEach(function (el) {
        el.classList.add("cube-logo--playing");
      });
    }
    updateMobileSwipeHintVisibility();
  }

  function ensureLocalMedia() {
    if (streamHasLiveCameraAndMic(localStream)) {
      enableCameraAnimation();
      clearMediaPermissionNotice();
      return Promise.resolve(localStream);
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      var unsupported = new Error("Camera and microphone are not available in this browser.");
      showMediaPermissionNotice(unsupported);
      return Promise.reject(unsupported);
    }
    var prefs = readLocalDevicePrefs();
    function buildConstraints(usePrefs) {
      return preferredMediaConstraints(
        usePrefs && prefs.videoId ? prefs.videoId : "",
        usePrefs && prefs.audioId ? prefs.audioId : ""
      );
    }
    function applyStream(stream) {
      if (!streamHasLiveCameraAndMic(stream)) {
        var missing = new Error("Camera and microphone are required to start video chat.");
        try {
          stream.getTracks().forEach(function (track) { try { track.stop(); } catch (_) {} });
        } catch (_) {}
        showMediaPermissionNotice(missing);
        throw missing;
      }
      return applyLocalStream(stream);
    }
    return navigator.mediaDevices.getUserMedia(buildConstraints(true)).then(applyStream).catch(function (err) {
      if (!prefs.videoId && !prefs.audioId) throw err;
      clearLocalDevicePrefs();
      return navigator.mediaDevices.getUserMedia(buildConstraints(false)).then(applyStream);
    }).catch(function (err) {
      showMediaPermissionNotice(err);
      throw err;
    });
  }

  function preferredMediaConstraints(videoId, audioId) {
    var video = {
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 },
      frameRate: { ideal: 24, max: 30 }
    };
    var audio = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    };
    if (videoId) video.deviceId = { exact: videoId };
    else video.facingMode = { ideal: "user" };
    if (audioId) audio.deviceId = { exact: audioId };
    return { video: video, audio: audio };
  }

  function waitForVideoReady(video, timeoutMs) {
    if (!video) return Promise.reject(new Error("Camera preview is not ready."));
    if (video.videoWidth && video.videoHeight) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var done = false;
      var timeout = window.setTimeout(function () {
        cleanup();
        reject(new Error("Camera preview is not ready."));
      }, timeoutMs || 2500);
      function cleanup() {
        if (done) return;
        done = true;
        window.clearTimeout(timeout);
        video.removeEventListener("loadedmetadata", check);
        video.removeEventListener("canplay", check);
        video.removeEventListener("playing", check);
      }
      function check() {
        if (!video.videoWidth || !video.videoHeight) return;
        cleanup();
        resolve();
      }
      video.addEventListener("loadedmetadata", check);
      video.addEventListener("canplay", check);
      video.addEventListener("playing", check);
      try { video.play().catch(function () {}); } catch (_) {}
      check();
    });
  }

  function faceBlinkSessionVerified() {
    try {
      if (faceBlinkGate.verified) return true;
      if (window.sessionStorage && window.sessionStorage.getItem(FACE_BLINK_SESSION_KEY) === "1") {
        faceBlinkGate.verified = true;
        return true;
      }
    } catch (_) {}
    return false;
  }

  function markFaceBlinkVerified() {
    faceBlinkGate.verified = true;
    try {
      if (window.sessionStorage) window.sessionStorage.setItem(FACE_BLINK_SESSION_KEY, "1");
    } catch (_) {}
  }

  function fetchFaceBlinkConfig(force) {
    var nowMs = Date.now();
    if (!force && faceBlinkConfig.at && nowMs - faceBlinkConfig.at < 5000) return Promise.resolve(!!faceBlinkConfig.enabled);
    if (faceBlinkConfig.inflight) return faceBlinkConfig.inflight;
    faceBlinkConfig.inflight = fetch("/api/facecheck/config?ts=" + encodeURIComponent(String(nowMs)), {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin"
    }).then(function (res) {
      if (!res.ok) throw new Error("facecheck_config_http_" + res.status);
      return res.json();
    }).then(function (body) {
      faceBlinkConfig.enabled = !(body && body.enabled === false);
      faceBlinkConfig.at = Date.now();
      return faceBlinkConfig.enabled;
    }).catch(function () {
      faceBlinkConfig.enabled = true;
      faceBlinkConfig.at = Date.now();
      return true;
    }).finally(function () {
      faceBlinkConfig.inflight = null;
    });
    return faceBlinkConfig.inflight;
  }

  function postFaceBlinkLog(extra) {
    try {
      var body = {
        checks: Math.max(0, Math.floor(Number(extra && extra.checks) || 0)),
        success: Math.max(0, Math.floor(Number(extra && extra.success) || 0)),
        fail: Math.max(0, Math.floor(Number(extra && extra.fail) || 0)),
        gate_shown: Math.max(0, Math.floor(Number(extra && extra.gate_shown) || 0)),
        gate_confirmed: Math.max(0, Math.floor(Number(extra && extra.gate_confirmed) || 0)),
        model_fail: Math.max(0, Math.floor(Number(extra && extra.model_fail) || 0)),
        kind: String(extra && extra.kind ? extra.kind : "blink").slice(0, 80),
        reason: String(extra && extra.reason ? extra.reason : "").slice(0, 160),
        match_id: matchId || "",
        clientVersion: VIDEO_CLIENT_VERSION
      };
      fetch("/api/facecheck/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
        credentials: "same-origin"
      }).catch(function () {});
    } catch (_) {}
  }

  function loadFaceBlinkScript(src) {
    if (window.FaceMesh) return Promise.resolve();
    var existing = document.querySelector('script[data-face-blink-src="' + src + '"]');
    if (existing && existing._faceBlinkPromise) return existing._faceBlinkPromise;
    var script = existing || document.createElement("script");
    var promise = new Promise(function (resolve, reject) {
      if (window.FaceMesh) {
        resolve();
        return;
      }
      script.onload = function () { window.FaceMesh ? resolve() : reject(new Error("Face model did not initialize.")); };
      script.onerror = function () { reject(new Error("Face model could not load.")); };
    });
    script._faceBlinkPromise = promise;
    if (!existing) {
      script.async = true;
      script.setAttribute("data-face-blink-src", src);
      script.src = src;
      (document.head || document.documentElement).appendChild(script);
    }
    return promise;
  }

  function ensureFaceBlinkModel() {
    if (faceBlinkGate.mesh) return Promise.resolve(faceBlinkGate.mesh);
    if (faceBlinkGate.readyPromise) return faceBlinkGate.readyPromise;
    faceBlinkGate.readyPromise = loadFaceBlinkScript(FACE_BLINK_MODEL_BASE + "face_mesh.js").then(function () {
      if (!window.FaceMesh) throw new Error("Face model did not initialize.");
      var mesh = new window.FaceMesh({
        locateFile: function (file) {
          return FACE_BLINK_MODEL_BASE + String(file || "");
        }
      });
      mesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.65
      });
      mesh.onResults(function (results) {
        var landmarks = null;
        try {
          landmarks = results && results.multiFaceLandmarks && results.multiFaceLandmarks[0] ? results.multiFaceLandmarks[0] : null;
        } catch (_) {
          landmarks = null;
        }
        faceBlinkGate.last = { has: !!landmarks, landmarks: landmarks };
        faceBlinkGate.inFlight = false;
        if (faceBlinkGate.pending) {
          var pending = faceBlinkGate.pending;
          faceBlinkGate.pending = null;
          pending.resolve(faceBlinkGate.last);
        }
      });
      faceBlinkGate.mesh = mesh;
      return mesh;
    }).catch(function (err) {
      faceBlinkGate.readyPromise = null;
      throw err;
    });
    return faceBlinkGate.readyPromise;
  }

  function detectFaceBlinkFrame(video) {
    if (!video || !video.videoWidth || !video.videoHeight) return Promise.resolve({ has: false, landmarks: null });
    if (faceBlinkGate.inFlight) return Promise.resolve(faceBlinkGate.last || { has: false, landmarks: null });
    return ensureFaceBlinkModel().then(function (mesh) {
      faceBlinkGate.inFlight = true;
      return new Promise(function (resolve) {
        var done = false;
        var timer = window.setTimeout(function () {
          if (done) return;
          done = true;
          faceBlinkGate.inFlight = false;
          faceBlinkGate.pending = null;
          resolve(faceBlinkGate.last || { has: false, landmarks: null });
        }, 2200);
        faceBlinkGate.pending = {
          resolve: function (value) {
            if (done) return;
            done = true;
            window.clearTimeout(timer);
            resolve(value || { has: false, landmarks: null });
          }
        };
        try {
          var sent = mesh.send({ image: video });
          if (sent && sent.catch) {
            sent.catch(function () {
              if (done) return;
              done = true;
              window.clearTimeout(timer);
              faceBlinkGate.inFlight = false;
              faceBlinkGate.pending = null;
              resolve(faceBlinkGate.last || { has: false, landmarks: null });
            });
          }
        } catch (_) {
          if (done) return;
          done = true;
          window.clearTimeout(timer);
          faceBlinkGate.inFlight = false;
          faceBlinkGate.pending = null;
          resolve(faceBlinkGate.last || { has: false, landmarks: null });
        }
      });
    });
  }

  function pointDistance(a, b) {
    if (!a || !b) return 0;
    var dx = Number(a.x || 0) - Number(b.x || 0);
    var dy = Number(a.y || 0) - Number(b.y || 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function eyeAspectRatio(landmarks, idx) {
    if (!landmarks || !idx || idx.length < 6) return 0;
    var p1 = landmarks[idx[0]];
    var p2 = landmarks[idx[1]];
    var p3 = landmarks[idx[2]];
    var p4 = landmarks[idx[3]];
    var p5 = landmarks[idx[4]];
    var p6 = landmarks[idx[5]];
    var width = pointDistance(p1, p4);
    if (!width) return 0;
    return (pointDistance(p2, p6) + pointDistance(p3, p5)) / (2 * width);
  }

  function averageEyeAspectRatio(landmarks) {
    var left = eyeAspectRatio(landmarks, [33, 160, 158, 133, 153, 144]);
    var right = eyeAspectRatio(landmarks, [362, 385, 387, 263, 373, 380]);
    if (!left && !right) return 0;
    if (!left) return right;
    if (!right) return left;
    return (left + right) / 2;
  }

  function setFaceBlinkStatus(message, faceOn, blinkOn) {
    if (faceBlinkGate.status) text(faceBlinkGate.status, message || "");
    if (faceBlinkGate.faceDot) faceBlinkGate.faceDot.className = faceOn ? "faceBlinkGate__dot isOn" : "faceBlinkGate__dot";
    if (faceBlinkGate.blinkDot) faceBlinkGate.blinkDot.className = blinkOn ? "faceBlinkGate__dot isOn" : "faceBlinkGate__dot";
  }

  function ensureFaceBlinkGateStyles() {
    if (document.getElementById("faceBlinkGateStyles")) return;
    var style = document.createElement("style");
    style.id = "faceBlinkGateStyles";
    style.textContent =
      ".faceBlinkGate{position:absolute;left:10px;right:10px;bottom:10px;z-index:12;display:block;color:#fff;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;pointer-events:none;}" +
      ".faceBlinkGate.isFallback{position:fixed;left:50%;right:auto;bottom:18px;z-index:2147483000;width:min(420px,calc(100vw - 24px));transform:translateX(-50%);}" +
      ".faceBlinkGate__panel{width:100%;overflow:hidden;border:1px solid rgba(255,255,255,.20);border-radius:10px;background:linear-gradient(180deg,rgba(10,16,28,.86),rgba(8,12,20,.74));box-shadow:0 14px 38px rgba(0,0,0,.38);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);padding:10px 11px;pointer-events:auto;}" +
      ".faceBlinkGate__head{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;}" +
      ".faceBlinkGate__titleWrap{min-width:0;display:grid;gap:2px;}" +
      ".faceBlinkGate__eyebrow{font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.64);line-height:1;}" +
      ".faceBlinkGate__title{font-size:15px;font-weight:900;line-height:1.1;margin:0;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".faceBlinkGate__badge{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px;border-radius:999px;background:rgba(75,128,255,.18);border:1px solid rgba(134,174,255,.28);font-size:11px;font-weight:900;color:#dbe7ff;}" +
      ".faceBlinkGate__badgeDot{width:7px;height:7px;border-radius:50%;background:#60a5fa;box-shadow:0 0 0 3px rgba(96,165,250,.16);}" +
      ".faceBlinkGate__status{min-height:20px;margin-top:8px;font-size:13px;font-weight:750;line-height:1.25;color:#eef6ff;}" +
      ".faceBlinkGate__checks{display:flex;gap:8px;align-items:center;margin-top:9px;font-size:12px;color:rgba(255,255,255,.74);}" +
      ".faceBlinkGate__check{display:flex;gap:6px;align-items:center;min-width:0;padding:5px 7px;border-radius:999px;background:rgba(255,255,255,.08);}" +
      ".faceBlinkGate__dot{width:8px;height:8px;flex:0 0 auto;border-radius:50%;background:#7b8798;box-shadow:0 0 0 1px rgba(255,255,255,.16);}" +
      ".faceBlinkGate__dot.isOn{background:#23c36b;box-shadow:0 0 0 3px rgba(35,195,107,.18);}" +
      ".faceBlinkGate__retry{display:none;margin-top:9px;width:100%;height:34px;border:0;border-radius:8px;background:#2f6df6;color:#fff;font-size:13px;font-weight:850;cursor:pointer;}" +
      ".faceBlinkGate__retry.isVisible{display:block;}" +
      "@media (max-width:600px){.faceBlinkGate{left:6px;right:6px;top:6px;bottom:auto;}.faceBlinkGate.isFallback{top:max(8px,env(safe-area-inset-top));bottom:auto;left:50%;right:auto;width:min(360px,calc(100vw - 16px));}.faceBlinkGate__panel{padding:6px 7px;border-radius:8px;box-shadow:0 8px 22px rgba(0,0,0,.30);}.faceBlinkGate__head{gap:6px;}.faceBlinkGate__eyebrow{display:none;}.faceBlinkGate__title{font-size:12px;line-height:1.05;}.faceBlinkGate__badge{height:18px;padding:0 6px;font-size:9px;gap:4px;}.faceBlinkGate__badgeDot{width:5px;height:5px;box-shadow:0 0 0 2px rgba(96,165,250,.14);}.faceBlinkGate__status{min-height:14px;margin-top:4px;font-size:10.5px;line-height:1.18;font-weight:750;}.faceBlinkGate__checks{gap:4px;margin-top:5px;font-size:9.5px;}.faceBlinkGate__check{gap:4px;padding:3px 5px;}.faceBlinkGate__dot{width:6px;height:6px;}.faceBlinkGate__dot.isOn{box-shadow:0 0 0 2px rgba(35,195,107,.16);}.faceBlinkGate__retry{height:28px;margin-top:6px;border-radius:7px;font-size:11px;}}" +
      "@media (min-width:601px) and (max-width:920px){.faceBlinkGate{left:8px;right:8px;top:8px;bottom:auto;}.faceBlinkGate.isFallback{top:max(10px,env(safe-area-inset-top));bottom:auto;left:50%;right:auto;width:min(390px,calc(100vw - 20px));}.faceBlinkGate__panel{padding:8px 9px;border-radius:9px;box-shadow:0 10px 26px rgba(0,0,0,.32);}.faceBlinkGate__head{gap:7px;}.faceBlinkGate__eyebrow{display:none;}.faceBlinkGate__title{font-size:13px;line-height:1.08;}.faceBlinkGate__badge{height:20px;padding:0 7px;font-size:10px;gap:5px;}.faceBlinkGate__badgeDot{width:6px;height:6px;box-shadow:0 0 0 2px rgba(96,165,250,.14);}.faceBlinkGate__status{min-height:16px;margin-top:5px;font-size:11.5px;line-height:1.2;}.faceBlinkGate__checks{gap:5px;margin-top:6px;font-size:10.5px;}.faceBlinkGate__check{gap:5px;padding:4px 6px;}.faceBlinkGate__dot{width:7px;height:7px;}.faceBlinkGate__dot.isOn{box-shadow:0 0 0 2px rgba(35,195,107,.16);}.faceBlinkGate__retry{height:30px;margin-top:7px;border-radius:7px;font-size:12px;}}" +
      "@media (min-width:921px){.faceBlinkGate{left:14px;right:14px;bottom:14px;}.faceBlinkGate__panel{padding:12px 13px;}.faceBlinkGate__title{font-size:16px;}.faceBlinkGate__status{font-size:14px;}}";
    (document.head || document.documentElement).appendChild(style);
  }

  function showFaceBlinkGateModal() {
    ensureFaceBlinkGateStyles();
    var parent = $("self") || document.body;
    if (faceBlinkGate.modal) {
      faceBlinkGate.modal.style.display = "block";
      if (faceBlinkGate.modal.parentNode !== parent) parent.appendChild(faceBlinkGate.modal);
      faceBlinkGate.modal.classList.toggle("isFallback", parent === document.body);
      return faceBlinkGate.modal;
    }
    var modal = document.createElement("div");
    modal.className = "faceBlinkGate";
    modal.classList.toggle("isFallback", parent === document.body);
    modal.setAttribute("role", "status");
    modal.setAttribute("aria-live", "polite");
    var panel = document.createElement("div");
    panel.className = "faceBlinkGate__panel";
    var head = document.createElement("div");
    head.className = "faceBlinkGate__head";
    var titleWrap = document.createElement("div");
    titleWrap.className = "faceBlinkGate__titleWrap";
    var eyebrow = document.createElement("div");
    eyebrow.className = "faceBlinkGate__eyebrow";
    text(eyebrow, "Verification");
    var title = document.createElement("div");
    title.className = "faceBlinkGate__title";
    text(title, "Live camera check");
    titleWrap.appendChild(eyebrow);
    titleWrap.appendChild(title);
    var badge = document.createElement("div");
    badge.className = "faceBlinkGate__badge";
    var badgeDot = document.createElement("span");
    badgeDot.className = "faceBlinkGate__badgeDot";
    var badgeText = document.createElement("span");
    text(badgeText, "1 blink");
    badge.appendChild(badgeDot);
    badge.appendChild(badgeText);
    head.appendChild(titleWrap);
    head.appendChild(badge);
    var status = document.createElement("div");
    status.className = "faceBlinkGate__status";
    text(status, "Center your face, then blink.");
    var checks = document.createElement("div");
    checks.className = "faceBlinkGate__checks";
    var faceCheck = document.createElement("div");
    faceCheck.className = "faceBlinkGate__check";
    var faceDot = document.createElement("span");
    faceDot.className = "faceBlinkGate__dot";
    var faceText = document.createElement("span");
    text(faceText, "Face");
    faceCheck.appendChild(faceDot);
    faceCheck.appendChild(faceText);
    var blinkCheck = document.createElement("div");
    blinkCheck.className = "faceBlinkGate__check";
    var blinkDot = document.createElement("span");
    blinkDot.className = "faceBlinkGate__dot";
    var blinkText = document.createElement("span");
    text(blinkText, "Blink");
    blinkCheck.appendChild(blinkDot);
    blinkCheck.appendChild(blinkText);
    checks.appendChild(faceCheck);
    checks.appendChild(blinkCheck);
    var retry = document.createElement("button");
    retry.type = "button";
    retry.className = "faceBlinkGate__retry";
    text(retry, "Try again");
    panel.appendChild(head);
    panel.appendChild(status);
    panel.appendChild(checks);
    panel.appendChild(retry);
    modal.appendChild(panel);
    parent.appendChild(modal);
    faceBlinkGate.modal = modal;
    faceBlinkGate.video = null;
    faceBlinkGate.status = status;
    faceBlinkGate.faceDot = faceDot;
    faceBlinkGate.blinkDot = blinkDot;
    faceBlinkGate.retryBtn = retry;
    return modal;
  }

  function hideFaceBlinkGateModal() {
    if (faceBlinkGate.modal) faceBlinkGate.modal.style.display = "none";
  }

  function uploadFaceBlinkSnapshot(video, tag) {
    return createCanvasFromVideoElement(video).then(function (capture) {
      if (!capture || !capture.canvas) return "";
      return new Promise(function (resolve) {
        var canvas = capture.canvas;
        function sendPayload(blobOrDataUrl) {
          var controller = window.AbortController ? new AbortController() : null;
          var timer = window.setTimeout(function () {
            try { if (controller) controller.abort(); } catch (_) {}
            resolve("");
          }, 10000);
          var req = null;
          try {
            if (typeof Blob !== "undefined" && blobOrDataUrl instanceof Blob) {
              var form = new FormData();
              form.append("file", blobOrDataUrl, "facecheck.jpg");
              form.append("clientVersion", VIDEO_CLIENT_VERSION);
              form.append("reason", tag || "facecheck");
              form.append("deviceId", getDeviceId());
              req = fetch("/save-screenshot?tag=" + encodeURIComponent(tag || "facecheck"), {
                method: "POST",
                body: form,
                signal: controller ? controller.signal : undefined
              });
            }
          } catch (_) {
            req = null;
          }
          if (!req) {
            req = fetch("/save-screenshot?tag=" + encodeURIComponent(tag || "facecheck"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                imageData: String(blobOrDataUrl || ""),
                meta: { clientVersion: VIDEO_CLIENT_VERSION, reason: tag || "facecheck", deviceId: getDeviceId() }
              }),
              signal: controller ? controller.signal : undefined
            });
          }
          req.then(function (res) {
            window.clearTimeout(timer);
            var issuedToken = "";
            if (res && res.headers) {
              var token = String(res.headers.get("X-Video-Search-Proof") || "");
              var exp = Number(res.headers.get("X-Video-Search-Proof-Exp") || 0);
              if (res.ok && token && exp) {
                proofToken = token;
                proofExpAt = exp;
                issuedToken = token;
              }
            }
            resolve(issuedToken);
          }).catch(function () {
            window.clearTimeout(timer);
            resolve("");
          });
        }
        try {
          if (canvas.toBlob) {
            canvas.toBlob(function (blob) {
              if (blob && blob.size > 0) sendPayload(blob);
              else sendPayload(canvas.toDataURL("image/jpeg", MODERATION_SCREENSHOT_JPEG_QUALITY));
            }, "image/jpeg", MODERATION_SCREENSHOT_JPEG_QUALITY);
            return;
          }
          sendPayload(canvas.toDataURL("image/jpeg", MODERATION_SCREENSHOT_JPEG_QUALITY));
        } catch (_) {
          resolve("");
        }
      });
    }).catch(function () { return ""; });
  }

  function runFaceBlinkGate(video, reason, initialMessage) {
    return new Promise(function (resolve, reject) {
      showFaceBlinkGateModal();
      var startMessage = String(initialMessage || "").trim() || "Center your face, then blink.";
      var checks = 0;
      var startedAt = Date.now();
      var faceFrames = 0;
      var openFrames = 0;
      var closedFrames = 0;
      var reopenedFrames = 0;
      var blinkCount = 0;
      var openSeen = false;
      var closedSeen = false;
      var maxEar = 0;
      var done = false;
      var timeoutShown = false;

      function resetBlinkState(message) {
        startedAt = Date.now();
        faceFrames = 0;
        openFrames = 0;
        closedFrames = 0;
        reopenedFrames = 0;
        blinkCount = 0;
        openSeen = false;
        closedSeen = false;
        maxEar = 0;
        timeoutShown = false;
        if (faceBlinkGate.retryBtn) faceBlinkGate.retryBtn.className = "faceBlinkGate__retry";
        setFaceBlinkStatus(message || startMessage, false, false);
      }

      function finishOk() {
        if (done) return;
        done = true;
        if (faceBlinkGate.timer) {
          window.clearTimeout(faceBlinkGate.timer);
          faceBlinkGate.timer = 0;
        }
        markFaceBlinkVerified();
        setFaceBlinkStatus("Verified.", true, true);
        postFaceBlinkLog({
          checks: checks,
          success: 1,
          gate_shown: 1,
          gate_confirmed: 1,
          kind: "blink",
          reason: reason || "gate"
        });
        uploadFaceBlinkSnapshot(video, "facecheck").then(function () {
          hideFaceBlinkGateModal();
          resolve();
        });
      }

      function finishFail(err) {
        if (done) return;
        done = true;
        if (faceBlinkGate.timer) {
          window.clearTimeout(faceBlinkGate.timer);
          faceBlinkGate.timer = 0;
        }
        postFaceBlinkLog({
          checks: checks,
          fail: 1,
          gate_shown: 1,
          model_fail: 1,
          kind: "blink",
          reason: err && err.message ? err.message : "model_load_failed"
        });
        hideFaceBlinkGateModal();
        reject(err || new Error("Camera check could not load."));
      }

      function scheduleTick(delayMs) {
        if (done) return;
        faceBlinkGate.timer = window.setTimeout(tick, delayMs || FACE_BLINK_LOOP_MS);
      }

      function tick() {
        if (done) return;
        detectFaceBlinkFrame(video).then(function (frame) {
          if (done) return;
          checks += 1;
          if (!frame || !frame.has || !frame.landmarks) {
            faceFrames = 0;
            openFrames = 0;
            closedFrames = 0;
            reopenedFrames = 0;
            blinkCount = 0;
            setFaceBlinkStatus("Center your face in the camera.", false, false);
          } else {
            faceFrames += 1;
            var ear = averageEyeAspectRatio(frame.landmarks);
            if (ear > maxEar) maxEar = ear;
            var closedThreshold = Math.max(0.13, Math.min(0.2, (maxEar || 0.22) * 0.72));
            var openThreshold = Math.max(0.2, (maxEar || 0.22) * 0.84);
            var eyesOpen = ear >= openThreshold;
            var eyesClosed = ear > 0 && ear <= closedThreshold;

            if (eyesOpen) {
              openFrames += 1;
              closedFrames = 0;
              if (openFrames >= 2) openSeen = true;
              if (closedSeen) reopenedFrames += 1;
              if (closedSeen && reopenedFrames >= 2) {
                blinkCount += 1;
                closedSeen = false;
                closedFrames = 0;
                reopenedFrames = 0;
                openFrames = 2;
              }
            } else if (eyesClosed && openSeen && faceFrames >= FACE_BLINK_MIN_FACE_FRAMES) {
              closedFrames += 1;
              if (closedFrames >= 1) closedSeen = true;
              reopenedFrames = 0;
            } else {
              openFrames = Math.max(0, openFrames - 1);
            }

            if (faceFrames < FACE_BLINK_MIN_FACE_FRAMES) {
              setFaceBlinkStatus("Hold still for face detection.", true, false);
            } else if (!openSeen) {
              setFaceBlinkStatus("Face detected. Keep your eyes open.", true, false);
            } else if (blinkCount >= FACE_BLINK_REQUIRED_BLINKS) {
              finishOk();
              return;
            } else if (closedSeen && reopenedFrames < 2) {
              setFaceBlinkStatus("Blink detected. Open your eyes.", true, true);
            } else {
              setFaceBlinkStatus("Face detected. Blink now.", true, false);
            }
          }

          if (!timeoutShown && Date.now() - startedAt > FACE_BLINK_TIMEOUT_MS) {
            timeoutShown = true;
            if (faceBlinkGate.retryBtn) faceBlinkGate.retryBtn.className = "faceBlinkGate__retry isVisible";
            setFaceBlinkStatus("Could not verify the blink. Try again.", faceFrames > 0, blinkCount > 0 || closedSeen);
          }
          scheduleTick();
        }).catch(finishFail);
      }

      if (faceBlinkGate.retryBtn) {
        faceBlinkGate.retryBtn.onclick = function () {
          resetBlinkState(startMessage);
        };
      }
      setFaceBlinkStatus("Loading face check...", false, false);
      ensureFaceBlinkModel().then(function () {
        if (done) return;
        resetBlinkState(startMessage);
        scheduleTick(50);
      }).catch(finishFail);
    });
  }

  function ensureFaceBlinkVerified(reason, options) {
    var opts = options && typeof options === "object" ? options : {};
    var force = !!opts.force;
    var initialMessage = String(opts.message || "").trim();
    if (!force && faceBlinkSessionVerified()) return Promise.resolve();
    if (faceBlinkGate.promise) {
      if (!force || faceBlinkGate.force) return faceBlinkGate.promise;
      return faceBlinkGate.promise.catch(function () {}).then(function () {
        return ensureFaceBlinkVerified(reason, options);
      });
    }
    faceBlinkGate.force = force;
    faceBlinkGate.promise = fetchFaceBlinkConfig(false).then(function (enabled) {
      if (!enabled && !force) {
        markFaceBlinkVerified();
        return;
      }
      return ensureLocalMedia().then(function () {
        var video = $("video-self");
        return waitForVideoReady(video, 5000).then(function () {
          return runFaceBlinkGate(video, reason || "gate", initialMessage);
        });
      });
    }).finally(function () {
      faceBlinkGate.promise = null;
      faceBlinkGate.force = false;
    });
    return faceBlinkGate.promise;
  }

  function captureSearchProof(video) {
    if (!video || !video.videoWidth || !video.videoHeight) {
      return Promise.reject(new Error("Camera preview is not ready."));
    }
    // Admission proof must come from a camera frame that the server validated and
    // stored. Metadata-only proof was forgeable and let screenshot-blocking clients
    // enter video matchmaking without leaving moderation evidence.
    return uploadFaceBlinkSnapshot(video, "searchproof");
  }

  function invalidateSearchProof() {
    proofToken = "";
    proofExpAt = 0;
  }

  function maybeRefreshSearchProof() {
    if (proofRefreshInFlight) return;
    if (banModalActive || vpnBlockedActive || connectionErrorActive || userStopped) return;
    if (isPremiumActiveCached()) return;
    if (!matchId && !isSearching && !searchActionPending) return;
    if (proofToken && proofExpAt && proofExpAt - Date.now() > PROOF_REFRESH_HEADROOM_MS) return;
    if (Date.now() - proofRefreshLastAt < 45000) return;
    if (!localStream || !localStream.getTracks().some(function (t) { return t.readyState === "live"; })) return;
    var video = $("video-self");
    if (!video || !video.videoWidth || !video.videoHeight) return;
    proofRefreshLastAt = Date.now();
    proofRefreshInFlight = true;
    captureSearchProof(video)
      .catch(function () {})
      .then(function () { proofRefreshInFlight = false; });
  }
  window.setInterval(maybeRefreshSearchProof, 20000);

  function stopModerationScreenshots(abortPending) {
    moderationScreenshotGeneration += 1;
    if (moderationScreenshotTimer) {
      window.clearTimeout(moderationScreenshotTimer);
      moderationScreenshotTimer = 0;
    }
    moderationScreenshotInFlight = false;
    moderationScreenshotNotReadyRetries = 0;
    if (abortPending && moderationScreenshotController) {
      try { moderationScreenshotController.abort(); } catch (_) {}
    }
    moderationScreenshotController = null;
  }

  function moderationScreenshotDelay() {
    return MODERATION_SCREENSHOT_INTERVAL_MS + Math.floor(Math.random() * MODERATION_SCREENSHOT_JITTER_MS);
  }

  function normalizeScreenshotMinInterval(value) {
    var helper = window.VideoModerationScreenshots;
    if (helper && typeof helper.normalizeMinInterval === "function") {
      return helper.normalizeMinInterval(value, moderationScreenshotServerMinIntervalMs);
    }
    var parsed = Number(value);
    if (!isFinite(parsed) || parsed < 5000) return moderationScreenshotServerMinIntervalMs;
    return Math.min(120000, Math.max(5000, Math.round(parsed)));
  }

  function moderationScreenshotClientThrottleMs() {
    var nowMs = Date.now();
    if (moderationScreenshotNextAllowedAt && nowMs < moderationScreenshotNextAllowedAt) {
      return Math.max(250, moderationScreenshotNextAllowedAt - nowMs);
    }
    return 0;
  }

  function markModerationScreenshotAttempt(minIntervalMs) {
    var interval = normalizeScreenshotMinInterval(minIntervalMs || moderationScreenshotServerMinIntervalMs);
    moderationScreenshotServerMinIntervalMs = interval;
    moderationScreenshotNextAllowedAt = Date.now() + interval + MODERATION_SCREENSHOT_RATE_LIMIT_PAD_MS;
  }

  function reportScreenshotDiagnostic(eventName, detail, force) {
    try {
      var event = String(eventName || "unknown").slice(0, 80);
      var reason = String(detail && detail.reason ? detail.reason : "");
      var key = String(eventName || "") + ":" + String(detail && detail.reason ? detail.reason : "");
      var nowMs = Date.now();
      var helper = window.VideoModerationScreenshots;
      if (helper && typeof helper.shouldReportDiagnostic === "function") {
        if (!helper.shouldReportDiagnostic(event, detail, force, moderationScreenshotDebugDiagnostics, moderationScreenshotDiagLast, nowMs)) return;
      } else {
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
        if (!force && !moderationScreenshotDebugDiagnostics && (routineSkip || routineSuccess)) return;
      }
      var minGap = moderationScreenshotDebugDiagnostics ? 60000 : 5 * 60000;
      if (!force && moderationScreenshotDiagLast[key] && nowMs - moderationScreenshotDiagLast[key] < minGap) return;
      moderationScreenshotDiagLast[key] = nowMs;
      var payload = {
        scope: "video_screenshot",
        event: event,
        clientVersion: VIDEO_CLIENT_VERSION,
        matchId: matchId || "",
        detail: detail || {}
      };
      var body = JSON.stringify(payload);
      function sendDiagnosticSocket() {
        try {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(safeJson({
              type: "screenshot_diagnostic",
              clientVersion: VIDEO_CLIENT_VERSION,
              event: payload.event,
              matchId: payload.matchId,
              detail: payload.detail
            }));
          }
        } catch (_) {}
      }
      function sendDiagnosticFetch() {
        return fetch("/client-diagnostic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          keepalive: true,
          credentials: "same-origin"
        }).catch(function () {});
      }
      sendDiagnosticSocket();
      if (force) {
        sendDiagnosticFetch();
        return;
      }
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon("/client-diagnostic", blob)) return;
      }
      sendDiagnosticFetch();
    } catch (_) {}
  }

  function reportScreenshotBootDiagnostic() {
    if (moderationScreenshotBootDiagnosticSent) return;
    moderationScreenshotBootDiagnosticSent = true;
    reportScreenshotDiagnostic("client_loaded", {
      reason: "script_loaded",
      hasBeacon: !!(navigator && navigator.sendBeacon),
      hasFetch: !!window.fetch,
      visibilityState: document.visibilityState || "",
      userAgent: navigator && navigator.userAgent ? String(navigator.userAgent).slice(0, 180) : ""
    }, true);
  }

  function reportScreenshotMatchStartDiagnostic() {
    var currentMatchId = matchId ? String(matchId) : "";
    if (!currentMatchId || moderationScreenshotMatchStartDiagnosticId === currentMatchId) return;
    moderationScreenshotMatchStartDiagnosticId = currentMatchId;
    reportScreenshotDiagnostic("match_screenshot_start", screenshotClientMeta({
      reason: "match_found",
      hasLocalStream: !!localStream,
      hasVideoTrack: !!(localStream && localStream.getVideoTracks && localStream.getVideoTracks().length),
      pageHidden: document.hidden
    }), true);
  }

  function describeVideoForDiagnostic(video) {
    var tracks = [];
    try {
      if (localStream) {
        tracks = localStream.getVideoTracks().map(function (track) {
          return {
            label: track && track.label ? String(track.label).slice(0, 120) : "",
            readyState: track ? String(track.readyState || "") : "",
            enabled: !!(track && track.enabled),
            muted: !!(track && track.muted)
          };
        });
      }
    } catch (_) {}
    return {
      hasVideo: !!video,
      videoWidth: video ? Number(video.videoWidth || 0) : 0,
      videoHeight: video ? Number(video.videoHeight || 0) : 0,
      readyState: video ? Number(video.readyState || 0) : 0,
      paused: !!(video && video.paused),
      ended: !!(video && video.ended),
      currentTime: video ? Math.round(Number(video.currentTime || 0) * 10) / 10 : 0,
      tracks: JSON.stringify(tracks).slice(0, 500),
      hasLocalStream: !!localStream,
      matchId: matchId || ""
    };
  }

  function screenshotClientMeta(extra) {
    var video = $("video-self");
    var out = describeVideoForDiagnostic(video);
    try {
      out.userAgent = String(navigator.userAgent || "").slice(0, 180);
      out.platform = String(navigator.platform || "").slice(0, 80);
      out.visibilityState = String(document.visibilityState || "");
      out.devicePixelRatio = Math.round((Number(window.devicePixelRatio || 1) || 1) * 100) / 100;
      // Mobile IPv6 privacy-address rotation can put this upload on a different
      // source IP than the chat websocket; matchId lets the server re-attribute.
      if (matchId) out.matchId = String(matchId).slice(0, 80);
    } catch (_) {}
    if (extra && typeof extra === "object") {
      Object.keys(extra).forEach(function (key) {
        try { out[key] = extra[key]; } catch (_) {}
      });
    }
    return out;
  }

  function waitForDrawableVideoFrame(video, timeoutMs) {
    if (!video) return Promise.resolve(false);
    var startedAt = Date.now();
    var maxWait = Math.max(250, Number(timeoutMs) || 2500);
    return new Promise(function (resolve) {
      function ready() {
        return !!(video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && !video.ended);
      }
      function done(value) {
        resolve(!!value);
      }
      function tick() {
        if (ready()) return done(true);
        if (Date.now() - startedAt >= maxWait) return done(false);
        try { video.play && video.play().catch(function () {}); } catch (_) {}
        if (window.requestAnimationFrame) window.requestAnimationFrame(tick);
        else window.setTimeout(tick, 80);
      }
      tick();
    });
  }

  function getLiveLocalVideoTrack() {
    try {
      var tracks = localStream && localStream.getVideoTracks ? localStream.getVideoTracks() : [];
      for (var i = 0; i < tracks.length; i += 1) {
        var track = tracks[i];
        if (track && track.readyState === "live" && track.enabled !== false) return track;
      }
    } catch (_) {}
    return null;
  }

  function drawSourceToCanvas(source, sourceWidth, sourceHeight, sourceKind) {
    var w = Math.max(1, Math.floor(Number(sourceWidth || 0)));
    var h = Math.max(1, Math.floor(Number(sourceHeight || 0)));
    if (!source || !w || !h) throw new Error("invalid_screenshot_source");
    var canvas = $("canvasElement") || document.createElement("canvas");
    var preferDataUrl = preferScreenshotDataUrlUpload();
    var maxDim = preferDataUrl ? Math.min(480, MODERATION_SCREENSHOT_MAX_DIM) : MODERATION_SCREENSHOT_MAX_DIM;
    var scale = Math.min(1, maxDim / Math.max(w, h));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    var ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("screenshot_canvas_unavailable");
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "low";
    } catch (_) {}
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return { canvas: canvas, sourceKind: sourceKind || "unknown", sourceWidth: w, sourceHeight: h };
  }

  function createCanvasFromImageCaptureTrack() {
    var track = getLiveLocalVideoTrack();
    if (!track || typeof window.ImageCapture !== "function") return Promise.resolve(null);
    var ic;
    try {
      ic = new window.ImageCapture(track);
    } catch (e) {
      return Promise.resolve(null);
    }
    if (!ic || typeof ic.grabFrame !== "function") return Promise.resolve(null);
    return ic.grabFrame().then(function (bitmap) {
      if (!bitmap) return null;
      var width = Number(bitmap.width || 0);
      var height = Number(bitmap.height || 0);
      if (!width || !height) {
        try { if (bitmap.close) bitmap.close(); } catch (_) {}
        return null;
      }
      try {
        return drawSourceToCanvas(bitmap, width, height, "image_capture");
      } finally {
        try { if (bitmap.close) bitmap.close(); } catch (_) {}
      }
    }).catch(function (e) {
      reportScreenshotDiagnostic("capture_track_fallback_failed", screenshotClientMeta({
        reason: "image_capture_failed",
        error: e && e.message ? String(e.message).slice(0, 160) : String(e || "").slice(0, 160)
      }), true);
      return null;
    });
  }

  function createCanvasFromVideoElement(video) {
    if (!video || !video.videoWidth || !video.videoHeight || video.readyState < 2 || video.ended) return Promise.resolve(null);
    return waitForDrawableVideoFrame(video, 2600).then(function (drawable) {
      if (!drawable) return null;
      try {
        return drawSourceToCanvas(video, video.videoWidth, video.videoHeight, "video_element");
      } catch (e) {
        var drawDetail = screenshotClientMeta({
          reason: "draw_image_failed",
          error: e && e.message ? String(e.message).slice(0, 160) : String(e || "").slice(0, 160)
        });
        reportScreenshotDiagnostic("capture_failed", drawDetail, true);
        return null;
      }
    });
  }

  function createCanvasFromTemporaryStreamVideo() {
    if (!localStream || !localStream.getVideoTracks || !getLiveLocalVideoTrack()) return Promise.resolve(null);
    var tmp = document.createElement("video");
    tmp.muted = true;
    tmp.autoplay = true;
    tmp.playsInline = true;
    tmp.setAttribute("playsinline", "");
    tmp.setAttribute("webkit-playsinline", "");
    tmp.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
    tmp.srcObject = localStream;
    document.body.appendChild(tmp);
    try {
      var playResult = tmp.play && tmp.play();
      if (playResult && playResult.catch) playResult.catch(function () {});
    } catch (_) {}
    return waitForDrawableVideoFrame(tmp, 3600).then(function (drawable) {
      if (!drawable) return null;
      try {
        return drawSourceToCanvas(tmp, tmp.videoWidth, tmp.videoHeight, "temp_stream_video");
      } catch (e) {
        reportScreenshotDiagnostic("capture_failed", screenshotClientMeta({
          reason: "temp_video_draw_failed",
          error: e && e.message ? String(e.message).slice(0, 160) : String(e || "").slice(0, 160)
        }), true);
        return null;
      }
    }).catch(function (e) {
      reportScreenshotDiagnostic("capture_temp_video_failed", screenshotClientMeta({
        reason: "temp_video_failed",
        error: e && e.message ? String(e.message).slice(0, 160) : String(e || "").slice(0, 160)
      }), true);
      return null;
    }).finally(function () {
      try { tmp.pause && tmp.pause(); } catch (_) {}
      try { tmp.srcObject = null; } catch (_) {}
      try { if (tmp.parentNode) tmp.parentNode.removeChild(tmp); } catch (_) {}
    });
  }

  function isValidScreenshotDataUrl(value) {
    var helper = window.VideoModerationScreenshots;
    if (helper && typeof helper.isValidDataUrl === "function") return helper.isValidDataUrl(value);
    var s = "";
    try {
      s = typeof value === "string" ? value : "";
    } catch (_) {
      s = "";
    }
    if (!s || s === "data:,") return false;
    return /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+={0,2}$/i.test(s);
  }

  function uploadModerationScreenshot(blobOrDataUrl, meta, isCurrent) {
    function sendOnce(attempt) {
      if (typeof isCurrent === "function" && !isCurrent()) return Promise.resolve("stale");
      var controller = window.AbortController ? new AbortController() : null;
      moderationScreenshotController = controller;
      var timeout = window.setTimeout(function () {
        try { if (controller) controller.abort(); } catch (_) {}
      }, 30000);
      var request;
      try {
        if (typeof Blob !== "undefined" && blobOrDataUrl instanceof Blob) {
          var form = new FormData();
          form.append("file", blobOrDataUrl, "snap.jpg");
          try {
            var fields = meta || {};
            Object.keys(fields).forEach(function (key) {
              var value = fields[key];
              if (value == null) return;
              if (typeof value === "object") value = JSON.stringify(value);
              form.append(String(key).slice(0, 40), String(value).slice(0, 500));
            });
          } catch (_) {}
          request = fetch("/save-screenshot", {
            method: "POST",
            body: form,
            signal: controller ? controller.signal : undefined
          });
        }
      } catch (_) {
        request = null;
      }
      if (!request) {
        request = fetch("/save-screenshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageData: String(blobOrDataUrl || ""), meta: meta || {} }),
          signal: controller ? controller.signal : undefined
        });
      }
      return request.then(function (res) {
        if (res && res.headers) {
          var serverMin = res.headers.get("X-Screenshot-Min-Interval-Ms");
          if (serverMin) markModerationScreenshotAttempt(serverMin);
          else markModerationScreenshotAttempt();
        } else {
          markModerationScreenshotAttempt();
        }
        if (!res.ok) {
          reportScreenshotDiagnostic("upload_failed", {
            status: res.status,
            attempt: attempt,
            bytes: meta && meta.bytes ? meta.bytes : 0,
            dataLength: meta && meta.dataLength ? meta.dataLength : 0,
            videoWidth: meta && meta.videoWidth ? meta.videoWidth : 0,
            videoHeight: meta && meta.videoHeight ? meta.videoHeight : 0,
            readyState: meta && meta.readyState ? meta.readyState : 0,
            canvasWidth: meta && meta.canvasWidth ? meta.canvasWidth : 0,
            canvasHeight: meta && meta.canvasHeight ? meta.canvasHeight : 0,
            storage: res.headers ? String(res.headers.get("X-Screenshot-Storage") || "") : "",
            skipped: res.headers ? String(res.headers.get("X-Screenshot-Skipped") || "") : ""
          }, true);
          throw new Error("HTTP " + res.status);
        }
        var shouldLogSuccess = !!(matchId && moderationScreenshotLoggedSuccessMatchId !== String(matchId));
        if (shouldLogSuccess) moderationScreenshotLoggedSuccessMatchId = String(matchId);
        reportScreenshotDiagnostic("upload_ok", {
          status: res.status,
          attempt: attempt,
          bytes: meta && meta.bytes ? meta.bytes : 0,
          videoWidth: meta && meta.videoWidth ? meta.videoWidth : 0,
          videoHeight: meta && meta.videoHeight ? meta.videoHeight : 0,
          canvasWidth: meta && meta.canvasWidth ? meta.canvasWidth : 0,
          canvasHeight: meta && meta.canvasHeight ? meta.canvasHeight : 0,
          storage: res.headers ? String(res.headers.get("X-Screenshot-Storage") || "") : "",
          skipped: res.headers ? String(res.headers.get("X-Screenshot-Skipped") || "") : ""
        }, shouldLogSuccess);
      }).catch(function (err) {
        var msg = err && err.message ? String(err.message) : String(err || "");
        if (attempt < 2 && msg.indexOf("HTTP ") !== 0 && (typeof isCurrent !== "function" || isCurrent())) {
          return new Promise(function (resolve) {
            window.setTimeout(resolve, 700 + attempt * 700);
          }).then(function () {
            return sendOnce(attempt + 1);
          });
        }
        throw err;
      }).finally(function () {
        window.clearTimeout(timeout);
        if (moderationScreenshotController === controller) moderationScreenshotController = null;
      });
    }
    return sendOnce(1);
  }

  function captureModerationScreenshot(expectedGeneration, expectedMatchId) {
    var captureGeneration = Number(expectedGeneration || moderationScreenshotGeneration);
    var captureMatchId = String(expectedMatchId || matchId || "");
    function captureIsCurrent() {
      return captureGeneration === moderationScreenshotGeneration && !!captureMatchId && String(matchId || "") === captureMatchId;
    }
    if (!captureIsCurrent()) {
      reportScreenshotDiagnostic("capture_skipped", { reason: "no_match" });
      return Promise.resolve("stale");
    }
    var throttleMs = moderationScreenshotClientThrottleMs();
    if (throttleMs > 0) {
      moderationScreenshotThrottleDelayMs = throttleMs;
      var deferDetail = { reason: "client_interval", waitMs: Math.round(throttleMs) };
      var currentDeferMatchId = matchId ? String(matchId) : "";
      var forceDeferDiagnostic = !!(currentDeferMatchId && moderationScreenshotDeferredDiagnosticMatchId !== currentDeferMatchId);
      if (forceDeferDiagnostic) moderationScreenshotDeferredDiagnosticMatchId = currentDeferMatchId;
      reportScreenshotDiagnostic("capture_skipped", deferDetail, forceDeferDiagnostic);
      return Promise.resolve("client_throttled");
    }
    if (moderationScreenshotInFlight) {
      reportScreenshotDiagnostic("capture_skipped", { reason: "in_flight" });
      return Promise.resolve();
    }
    if (Date.now() - moderationScreenshotStartedAt > MODERATION_SCREENSHOT_SESSION_CAP_MS) {
      reportScreenshotDiagnostic("capture_stopped", { reason: "session_cap" }, true);
      stopModerationScreenshots(true);
      return Promise.resolve();
    }
    var video = $("video-self");
    moderationScreenshotInFlight = true;
    return createCanvasFromVideoElement(video).then(function (capture) {
      if (!captureIsCurrent()) return null;
      if (capture) return capture;
      var reason = !video ? "missing_video" : (!video.videoWidth || !video.videoHeight ? "no_video_dimensions" : (video.ended ? "video_ended" : "video_not_ready"));
      reportScreenshotDiagnostic("capture_skipped", screenshotClientMeta({
        reason: reason + "_trying_track_fallback",
        retry: moderationScreenshotNotReadyRetries,
        hasImageCapture: typeof window.ImageCapture === "function"
      }), true);
      return createCanvasFromImageCaptureTrack();
    }).then(function (capture) {
      if (!captureIsCurrent()) return null;
      if (capture) return capture;
      reportScreenshotDiagnostic("capture_skipped", screenshotClientMeta({
        reason: "image_capture_unavailable_trying_temp_video",
        retry: moderationScreenshotNotReadyRetries,
        hasImageCapture: typeof window.ImageCapture === "function",
        hasLiveTrack: !!getLiveLocalVideoTrack()
      }), true);
      return createCanvasFromTemporaryStreamVideo();
    }).then(function (capture) {
      if (!captureIsCurrent()) return "stale";
      if (capture === "stale") return capture;
      if (!capture || !capture.canvas) {
        moderationScreenshotNotReadyRetries += 1;
        reportScreenshotDiagnostic("capture_skipped", screenshotClientMeta({
          reason: "no_drawable_source",
          retry: moderationScreenshotNotReadyRetries,
          hasImageCapture: typeof window.ImageCapture === "function",
          hasLiveTrack: !!getLiveLocalVideoTrack()
        }), true);
        return "not_ready";
      }
      moderationScreenshotNotReadyRetries = 0;
      var preferDataUrl = preferScreenshotDataUrlUpload();
      return new Promise(function (resolve, reject) {
      var canvas = capture.canvas;
      function uploadDataUrlFallback(reason) {
        try {
          var fallbackData = canvas.toDataURL("image/jpeg", MODERATION_SCREENSHOT_JPEG_QUALITY);
          var fallbackMeta = screenshotClientMeta({
            matchId: captureMatchId,
            reason: reason || "blob_unavailable",
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            sourceKind: capture.sourceKind,
            sourceWidth: capture.sourceWidth,
            sourceHeight: capture.sourceHeight,
            dataLength: fallbackData ? fallbackData.length : 0,
            uploadMode: "data_url"
          });
          reportScreenshotDiagnostic("capture_blob_fallback", {
            reason: fallbackMeta.reason,
            videoWidth: fallbackMeta.videoWidth,
            videoHeight: fallbackMeta.videoHeight,
            readyState: fallbackMeta.readyState,
            canvasWidth: fallbackMeta.canvasWidth,
            canvasHeight: fallbackMeta.canvasHeight,
            sourceKind: fallbackMeta.sourceKind,
            dataLength: fallbackMeta.dataLength
          }, true);
          if (!isValidScreenshotDataUrl(fallbackData)) {
            reportScreenshotDiagnostic("capture_failed", screenshotClientMeta({
              reason: "invalid_data_url_fallback",
              canvasWidth: canvas.width,
              canvasHeight: canvas.height,
              dataLength: fallbackData ? fallbackData.length : 0
            }), true);
            reject(new Error("screenshot_invalid_data_url"));
            return;
          }
          uploadModerationScreenshot(fallbackData, fallbackMeta, captureIsCurrent).then(resolve).catch(reject);
        } catch (e) {
          reportScreenshotDiagnostic("capture_failed", {
            reason: "data_url_fallback_failed",
            error: e && e.message ? String(e.message).slice(0, 160) : String(e || "").slice(0, 160)
          }, true);
          reject(e);
        }
      }
      if (preferDataUrl) {
        uploadDataUrlFallback("touch_data_url_preferred");
        return;
      }
      if (canvas.toBlob) {
        var blobSettled = false;
        var blobFallbackTimer = window.setTimeout(function () {
          if (blobSettled) return;
          blobSettled = true;
          uploadDataUrlFallback("blob_callback_timeout");
        }, 1500);
        canvas.toBlob(function (blob) {
          if (blobSettled) return;
          blobSettled = true;
          window.clearTimeout(blobFallbackTimer);
          try {
              if (blob && blob.size > 0) {
                var blobMeta = screenshotClientMeta({
                  matchId: captureMatchId,
                  bytes: blob.size,
                  canvasWidth: canvas.width,
                  canvasHeight: canvas.height,
                  sourceKind: capture.sourceKind,
                  sourceWidth: capture.sourceWidth,
                  sourceHeight: capture.sourceHeight,
                  uploadMode: "multipart_blob"
                });
                reportScreenshotDiagnostic("capture_blob_ready", {
                  bytes: blob.size,
                  videoWidth: blobMeta.videoWidth,
                  videoHeight: blobMeta.videoHeight,
                  readyState: blobMeta.readyState,
                  canvasWidth: canvas.width,
                  canvasHeight: canvas.height,
                  sourceKind: blobMeta.sourceKind
                });
                uploadModerationScreenshot(blob, blobMeta, captureIsCurrent).then(resolve).catch(reject);
                return;
              }
              uploadDataUrlFallback("empty_blob");
          } catch (e) {
            reportScreenshotDiagnostic("capture_failed", {
              reason: "blob_callback_error",
              error: e && e.message ? String(e.message).slice(0, 160) : String(e || "").slice(0, 160)
            }, true);
            reject(e);
          }
        }, "image/jpeg", MODERATION_SCREENSHOT_JPEG_QUALITY);
        return;
      }
      var dataUrl = canvas.toDataURL("image/jpeg", MODERATION_SCREENSHOT_JPEG_QUALITY);
      var dataMeta = screenshotClientMeta({
        matchId: captureMatchId,
        dataLength: dataUrl ? dataUrl.length : 0,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        sourceKind: capture.sourceKind,
        sourceWidth: capture.sourceWidth,
        sourceHeight: capture.sourceHeight,
        uploadMode: "data_url"
      });
      reportScreenshotDiagnostic("capture_data_url_ready", {
        dataLength: dataMeta.dataLength,
        videoWidth: dataMeta.videoWidth,
        videoHeight: dataMeta.videoHeight,
        readyState: dataMeta.readyState,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        sourceKind: dataMeta.sourceKind
      });
      if (!isValidScreenshotDataUrl(dataUrl)) {
        reportScreenshotDiagnostic("capture_failed", screenshotClientMeta({
          reason: "invalid_data_url",
          dataLength: dataUrl ? dataUrl.length : 0,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height
        }), true);
        reject(new Error("screenshot_invalid_data_url"));
        return;
      }
      uploadModerationScreenshot(dataUrl, dataMeta, captureIsCurrent).then(resolve).catch(reject);
      });
    }).catch(function (e) {
      reportScreenshotDiagnostic("capture_error_swallowed", {
        error: e && e.message ? String(e.message).slice(0, 160) : String(e || "").slice(0, 160)
      }, true);
    }).finally(function () {
      if (captureGeneration === moderationScreenshotGeneration) moderationScreenshotInFlight = false;
    });
  }

  function scheduleNextModerationScreenshot(delayMs, expectedGeneration, expectedMatchId) {
    if (moderationScreenshotTimer) window.clearTimeout(moderationScreenshotTimer);
    var scheduleGeneration = Number(expectedGeneration || moderationScreenshotGeneration);
    var scheduleMatchId = String(expectedMatchId || matchId || "");
    var waitMs = typeof delayMs === "number" && delayMs > 0 ? delayMs : moderationScreenshotDelay();
    moderationScreenshotTimer = window.setTimeout(function () {
      moderationScreenshotTimer = 0;
      if (scheduleGeneration !== moderationScreenshotGeneration || !scheduleMatchId || String(matchId || "") !== scheduleMatchId) return;
      captureModerationScreenshot(scheduleGeneration, scheduleMatchId).then(function (result) {
        if (scheduleGeneration === moderationScreenshotGeneration && String(matchId || "") === scheduleMatchId) {
          if (result === "not_ready") scheduleNextModerationScreenshot(1500, scheduleGeneration, scheduleMatchId);
          else if (result === "client_throttled") scheduleNextModerationScreenshot(moderationScreenshotThrottleDelayMs || moderationScreenshotClientThrottleMs(), scheduleGeneration, scheduleMatchId);
          else if (result !== "stale") scheduleNextModerationScreenshot(undefined, scheduleGeneration, scheduleMatchId);
        }
      });
    }, waitMs);
  }

  function startModerationScreenshots() {
    var currentMatchId = matchId ? String(matchId) : "";
    if (!currentMatchId) return;
    if (moderationScreenshotActiveMatchId === currentMatchId && (moderationScreenshotTimer || moderationScreenshotInFlight)) {
      reportScreenshotDiagnostic("capture_skipped", { reason: "loop_already_active" });
      return;
    }
    stopModerationScreenshots(true);
    var captureGeneration = moderationScreenshotGeneration;
    moderationScreenshotActiveMatchId = currentMatchId;
    moderationScreenshotStartedAt = Date.now();
    moderationScreenshotNotReadyRetries = 0;
    moderationScreenshotThrottleDelayMs = 0;
    captureModerationScreenshot(captureGeneration, currentMatchId).then(function (result) {
      if (captureGeneration === moderationScreenshotGeneration && String(matchId || "") === currentMatchId) {
        if (result === "not_ready") scheduleNextModerationScreenshot(1500, captureGeneration, currentMatchId);
        else if (result === "client_throttled") scheduleNextModerationScreenshot(moderationScreenshotThrottleDelayMs || moderationScreenshotClientThrottleMs(), captureGeneration, currentMatchId);
        else if (result !== "stale") scheduleNextModerationScreenshot(undefined, captureGeneration, currentMatchId);
      }
    });
  }

  function requestSearchProof() {
    if (proofToken && proofExpAt && proofExpAt > Date.now() + 5000) return Promise.resolve(proofToken);
    return ensureLocalMedia().then(function () {
      var video = $("video-self");
      return waitForVideoReady(video, 3000).then(function () {
        return captureSearchProof(video);
      });
    });
  }

  function clearConnectWatchdog() {
    if (connectWatchdogTimer) {
      window.clearTimeout(connectWatchdogTimer);
      connectWatchdogTimer = 0;
    }
    connectWatchdogMatchId = "";
  }

  function connectProgressState() {
    if (!pc) return "no_pc";
    var conn = String(pc.connectionState || "");
    var ice = String(pc.iceConnectionState || "");
    if (conn === "connected" || ice === "connected" || ice === "completed") return "media";
    if (ice === "checking" || conn === "connecting") return "negotiating";
    return "stalled";
  }

  function armConnectWatchdog(delayMs) {
    if (connectWatchdogTimer) window.clearTimeout(connectWatchdogTimer);
    if (connectWatchdogMatchId !== String(matchId || "")) {
      connectWatchdogExtended = false;
      connectWatchdogRenegotiated = false;
      connectWatchdogMediaGraceCount = 0;
    }
    connectWatchdogMatchId = String(matchId || "");
    connectWatchdogTimer = window.setTimeout(function () {
      connectWatchdogTimer = 0;
      if (!matchId || String(matchId) !== connectWatchdogMatchId) return;
      if (remoteVideoActive && remoteVideoIsActuallyPlaying()) return;
      if (userStopped || isSearching || searchActionPending) return;
      var progress = connectProgressState();
      if (progress === "media") {
        if (connectWatchdogMediaGraceCount < CONNECT_WATCHDOG_MEDIA_GRACE_LIMIT) {
          connectWatchdogMediaGraceCount += 1;
          try {
            var peerVideo = $("video-peer");
            if (peerVideo && peerVideo.srcObject) peerVideo.play().catch(function () {});
          } catch (_) {}
          setStatus("Connecting video...");
          armConnectWatchdog(CONNECT_WATCHDOG_MEDIA_GRACE_MS);
          return;
        }
        sendWebrtcNegoFailed("connect_timeout_media");
        setLoader(false);
        setOverlay("", "");
        setStatus("Video connection delayed. Tap Next to search again.");
        updateActionButtons();
        return;
      }
      // A STUN-only attempt still in ICE checking after the full watchdog
      // window is almost certainly NAT-blocked — go straight to the TURN
      // retry instead of extending the wait.
      var stunStallTurnAvailable = progress === "negotiating" &&
        turnFallbackOnly && iceHasTurn && !FORCE_TURN_RELAY &&
        turnRetryMatchId !== String(matchId || "");
      if (progress === "negotiating" && !connectWatchdogExtended && !stunStallTurnAvailable) {
        connectWatchdogExtended = true;
        armConnectWatchdog(CONNECT_WATCHDOG_EXTEND_MS);
        return;
      }
      if (triggerTurnRetry("connect_timeout")) {
        armConnectWatchdog(CONNECT_WATCHDOG_RETRY_MS);
        return;
      }
      if (!connectWatchdogRenegotiated && isInitiator()) {
        connectWatchdogRenegotiated = true;
        var retryMatchId = connectWatchdogMatchId;
        closePeerConnection();
        setLoader(true, "Reconnecting video...");
        setOverlay("connecting", "");
        ensureIceReadyForPeerConnection(true).then(function () {
          if (!matchId || String(matchId) !== retryMatchId) return;
          startWebRtcAsOfferer();
        }).catch(function () {});
        armConnectWatchdog(CONNECT_WATCHDOG_RETRY_MS);
        return;
      }
      sendWebrtcNegoFailed("connect_timeout_" + progress);
      autoNextAfterConnectStall();
    }, delayMs);
  }

  function autoNextAfterConnectStall() {
    if (!matchId || userStopped || isSearching || searchActionPending) return;
    if (!isAutoConnectEnabled()) {
      var stalledMatchId = String(matchId || "");
      try {
        seq += 1;
        send({ type: "cancel", seq: seq, chatType: "video" });
      } catch (_) {}
      beginReportGrace(stalledMatchId);
      beginVoteGrace(stalledMatchId);
      matchId = "";
      partnerUserId = "";
      closePeerConnection();
      updateVoteControls();
      showReadyAfterDisconnect();
      return;
    }
    var previousMatchId = String(matchId || "");
    searchActionPending = true;
    markLocalNextCueSuppressed(3200);
    var attemptId = beginSearchWatchdog();
    clearConversationMessages();
    setSearchingUi("Searching for strangers...");
    prefetchIceServers();
    sendSearchRequest(attemptId, previousMatchId, "auto_connect_stall").catch(function () {
      if (attemptId !== searchAttemptId || userStopped) return;
      clearSearchWatchdog();
      searchActionPending = false;
      setLoader(false);
      setStatus("Video connection failed.");
    });
  }

  function sendWebrtcNegoFailed(reason) {
    try {
      if (!matchId || webrtcNegoFailSentMatchId === String(matchId)) return;
      webrtcNegoFailSentMatchId = String(matchId);
      send({ type: "webrtc_nego_failed", matchId: matchId, reason: String(reason || "unknown") });
    } catch (_) {}
  }

  function iceServersHaveTurn(list) {
    try {
      var servers = Array.isArray(list) ? list : [];
      for (var i = 0; i < servers.length; i++) {
        var urls = servers[i] && servers[i].urls;
        var items = Array.isArray(urls) ? urls : urls ? [urls] : [];
        for (var j = 0; j < items.length; j++) {
          var url = String(items[j] || "").toLowerCase();
          if (url.indexOf("turn:") === 0 || url.indexOf("turns:") === 0) return true;
        }
      }
    } catch (_) {}
    return false;
  }

  function fetchIceServersNow(forceRefresh) {
    if (iceFetchInflight && !forceRefresh) return iceFetchInflight;
    var url = "/api/webrtc/ice" + (forceRefresh ? "?refresh=1" : "");
    iceFetchInflight = fetchWsToken().then(function (token) {
      var did = "";
      try { did = String(getDeviceId() || "").trim(); } catch (_) {}
      return typeof fetch === "function" ? fetch(url, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Accept": "application/json",
          "X-Device-ID": did,
          "X-Video-Session": String(token || "")
        }
      }) : Promise.resolve(null);
    })
      .then(function (res) { return res && res.ok ? res.json() : null; })
      .then(function (payload) {
        if (payload && Array.isArray(payload.iceServers) && payload.iceServers.length) {
          iceServersTurn = payload.iceServers;
          iceServersStun = Array.isArray(payload.stunIceServers) && payload.stunIceServers.length
            ? payload.stunIceServers
            : [{ urls: "stun:stun.l.google.com:19302" }];
          turnFallbackOnly = !!payload.turnFallbackOnly;
          iceHasTurn = !!payload.hasTurn || iceServersHaveTurn(payload.iceServers);
          turnInitialGather = turnFallbackOnly && !FORCE_TURN_RELAY && shouldGatherTurnInitially();
          iceServers = (turnFallbackOnly && !FORCE_TURN_RELAY && !turnInitialGather) ? iceServersStun : iceServersTurn;
          iceLastFetchAt = Date.now();
          var cap = payload.turnVideoCap;
          if (cap && typeof cap === "object") {
            if (typeof cap.enabled === "boolean") TURN_VIDEO_CAP_ENABLED = !!cap.enabled;
            var maxKbps = Number(cap.maxKbps);
            var maxFps = Number(cap.maxFps);
            var scaleDownBy = Number(cap.scaleDownBy);
            if (isFinite(maxKbps) && maxKbps > 0) TURN_VIDEO_MAX_BITRATE_BPS = Math.round(maxKbps) * 1000;
            if (isFinite(maxFps) && maxFps > 0) TURN_VIDEO_MAX_FRAMERATE = Math.round(maxFps);
            if (isFinite(scaleDownBy) && scaleDownBy >= 1) TURN_VIDEO_SCALE_DOWN_BY = scaleDownBy;
          }
        }
        return payload;
      })
      .catch(function () { return null; })
      .finally(function () { iceFetchInflight = null; });
    return iceFetchInflight;
  }

  function shouldRefreshIceBeforePc() {
    if (!Array.isArray(iceServers) || !iceServers.length) return true;
    if (!iceLastFetchAt) return true;
    return Date.now() - iceLastFetchAt > 10 * 60 * 1000;
  }

  function ensureIceReadyForPeerConnection(forceRefresh) {
    if (!forceRefresh && !FORCE_TURN_RELAY && !shouldRefreshIceBeforePc()) return Promise.resolve();
    return fetchIceServersNow(!!forceRefresh || !!FORCE_TURN_RELAY).then(function () {});
  }

  function rtcConfigForCurrentMatch() {
    var usingRelayRetry = !!(matchId && turnRetryMatchId === String(matchId));
    var servers = usingRelayRetry && Array.isArray(iceServersTurn) && iceServersTurn.length
      ? iceServersTurn
      : iceServers;
    var config = { iceServers: Array.isArray(servers) && servers.length ? servers : [{ urls: "stun:stun.l.google.com:19302" }] };
    if (FORCE_TURN_RELAY || usingRelayRetry) config.iceTransportPolicy = "relay";
    return config;
  }

  function triggerTurnRetry(reason) {
    try {
      if (!matchId || !turnFallbackOnly || FORCE_TURN_RELAY || !iceHasTurn) return false;
      var retryMatchId = String(matchId);
      if (turnRetryMatchId === retryMatchId) return false;
      turnRetryMatchId = retryMatchId;
      if (Array.isArray(iceServersTurn) && iceServersTurn.length) iceServers = iceServersTurn;
      closePeerConnection();
      setRemoteVideoActive(false);
      setOverlay("connecting", "");
      setLoader(true, "Reconnecting video...");
      setStatus("Reconnecting video...");
      if (isInitiator()) {
        ensureIceReadyForPeerConnection(true).then(function () {
          if (!matchId || String(matchId) !== retryMatchId) return;
          startWebRtcAsOfferer();
        }).catch(function () {
          if (!matchId || String(matchId) !== retryMatchId) return;
          sendWebrtcNegoFailed(reason || "turn_retry_failed");
        });
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function applyTurnBitrateCap(currentPc, currentMatchId) {
    try {
      if (!currentPc || !currentMatchId || !TURN_VIDEO_CAP_ENABLED) return;
      if (turnBitrateAppliedMatchId === currentMatchId || typeof currentPc.getSenders !== "function") return;
      var attempted = false;
      (currentPc.getSenders() || []).forEach(function (sender) {
        if (!sender || !sender.track || sender.track.kind !== "video" ||
            typeof sender.getParameters !== "function" || typeof sender.setParameters !== "function") return;
        var parameters = sender.getParameters() || {};
        if (!Array.isArray(parameters.encodings) || !parameters.encodings.length) parameters.encodings = [{}];
        parameters.encodings.forEach(function (encoding) {
          encoding.maxBitrate = TURN_VIDEO_MAX_BITRATE_BPS;
          encoding.maxFramerate = TURN_VIDEO_MAX_FRAMERATE;
          if (TURN_VIDEO_SCALE_DOWN_BY > 1) encoding.scaleResolutionDownBy = TURN_VIDEO_SCALE_DOWN_BY;
        });
        attempted = true;
        sender.setParameters(parameters).catch(function () {});
      });
      if (attempted) turnBitrateAppliedMatchId = currentMatchId;
    } catch (_) {}
  }

  function outboundVideoBytes(stats) {
    var total = 0;
    var found = false;
    try {
      stats.forEach(function (record) {
        if (record.type !== "outbound-rtp" || record.isRemote) return;
        var kind = String(record.kind || record.mediaType || "");
        if (kind !== "video" || !isFinite(Number(record.bytesSent))) return;
        total += Math.max(0, Number(record.bytesSent));
        found = true;
      });
    } catch (_) {}
    return found ? total : null;
  }

  function reportSelectedCandidatePair() {
    try {
      if (!pc || !matchId || webrtcSelectedPairSentMatchId === String(matchId) || typeof pc.getStats !== "function") return;
      var currentMatchId = String(matchId);
      var currentPc = pc;
      currentPc.getStats(null).then(function (stats) {
        if (pc !== currentPc || !matchId || String(matchId) !== currentMatchId || webrtcSelectedPairSentMatchId === currentMatchId) return;
        var selected = null;
        stats.forEach(function (record) {
          if (record.type === "transport" && record.selectedCandidatePairId) {
            selected = stats.get(record.selectedCandidatePairId);
          }
          if (!selected && record.type === "candidate-pair" && record.state === "succeeded" && (record.selected || record.nominated)) {
            selected = record;
          }
        });
        if (!selected) return;
        var local = selected.localCandidateId ? stats.get(selected.localCandidateId) : null;
        var remote = selected.remoteCandidateId ? stats.get(selected.remoteCandidateId) : null;
        var localType = local && (local.candidateType || local.type || "");
        var remoteType = remote && (remote.candidateType || remote.type || "");
        var usesTurn = localType === "relay" || remoteType === "relay";
        var rtt = Number(selected.currentRoundTripTime || selected.totalRoundTripTime || 0);
        var turnUrl = localType === "relay" && local && local.url
          ? String(local.url)
          : remoteType === "relay" && remote && remote.url
            ? String(remote.url)
            : "";
        var relayProtocol = localType === "relay" && local && local.relayProtocol
          ? String(local.relayProtocol)
          : remoteType === "relay" && remote && remote.relayProtocol
            ? String(remote.relayProtocol)
            : "";
        var payload = {
          type: "webrtc_selected_pair",
          matchId: currentMatchId,
          usesTurn: usesTurn,
          localCandidateType: localType || undefined,
          remoteCandidateType: remoteType || undefined,
          turnFallbackOnly: !!turnFallbackOnly,
          turnInitialGather: !!turnInitialGather,
          turnRetried: turnRetryMatchId === currentMatchId,
          turnUrl: turnUrl || undefined,
          relayProtocol: relayProtocol || undefined
        };
        if (isFinite(rtt) && rtt > 0) payload.rttMs = Math.round(rtt * 1000);
        if (usesTurn) applyTurnBitrateCap(currentPc, currentMatchId);
        webrtcSelectedPairSentMatchId = currentMatchId;
        send(payload);
        var bytesAtStart = outboundVideoBytes(stats);
        var sampledAt = Date.now();
        window.setTimeout(function () {
          if (pc !== currentPc || !matchId || String(matchId) !== currentMatchId || typeof currentPc.getStats !== "function") return;
          currentPc.getStats(null).then(function (laterStats) {
            if (pc !== currentPc || !matchId || String(matchId) !== currentMatchId) return;
            var bytesNow = outboundVideoBytes(laterStats);
            var elapsedMs = Date.now() - sampledAt;
            if (bytesAtStart === null || bytesNow === null || bytesNow < bytesAtStart || elapsedMs < 500) return;
            send({
              type: "webrtc_selected_pair",
              matchId: currentMatchId,
              usesTurn: usesTurn,
              localCandidateType: localType || undefined,
              remoteCandidateType: remoteType || undefined,
              rttMs: isFinite(rtt) && rtt > 0 ? Math.round(rtt * 1000) : undefined,
              videoOutKbps: Math.max(0, Math.round(((bytesNow - bytesAtStart) * 8) / elapsedMs)),
              turnFallbackOnly: !!turnFallbackOnly,
              turnInitialGather: !!turnInitialGather,
              turnRetried: turnRetryMatchId === currentMatchId,
              turnUrl: turnUrl || undefined,
              relayProtocol: relayProtocol || undefined,
              telemetryOnly: true
            });
          }).catch(function () {});
        }, 2500);
      }).catch(function () {});
    } catch (_) {}
  }

  function createPeerConnection() {
    closePeerConnection();
    var pcRef = new RTCPeerConnection(rtcConfigForCurrentMatch());
    var generation = ++pcGeneration;
    pc = pcRef;
    pcRef.onicecandidate = function (event) {
      if (pc !== pcRef || generation !== pcGeneration) return;
      if (event.candidate && matchId) {
        sendIceCandidate(matchId, event.candidate);
      }
    };
    pcRef.ontrack = function (event) {
      if (pc !== pcRef || generation !== pcGeneration) return;
      var incoming = event.streams && event.streams[0] ? event.streams[0] : null;
      var peerVideo = $("video-peer");
      var blur = $("video-peer-blur");
      if (!remoteStream) remoteStream = new MediaStream();
      if (incoming) {
        incoming.getTracks().forEach(function (track) {
          if (!remoteStream.getTracks().some(function (existing) { return existing.id === track.id; })) {
            try { remoteStream.addTrack(track); } catch (_) {}
          }
        });
      } else if (event.track) {
        try { remoteStream.addTrack(event.track); } catch (_) {}
      }
      var hasVideoTrack = remoteStream.getVideoTracks().some(function (track) { return track.readyState === "live"; });
      function activateRemoteVideo() {
        if (pc !== pcRef || generation !== pcGeneration) return;
        if (!peerVideo) return;
        var hasFrame = peerVideo.videoWidth > 0 && peerVideo.videoHeight > 0;
        var isPlaying = !peerVideo.paused && !peerVideo.ended && peerVideo.readyState >= 3;
        if (!hasFrame || !isPlaying) return;
        setRemoteVideoActive(true);
        startModerationScreenshots();
        setLoader(false);
        setOverlay("", "");
        setStatus("");
        updateActionButtons();
      }
      if (peerVideo) {
        peerVideo.srcObject = remoteStream;
        peerVideo.onloadedmetadata = null;
        peerVideo.onloadeddata = null;
        peerVideo.oncanplay = null;
        peerVideo.onplaying = activateRemoteVideo;
        peerVideo.ontimeupdate = activateRemoteVideo;
        peerVideo.onpause = updateActionButtons;
        peerVideo.onstalled = updateActionButtons;
        peerVideo.onwaiting = updateActionButtons;
        try { peerVideo.play().catch(function () {}); } catch (_) {}
      }
      if (blur) {
        blur.srcObject = remoteStream;
        try { blur.play().catch(function () {}); } catch (_) {}
      }
      if (hasVideoTrack) window.setTimeout(activateRemoteVideo, 0);
    };
    pcRef.onconnectionstatechange = function () {
      if (pc !== pcRef || generation !== pcGeneration) return;
      if (pcRef.connectionState === "connected") {
        setStatus("");
        reportSelectedCandidatePair();
      }
      if (pcRef.connectionState === "failed") {
        if (triggerTurnRetry("connection_failed")) return;
        sendWebrtcNegoFailed("connection_failed");
        setStatus("Video connection interrupted");
      }
      if (pcRef.connectionState === "disconnected") {
        setStatus("Video connection interrupted");
      }
    };
    pcRef.oniceconnectionstatechange = function () {
      if (pc !== pcRef || generation !== pcGeneration) return;
      var state = String(pcRef.iceConnectionState || "");
      if (state === "connected" || state === "completed") reportSelectedCandidatePair();
      if (state === "failed") {
        if (triggerTurnRetry("ice_failed")) return;
        sendWebrtcNegoFailed("ice_failed");
      }
    };
    if (localStream) {
      localStream.getTracks().forEach(function (track) {
        try { pcRef.addTrack(track, localStream); } catch (_) {}
      });
    }
    if (FORCE_TURN_RELAY || (matchId && turnRetryMatchId === String(matchId))) {
      applyTurnBitrateCap(pcRef, String(matchId || ""));
    }
    return pcRef;
  }

  function isInitiator() {
    if (!myUserId || !partnerUserId) return false;
    return String(myUserId) < String(partnerUserId);
  }

  function queuePendingRemoteIce(candidate) {
    if (!candidate) return;
    if (pendingIce.length >= MAX_PENDING_REMOTE_ICE) pendingIce.shift();
    pendingIce.push(candidate);
  }

  function flushIce() {
    if (!pc || !pc.remoteDescription) return;
    var list = pendingIce.slice();
    pendingIce = [];
    list.forEach(function (candidate) {
      try { pc.addIceCandidate(candidate).catch(function () {}); } catch (_) {}
    });
  }

  function startWebRtcAsOfferer() {
    ensureLocalMedia().then(function () {
      return ensureIceReadyForPeerConnection(false);
    }).then(function () {
      var offerMatchId = String(matchId || "");
      if (!offerMatchId) return;
      var offerMode = turnRetryMatchId === offerMatchId ? "relay" : "direct";
      if (isInitiator() && sdpOfferSentByMatch[offerMatchId] === offerMode) return;
      if (isInitiator()) sdpOfferSentByMatch[offerMatchId] = offerMode;
      var current = createPeerConnection();
      if (!isInitiator()) return;
      return current.createOffer()
        .then(function (offer) {
          if (pc !== current || !matchId || String(matchId) !== offerMatchId) return null;
          return current.setLocalDescription(offer).then(function () { return offer; });
        })
        .then(function (offer) {
          if (!offer || pc !== current || !matchId || String(matchId) !== offerMatchId) return;
          return sendSdpSignalAsync("webrtc_offer", offerMatchId, offer.sdp);
        });
    }).catch(function (err) {
      if (matchId) delete sdpOfferSentByMatch[String(matchId)];
      sendWebrtcNegoFailed("offer_failed");
      addMessage("system", "", err && err.message ? err.message : "Video setup failed.");
    });
  }

  function handleOffer(msg) {
    if (!matchId || msg.matchId !== matchId) return;
    signalSdpAsync(msg).then(function (offerSdp) {
      if (!offerSdp) return;
      var offerKey = sdpSignalKey(offerSdp);
      if (sdpOfferHandledByMatch[String(msg.matchId)] === offerKey) return;
      return ensureLocalMedia().then(function () {
      return ensureIceReadyForPeerConnection(false);
    }).then(function () {
      if (!matchId || msg.matchId !== matchId) return;
      if (pc && (pc.signalingState === "closed" || pc.connectionState === "failed" || pc.iceConnectionState === "failed")) {
        closePeerConnection();
      }
      var current = pc || createPeerConnection();
      return current.setRemoteDescription({ type: "offer", sdp: offerSdp })
        .then(function () {
          if (pc !== current || !matchId || msg.matchId !== matchId) return null;
          flushIce();
          return current.createAnswer();
        })
        .then(function (answer) {
          if (!answer || pc !== current || !matchId || msg.matchId !== matchId) return null;
          return current.setLocalDescription(answer).then(function () { return answer; });
        })
        .then(function (answer) {
          if (!answer || pc !== current || !matchId || msg.matchId !== matchId) return;
          sdpOfferHandledByMatch[String(msg.matchId)] = offerKey;
          sdpAnswerSentByMatch[String(msg.matchId)] = sdpSignalKey(answer.sdp);
          return sendSdpSignalAsync("webrtc_answer", matchId, answer.sdp);
        });
      });
    }).catch(function (err) {
      sendWebrtcNegoFailed("answer_failed");
      addMessage("system", "", err && err.message ? err.message : "Video answer failed.");
    });
  }

  function handleSocketMessage(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === "ui_action") {
      try {
        var action = String(msg.action || "");
        var ms = Number(msg.ms || 0);
        if (action === "disable_skip" && ms > 0) disableSkipButtonForMs(ms);
        if (action === "investigation_lock") {
          if (msg.enabled !== false) {
            investigationLockActive = true;
            showTerminalSystemState(msg.subtitle || msg.title || "This chat is temporarily locked for moderation review.");
            setChatControlsEnabled(false);
          } else {
            investigationLockActive = false;
            setChatControlsEnabled(true);
          }
        }
        if (action === "mod_strike") {
          showModStrike(msg.strikes, msg.max, msg.banText || "");
          if (msg.requireAck) {
            showStrikeModal(
              msg.triggerText || "",
              msg.guidelinesUrl || "/community-guidelines.html",
              msg.ackTimeoutSec || 10,
              msg.strikes,
              msg.max,
              msg.banText || "",
              msg.ruleKey || ""
            );
          }
        }
      } catch (_) {}
      return;
    }
    if (msg.type === "session") {
      myUserId = String(msg.userId || myUserId || "");
      isAdminSession = !!msg.isAdmin;
      applyDefaultCountryFromGeo(msg.countryCode || msg.clientCountryCode || "");
      return;
    }
    if (msg.type === "resume_ok") {
      if (signalingResumeMatchId &&
          String(msg.matchId || "") === signalingResumeMatchId &&
          String(matchId || "") === signalingResumeMatchId) {
        clearSignalingResume();
        // The edge re-adopted our previous identity; restore it locally so
        // isInitiator() stays consistent for any later renegotiation.
        if (msg.userId) myUserId = String(msg.userId);
        setLoader(false);
        setStatus("");
      }
      return;
    }
    if (msg.type === "resume_failed") {
      if (signalingResumeMatchId && String(msg.matchId || "") === signalingResumeMatchId) {
        failSignalingResume();
      }
      return;
    }
    if (msg.type === "showIpResponse") {
      var ipData = msg.data;
      if (ipData && typeof ipData === "object") {
        var peerIp = String(ipData.peerIp || "");
        var ipUrl = String(ipData.url || "");
        var ipLabel = String(ipData.message || "Remote Peer IP");
        if (peerIp && ipUrl) {
          var messages = $("messages");
          if (messages) {
            var div = document.createElement("div");
            div.className = "message message-system";
            var span = document.createElement("span");
            span.className = "message-text";
            span.textContent = ipLabel + ": ";
            div.appendChild(span);
            var link = document.createElement("a");
            link.href = ipUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = peerIp;
            div.appendChild(link);
            messages.appendChild(div);
            var typingNode = $("typing");
            if (typingNode && typingNode.parentNode === messages) messages.appendChild(typingNode);
            messages.scrollTop = messages.scrollHeight;
          }
        } else {
          addMessage("system", "", "No peer connected");
        }
      } else {
        addMessage("system", "", String(ipData || ""));
      }
      return;
    }
    if (msg.type === "redirect") {
      if (msg.url) {
        try {
          var redirectUrl = String(msg.url || "");
          var parsedRedirect = new URL(redirectUrl, window.location.href);
          if (parsedRedirect.pathname === "/video.html" && parsedRedirect.searchParams.has("cv")) {
            console.warn("[video] Ignoring client-version redirect while version enforcement is paused", redirectUrl);
            return;
          }
          window.location.href = redirectUrl;
        } catch (_) {}
      }
      return;
    }
    if (msg.type === "stats") {
      updateOnlineCount(msg.online);
      return;
    }
    if (msg.type === "screenshot_check") {
      if (msg.matchId && String(msg.matchId) !== String(matchId || "")) return;
      reportScreenshotDiagnostic("screenshot_check_received", {
        reason: String(msg.reason || "server_probe"),
        afterMs: Number(msg.afterMs || 0)
      }, true);
      if (!matchId) return;
      if (!moderationScreenshotInFlight) {
        captureModerationScreenshot().then(function (result) {
          if (!matchId) return;
          if (result === "not_ready") scheduleNextModerationScreenshot(1500);
          else if (result === "client_throttled") scheduleNextModerationScreenshot(moderationScreenshotThrottleDelayMs || moderationScreenshotClientThrottleMs());
        });
      } else {
        reportScreenshotDiagnostic("capture_skipped", { reason: "server_probe_in_flight" }, true);
      }
      return;
    }
    if (msg.type === "system") {
      var systemText = String(msg.text || "");
      if (/please wait|now talking/i.test(systemText)) {
        setStatus(systemText);
        return;
      }
      addMessage("system", "", systemText);
      return;
    }
    if (msg.type === "error") {
      if (String(msg.code || "") === "connection error") {
        connectionErrorActive = true;
        banModalActive = true;
        showTerminalSystemState("Connection error.");
        try { if (ws) ws.close(); } catch (_) {}
        return;
      }
      if (String(msg.code || "") === "video_proof_required") {
        invalidateSearchProof();
        clearSearchWatchdog();
        isSearching = false;
        searchActionPending = false;
        setLoader(false);
        if (!userStopped && !matchId && proofFailureRetries < PROOF_FAILURE_RETRY_MAX) {
          proofFailureRetries += 1;
          setStartLabel("Next");
          setLoader(true, "Searching for strangers...");
          setOverlay("searching", "Searching for strangers...");
          setStatus("Searching for strangers...");
          scheduleSearchRetry(350, true);
          return;
        }
        proofFailureRetries = 0;
        clearSearchLifetime();
        setStartLabel("Start");
        setLoader(false);
        setOverlay("ready", "");
        setStatus(msg.message || "Live camera proof required before video search.");
        updateActionButtons();
        return;
      }
      if (String(msg.code || "") === "vpn_blocked") {
        vpnBlockedActive = true;
        banModalActive = true;
        showTerminalSystemState("VPN or proxy connections are not allowed.");
        try { if (ws) ws.close(); } catch (_) {}
        return;
      }
      var errorText = String(msg.message || msg.code || "Please wait a moment.");
      if (/please wait|wait a moment|too fast|rate/i.test(errorText)) {
        searchActionPending = false;
        if (isSearching && !matchId) {
          setStartLabel("Next");
          setLoader(true, "Searching for strangers...");
          setStatus("Searching for strangers...");
          setOverlay("searching", "Searching for strangers...");
          scheduleSearchRetry(1700, false);
        } else {
          setStatus(errorText);
        }
        return;
      }
      setStatus(errorText);
      if (isSearching && !matchId) {
        clearSearchWatchdog();
        stopSearchUi(isMobileViewport() ? "" : "Search failed");
        setOverlay("ready", "");
      }
      return;
    }
    if (msg.type === "banned") {
      banModalActive = true;
      // The ws close handler early-returns while the ban modal is active, so
      // tear the call down here or the peer connection would stay open.
      clearSignalingResume();
      matchId = "";
      partnerUserId = "";
      closePeerConnection();
      showBanModal(msg);
      try { ws.close(); } catch (_) {}
      return;
    }
    if (msg.type === "match_found") {
      clearSignalingResume();
      clearSearchRetryTimer();
      clearSearchWatchdog();
      resetSearchWatchdogMisses();
      clearSearchLifetime();
      proofFailureRetries = 0;
      clearReportGrace();
      clearVoteGrace();
      clearVotePanelExpiry();
      webrtcNegoFailSentMatchId = "";
      webrtcSelectedPairSentMatchId = "";
      turnRetryMatchId = "";
      sdpOfferSentByMatch = {};
      sdpAnswerSentByMatch = {};
      sdpOfferHandledByMatch = {};
      matchId = String(msg.matchId || "");
      if (matchId && gaMatchFoundSentId !== matchId) {
        gaMatchFoundSentId = matchId;
        gaConnectedSentId = "";
        sendVideoAnalyticsEvent("video_match_found", {
          match_id_present: 1,
          match_mode: String(msg.matchMode || "random")
        });
      }
      myUserId = String(msg.userId || myUserId || "");
      partnerUserId = String(msg.partnerUserId || "");
      setRemoteCountryFlag(msg.partnerCountryCode || msg.peerCountryCode || "");
      setPartnerVoteScore(msg.partnerVoteScore || { upvotes: 0, downvotes: 0, score: 0 });
      updateVoteControls();
      isSearching = false;
      searchActionPending = false;
      matchConnectingSince = Date.now();
      window.setTimeout(updateActionButtons, CONNECTING_NEXT_ESCAPE_MS + 100);
      setStartLabel("Next");
      setLoader(true, "Connecting video...");
      setStatus("");
      setRemoteVideoActive(false);
      setOverlay("connecting", "");
      updateMobileSwipeHintVisibility();
      send({ type: "device_info", matchId: matchId, videoLabel: cameraLabel() || undefined, clientVersion: VIDEO_CLIENT_VERSION });
      reportScreenshotMatchStartDiagnostic();
      startModerationScreenshots();
      try {
        if (!isMobileViewport()) {
          var interests = savedInterests();
          if (msg.matchMode === "interest" && msg.matchedInterest) {
            addMessage("system", "", 'Matched on interest: "' + String(msg.matchedInterest) + '"');
          } else if (interests.length) {
            addMessage("system", "", "Matched randomly. No shared interests found.");
          }
        }
      } catch (_) {}
      startWebRtcAsOfferer();
      armConnectWatchdog(CONNECT_WATCHDOG_MS);
      return;
    }
    if (msg.type === "partner_disconnected") {
      resetSearchWatchdogMisses();
      clearConnectWatchdog();
      if (msg.matchId && msg.matchId !== matchId) return;
      var endedMatchId = String(matchId || msg.matchId || "");
      sendVideoAnalyticsEvent("video_match_ended", {
        match_id_present: endedMatchId ? 1 : 0,
        reason: String(msg.reason || "partner_disconnected")
      });
      beginReportGrace(endedMatchId);
      beginVoteGrace(endedMatchId);
      matchId = "";
      partnerUserId = "";
      turnRetryMatchId = "";
      closePeerConnection();
      if (isMobileViewport()) clearConversationMessages();
      updateVoteControls();
      // The server set us IDLE when this match ended and only re-enqueues
      // us when a new search request arrives. Skip startSearch() solely
      // while a next/find_partner is still in flight (searchActionPending):
      // that request will re-enqueue us. isSearching and the cube-cue
      // suppression window are not proof of a server-side search — once a
      // request is actually sent, matchId is already "" and the matchId
      // guard above drops this message, so here they can only be stale.
      var searchRequestInFlight = searchActionPending;
      searchActionPending = false;
      if (userStopped || isUrlCommandMode()) {
        showReadyAfterDisconnect();
      } else if (searchRequestInFlight) {
        isSearching = true;
        // Preserve the attempt id: the in-flight next/find_partner request is
        // the thing that will re-enqueue us, so it must not be invalidated.
        beginSearchWatchdog(true);
        setSearchingUi("Searching for strangers...");
        updateActionButtons();
      } else if (!isAutoConnectEnabled()) {
        playRemoteSwipeCue(-1);
        showReadyAfterDisconnect();
      } else {
        playRemoteSwipeCue(-1);
            isSearching = false;
        startSearch();
      }
      return;
    }
    if (msg.type === "partner_typing") {
      var typing = $("typing");
      document.body.classList.toggle("video2-partner-typing", !!msg.isTyping);
      if (typing) {
        typing.style.display = msg.isTyping ? "" : "none";
        var messages = $("messages");
        if (msg.isTyping && messages) messages.scrollTop = messages.scrollHeight;
      }
      return;
    }
    if (msg.type === "partner_device_info") {
      text($("webcam-label"), msg.videoLabel || "Stranger's camera");
      return;
    }
    if (msg.type === "partner_geo") {
      if (msg.matchId && String(msg.matchId) !== String(matchId)) return;
      setRemoteCountryFlag(msg.partnerCountryCode || msg.peerCountryCode || msg.countryCode || "");
      return;
    }
    if (msg.type === "admin_peer_info") {
      if (!isAdminSession) return;
      if (msg.matchId && String(msg.matchId) !== String(matchId)) return;
      return;
    }
    if (msg.type === "vote_update") {
      if (!matchId || (msg.matchId && String(msg.matchId) !== String(matchId))) return;
      if (msg.ok === false && msg.matchId) {
        delete userVoteByMatchId[String(msg.matchId)];
        clearVotePanelExpiry();
      }
      if (msg.targetScore) setPartnerVoteScore(msg.targetScore);
      if (msg.ok && msg.matchId && msg.vote) userVoteByMatchId[String(msg.matchId)] = Number(msg.vote) === -1 ? -1 : 1;
      updateVoteControls();
      return;
    }
    if (msg.type === "chat_message") {
      var typingNode = $("typing");
      if (typingNode) typingNode.style.display = "none";
      var mine = msg.from === "you";
      addMessage(mine ? "you" : "stranger", mine ? "You" : "Stranger", msg.text || "");
      return;
    }
    if (msg.type === "webrtc_offer") {
      handleOffer(msg);
      return;
    }
    if (msg.type === "webrtc_answer") {
      if (pc && msg.matchId === matchId) {
        // Ignore stale/duplicate answers (e.g. the answer to a previous
        // offer arriving after a watchdog renegotiation recreated the pc).
        if (String(pc.signalingState || "") !== "have-local-offer") return;
        var answerPc = pc;
        var answerMatchId = String(matchId || "");
        signalSdpAsync(msg).then(function (answerSdp) {
          if (!answerSdp || pc !== answerPc || msg.matchId !== matchId || String(matchId || "") !== answerMatchId) return;
          if (String(answerPc.signalingState || "") !== "have-local-offer") return;
          return answerPc.setRemoteDescription({ type: "answer", sdp: answerSdp }).then(function () {
            if (pc === answerPc && String(matchId || "") === answerMatchId) flushIce();
          });
        }).catch(function () {
          sendWebrtcNegoFailed("answer_handler_error");
        });
      }
      return;
    }
    if (msg.type === "webrtc_ice_candidate") {
      if (!msg.candidate || msg.matchId !== matchId) return;
      if (!pc || !pc.remoteDescription) {
        queuePendingRemoteIce(msg.candidate);
        return;
      }
      pc.addIceCandidate(msg.candidate).catch(function () {});
      return;
    }
    if (msg.type === "webrtc_ice_candidates") {
      if (!Array.isArray(msg.candidates) || msg.matchId !== matchId) return;
      for (var cbi = 0; cbi < msg.candidates.length; cbi++) {
        var batchedCandidate = msg.candidates[cbi];
        if (!batchedCandidate || !batchedCandidate.candidate) continue;
        if (!pc || !pc.remoteDescription) {
          queuePendingRemoteIce(batchedCandidate);
          continue;
        }
        pc.addIceCandidate(batchedCandidate).catch(function () {});
      }
      return;
    }
  }

  function searchingStatusText() {
    var country = selectedCountry();
    return country
      ? ("Searching " + country + interestStatusSuffix())
      : ("Looking for people online" + interestStatusSuffix());
  }

  function setSearchingUi(statusText) {
    setStartLabel("Next");
    setLoader(true, "Searching for strangers...");
    setStatus(statusText || "Searching for strangers...");
    setOverlay("searching", "Searching for strangers...");
  }

  // Re-enter the "in a live match" UI after an aborted skip (slow or failed
  // proof step). The optimistic searching UI already hid the remote video and
  // marked it inactive; undo that so the user sees they're still connected.
  function restoreActiveMatchUi(statusText) {
    if (!matchId) return;
    setStartLabel("Next");
    setLoader(false);
    setStatus(statusText || "");
    if (remoteVideoIsActuallyPlaying()) {
      setRemoteVideoActive(true);
      setOverlay("", "");
    } else {
      setOverlay("connecting", "");
    }
    updateActionButtons();
  }

  function prefetchIceServers() {
    if (shouldRefreshIceBeforePc()) fetchIceServersNow(false);
  }

  function sendSearchRequest(attemptId, previousMatchId, searchKind) {
    return ensureFaceBlinkVerified(searchKind || (previousMatchId ? "next" : "search")).then(function () {
      return requestSearchProof();
    }).then(function (token) {
      if (attemptId !== searchAttemptId || userStopped) return false;
      var country = selectedCountry();
      var prefs = {};
      if (country) prefs.country = country;
      applySearchPrefs(prefs);
      seq += 1;
      sendClientVersion(previousMatchId ? "next" : "search");
      send({
        type: matchId ? "next" : "find_partner",
        seq: seq,
        bucket: "global",
        chatType: "video",
        prefs: prefs,
        videoLabel: cameraLabel() || undefined,
        clientVersion: VIDEO_CLIENT_VERSION,
        videoProofToken: token || undefined
      });
      sendVideoAnalyticsEvent("video_search_started", {
        search_kind: String(searchKind || (previousMatchId ? "next" : "start")),
        previous_match: previousMatchId ? 1 : 0,
        country_filter: country ? 1 : 0
      });
      if (previousMatchId) {
        beginReportGrace(previousMatchId);
        beginVoteGrace(previousMatchId);
      }
      clearSignalingResume();
      matchId = "";
      partnerUserId = "";
      closePeerConnection();
      updateVoteControls();
      isSearching = true;
      searchActionPending = false;
      clearConversationMessages();
      setSearchingUi(searchingStatusText());
      return true;
    });
  }

  function startSearch(preserveSearchLifetime) {
    if (banModalActive || vpnBlockedActive || connectionErrorActive) return;
    clearSearchRetryTimer();
    try {
      if (banStatusCache && banStatusCache.banned) {
        showBanModal(banStatusCache);
        return;
      }
      void preflightBanCheck(false);
    } catch (_) {}
    if (searchActionPending || isSearching) {
      setStartLabel("Next");
      setStatus("Searching for strangers...");
      return;
    }
    resetSearchWatchdogMisses();
    if (!preserveSearchLifetime) clearSearchLifetime();
    proofFailureRetries = 0;
    markSearchStarted(!preserveSearchLifetime);
    var attemptId = beginSearchWatchdog();
    userStopped = false;
    searchActionPending = true;
    isSearching = true;
    clearConversationMessages();
    setSearchingUi(searchingStatusText());
    connectSocket();
    prefetchIceServers();
    ensureLocalMedia()
      .then(function () { return sendSearchRequest(attemptId, "", preserveSearchLifetime ? "retry" : "start"); })
      .catch(function (err) {
        if (attemptId !== searchAttemptId || userStopped) return;
        searchActionPending = false;
        // The local-feed notice already shows the full message; keep status short.
        stopSearchUi("Camera required");
      });
  }

  function retrySearchRequest() {
    if (banModalActive || vpnBlockedActive || connectionErrorActive || userStopped || matchId) return;
    clearSearchRetryTimer();
    var attemptId = beginSearchWatchdog();
    isSearching = true;
    searchActionPending = true;
    setSearchingUi(searchingStatusText());
    connectSocket();
    prefetchIceServers();
    sendSearchRequest(attemptId, "", "retry").catch(function () {
      if (attemptId !== searchAttemptId || userStopped || matchId) return;
      searchActionPending = false;
      isSearching = false;
      stopSearchUi("Camera required");
    });
  }

  function cancelOrNext() {
    var label = String(($("skip-btn") && $("skip-btn").getAttribute("data-label")) || "");
    if (label === "Next" && !canUseNextAction()) {
      if (matchId && !remoteVideoActive) setStatus("Connecting video...");
      else if (isSearching || searchActionPending) setStatus("Searching for strangers...");
      updateActionButtons();
      return;
    }
    if (label !== "Next" && !canUseStartAction()) {
      updateActionButtons();
      return;
    }
    if (searchActionPending) {
      setStartLabel("Next");
      setStatus("Searching for strangers...");
      return;
    }
    if (isSearching && !matchId) {
      setStartLabel("Next");
      setStatus("Searching for strangers...");
      return;
    }
    if (matchId) {
      if (!remoteVideoActive && !connectingNextEscapeActive()) {
        setStatus("Connecting video...");
        updateActionButtons();
        return;
      }
      var previousMatchId = String(matchId || "");
      markLocalNextCueSuppressed(3200);
      userStopped = false;
      searchActionPending = true;
      sendVideoAnalyticsEvent("video_next_requested", {
        previous_match: previousMatchId ? 1 : 0
      });
      var attemptId = beginSearchWatchdog();
      // Conversation is cleared inside sendSearchRequest once the skip is
      // actually sent — clearing it here would lose the chat if the proof
      // step fails and we stay in the current match.
      setSearchingUi("Searching for strangers...");
      prefetchIceServers();
      sendSearchRequest(attemptId, previousMatchId, "next")
        .catch(function (err) {
          if (attemptId !== searchAttemptId || userStopped) return;
          clearSearchWatchdog();
          searchActionPending = false;
          if (matchId) {
            restoreActiveMatchUi(err && err.message ? err.message : "Skip failed. Tap Next to try again.");
          } else {
            setLoader(false);
            setStatus(err && err.message ? err.message : "Camera proof failed.");
          }
        });
      return;
    }
    startSearch();
  }

  function stopToReady() {
    if (!canUseStopAction()) {
      updateActionButtons();
      return;
    }
    userStopped = true;
    clearSignalingResume();
    clearSearchWatchdog();
    clearSearchRetryTimer();
    clearConnectWatchdog();
    resetSearchWatchdogMisses();
    clearSearchLifetime();
    proofFailureRetries = 0;
    var stoppedMatchId = String(matchId || "");
    if (isSearching || matchId) {
      seq += 1;
      send({ type: "cancel", seq: seq, chatType: "video" });
    }
    beginReportGrace(stoppedMatchId);
    beginVoteGrace(stoppedMatchId);
    matchId = "";
    partnerUserId = "";
    closePeerConnection();
    if (isMobileViewport()) clearConversationMessages();
    updateVoteControls();
    isSearching = false;
    searchActionPending = false;
    setStartLabel("Start");
    setLoader(false);
    setStatus("");
    setOverlay("ready", "");
  }

  function sendChat() {
    var input = $("message-input");
    var value = input ? String(input.value || "").trim() : "";
    if (!value) return;
    if (value === "/showbanned") {
      showBanModal({
        reason: "Violation of community guidelines.",
        bannedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        lastScreenshot: null,
        unbanPrice: 10.99,
        demoMode: true
      });
      if (input) input.value = "";
      return;
    }
    if (value === "/clear") {
      clearConversationMessages();
      if (input) input.value = "";
      return;
    }
    if (value === "/stop") {
      if (isSearching || matchId) stopToReady();
      else addMessage("system", "", "Nothing to stop.");
      if (input) input.value = "";
      return;
    }
    if (value.indexOf("/ban") === 0) {
      var parts = value.split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        addMessage("system", "", "Usage: /ban <ip> [minutes]");
        if (input) input.value = "";
        return;
      }
      var ip = parts[1];
      var mins = parts.length >= 3 ? parts[2] : "";
      send({ type: "cmd", text: "/cmd ban " + ip + (mins ? " " + mins : "") });
      if (input) input.value = "";
      return;
    }
    if (value.indexOf("/cmd ") === 0 || value === "/cmd") {
      send({ type: "cmd", text: value });
      if (input) input.value = "";
      return;
    }
    if (!quickEmojiActive()) return;
    if (!canSendChatNow()) return;
    send({ type: "chat_message", matchId: matchId, text: value });
    if (input) input.value = "";
    send({ type: "typing", matchId: matchId, isTyping: false });
  }

  function sendQuickEmoji(value) {
    var emoji = String(value || "").trim();
    if (!emoji || !quickEmojiActive()) return;
    if (!canSendChatNow()) return;
    send({ type: "chat_message", matchId: matchId, text: emoji });
    send({ type: "typing", matchId: matchId, isTyping: false });
  }

  function bindSafetyNotice() {
    var drawer = document.getElementById("safetyInfoDrawer");
    var closeBtn = document.getElementById("safetyInfoClose");
    if (!drawer || drawer.__safetyNoticeBound) return;
    function setPanel(panel) {
      var next = panel === "safety" ? "safety" : "rules";
      drawer.querySelectorAll(".safety-info-tab").forEach(function (tab) {
        var active = tab.getAttribute("data-info-tab") === next;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
      });
      drawer.querySelectorAll(".safety-info-panel").forEach(function (content) {
        content.classList.toggle("is-active", content.getAttribute("data-info-panel-content") === next);
      });
    }
    function openDrawer(panel) {
      setPanel(panel);
      drawer.classList.add("open");
      drawer.setAttribute("aria-hidden", "false");
    }
    function closeDrawer() {
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
    }
    drawer.__safetyNoticeBound = true;
    document.addEventListener("click", function (ev) {
      var target = ev && ev.target && ev.target.closest ? ev.target.closest(".video2-info-link") : null;
      if (!target) return;
      try { ev.preventDefault(); } catch (_) {}
      openDrawer(target.getAttribute("data-info-panel") || "rules");
    });
    drawer.querySelectorAll(".safety-info-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        setPanel(tab.getAttribute("data-info-tab") || "rules");
      });
    });
    if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
    drawer.addEventListener("click", function (ev) { if (ev && ev.target === drawer) closeDrawer(); });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && drawer.classList.contains("open")) closeDrawer();
    });
  }
  function bindPremiumDrawer() {
    var openerIds = ["premiumUiBtn", "video2PremiumTile"];
    var openBtns = openerIds.map(function (id) { return document.getElementById(id); }).filter(Boolean);
    var drawer = document.getElementById("premiumDrawer");
    var headerMenuBtn = document.getElementById("headerMenuBtn");
    var closeBtn = document.getElementById("premiumDrawerClose");
    var checkoutBtn = document.getElementById("premiumMockCheckoutBtn");
    var manageBtn = document.getElementById("premiumMockManageBtn");
    var restoreEmailInput = document.getElementById("premiumRestoreEmail");
    var restoreEmailBtn = document.getElementById("premiumRestoreEmailBtn");
    var note = document.getElementById("premiumMockNote");
    var statusText = note ? note.querySelector(".premium-status-text") : null;
    if (!drawer || drawer.__premiumDrawerBound) return;
    var statusInflight = null;
    var statusCache = null;
    function readJson(response) {
      return response.json().then(function (json) {
        if (!response.ok) throw new Error((json && json.error) || "request_failed");
        return json;
      });
    }
    function setNote(text) {
      if (!note) return;
      note.classList.remove("is-trust");
      if (statusText) statusText.textContent = text;
    }
    function setTrustNote() {
      if (!note) return;
      note.classList.add("is-trust");
      if (statusText) statusText.textContent = "";
    }
    function setBusy(button, busy, text) {
      if (!button) return;
      button.disabled = !!busy;
      if (text) button.textContent = text;
    }
    function formatPremiumDate(value) {
      try {
        if (!value) return "";
        return new Date(value).toLocaleDateString();
      } catch (_) {
        return "";
      }
    }
    function premiumStatusText(status) {
      return String(status && status.subscriptionStatus ? status.subscriptionStatus : "").trim().toLowerCase();
    }
    function premiumCancellationMessage(endDate) {
      return endDate
        ? ("Your subscription cancellation is confirmed. Premium stays active until " + endDate + ". You will not be charged again for this subscription.")
        : "Your subscription cancellation is confirmed. Premium stays active until the end of the current paid period. You will not be charged again for this subscription.";
    }
    function fetchPremiumStatus(force) {
      if (!force && statusCache) return Promise.resolve(statusCache);
      if (statusInflight) return statusInflight;
      statusInflight = window.fetch("/api/premium/status", { method: "GET", cache: "no-store" })
        .then(readJson)
        .then(function (status) {
          statusCache = status || {};
          premiumStatusCache = statusCache;
          premiumStatusCacheAt = Date.now();
          statusInflight = null;
          return statusCache;
        })
        .catch(function (err) {
          statusInflight = null;
          throw err;
        });
      return statusInflight;
    }
	    function refreshPremiumStatus(force) {
	      setNote("Loading premium status...");
	      return fetchPremiumStatus(force).then(function (status) {
	        sendPremiumAnalyticsEvent("premium_status_loaded", {
	          premium_active: !!(status && status.premiumActive),
	          subscription_status: premiumStatusText(status) || "none",
	          billing_period: String(status && status.billingPeriod ? status.billingPeriod : "week").toLowerCase(),
	          price_usd: Number(status && status.priceUsd ? status.priceUsd : 9.99) || 9.99
	        });
	        var renewalAmount = drawer.querySelector(".premium-renewal-amount");
        var renewalPeriod = drawer.querySelector(".premium-renewal-period");
        if (renewalAmount) renewalAmount.textContent = "$" + Number(status && status.priceUsd ? status.priceUsd : 9.99).toFixed(2);
        if (renewalPeriod) {
          var renewalBillingPeriod = String(status && status.billingPeriod ? status.billingPeriod : "week").toLowerCase();
          renewalPeriod.textContent = renewalBillingPeriod === "week" ? "/ week" : "/ month";
        }
        if (status && status.premiumActive) {
          var subStatus = premiumStatusText(status);
          var endDate = formatPremiumDate(status.currentPeriodEnd);
          if (checkoutBtn) {
            checkoutBtn.textContent = subStatus === "canceling" ? "Cancellation confirmed" : "Premium active";
            checkoutBtn.disabled = true;
          }
          if (subStatus === "canceling") {
            if (manageBtn) manageBtn.style.display = "none";
            setNote(premiumCancellationMessage(endDate));
            return status;
          }
          if (manageBtn) {
            manageBtn.style.display = status.manageAvailable ? "" : "none";
            manageBtn.disabled = false;
            manageBtn.textContent = "Cancel subscription";
          }
          setNote("Premium is active on this browser/IP. You can cancel anytime.");
          return status;
        }
        if (checkoutBtn) {
          checkoutBtn.disabled = false;
          checkoutBtn.textContent = "Start free trial";
        }
        if (manageBtn) manageBtn.style.display = "none";
        setTrustNote();
        return status;
      }).catch(function () {
        if (checkoutBtn) {
          checkoutBtn.disabled = false;
          checkoutBtn.textContent = "Start free trial";
        }
        if (manageBtn) manageBtn.style.display = "none";
        setNote("Could not load premium status. You can still try checkout.");
      });
    }
    function premiumReturnTo() {
      try {
        var url = new URL(window.location.href);
        url.hash = "";
        url.searchParams.set("premium", "1");
        url.searchParams.delete("premium_cancel");
        url.searchParams.delete("premium_error");
        url.searchParams.delete("confirm_error");
        url.searchParams.delete("error");
        url.searchParams.delete("square_code");
        url.searchParams.delete("subscribed");
        url.searchParams.delete("sub_status");
        return url.toString();
      } catch (_) {
        return "/video.html?premium=1";
      }
    }
    function cleanPremiumReturnParams(searchParams) {
      try {
        [
          "premium",
          "premium_cancel",
          "premium_error",
          "confirm_error",
          "error",
          "session_id",
          "square_code",
          "subscribed",
          "sub_status",
          "restored"
        ].forEach(function (key) { searchParams.delete(key); });
        var query = searchParams.toString();
        var hash = window.location.hash === "#premium" ? "" : (window.location.hash || "");
        window.history.replaceState({}, "", window.location.pathname + (query ? "?" + query : "") + hash);
      } catch (_) {}
    }
	    function confirmPremiumReturnFromUrl() {
	      var sp = new URLSearchParams(window.location.search);
	      if (sp.get("premium_cancel") === "1") {
	        sendPremiumAnalyticsEvent("premium_checkout_canceled", {
	          checkout_provider: "stripe",
	          return_has_session: !!String(sp.get("session_id") || "").trim()
	        });
	        openDrawer();
	        setNote("Premium checkout was canceled. You can restart anytime. Cancel anytime.");
	        cleanPremiumReturnParams(sp);
	        return true;
	      }
	      if (sp.get("premium_error") === "1" || sp.get("confirm_error") === "1" || sp.get("error")) {
	        sendPremiumAnalyticsEvent("premium_checkout_failed", {
	          stage: "return",
	          checkout_provider: "stripe",
	          error_type: sp.get("premium_error") === "1" ? "premium_error" : (sp.get("confirm_error") === "1" ? "confirm_error" : "query_error")
	        });
	        openDrawer();
	        setNote(sp.get("error") && String(sp.get("error")).indexOf("restore") === 0 ? "Premium restore link is invalid or expired. Request a new link." : "Premium checkout was not completed. Please try again.");
	        cleanPremiumReturnParams(sp);
	        return true;
	      }
	      if (sp.get("premium") !== "1") return false;
	      var sid = String(sp.get("session_id") || "").trim();
	      sendPremiumAnalyticsEvent("premium_return_seen", {
	        checkout_provider: "stripe",
	        return_has_session: !!sid
	      }, sid ? "premium_return_" + sid : "premium_return_no_session");
	      openDrawer();
	      if (sp.get("restored") === "1") {
	        sendPremiumAnalyticsEvent("premium_restore_completed", { restore_method: "email_link" });
	        setNote("Premium restored on this browser. You can cancel anytime.");
	        cleanPremiumReturnParams(sp);
	        refreshPremiumStatus(true);
        return true;
      }
	      if (!sid) {
	        sendPremiumAnalyticsEvent("premium_return_missing_session", { checkout_provider: "stripe" });
	        setNote("Premium checkout completed. Refreshing status...");
	        cleanPremiumReturnParams(sp);
	        refreshPremiumStatus(true);
	        return true;
	      }
	      setNote("Confirming Premium checkout...");
	      sendPremiumAnalyticsEvent("premium_confirm_started", {
	        checkout_provider: "stripe",
	        transaction_id: sid
	      }, "premium_confirm_started_" + sid);
	      window.fetch("/api/premium/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid })
      })
        .then(readJson)
	        .then(function (payload) {
	          if (payload && payload.premiumActive) {
	            premiumStatusCache = payload;
	            premiumStatusCacheAt = Date.now();
	            sendPremiumAnalyticsEvent("premium_confirm_success", {
	              checkout_provider: "stripe",
	              transaction_id: sid
	            }, "premium_confirm_success_" + sid);
	            sendPremiumAnalyticsEvent("premium_activated", {
	              checkout_provider: "stripe",
	              transaction_id: sid
	            }, "premium_activated_" + sid);
	            sendPremiumPurchaseEvents(sid, payload);
	          } else {
	            sendPremiumAnalyticsEvent("premium_confirm_pending", {
	              checkout_provider: "stripe",
	              transaction_id: sid
	            }, "premium_confirm_pending_" + sid);
	          }
	          setNote("Premium checkout completed. Cancel anytime.");
	          return refreshPremiumStatus(true);
	        })
	        .catch(function (err) {
	          sendPremiumAnalyticsEvent("premium_confirm_failed", {
	            checkout_provider: "stripe",
	            transaction_id: sid,
	            error_type: err && err.message ? String(err.message).slice(0, 80) : "confirm_failed"
	          }, "premium_confirm_failed_" + sid);
	          setNote("Checkout returned. Refreshing Premium status...");
	          return refreshPremiumStatus(true);
	        })
        .finally(function () {
          cleanPremiumReturnParams(sp);
        });
      return true;
    }
	    function startPremiumCheckout() {
	      sendPremiumAnalyticsEvent("premium_checkout_clicked", {
	        checkout_provider: "stripe",
	        checkout_mode: "trial"
	      });
	      setBusy(checkoutBtn, true, "Redirecting...");
	      setNote("Starting secure checkout...");
	      return window.fetch("/api/premium/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "trial", provider: "stripe", returnTo: premiumReturnTo() })
      })
	        .then(readJson)
	        .then(function (payload) {
	          if (payload && payload.url) {
	            sendPremiumAnalyticsEvent("premium_checkout_created", {
	              checkout_provider: "stripe",
	              checkout_mode: payload.mode || "trial",
	              has_checkout_url: true
	            });
	            sendPremiumAnalyticsEvent("premium_checkout_redirect", {
	              checkout_provider: "stripe",
	              checkout_mode: payload.mode || "trial"
	            });
	            window.location.href = String(payload.url);
	            return;
	          }
	          throw new Error("missing_checkout_url");
	        })
	        .catch(function (err) {
	          sendPremiumAnalyticsEvent("premium_checkout_failed", {
	            stage: "create_checkout",
	            checkout_provider: "stripe",
	            error_type: err && err.message ? String(err.message).slice(0, 80) : "create_checkout_failed"
	          });
	          setBusy(checkoutBtn, false, "Start free trial");
	          setNote("Unable to start checkout. Please try again.");
	        });
    }
	    function requestPremiumRestoreEmail() {
	      var email = restoreEmailInput ? String(restoreEmailInput.value || "").trim() : "";
	      if (!email || email.indexOf("@") < 1) {
	        sendPremiumAnalyticsEvent("premium_restore_email_failed", { error_type: "invalid_email" });
	        setNote("Enter the email used at checkout.");
	        if (restoreEmailInput) restoreEmailInput.focus();
	        return Promise.resolve();
	      }
	      sendPremiumAnalyticsEvent("premium_restore_email_requested", { restore_method: "email_link" });
	      setBusy(restoreEmailBtn, true, "Sending...");
	      setNote("Sending restore link if this email has Premium...");
      return window.fetch("/api/premium/restore-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email })
      })
	        .then(readJson)
	        .then(function () {
	          sendPremiumAnalyticsEvent("premium_restore_email_sent", { restore_method: "email_link" });
	          setNote("If that email has an active Premium subscription, a restore link was sent.");
	        })
	        .catch(function (err) {
	          sendPremiumAnalyticsEvent("premium_restore_email_failed", {
	            restore_method: "email_link",
	            error_type: err && err.message ? String(err.message).slice(0, 80) : "restore_email_failed"
	          });
	          setNote("Could not send the restore link. Please try again.");
	        })
        .finally(function () {
          setBusy(restoreEmailBtn, false, "Email link");
        });
    }
	    function startPremiumCancel() {
	      sendPremiumAnalyticsEvent("premium_cancel_clicked", {});
	      var ok = true;
	      try { ok = window.confirm(translatedUiText("Cancel Premium subscription? Premium stays active until the end of your current paid period, and you will not be charged again for this subscription.")); } catch (_) {}
	      if (!ok) {
	        sendPremiumAnalyticsEvent("premium_cancel_aborted", {});
	        setNote("Cancellation was not made. Premium is still active and can be canceled anytime.");
	        return Promise.resolve();
	      }
      setBusy(manageBtn, true, "Canceling...");
      setNote("Canceling subscription...");
      return window.fetch("/api/premium/cancel", { method: "POST" })
        .then(readJson)
	        .then(function (cancelPayload) {
	          var endDate = formatPremiumDate(cancelPayload && cancelPayload.effectiveDate);
	          sendPremiumAnalyticsEvent("premium_cancel_scheduled", {
	            effective_date: cancelPayload && cancelPayload.effectiveDate ? String(cancelPayload.effectiveDate) : ""
	          });
	          setNote(premiumCancellationMessage(endDate));
	          return refreshPremiumStatus(true);
	        })
	        .catch(function (err) {
	          sendPremiumAnalyticsEvent("premium_cancel_failed", {
	            error_type: err && err.message ? String(err.message).slice(0, 80) : "cancel_failed"
	          });
	          setNote("Unable to cancel subscription. Your subscription was not changed. Please try again.");
	        })
        .finally(function () {
          setBusy(manageBtn, false, "Cancel subscription");
        });
    }
	    function openDrawer() {
	      drawer.classList.add("open");
	      drawer.setAttribute("aria-hidden", "false");
	      sendPremiumAnalyticsEvent("premium_drawer_open", {});
	      refreshPremiumStatus(false);
      if (headerMenuBtn) {
        headerMenuBtn.setAttribute("aria-expanded", "false");
        if (headerMenuBtn.parentElement) headerMenuBtn.parentElement.classList.remove("open");
      }
    }
    function closeDrawer() {
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
    }
    drawer.__premiumDrawerBound = true;
    openBtns.forEach(function (openBtn) {
      openBtn.addEventListener("click", function (ev) {
        try { ev.preventDefault(); } catch (_) {}
        openDrawer();
      });
    });
    window.addEventListener("hashchange", function () {
      if (window.location.hash === "#premium") openDrawer();
    });
    if (!confirmPremiumReturnFromUrl() && window.location.hash === "#premium") {
      setTimeout(openDrawer, 0);
    }
    if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
    drawer.addEventListener("click", function (ev) { if (ev && ev.target === drawer) closeDrawer(); });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && drawer.classList.contains("open")) closeDrawer();
    });
    if (checkoutBtn) {
      checkoutBtn.addEventListener("click", function () {
        startPremiumCheckout();
      });
    }
    if (manageBtn) {
      manageBtn.addEventListener("click", function () {
        startPremiumCancel();
      });
    }
    if (restoreEmailBtn) {
      restoreEmailBtn.addEventListener("click", function () {
        requestPremiumRestoreEmail();
      });
    }
    if (restoreEmailInput) {
      restoreEmailInput.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          try { ev.preventDefault(); } catch (_) {}
          requestPremiumRestoreEmail();
        }
      });
    }
  }
  function bindMenu() {
    var btn = document.getElementById("headerMenuBtn");
    var menu = btn && btn.parentElement;
    if (!btn || !menu) return;
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", open ? "false" : "true");
      menu.classList.toggle("open", !open);
    });
  }
  function bindMute() {
    var video = document.getElementById("video-peer");
    var muteBtn = document.getElementById("mute-btn");
    var volumeSlider = document.getElementById("peer-volume");
    var settingsMuteBtn = document.getElementById("settings-peer-mute");
    var settingsVolumeSlider = document.getElementById("settings-peer-volume");
    if (!video) return;
    var muteButtons = [muteBtn, settingsMuteBtn].filter(Boolean);
    var volumeSliders = [volumeSlider, settingsVolumeSlider].filter(Boolean);
    var prefs = readPeerAudioPrefs();
    var storedVolume = prefs.volume || 1;
    video.volume = storedVolume;
    video.muted = !!prefs.muted;
    function syncRemoteAudioUi() {
      muteButtons.forEach(function (btn) {
        btn.classList.toggle("muted", !!video.muted);
        btn.classList.toggle("is-muted", !!video.muted);
        btn.setAttribute("aria-pressed", video.muted ? "true" : "false");
        var label = btn.querySelector("span");
        if (label) label.textContent = video.muted ? "Unmute" : "Mute";
      });
      volumeSliders.forEach(function (slider) {
        slider.value = String(video.muted ? 0 : video.volume);
      });
    }
    function toggleMute() {
      var nextMuted = !video.muted;
      video.muted = nextMuted;
      if (!nextMuted && video.volume === 0) video.volume = storedVolume || 1;
      savePeerAudioPrefs(storedVolume || video.volume || 1, video.muted);
      syncRemoteAudioUi();
    }
    function setRemoteVolume(value) {
      var nextVolume = Math.max(0, Math.min(1, parseFloat(value) || 0));
        storedVolume = nextVolume;
        video.volume = nextVolume;
        video.muted = nextVolume <= 0;
      savePeerAudioPrefs(storedVolume, video.muted);
      syncRemoteAudioUi();
    }
    muteButtons.forEach(function (btn) {
      btn.addEventListener("click", toggleMute);
    });
    volumeSliders.forEach(function (slider) {
      slider.addEventListener("input", function () {
        setRemoteVolume(slider.value);
      });
    });
    syncRemoteAudioUi();
  }

  function bindRemoteAudioTouchControls() {
    var control = $("peerAudioControl");
    var peer = $("peer");
    if (!control || !peer) return;
    function isTouchDesktopView() {
      var touchLike = !!(("ontouchstart" in window) || (navigator.maxTouchPoints || 0) > 0);
      try {
        touchLike = touchLike || !!(window.matchMedia && window.matchMedia("(hover: none), (pointer: coarse)").matches);
      } catch (_) {}
      return touchLike && !isMobileViewport();
    }
    function setOpen(open) {
      control.classList.toggle("is-open", !!open && !isMobileViewport());
    }
    var lastAudioToggleAt = 0;
    function toggleOpen() {
      var now = Date.now();
      if (now - lastAudioToggleAt < 220) return;
      lastAudioToggleAt = now;
      setOpen(!control.classList.contains("is-open"));
    }
    function handlePeerTouchOpen(ev) {
      if (!isTouchDesktopView()) return;
      var target = ev.target;
      if (target && target.closest && target.closest("button, input, select, textarea, a, .video2-vote-panel, .video-controls-peer, .remote-country-flag")) return;
      toggleOpen();
    }
    function handleControlTouchOpen(ev) {
      if (!isTouchDesktopView()) return;
      var target = ev.target;
      if (target && target.closest && target.closest(".peer-audio-panel")) return;
      ev.stopPropagation();
      toggleOpen();
    }
    peer.addEventListener("pointerdown", handlePeerTouchOpen);
    peer.addEventListener("touchstart", function (ev) {
      handlePeerTouchOpen(ev);
    }, { passive: true });
    control.addEventListener("pointerdown", handleControlTouchOpen);
    control.addEventListener("touchstart", function (ev) {
      handleControlTouchOpen(ev);
    }, { passive: true });
    control.addEventListener("click", function (ev) {
      handleControlTouchOpen(ev);
    });
    document.addEventListener("pointerdown", function (ev) {
      if (!control.classList.contains("is-open")) return;
      var target = ev.target;
      if (target && target.closest && (target.closest("#peerAudioControl") || target.closest("#peer"))) return;
      setOpen(false);
    });
  }

  function bindVoteControls() {
    var panel = $("video2VotePanel");
    if (panel) {
      var restoreHiddenPanel = function (ev) {
        if (!panel.classList.contains("is-hidden-after-vote")) return;
        ev.preventDefault();
        ev.stopPropagation();
        revealVotePanelForCurrentMatch();
      };
      panel.addEventListener("pointerdown", restoreHiddenPanel, true);
      panel.addEventListener("touchstart", restoreHiddenPanel, { capture: true, passive: false });
      panel.addEventListener("click", restoreHiddenPanel, true);
    }
    var up = $("video2UpvoteBtn");
    var down = $("video2DownvoteBtn");
    if (up) up.addEventListener("click", function () { sendUserVote(1); });
    if (down) down.addEventListener("click", function () { sendUserVote(-1); });
    setPartnerVoteScore(partnerVoteScore);
    updateVoteControls();
  }

  function bindReportModal() {
    var openBtn = $("report-btn");
    var modal = $("reportModal");
    var closeBtn = $("reportModalClose");
    var cancelBtn = $("cancelReport");
    var form = $("reportForm");
    if (!openBtn || !modal) return;
    function open() {
      modal.style.display = "flex";
      modal.setAttribute("aria-hidden", "false");
    }
    function close() {
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
    }
    openBtn.addEventListener("click", open);
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (cancelBtn) cancelBtn.addEventListener("click", close);
    modal.addEventListener("click", function (ev) { if (ev && ev.target === modal) close(); });
    if (form) {
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var type = $("reportType");
        var reason = $("reportReason");
        var reportMatchId = getReportTargetMatchId();
        if (!reportMatchId) {
          addMessage("system", "", "There is no recent stranger to report.");
          close();
          return;
        }
        send({
          type: "report",
          matchId: reportMatchId,
          reportType: type ? type.value : "other",
          reason: reason ? reason.value : ""
        });
        if (reason) reason.value = "";
        close();
      });
    }
  }

  function applyLocalStream(stream) {
    var oldStream = localStream;
    var targetPc = pc;
    var replacements = [];
    var replacedSenders = [];
    var addedSenders = [];
    if (targetPc) {
      stream.getTracks().forEach(function (track) {
        var sender = null;
        try {
          sender = targetPc.getSenders().find(function (item) {
            return item.track && item.track.kind === track.kind;
          });
        } catch (_) {}
        if (sender) {
          replacedSenders.push({ sender: sender, track: sender.track || null });
          try { replacements.push(Promise.resolve(sender.replaceTrack(track))); } catch (err) { replacements.push(Promise.reject(err)); }
        } else {
          try { addedSenders.push(targetPc.addTrack(track, stream)); } catch (err) { replacements.push(Promise.reject(err)); }
        }
      });
    }
    function rollbackPeerTracks() {
      var rollbacks = replacedSenders.map(function (item) {
        try { return Promise.resolve(item.sender.replaceTrack(item.track)).catch(function () {}); } catch (_) { return Promise.resolve(); }
      });
      addedSenders.forEach(function (sender) {
        try { if (targetPc && targetPc.signalingState !== "closed") targetPc.removeTrack(sender); } catch (_) {}
      });
      return Promise.all(rollbacks);
    }
    return Promise.all(replacements).then(function () {
      if (targetPc && pc !== targetPc) throw new Error("Video connection changed while switching devices.");
      localStream = stream;
      enableCameraAnimation();
      proofToken = "";
      proofExpAt = 0;
      var self = $("video-self");
      if (self) {
        self.srcObject = stream;
        try { self.play().catch(function () {}); } catch (_) {}
      }
      var vt = stream.getVideoTracks()[0];
      var at = stream.getAudioTracks()[0];
      text($("local-webcam-label"), vt && vt.label ? vt.label : "Camera");
      text($("local-microphone-label"), at && at.label ? at.label : "Mic");
      bindLocalTrackRecovery(stream);
      clearMediaPermissionNotice();
      if (oldStream && oldStream !== stream) {
        oldStream.getTracks().forEach(function (track) { try { track.stop(); } catch (_) {} });
      }
      if (matchId) send({ type: "device_info", matchId: matchId, videoLabel: cameraLabel() || undefined, clientVersion: VIDEO_CLIENT_VERSION });
      return stream;
    }).catch(function (err) {
      return rollbackPeerTracks().then(function () {
        if (stream && stream !== oldStream) {
          try { stream.getTracks().forEach(function (track) { try { track.stop(); } catch (_) {} }); } catch (_) {}
        }
        throw err;
      });
    });
  }

  function scheduleLocalMediaRecovery(reason) {
    if (mediaRecoveryTimer) window.clearTimeout(mediaRecoveryTimer);
    mediaRecoveryTimer = window.setTimeout(function () {
      mediaRecoveryTimer = 0;
      if (pageExiting || mediaRecoveryPromise || streamHasLiveCameraAndMic(localStream)) return;
      var unavailable = new Error(reason || "Camera or microphone disconnected. Reconnecting devices...");
      showMediaPermissionNotice(unavailable);
      setStatus("Reconnecting camera and microphone...");
      mediaRecoveryPromise = ensureLocalMedia().then(function () {
        setStatus("");
      }).catch(function (err) {
        showMediaPermissionNotice(err || unavailable);
        setStatus("Camera or microphone disconnected");
      }).then(function () {
        mediaRecoveryPromise = null;
      });
    }, 350);
  }

  function bindLocalTrackRecovery(stream) {
    if (!stream || !stream.getTracks) return;
    stream.getTracks().forEach(function (track) {
      if (!track || track.__ChatSphereRecoveryBound) return;
      track.__ChatSphereRecoveryBound = true;
      track.addEventListener("ended", function () {
        if (localStream !== stream || pageExiting) return;
        invalidateSearchProof();
        scheduleLocalMediaRecovery(track.kind === "audio" ? "Microphone disconnected." : "Camera disconnected.");
      });
    });
  }

  function bindMediaDeviceRecovery() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.addEventListener) return;
    navigator.mediaDevices.addEventListener("devicechange", function () {
      if (!streamHasLiveCameraAndMic(localStream)) scheduleLocalMediaRecovery("Camera or microphone changed.");
    });
  }

  function bindPageLifecycle() {
    window.addEventListener("pagehide", function (event) {
      if (event && event.persisted) return;
      pageExiting = true;
      clearWsReconnectTimer();
      clearSearchRetryTimer();
      clearSearchWatchdog();
      clearConnectWatchdog();
      clearSignalingResume();
      sendQueue = [];
      stopModerationScreenshots(true);
      closePeerConnection();
      var socket = ws;
      ws = null;
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        try { socket.close(1000, "pagehide"); } catch (_) {}
      }
    });
    window.addEventListener("pageshow", function (event) {
      if (!event || !event.persisted) return;
      pageExiting = false;
      if (!ws || ws.readyState === WebSocket.CLOSED) connectSocket();
    });
  }

  function switchLocalDevices(videoId, audioId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error("Camera is not available in this browser."));
    }
    return navigator.mediaDevices.getUserMedia(preferredMediaConstraints(videoId, audioId)).then(function (stream) {
      return applyLocalStream(stream);
    }).then(function (stream) {
      saveLocalDevicePrefs(videoId, audioId);
      return stream;
    });
  }

  function clearMicLevelUI() {
    var fill = $("mic-level-fill");
    var txt = $("mic-level-text");
    if (fill) fill.style.width = "0%";
    if (txt) txt.textContent = "0%";
  }

  function stopMicLevelMeter() {
    if (micLevelTimer) {
      window.clearInterval(micLevelTimer);
      micLevelTimer = 0;
    }
    try {
      if (micLevelSource) micLevelSource.disconnect();
    } catch (_) {}
    micLevelSource = null;
    micLevelAnalyser = null;
    if (micLevelAudioCtx) {
      try { micLevelAudioCtx.close(); } catch (_) {}
      micLevelAudioCtx = null;
    }
    clearMicLevelUI();
  }

  function startMicLevelMeter() {
    var modal = $("device-selection-modal");
    if (!modal || !modal.classList.contains("open")) {
      stopMicLevelMeter();
      return Promise.resolve();
    }
    return ensureLocalMedia().then(function (stream) {
      stopMicLevelMeter();
      var audioTrack = stream && stream.getAudioTracks ? stream.getAudioTracks()[0] : null;
      if (!audioTrack || audioTrack.readyState !== "live") {
        clearMicLevelUI();
        return;
      }
      var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) {
        clearMicLevelUI();
        return;
      }
      micLevelAudioCtx = new AudioContextCtor();
      micLevelAnalyser = micLevelAudioCtx.createAnalyser();
      micLevelAnalyser.fftSize = 1024;
      micLevelSource = micLevelAudioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
      micLevelSource.connect(micLevelAnalyser);
      if (micLevelAudioCtx.state === "suspended" && micLevelAudioCtx.resume) {
        try { micLevelAudioCtx.resume().catch(function () {}); } catch (_) {}
      }
      var data = new Uint8Array(micLevelAnalyser.fftSize);
      micLevelTimer = window.setInterval(function () {
        if (!micLevelAnalyser) return;
        micLevelAnalyser.getByteTimeDomainData(data);
        var sum = 0;
        for (var i = 0; i < data.length; i++) {
          var v = (data[i] - 128) / 128;
          sum += v * v;
        }
        var rms = Math.sqrt(sum / data.length);
        var pct = Math.max(0, Math.min(100, Math.round(rms * 180)));
        var fill = $("mic-level-fill");
        var txt = $("mic-level-text");
        if (fill) fill.style.width = String(pct) + "%";
        if (txt) txt.textContent = String(pct) + "%";
      }, 100);
    }).catch(function () {
      clearMicLevelUI();
    });
  }

  function cycleCameraSource() {
    if (cameraCycleInFlight) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      setTemporaryStatus("Camera switching is not available.");
      return;
    }
    cameraCycleInFlight = true;
    ensureLocalMedia()
      .then(function () { return navigator.mediaDevices.enumerateDevices(); })
      .then(function (devices) {
        var cameras = devices.filter(function (device) { return device.kind === "videoinput"; });
        if (cameras.length < 2) {
          setTemporaryStatus("No other camera found.");
          return null;
        }
        var currentTrack = localStream && localStream.getVideoTracks()[0];
        var currentId = "";
        try { currentId = currentTrack && currentTrack.getSettings ? String(currentTrack.getSettings().deviceId || "") : ""; } catch (_) {}
        var currentIndex = cameras.findIndex(function (device) { return device.deviceId === currentId; });
        var next = cameras[(currentIndex + 1 + cameras.length) % cameras.length] || cameras[0];
        var audioTrack = localStream && localStream.getAudioTracks()[0];
        var audioId = "";
        try { audioId = audioTrack && audioTrack.getSettings ? String(audioTrack.getSettings().deviceId || "") : ""; } catch (_) {}
        return switchLocalDevices(next.deviceId, audioId).then(function () {
          setTemporaryStatus(next.label ? ("Camera: " + next.label) : "Camera switched");
        });
      })
      .catch(function (err) {
        setTemporaryStatus(err && err.message ? err.message : "Could not switch camera.");
      })
      .then(function () {
        cameraCycleInFlight = false;
      }, function (err) {
        cameraCycleInFlight = false;
        throw err;
      });
  }

  function bindDeviceModal() {
    var openBtn = $("device-settings-btn");
    var modal = $("device-selection-modal");
    var closeBtn = $("device-modal-close");
    var cancelBtn = $("device-modal-cancel");
    var camSelect = $("webcam-select");
    var micSelect = $("microphone-select");
    var currentCamera = $("device-current-camera");
    var currentMic = $("device-current-mic");
    var premiumBtn = $("settingsPremiumBtn");
    var genderPrefButtons = Array.prototype.slice.call(document.querySelectorAll("[data-match-gender]"));
    var interestInput = $("interest-input");
    var interestChips = $("interestChips");
    var currentInterests = $("device-current-interests");
    if (!openBtn || !modal) return;
    function close() {
      stopMicLevelMeter();
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
    function renderInterestSettings(list) {
      var interests = normalizeInterests(list || savedInterests());
      if (currentInterests) {
        currentInterests.textContent = interests.length ? interests.join(", ") : "Any interests";
      }
      if (interestInput && document.activeElement !== interestInput) {
        interestInput.value = interests.join(", ");
      }
      if (!interestChips) return;
      interestChips.innerHTML = "";
      interests.forEach(function (interest) {
        var chip = document.createElement("span");
        chip.className = "interestChip";
        var label = document.createElement("span");
        label.textContent = interest;
        var remove = document.createElement("button");
        remove.type = "button";
        remove.setAttribute("aria-label", "Remove " + interest);
        remove.setAttribute("data-interest-remove", interest);
        remove.textContent = "×";
        chip.appendChild(label);
        chip.appendChild(remove);
        interestChips.appendChild(chip);
      });
    }
    function saveInterestInput() {
      var interests = saveInterests(interestInput ? interestInput.value : "");
      renderInterestSettings(interests);
    }
    function savedGenderMatchPref() {
      try {
        var value = String(localStorage.getItem("video2_gender_match_pref_v1") || "male").toLowerCase();
        return value === "female" ? "female" : "male";
      } catch (_) {
        return "male";
      }
    }
    function renderGenderMatchPref(value) {
      var selected = value === "female" ? "female" : "male";
      genderPrefButtons.forEach(function (btn) {
        var active = String(btn.getAttribute("data-match-gender") || "") === selected;
        btn.classList.toggle("is-selected", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }
    function saveGenderMatchPref(value) {
      var selected = value === "female" ? "female" : "male";
      try { localStorage.setItem("video2_gender_match_pref_v1", selected); } catch (_) {}
      renderGenderMatchPref(selected);
    }
    function populate() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      var currentVideoId = "";
      var currentAudioId = "";
      try {
        var videoTrack = localStream && localStream.getVideoTracks()[0];
        currentVideoId = videoTrack && videoTrack.getSettings ? String(videoTrack.getSettings().deviceId || "") : "";
      } catch (_) {}
      try {
        var audioTrack = localStream && localStream.getAudioTracks()[0];
        currentAudioId = audioTrack && audioTrack.getSettings ? String(audioTrack.getSettings().deviceId || "") : "";
      } catch (_) {}
      navigator.mediaDevices.enumerateDevices().then(function (devices) {
        if (camSelect) camSelect.innerHTML = "";
        if (micSelect) micSelect.innerHTML = "";
        var cameraName = "";
        var micName = "";
        devices.forEach(function (device) {
          if (device.kind !== "videoinput" && device.kind !== "audioinput") return;
          var opt = document.createElement("option");
          opt.value = device.deviceId;
          opt.textContent = device.label || (device.kind === "videoinput" ? "Camera" : "Microphone");
          if (device.kind === "videoinput" && camSelect) {
            if (device.deviceId === currentVideoId) {
              opt.selected = true;
              cameraName = opt.textContent;
            }
            camSelect.appendChild(opt);
          }
          if (device.kind === "audioinput" && micSelect) {
            if (device.deviceId === currentAudioId) {
              opt.selected = true;
              micName = opt.textContent;
            }
            micSelect.appendChild(opt);
          }
        });
        if (!cameraName && camSelect && camSelect.options.length) cameraName = camSelect.options[camSelect.selectedIndex >= 0 ? camSelect.selectedIndex : 0].textContent;
        if (!micName && micSelect && micSelect.options.length) micName = micSelect.options[micSelect.selectedIndex >= 0 ? micSelect.selectedIndex : 0].textContent;
        if (currentCamera) currentCamera.textContent = cameraName || "Camera permission needed";
        if (currentMic) currentMic.textContent = micName || "Microphone permission needed";
      }).catch(function () {});
    }
    function open() {
      populate();
      renderInterestSettings();
      renderGenderMatchPref(savedGenderMatchPref());
      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
      startMicLevelMeter();
    }
    function applySelection() {
      var videoId = camSelect ? camSelect.value : "";
      var audioId = micSelect ? micSelect.value : "";
      switchLocalDevices(videoId, audioId).then(function () {
        if (currentCamera && camSelect && camSelect.selectedIndex >= 0) currentCamera.textContent = camSelect.options[camSelect.selectedIndex].textContent;
        if (currentMic && micSelect && micSelect.selectedIndex >= 0) currentMic.textContent = micSelect.options[micSelect.selectedIndex].textContent;
        if (modal.classList.contains("open")) startMicLevelMeter();
      }).catch(function (err) {
        setStatus(err && err.message ? err.message : "Could not switch devices.");
      });
    }
    openBtn.addEventListener("click", open);
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (cancelBtn) cancelBtn.addEventListener("click", close);
    if (camSelect) camSelect.addEventListener("change", applySelection);
    if (micSelect) micSelect.addEventListener("change", applySelection);
    if (premiumBtn) {
      premiumBtn.addEventListener("click", function () {
        close();
        openPremiumDrawer();
      });
    }
    if (genderPrefButtons.length) {
      genderPrefButtons.forEach(function (btn) {
        btn.addEventListener("click", function () {
          var value = String(btn.getAttribute("data-match-gender") || "male").toLowerCase();
          fetchPremiumStatusGlobal(true).then(function (status) {
            if (status && status.premiumActive) {
              saveGenderMatchPref(value);
              return;
            }
            close();
            openPremiumDrawer();
          }).catch(function () {
            close();
            openPremiumDrawer();
          });
        });
      });
    }
    if (interestInput) {
      interestInput.addEventListener("input", saveInterestInput);
      interestInput.addEventListener("blur", saveInterestInput);
      interestInput.addEventListener("keydown", function (ev) {
        if (!ev || ev.key !== "Enter") return;
        ev.preventDefault();
        saveInterestInput();
        interestInput.blur();
      });
    }
    if (interestChips) {
      interestChips.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-interest-remove]") : null;
        if (!btn) return;
        var value = String(btn.getAttribute("data-interest-remove") || "").toLowerCase();
        var next = savedInterests().filter(function (interest) {
          return interest.toLowerCase() !== value;
        });
        saveInterests(next);
        if (interestInput) interestInput.value = next.join(", ");
        renderInterestSettings(next);
      });
    }
    modal.addEventListener("click", function (ev) { if (ev && ev.target === modal) close(); });
    var drawerPanel = modal.querySelector(".device-modal-v2");
    if (drawerPanel) {
      drawerPanel.addEventListener("click", function (ev) { ev.stopPropagation(); });
    }
  }

  var AUTO_CONNECT_KEY = "video2_auto_connect_v1";
  function isAutoConnectEnabled() {
    try { return localStorage.getItem(AUTO_CONNECT_KEY) !== "0"; } catch (_) { return true; }
  }

  var HOTKEYS_KEY = "video2_hotkeys_v3";
  // Single-key defaults that are still chat-input safe (they don't type, so they
  // fire even while the chat box is focused). Only Esc and the function keys
  // qualify as single keys; F1/F3/F5/F6/F7/F11/F12 are taken by the browser, so
  // the free ones (F2/F4/F8/F9) are used. Users can rebind to any input-safe key
  // or modifier combo.
  var HOTKEY_DEFAULTS = { start: "F2", stop: "Escape", upvote: "F4", downvote: "F8", report: "F9" };
  var HOTKEY_ACTION_ORDER = ["start", "stop", "upvote", "downvote", "report"];
  var hotkeyCapturing = null;

  function hotkeyBaseKey(ev) {
    var k = ev && ev.key ? String(ev.key) : "";
    if (!k || k === "Dead" || k === "Unidentified") return "";
    if (k === "Control" || k === "Shift" || k === "Alt" || k === "Meta") return "";
    if (k === " " || k === "Spacebar") return "Space";
    if (k.length === 1) return k.toUpperCase();
    return k;
  }

  // Canonical token for a keydown event, used for both storage and matching.
  // Format: optional "Ctrl+"/"Alt+"/"Shift+"/"Meta+" prefixes then the base key
  // (e.g. "Escape", "Ctrl+Enter", "Shift+ArrowRight"). Shift is only encoded for
  // non-printable bases — for a printable character the base already reflects it.
  function hotkeyTokenFromEvent(ev) {
    var base = hotkeyBaseKey(ev);
    if (!base) return "";
    var printable = base.length === 1;
    var parts = [];
    if (ev.ctrlKey) parts.push("Ctrl");
    if (ev.altKey) parts.push("Alt");
    if (ev.shiftKey && !printable) parts.push("Shift");
    if (ev.metaKey) parts.push("Meta");
    parts.push(base);
    return parts.join("+");
  }

  // A shortcut may fire while a text field is focused only if it can't be
  // mistaken for typing: it carries a non-Shift modifier, or its base is a
  // key that never edits text (Escape / function keys).
  function hotkeyInputSafe(token) {
    if (!token) return false;
    if (/(?:^|\+)(Ctrl|Alt|Meta)\+/.test(token)) return true;
    var base = token.split("+").pop();
    return base === "Escape" || /^F\d{1,2}$/.test(base);
  }

  function hotkeyBaseLabel(base) {
    if (base === "Space") return "Space";
    if (base === "Escape") return "Esc";
    if (base === "ArrowLeft") return "←";
    if (base === "ArrowRight") return "→";
    if (base === "ArrowUp") return "↑";
    if (base === "ArrowDown") return "↓";
    return base;
  }

  function hotkeyLabel(token) {
    if (!token) return "None";
    return token.split("+").map(function (part) {
      if (part === "Ctrl" || part === "Alt" || part === "Shift" || part === "Meta") return part;
      return hotkeyBaseLabel(part);
    }).join(" + ");
  }

  function loadHotkeys() {
    var out = {};
    HOTKEY_ACTION_ORDER.forEach(function (action) { out[action] = HOTKEY_DEFAULTS[action]; });
    try {
      var raw = localStorage.getItem(HOTKEYS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed) {
          HOTKEY_ACTION_ORDER.forEach(function (action) {
            if (typeof parsed[action] === "string" && parsed[action]) out[action] = parsed[action];
          });
        }
      }
    } catch (_) {}
    return out;
  }

  function saveHotkeys(map) {
    try { localStorage.setItem(HOTKEYS_KEY, JSON.stringify(map)); } catch (_) {}
  }

  function anyOverlayBlocksHotkeys() {
    if (banModalActive || vpnBlockedActive || connectionErrorActive) return true;
    if (strikeModalActive || investigationLockActive) return true;
    if (document.querySelector(".device-settings-drawer.open")) return true;
    var reportModal = $("reportModal");
    if (reportModal && reportModal.getAttribute("aria-hidden") === "false") return true;
    return false;
  }

  function isEditableTarget(el) {
    if (!el) return false;
    var tag = String(el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function bindSettingsHotkeys() {
    var caps = {
      start: $("hotkeyStart"),
      stop: $("hotkeyStop"),
      upvote: $("hotkeyUpvote"),
      downvote: $("hotkeyDownvote"),
      report: $("hotkeyReport")
    };
    var resetBtn = $("hotkeyReset");
    var hasAnyCap = HOTKEY_ACTION_ORDER.some(function (action) { return !!caps[action]; });
    if (!hasAnyCap) return;

    function render() {
      var map = loadHotkeys();
      HOTKEY_ACTION_ORDER.forEach(function (action) {
        var cap = caps[action];
        if (!cap) return;
        if (hotkeyCapturing === action) {
          cap.textContent = "Press a key…";
          cap.classList.add("is-capturing");
        } else {
          cap.textContent = hotkeyLabel(map[action]);
          cap.classList.remove("is-capturing");
        }
      });
    }

    function stopCapturing() {
      hotkeyCapturing = null;
      render();
    }

    function flashConflict(cap) {
      if (!cap) return;
      cap.classList.remove("is-conflict");
      // reflow so the animation restarts on repeated conflicts
      void cap.offsetWidth;
      cap.classList.add("is-conflict");
      window.setTimeout(function () { cap.classList.remove("is-conflict"); }, 320);
    }

    // Capture keydown runs before the global runtime handler (capture phase)
    // so assigning a key never also fires its action.
    document.addEventListener("keydown", function (ev) {
      if (!hotkeyCapturing) return;
      ev.preventDefault();
      ev.stopPropagation();
      var token = hotkeyTokenFromEvent(ev);
      if (!token) return; // ignore lone modifiers
      if (!hotkeyInputSafe(token)) {
        // Bare letters/numbers/Enter/Space/arrows get eaten by the auto-focused
        // chat box, so they'd never fire. Require a modifier combo, Esc, or an F-key.
        flashConflict(caps[hotkeyCapturing]);
        return;
      }
      var map = loadHotkeys();
      var clash = HOTKEY_ACTION_ORDER.some(function (action) {
        return action !== hotkeyCapturing && map[action] === token;
      });
      if (clash) {
        flashConflict(caps[hotkeyCapturing]);
        return; // keep listening; don't let two actions share a key
      }
      map[hotkeyCapturing] = token;
      saveHotkeys(map);
      stopCapturing();
    }, true);

    HOTKEY_ACTION_ORDER.forEach(function (action) {
      var cap = caps[action];
      if (!cap) return;
      cap.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        hotkeyCapturing = hotkeyCapturing === action ? null : action;
        render();
      });
    });

    if (resetBtn) {
      resetBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        hotkeyCapturing = null;
        var defaults = {};
        HOTKEY_ACTION_ORDER.forEach(function (action) { defaults[action] = HOTKEY_DEFAULTS[action]; });
        saveHotkeys(defaults);
        render();
      });
    }

    // Cancel capture when the drawer closes or focus leaves the caps.
    var drawer = $("device-selection-modal");
    if (drawer) {
      drawer.addEventListener("click", function (ev) {
        if (!hotkeyCapturing) return;
        if (ev.target && ev.target.closest && ev.target.closest(".hotkeyCap")) return;
        stopCapturing();
      });
    }

    render();
  }

  function triggerReportHotkey() {
    if (!getReportTargetMatchId()) return false;
    var btn = $("report-btn");
    if (!btn) return false;
    btn.click();
    return true;
  }

  // Runs an action by name; returns true if it did something worth consuming
  // the keystroke for (so we only preventDefault when the shortcut acted).
  function runHotkeyAction(action) {
    if (action === "stop") {
      if (!canUseStopAction()) return false;
      stopToReady();
      return true;
    }
    if (action === "start") {
      cancelOrNext();
      return true;
    }
    if (action === "upvote" || action === "downvote") {
      if (!getVoteTargetMatchId()) return false;
      sendUserVote(action === "downvote" ? -1 : 1);
      return true;
    }
    if (action === "report") {
      return triggerReportHotkey();
    }
    return false;
  }

  // Global runtime hotkey handler: fires a configured action from anywhere on
  // the page, except while typing (unless input-safe) or with a blocking
  // overlay open.
  function bindRuntimeHotkeys() {
    document.addEventListener("keydown", function (ev) {
      if (hotkeyCapturing) return;
      if (ev.repeat) return;
      if (anyOverlayBlocksHotkeys()) return;
      var token = hotkeyTokenFromEvent(ev);
      if (!token) return;
      // While typing, only input-safe shortcuts (modifier combos / Esc / F-keys)
      // may fire, so normal keystrokes reach the chat box untouched.
      if (isEditableTarget(ev.target) && !hotkeyInputSafe(token)) return;
      var map = loadHotkeys();
      for (var i = 0; i < HOTKEY_ACTION_ORDER.length; i++) {
        var action = HOTKEY_ACTION_ORDER[i];
        if (token === map[action]) {
          if (runHotkeyAction(action)) ev.preventDefault();
          return;
        }
      }
    });
  }

  function bindSettingsAutoConnect() {
    var toggle = $("settings-auto-connect");
    var row = $("settingsAutoConnectRow");
    if (!toggle) return;
    function setAutoConnect(enabled) {
      toggle.checked = !!enabled;
      try { localStorage.setItem(AUTO_CONNECT_KEY, enabled ? "1" : "0"); } catch (_) {}
    }
    toggle.checked = isAutoConnectEnabled();
    toggle.addEventListener("change", function () {
      setAutoConnect(toggle.checked);
    });
    if (row) {
      row.addEventListener("click", function (ev) {
        if (ev && ev.target && ev.target.closest && ev.target.closest(".settingsSwitch")) return;
        setAutoConnect(!toggle.checked);
      });
      row.addEventListener("keydown", function (ev) {
        if (!ev || (ev.key !== "Enter" && ev.key !== " ")) return;
        ev.preventDefault();
        setAutoConnect(!toggle.checked);
      });
    }
  }

  function bindSettingsDarkMode() {
    var settingsToggle = $("settings-dark-mode");
    var settingsRow = $("settingsDarkModeRow");
    var headerToggle = $("dark-mode-toggle-compact");
    var key = "video2_dark_mode_v1";
    function setDarkMode(enabled) {
      document.body.classList.toggle("video2-dark-mode", !!enabled);
      if (settingsToggle) settingsToggle.checked = !!enabled;
      if (headerToggle) headerToggle.checked = !!enabled;
      try { localStorage.setItem(key, enabled ? "1" : "0"); } catch (_) {}
    }
    var initial = false;
    try { initial = localStorage.getItem(key) === "1"; } catch (_) {}
    setDarkMode(initial);
    if (settingsToggle) {
      settingsToggle.addEventListener("change", function () {
        setDarkMode(settingsToggle.checked);
      });
    }
    if (settingsRow && settingsToggle) {
      settingsRow.addEventListener("click", function (ev) {
        if (ev && ev.target && ev.target.closest && ev.target.closest(".settingsSwitch")) return;
        settingsToggle.checked = !settingsToggle.checked;
        setDarkMode(settingsToggle.checked);
      });
      settingsRow.addEventListener("keydown", function (ev) {
        if (!ev || (ev.key !== "Enter" && ev.key !== " ")) return;
        ev.preventDefault();
        settingsToggle.checked = !settingsToggle.checked;
        setDarkMode(settingsToggle.checked);
      });
    }
    if (headerToggle) {
      headerToggle.addEventListener("change", function () {
        setDarkMode(headerToggle.checked);
      });
    }
  }

  function bindConceptControls() {
    var stop = document.getElementById("video2StopTile");
    var skip = document.getElementById("skip-btn");
    function setMobileChatViewportHeight() {
      var h = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
      if (window.visualViewport && window.visualViewport.height) {
        h = Math.round(window.visualViewport.height);
      }
      if (h > 0) document.documentElement.style.setProperty("--mobile-chat-vh", h + "px");
    }
    function resetMobileScroll() {
      if (!isMobileViewport()) return;
      try { window.scrollTo(0, 0); } catch (_) {}
      try { document.documentElement.scrollTop = 0; } catch (_) {}
      try { document.body.scrollTop = 0; } catch (_) {}
    }
    function closeMobileChatInput() {
      document.body.classList.remove("mobile-chat-open");
      resetMobileScroll();
    }
    // iOS pans the page to reveal a focused input when the on-screen
    // keyboard opens (even with focus({preventScroll:true})). The desktop
    // layout is fixed (body overflow:hidden), so any window scroll there
    // is unintended — pin it back to 0.
    function guardDesktopScroll() {
      if (isMobileViewport()) return;
      var y = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
      var x = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
      if (!y && !x) return;
      try { window.scrollTo(0, 0); } catch (_) {}
      try { document.documentElement.scrollTop = 0; } catch (_) {}
      try { document.body.scrollTop = 0; } catch (_) {}
    }
    window.addEventListener("scroll", guardDesktopScroll);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", guardDesktopScroll);
      window.visualViewport.addEventListener("scroll", guardDesktopScroll);
    }
    // iOS pauses media when the app is backgrounded (and Low Power Mode can
    // block autoplay entirely); resume on return / first interaction.
    function resumePausedVideos() {
      ["video-peer", "video-peer-blur", "video-self"].forEach(function (id) {
        var v = $(id);
        if (v && v.srcObject && v.paused && !v.ended) {
          try { v.play().catch(function () {}); } catch (_) {}
        }
      });
    }
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") resumePausedVideos();
    });
    document.addEventListener("pointerdown", resumePausedVideos, { capture: true, passive: true });
    // Rotating while the mobile chat is open changes the viewport height
    // (and can leave the mobile viewport entirely) — recompute or close.
    function handleMobileChatOrientation() {
      window.setTimeout(function () {
        if (!document.body.classList.contains("mobile-chat-open")) return;
        if (!isMobileViewport()) {
          dismissPopupKeyboard();
          closeMobileChatInput();
          return;
        }
        setMobileChatViewportHeight();
        resetMobileScroll();
      }, 250);
    }
    window.addEventListener("orientationchange", handleMobileChatOrientation);
    if (window.screen && screen.orientation && typeof screen.orientation.addEventListener === "function") {
      screen.orientation.addEventListener("change", handleMobileChatOrientation);
    }
    function focusInputNoScroll(input) {
      if (!input) return;
      setMobileChatViewportHeight();
      resetMobileScroll();
      try { input.focus({ preventScroll: true }); }
      catch (_) {
        try { input.focus(); } catch (_) {}
      }
      window.setTimeout(resetMobileScroll, 0);
      window.setTimeout(resetMobileScroll, 80);
      window.setTimeout(resetMobileScroll, 220);
    }
    if (stop) {
      stop.addEventListener("click", function () {
        stopToReady();
      });
    }
    if (skip) skip.addEventListener("click", function (ev) {
      if (isMobileViewport()) {
        ev.preventDefault();
        ev.stopPropagation();
        cycleCameraSource();
        return;
      }
      cancelOrNext();
    });

    var sendBtn = $("send-btn");
    var input = $("message-input");
    if (sendBtn) sendBtn.addEventListener("click", function () {
      if (window.matchMedia && window.matchMedia("(max-width: 520px)").matches) {
        if (!quickEmojiActive() && !canUseUrlCommandChat()) {
          closeMobileChatInput();
          updateQuickEmojiControls();
          return;
        }
        if (!document.body.classList.contains("mobile-chat-open")) {
          document.body.classList.add("mobile-chat-open");
          focusInputNoScroll(input);
          return;
        }
        if (!input || !String(input.value || "").trim()) {
          focusInputNoScroll(input);
          return;
        }
      }
      var hadText = !!(input && String(input.value || "").trim());
      sendChat();
      if (hadText) dismissPopupKeyboard(input);
    });
    if (input) {
      input.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          var hadText = !!String(input.value || "").trim();
          sendChat();
          if (hadText) dismissPopupKeyboard(input);
          if (window.matchMedia && window.matchMedia("(max-width: 520px)").matches) {
            closeMobileChatInput();
          }
        }
        if (ev.key === "Escape") {
          closeMobileChatInput();
        }
      });
      input.addEventListener("focus", function () {
        if (!window.matchMedia || !window.matchMedia("(max-width: 520px)").matches) {
          window.setTimeout(guardDesktopScroll, 0);
          window.setTimeout(guardDesktopScroll, 120);
          window.setTimeout(guardDesktopScroll, 350);
          return;
        }
        if (!document.body.classList.contains("mobile-chat-open")) return;
        setMobileChatViewportHeight();
        resetMobileScroll();
        window.setTimeout(resetMobileScroll, 80);
        window.setTimeout(resetMobileScroll, 220);
      });
      input.addEventListener("blur", function () {
        if (!window.matchMedia || !window.matchMedia("(max-width: 520px)").matches) return;
        if (!String(input.value || "").trim()) {
          window.setTimeout(closeMobileChatInput, 120);
        }
      });
      input.addEventListener("input", function () {
        if (!matchId) return;
        send({ type: "typing", matchId: matchId, isTyping: true });
        if (typingTimer) window.clearTimeout(typingTimer);
        typingTimer = window.setTimeout(function () {
          send({ type: "typing", matchId: matchId, isTyping: false });
        }, 900);
      });
    }

    document.querySelectorAll(".mobile-quick-emoji").forEach(function (btn) {
      btn.addEventListener("click", function () {
        sendQuickEmoji(btn.getAttribute("data-emoji") || btn.textContent || "");
      });
    });
    function openDeviceSettingsFromControl(ev) {
      if (ev) ev.preventDefault();
      var settingsBtn = $("device-settings-btn");
      if (settingsBtn && typeof settingsBtn.click === "function") {
        settingsBtn.click();
      }
    }
    var mobilePremiumControl = $("mobilePremiumControl");
    if (mobilePremiumControl) {
      mobilePremiumControl.addEventListener("click", openDeviceSettingsFromControl);
    }
    var desktopSettingsControl = $("video2SettingsTile");
    if (desktopSettingsControl) {
      desktopSettingsControl.addEventListener("click", openDeviceSettingsFromControl);
    }
    updateQuickEmojiControls();

    var countrySelect = $("countrySelect");
    var countryTile = $("countryTile");
    var countryTileEmoji = $("countryTileEmoji");
    var countryPopover = $("video2CountryPopover");
    function renderCountryPopup() {
      if (!countrySelect || !countryPopover) return;
      countryPopover.innerHTML = "";
      Array.prototype.forEach.call(countrySelect.options || [], function (opt) {
        var value = String(opt.value || "");
        var label = value ? String(opt.textContent || "").replace(/^[A-Z]{2}\s*-\s*/, "") : "Global / All Countries";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "video2-country-option";
        btn.setAttribute("role", "menuitem");
        btn.setAttribute("data-country", value);
        btn.innerHTML = '<span>' + label.replace(/[&<>"']/g, function (ch) {
          return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
        }) + '</span><span class="country-option-emoji" aria-hidden="true"></span>';
        setCountryIcon(btn.querySelector(".country-option-emoji"), value);
        btn.addEventListener("click", function () {
          countrySelect.value = value;
          countrySelect.dispatchEvent(new Event("change", { bubbles: true }));
          countryPopover.classList.remove("is-open");
          document.body.classList.remove("video2-country-drawer-open");
          if (countryTile) countryTile.setAttribute("aria-expanded", "false");
        });
        countryPopover.appendChild(btn);
      });
    }
    function syncCountrySelected() {
      if (!countrySelect || !countryPopover) return;
      Array.prototype.forEach.call(countryPopover.querySelectorAll(".video2-country-option"), function (btn) {
        btn.classList.toggle("is-selected", String(btn.getAttribute("data-country") || "") === String(countrySelect.value || ""));
      });
    }
    if (countrySelect) {
      countrySelect.value = readSavedCountryPreference();
      if (countryTile) {
        countryTile.setAttribute("data-flag", flagEmoji(countrySelect.value));
        countryTile.setAttribute("data-icon", flagEmoji(countrySelect.value));
        countryTile.setAttribute("aria-haspopup", "true");
        countryTile.setAttribute("aria-expanded", "false");
      }
      setCountryIcon(countryTileEmoji, countrySelect.value);
      renderCountryPopup();
      syncCountrySelected();
      countrySelect.addEventListener("change", function () {
        var value = selectedCountry();
        if (/^[A-Z]{2}$/.test(value)) {
          ensureCountryAllowed(value).then(function (allowed) {
            if (allowed === value) return;
            syncCountrySelected();
          });
        }
        saveManualCountryPreference(value);
        if (countryTile) {
          countryTile.setAttribute("data-flag", flagEmoji(value));
          countryTile.setAttribute("data-icon", flagEmoji(value));
        }
        setCountryIcon(countryTileEmoji, value);
        syncCountrySelected();
      });
      fetchDefaultCountry();
    }
    if (countryTile && countryPopover) {
      function closeCountryDrawer() {
        countryPopover.classList.remove("is-open");
        document.body.classList.remove("video2-country-drawer-open");
        countryTile.setAttribute("aria-expanded", "false");
      }
      countryTile.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (countryPopover.classList.contains("is-open")) {
          closeCountryDrawer();
          return;
        }
        closeCountryDrawer();
        fetchPremiumStatusGlobal(true).then(function (status) {
          if (status && status.premiumActive) {
            countryPopover.classList.add("is-open");
            document.body.classList.add("video2-country-drawer-open");
            countryTile.setAttribute("aria-expanded", "true");
            armDesktopHoverIdle();
            return;
          }
          openPremiumDrawer();
        }).catch(function () {
          openPremiumDrawer();
        });
      });
      document.addEventListener("click", function (ev) {
        if (!countryPopover.classList.contains("is-open")) return;
        if (countryPopover.contains(ev.target) || countryTile.contains(ev.target)) return;
        closeCountryDrawer();
      });
    }

    var buttons = Array.prototype.slice.call(document.querySelectorAll(".video2-gender-btn"));
    var identityTile = document.getElementById("video2IdentityTile");
    var identityIconEl = document.getElementById("video2IdentityEmoji");
    var identityPopover = document.getElementById("video2IdentityPopover");
    var desktopHoverIdleTimer = 0;
    function hasDesktopHoverPointer() {
      return !isMobileViewport() && !!(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches);
    }
    function clearDesktopHoverIdle() {
      if (desktopHoverIdleTimer) {
        window.clearTimeout(desktopHoverIdleTimer);
        desktopHoverIdleTimer = 0;
      }
      if (document.body) document.body.classList.remove("video2-hover-idle");
    }
    function hideDesktopHoverControls() {
      if (!hasDesktopHoverPointer()) {
        clearDesktopHoverIdle();
        return;
      }
      desktopHoverIdleTimer = 0;
      if (document.body) {
        document.body.classList.add("video2-hover-idle");
        document.body.classList.remove("video2-country-drawer-open");
      }
      if (countryPopover) countryPopover.classList.remove("is-open");
      if (countryTile) countryTile.setAttribute("aria-expanded", "false");
      if (identityPopover) identityPopover.classList.remove("is-open");
      if (identityTile) identityTile.setAttribute("aria-expanded", "false");
    }
    function armDesktopHoverIdle() {
      if (!hasDesktopHoverPointer()) {
        clearDesktopHoverIdle();
        return;
      }
      if (document.body) document.body.classList.remove("video2-hover-idle");
      if (desktopHoverIdleTimer) window.clearTimeout(desktopHoverIdleTimer);
      desktopHoverIdleTimer = window.setTimeout(hideDesktopHoverControls, 5000);
    }
    function bindDesktopHoverIdleTarget(target) {
      if (!target || !target.addEventListener) return;
      target.addEventListener("mouseenter", armDesktopHoverIdle);
      if (window.PointerEvent) {
        target.addEventListener("pointermove", armDesktopHoverIdle, { passive: true });
        target.addEventListener("pointerdown", armDesktopHoverIdle, { passive: true });
      } else {
        target.addEventListener("mousemove", armDesktopHoverIdle);
        target.addEventListener("mousedown", armDesktopHoverIdle);
      }
      target.addEventListener("focusin", armDesktopHoverIdle);
      target.addEventListener("keydown", armDesktopHoverIdle);
      target.addEventListener("wheel", armDesktopHoverIdle, { passive: true });
    }
    [
      document.getElementById("peer"),
      document.getElementById("self"),
      document.getElementById("message-area"),
      countryTile,
      countryPopover,
      identityTile,
      identityPopover,
      document.getElementById("video2PremiumTile"),
      stop,
      skip,
      desktopSettingsControl
    ].forEach(bindDesktopHoverIdleTarget);
    window.addEventListener("resize", function () {
      if (!hasDesktopHoverPointer()) clearDesktopHoverIdle();
    });
    if (identityTile && identityPopover) {
      identityTile.addEventListener("click", function (ev) {
        ev.preventDefault();
        armDesktopHoverIdle();
        var order = ["male", "female"];
        var current = "";
        try { current = selectedIdentity(); } catch (_) { current = "male"; }
        var currentIndex = order.indexOf(normalizeIdentity(current || "male"));
        var next = order[(Math.max(0, currentIndex) + 1) % order.length];
        try { localStorage.setItem("video2_identity_v1", next); } catch (_) {}
        render(next);
        identityPopover.classList.remove("is-open");
        identityTile.setAttribute("aria-expanded", "false");
      });
      document.addEventListener("click", function (ev) {
        if (!identityPopover.classList.contains("is-open")) return;
        if (identityPopover.contains(ev.target) || identityTile.contains(ev.target)) return;
        identityPopover.classList.remove("is-open");
        identityTile.setAttribute("aria-expanded", "false");
      });
    }
    if (!buttons.length) return;
    var selected = "";
    try { selected = String(localStorage.getItem("video2_identity_v1") || ""); } catch (_) {}
    selected = normalizeIdentity(selected || "male");
    try { localStorage.setItem("video2_identity_v1", selected); } catch (_) {}
    function identityLabel(value) {
      return "I am";
    }
    function identityIcon(value) {
      return normalizeIdentity(value);
    }
    function render(value) {
      value = normalizeIdentity(value || "male");
      buttons.forEach(function (btn) {
        var active = String(btn.getAttribute("data-gender") || "") === value;
        btn.classList.toggle("is-selected", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
      if (identityTile) {
        var label = identityLabel(value || "male");
        identityTile.setAttribute("data-label", label);
        identityTile.setAttribute("data-icon", identityIcon(value || "male"));
        identityTile.setAttribute("aria-label", value === "female" ? "I am female" : "I am male");
      }
      setGenderAvatarClass(identityIconEl, value || "male");
    }
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var value = normalizeIdentity(btn.getAttribute("data-gender") || "");
        try { localStorage.setItem("video2_identity_v1", value); } catch (_) {}
        render(value);
        if (identityPopover) identityPopover.classList.remove("is-open");
        if (identityTile) identityTile.setAttribute("aria-expanded", "false");
      });
    });
    render(selected);
  }

  function bindMobileGestures() {
    var peer = $("peer");
    if (!peer) return;
    var startX = 0;
    var startY = 0;
    var startT = 0;
    var dragging = false;
    var swiping = false;
    function isMobile() {
      return !!(window.matchMedia && window.matchMedia("(max-width: 520px)").matches);
    }
    function shouldIgnoreGesture(target) {
      if (!target || !target.closest) return false;
      return !!target.closest("button, a, input, textarea, select, [role='button'], [contenteditable='true'], .modal, .device-settings-drawer, .video2-country-popover, .video2-identity-popover");
    }
    function swipeActionAllowed(dx) {
      if (dx < 0) {
        if (searchActionPending || isSearching) return false;
        var label = String(($("skip-btn") && $("skip-btn").getAttribute("data-label")) || "");
        return label === "Next" ? canUseNextAction() : canUseStartAction();
      }
      return !!(matchId || isSearching || searchActionPending);
    }
    function runSwipeAction(dx) {
      if (dx < 0) {
        if (searchActionPending || isSearching) {
          updateActionButtons();
          return;
        }
        cancelOrNext();
        return;
      }
      stopToReady();
    }
    var nextFace = null;
    var nextFaceDir = 0;
    var releasePending = false;
    var cubeStatusEl = null;
    var cubeSpinnerEl = null;
    var cleanupTimer = 0;
    var lastDeg = 0;
    var releaseAnims = [];
    var suppressMouseGestureUntil = 0;
    var swipeActionLockedUntil = 0;
    var SWIPE_ACTION_COOLDOWN_MS = 900;
    function swipeActionLocked() {
      return Date.now() < swipeActionLockedUntil;
    }
    function lockSwipeAction(ms) {
      swipeActionLockedUntil = Math.max(swipeActionLockedUntil, Date.now() + (Number(ms) || SWIPE_ACTION_COOLDOWN_MS));
    }
    function cubeTransform(deg, width, k) {
      var half = width / 2;
      var persp = Math.max(700, width * 2);
      return "perspective(" + persp.toFixed(0) + "px) scale(" + (k || 1).toFixed(4) + ") translateZ(" + (-half).toFixed(1) + "px) rotateY(" + deg.toFixed(2) + "deg) translateZ(" + half.toFixed(1) + "px)";
    }
    function cubeContainScale(deg, width) {
      // shrink so the projected near edge never exceeds the tile bounds
      var persp = Math.max(700, width * 2);
      var rad = Math.min(90, Math.abs(deg)) * Math.PI / 180;
      var z = (width / 2) * Math.max(0, Math.sin(rad) + Math.cos(rad) - 1);
      return persp / (persp + z);
    }
    function cancelReleaseAnims() {
      while (releaseAnims.length) {
        try { releaseAnims.pop().cancel(); } catch (_) {}
      }
    }
    function runCubeRelease(fromDeg, toDeg, dir, width, durationMs) {
      var nw = nextFaceWidth();
      if (!peer.animate) {
        peer.style.transition = "transform " + (durationMs || 230) + "ms cubic-bezier(.22,.61,.36,1)";
        if (nextFace) nextFace.style.transition = peer.style.transition;
        peer.style.transform = cubeTransform(toDeg, width, 1);
        if (nextFace) nextFace.style.transform = cubeTransform(toDeg - dir * 90, nw, 1);
        return;
      }
      peer.style.transition = "none";
      if (nextFace) nextFace.style.transition = "none";
      var steps = 8;
      var pf = [];
      var nf = [];
      for (var i = 0; i <= steps; i++) {
        var t = i / steps;
        var e = 1 - Math.pow(1 - t, 3);
        var deg = fromDeg + (toDeg - fromDeg) * e;
        var k = cubeContainScale(deg, width);
        pf.push({ transform: cubeTransform(deg, width, k) });
        nf.push({ transform: cubeTransform(deg - dir * 90, nw, k) });
      }
      var opts = { duration: durationMs || 230, easing: "linear", fill: "forwards" };
      releaseAnims.push(peer.animate(pf, opts));
      if (nextFace) releaseAnims.push(nextFace.animate(nf, opts));
    }
    function playCubeTurnCue(dir) {
      if (dragging || swiping) return 0;
      if (nextFace && nextFace.classList.contains("is-active")) return 0;
      lastLocalSwipeAnimAt = Date.now();
      var width = Math.max(1, peer.clientWidth || window.innerWidth || 1);
      window.clearTimeout(cleanupTimer);
      cancelReleaseAnims();
      showNextFace(dir);
      if (dir < 0 && cubeStatusEl) cubeStatusEl.classList.add("is-active");
      if (dir < 0 && cubeSpinnerEl) {
        cubeSpinnerEl.style.animationDelay = (-(performance.now() % 900)).toFixed(0) + "ms";
        cubeSpinnerEl.classList.add("is-active");
      }
      peer.classList.remove("is-swiping");
      peer.classList.add("is-swipe-release");
      nextFace.classList.add("is-swipe-release");
      releasePending = true;
      runCubeRelease(0, dir * 90, dir, width, 320);
      cleanupTimer = window.setTimeout(function () {
        releasePending = false;
        lastDeg = 0;
        if (nextFace) nextFace.style.transform = cubeTransform(0, nextFaceWidth(), 1);
        peer.classList.remove("is-swipe-release");
        peer.style.transition = "";
        if (nextFace) nextFace.style.transition = "";
        peer.style.transform = "";
        peer.style.opacity = "";
        cancelReleaseAnims();
        cleanupTimer = window.setTimeout(hideNextFace, 160);
      }, 320);
      return 320;
    }
    cubeTurnCue = playCubeTurnCue;
    function showNextFace(dir) {
      var cubeHost = $("peer-cube-clip") || peer.parentNode || document.body;
      if (!nextFace) {
        nextFace = document.createElement("div");
        nextFace.id = "peer-cube-next";
        nextFace.setAttribute("aria-hidden", "true");
      }
      if (nextFace.parentNode !== cubeHost) cubeHost.appendChild(nextFace);
      var r = cubeHost.getBoundingClientRect ? cubeHost.getBoundingClientRect() : peer.getBoundingClientRect();
      nextFace.style.left = "0px";
      nextFace.style.top = "0px";
      nextFace.style.width = Math.max(1, r.width) + "px";
      nextFace.style.height = Math.max(1, r.height) + "px";
      if (!cubeStatusEl) {
        cubeStatusEl = document.createElement("div");
        cubeStatusEl.id = "peer-cube-status";
        cubeStatusEl.setAttribute("aria-hidden", "true");
        document.body.appendChild(cubeStatusEl);
      }
      renderLoaderStatusLabel(cubeStatusEl, "Searching for strangers...");
      if (!cubeSpinnerEl) {
        cubeSpinnerEl = document.createElement("div");
        cubeSpinnerEl.id = "peer-cube-spinner";
        cubeSpinnerEl.setAttribute("aria-hidden", "true");
        document.body.appendChild(cubeSpinnerEl);
      }
      cubeStatusEl.style.left = (r.left + r.width / 2) + "px";
      cubeStatusEl.style.top = (r.top + r.height / 2 + 44) + "px";
      cubeSpinnerEl.style.left = (r.left + r.width / 2 - 29) + "px";
      cubeSpinnerEl.style.top = (r.top + r.height / 2 - 29) + "px";
      cubeStatusEl.classList.remove("is-active");
      cubeSpinnerEl.classList.remove("is-active");
      nextFaceDir = dir;
      nextFace.classList.remove("is-swipe-release");
      nextFace.classList.add("is-active");
      nextFace.style.transform = cubeTransform(-dir * 90, Math.max(1, r.width));
    }
    function hideNextFace() {
      if (cubeStatusEl) cubeStatusEl.classList.remove("is-active");
      if (cubeSpinnerEl) cubeSpinnerEl.classList.remove("is-active");
      if (!nextFace) return;
      nextFace.classList.remove("is-active", "is-swipe-release");
      nextFace.style.transform = "";
    }
    function nextFaceWidth() {
      return Math.max(1, parseFloat((nextFace && nextFace.style.width) || "") || peer.clientWidth || window.innerWidth || 1);
    }
    function resetSwipe() {
      if (releasePending) return;
      swiping = false;
      setStartIntent(false);
      lastDeg = 0;
      cancelReleaseAnims();
      peer.classList.remove("is-swiping");
      peer.classList.add("is-swipe-release");
      peer.style.transform = "";
      peer.style.opacity = "";
      if (nextFace && nextFace.classList.contains("is-active")) {
        nextFace.classList.add("is-swipe-release");
        nextFace.style.transform = cubeTransform(-nextFaceDir * 90, nextFaceWidth(), 1);
      }
      window.clearTimeout(cleanupTimer);
      cleanupTimer = window.setTimeout(function () {
        peer.classList.remove("is-swipe-release");
        hideNextFace();
      }, 260);
    }
    function applySwipe(dx) {
      var width = Math.max(1, peer.clientWidth || window.innerWidth || 1);
      var pct = Math.max(-1, Math.min(1, dx / width));
      var dir = dx < 0 ? -1 : 1;
      if (!nextFace || !nextFace.classList.contains("is-active") || nextFaceDir !== dir) showNextFace(dir);
      var deg = pct * 90;
      lastDeg = deg;
      lastLocalSwipeAnimAt = Date.now();
      var k = cubeContainScale(deg, width);
      peer.style.transform = cubeTransform(deg, width, k);
      peer.style.opacity = "";
      nextFace.style.transform = cubeTransform(deg - dir * 90, nextFaceWidth(), k);
    }
    function beginGesture(x, y, target) {
      if (!isMobile()) return;
      if (releasePending) return;
      if (swipeActionLocked()) return;
      if (shouldIgnoreGesture(target)) return;
      startX = x;
      startY = y;
      startT = Date.now();
      dragging = true;
      swiping = false;
      lastDeg = 0;
      window.clearTimeout(cleanupTimer);
      cancelReleaseAnims();
      peer.classList.remove("is-swipe-release");
    }
    function moveGesture(x, y, ev) {
      if (!dragging || !isMobile()) return;
      var dx = x - startX;
      var dy = y - startY;
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy) * 1.1) return;
      if (!swipeActionAllowed(dx)) return;
      if (ev && ev.cancelable) ev.preventDefault();
      if (!swiping) {
        swiping = true;
        peer.classList.add("is-swiping");
      }
      applySwipe(dx);
    }
    function endGesture(x, y, ev) {
      if (!isMobile()) return;
      if (!dragging) return;
      dragging = false;
      var dx = x - startX;
      var dy = y - startY;
      if (Date.now() - startT > 900 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.25) {
        resetSwipe();
        return;
      }
      if (!swipeActionAllowed(dx)) {
        resetSwipe();
        updateActionButtons();
        return;
      }
      var direction = dx < 0 ? -1 : 1;
      lockSwipeAction(direction < 0 ? 1800 : SWIPE_ACTION_COOLDOWN_MS);
      if (direction < 0) markLocalNextCueSuppressed(3200);
      if (direction < 0) setStartIntent(true);
      if (swiping && ev && ev.cancelable) ev.preventDefault();
      var width = Math.max(1, peer.clientWidth || window.innerWidth || 1);
      if (!nextFace || !nextFace.classList.contains("is-active") || nextFaceDir !== direction) showNextFace(direction);
      peer.classList.remove("is-swiping");
      peer.classList.add("is-swipe-release");
      nextFace.classList.add("is-swipe-release");
      if (direction < 0 && cubeStatusEl) cubeStatusEl.classList.add("is-active");
      if (direction < 0 && cubeSpinnerEl) {
        cubeSpinnerEl.style.animationDelay = (-(performance.now() % 900)).toFixed(0) + "ms";
        cubeSpinnerEl.classList.add("is-active");
      }
      lastLocalSwipeAnimAt = Date.now();
      releasePending = true;
      runCubeRelease(lastDeg, direction * 90, direction, width);
      window.clearTimeout(cleanupTimer);
      cleanupTimer = window.setTimeout(function () {
        releasePending = false;
        swiping = false;
        lastDeg = 0;
       if (nextFace) nextFace.style.transform = cubeTransform(0, nextFaceWidth(), 1);
        peer.classList.remove("is-swipe-release");
        peer.style.transition = "";
        if (nextFace) nextFace.style.transition = "";
        peer.style.transform = "";
        peer.style.opacity = "";
        cancelReleaseAnims();
        lastLocalSwipeAnimAt = Date.now();
        runSwipeAction(dx);
        cleanupTimer = window.setTimeout(hideNextFace, 140);
      }, 230);
    }
    document.addEventListener("touchstart", function (ev) {
      if (!ev.touches || !ev.touches.length) return;
      suppressMouseGestureUntil = Date.now() + 900;
      beginGesture(ev.touches[0].clientX, ev.touches[0].clientY, ev.target);
    }, { passive: true });
    document.addEventListener("touchmove", function (ev) {
      if (!ev.touches || !ev.touches.length) return;
      suppressMouseGestureUntil = Date.now() + 900;
      moveGesture(ev.touches[0].clientX, ev.touches[0].clientY, ev);
    }, { passive: false });
    document.addEventListener("touchend", function (ev) {
      suppressMouseGestureUntil = Date.now() + 900;
      var t = ev.changedTouches && ev.changedTouches[0];
      if (!t) { resetSwipe(); return; }
      endGesture(t.clientX, t.clientY, ev);
    }, { passive: false });
    document.addEventListener("touchcancel", function () {
      dragging = false;
      resetSwipe();
    }, { passive: true });
    document.addEventListener("mousedown", function (ev) {
      if (Date.now() < suppressMouseGestureUntil) return;
      if (ev.button !== 0) return;
      beginGesture(ev.clientX, ev.clientY, ev.target);
    });
    document.addEventListener("mousemove", function (ev) {
      if (Date.now() < suppressMouseGestureUntil) return;
      moveGesture(ev.clientX, ev.clientY, ev);
    });
    document.addEventListener("mouseup", function (ev) {
      if (Date.now() < suppressMouseGestureUntil) return;
      endGesture(ev.clientX, ev.clientY, ev);
    });
    window.addEventListener("mouseleave", function () {
      if (!dragging) return;
      dragging = false;
      resetSwipe();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    setOverlay("ready", "");
    document.body.classList.add("video2-initial-screen");
    reportScreenshotBootDiagnostic();
    updateMobileSwipeHintVisibility();
    startSitePresenceHeartbeat();
    bindSafetyNotice();
    bindPremiumDrawer();
    bindMenu();
    bindMute();
    bindRemoteAudioTouchControls();
    bindVoteControls();
    bindReportModal();
    bindDeviceModal();
    bindSettingsDarkMode();
    bindSettingsAutoConnect();
    bindSettingsHotkeys();
    bindRuntimeHotkeys();
    bindConceptControls();
    bindMobileGestures();
    bindMediaDeviceRecovery();
    bindPageLifecycle();
    applyUrlCommand();
    connectSocket();
    fetchIceServersNow(false).catch(function () {});
    ensureLocalMedia().then(function () {
      return ensureFaceBlinkVerified("initial_camera");
    }).catch(function (err) {
      // Never surface raw browser error strings (e.g. Safari's "The request is
      // not allowed by the user agent..."). Media errors already show the
      // local-feed notice with the Allow Camera button, so keep status empty.
      var rawErrText = String((err && err.name || "") + " " + (err && err.message || ""));
      var isMediaErr = /notallowed|permission|denied|not allowed by the user agent|devices?notfound|notreadable|getusermedia|camera|microphone/i.test(rawErrText);
      setStatus(isMediaErr ? "" : (err && err.message ? err.message : "Camera permission needed"));
    });
  });
})();
