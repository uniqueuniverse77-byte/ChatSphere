/* global window, document */
/**
 * chat.js
 * - Text-only ChatSphere-style chat using the same edge/matchmaker backend.
 * - Uses existing IDs in public/chat.html
 * - Defines window.main() so existing captcha flow can start the app
 */

(function () {
  var wsClient = null;
  var seq = 0;
  var matchId = null;
  var myUserId = null;
  var partnerUserId = null;
  var myPremiumActive = false;
  var partnerPremiumActive = false;
  var AUTO_MESSAGE_ENABLED_KEY = "ChatSphere_auto_message_on_connect_v1";
  var AUTO_MESSAGE_TEXT_KEY = "ChatSphere_auto_message_text_v1";
  var autoMsgToken = 0;
  var autoMsgTimer = null;
  var lastAutoMsgSentMatchId = null;
  var cmdFreezeToken = 0;
  var cmdFreezeTimer = null;
  var banModalActive = false;
  var lastBanPayload = null;
  var banStatusCache = null;
  var banStatusCacheAt = 0;
  var banStatusInflight = null;
  // Terminal block (e.g. VPN/proxy) should not trigger reconnect spam.
  var vpnBlockedActive = false;
  // Generic terminal connection error (e.g. device blocks) should not trigger reconnect spam.
  var connectionErrorActive = false;
  var strikeModalActive = false;
  var strikeModalTimer = null;
  var strikeModalRemaining = 0;
  var lastStrikeTriggerText = "";
  var lastStrikeGuidelinesUrl = "/community-guidelines.html";
  var lastStrikeCount = 0;
  var lastStrikeMax = 2;
  var lastStrikeBanText = "";
  var lastStrikeRuleKey = "";
  var guidelinesNoticeShown = false;
  // Temporarily disable the "Keep it clean..." guidelines notice under the "now talking" line.
  // Flip to true when you want it back.
  var ENABLE_GUIDELINES_NOTICE = false;
  var ENABLE_CONNECT_POLICY_NOTICE = false;
  var CONNECT_POLICY_NOTICE = "Illegal activity will get you banned and reported to authorities.";
  var statusDotsTimer = null;
  var statusDotsPhase = 0;
  var statusLineToken = 0;
  var isSearching = false;
  var searchWatchdogTimer = null;
  var searchWatchdogToken = 0;
  var searchWatchdogRetries = 0;
  var SEARCH_WATCHDOG_MS = 25000;
  var reportAvailable = false;
  var REPORT_GRACE_MS = 5 * 60 * 1000;
  var reportGraceMatchId = null;
  var reportGraceTimer = null;
  var voteGraceMatchId = null;
  var voteGraceTimer = null;
  var partnerVoteScore = { upvotes: 0, downvotes: 0, score: 0 };
  var userVoteByMatchId = {};
  var gaMatchFoundSentId = null;
  var autoSearchPending = true;
  var typingStopTimer = null;
  var localIsTyping = false;
  var partnerIsTyping = false;
  var partnerTypingDotsTimer = null;
  var partnerTypingDotsPhase = 0;
  var MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
  // Session timer (shows how long the user has been connected to the current stranger)
  var sessionTimerStartAt = 0;
  var sessionTimerInterval = null;

  function $(id) {
    return document.getElementById(id);
  }

  function sendAnalyticsEvent(name, params) {
    try {
      if (typeof window.gtag !== "function") return;
      params = params || {};
      params.event_category = params.event_category || "text_chat";
      params.transport_type = "beacon";
      window.gtag("event", name, params);
    } catch (_) {}
  }

  function sendTextAnalyticsEvent(name, params) {
    params = params || {};
    params.chat_type = "text";
    params.chat_state = matchId ? "connected" : (isSearching ? "searching" : "idle");
    sendAnalyticsEvent(name, params);
  }

  function stopSearchWatchdog() {
    searchWatchdogToken += 1;
    searchWatchdogRetries = 0;
    if (searchWatchdogTimer) {
      try { window.clearTimeout(searchWatchdogTimer); } catch (_) {}
      searchWatchdogTimer = null;
    }
  }

  function resetStalledSearch() {
    try { seq += 1; wsClient && wsClient.send({ type: "cancel", seq: seq, chatType: "text" }); } catch (_) {}
    try { hideStatusLine(); } catch (_) {}
    try { setSkipLabel("Start"); } catch (_) {}
    isSearching = false;
    stopSearchWatchdog();
    try { showInlineError("Search timed out. Try again."); } catch (_) {}
  }

  function startSearchWatchdog() {
    if (!isSearching || matchId) return;
    searchWatchdogToken += 1;
    var token = searchWatchdogToken;
    if (searchWatchdogTimer) {
      try { window.clearTimeout(searchWatchdogTimer); } catch (_) {}
      searchWatchdogTimer = null;
    }
    searchWatchdogTimer = window.setTimeout(function () {
      if (token !== searchWatchdogToken) return;
      if (!isSearching || matchId) return;
      if (searchWatchdogRetries >= 2) {
        resetStalledSearch();
        return;
      }
      searchWatchdogRetries += 1;
      try { showInlineError("Still looking... retrying."); } catch (_) {}
      try { seq += 1; wsClient && wsClient.send({ type: "cancel", seq: seq, chatType: "text" }); } catch (_) {}
      window.setTimeout(function () {
        try {
          if (!wsClient) return;
          if (!matchId) findPartner();
        } catch (_) {}
      }, 120);
      startSearchWatchdog();
    }, SEARCH_WATCHDOG_MS);
  }

  function ensureMessageOverlayRowEl() {
    var area = document.getElementById("message-area");
    if (!area) return null;
    // Place timer/strike row in the message-area so it can be positioned as an overlay.
    var host = area;
    var row = document.getElementById("messageOverlayRow");
    if (row) return row;
    row = document.createElement("div");
    row.id = "messageOverlayRow";
    row.className = "message-overlay-row";
    row.setAttribute("aria-hidden", "true");
    try {
      if (host && host.firstChild) host.insertBefore(row, host.firstChild);
      else host.appendChild(row);
    } catch (_) {
      area.appendChild(row);
    }
    return row;
  }

  function ensureModStrikeEl() {
    var row = ensureMessageOverlayRowEl();
    if (!row) return null;
    var el = document.getElementById("modStrikeBadge");
    if (el) return el;
    el = document.createElement("div");
    el.id = "modStrikeBadge";
    el.className = "mod-strike-badge";
    el.setAttribute("aria-hidden", "true");
    el.style.display = "none";
    el.textContent = "Strike 1/2";
    // Ensure the badge sits to the LEFT of the timer.
    var timer = document.getElementById("sessionTimer");
    if (timer && timer.parentNode === row) row.insertBefore(el, timer);
    else row.appendChild(el);
    return el;
  }

  function showModStrike(strikes, max, banText) {
    var el = ensureModStrikeEl();
    if (!el) return;
    var s = Math.max(0, Math.floor(Number(strikes) || 0));
    var m = Math.max(1, Math.floor(Number(max) || 2));
    el.textContent = "Strike " + String(s) + "/" + String(m);
    el.style.display = "";
    if (banText) {
      try { el.title = String(banText || ""); } catch (_) {}
    }
  }

  function setChatControlsEnabled(enabled) {
    try {
      var input = $("message-input");
      if (input) {
        input.disabled = !enabled;
        input.readOnly = !enabled;
        if (enabled) {
          input.removeAttribute("disabled");
          input.removeAttribute("readonly");
          input.setAttribute("aria-disabled", "false");
        } else {
          input.setAttribute("aria-disabled", "true");
        }
      }
    } catch (_) {}
    try {
      var sendBtn = $("send-btn");
      if (sendBtn) sendBtn.disabled = !enabled;
    } catch (_) {}
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

    var h = document.createElement("div");
    h.className = "mod-strike-modal-title";
    h.textContent = "Moderation warning";
    modal.appendChild(h);

    var rule = document.createElement("div");
    rule.id = "modStrikeModalRule";
    rule.className = "mod-strike-modal-rule";
    rule.textContent = "";
    modal.appendChild(rule);

    var p = document.createElement("div");
    p.id = "modStrikeModalText";
    p.className = "mod-strike-modal-text";
    modal.appendChild(p);

    var quote = document.createElement("div");
    quote.id = "modStrikeModalQuote";
    quote.className = "mod-strike-modal-quote";
    modal.appendChild(quote);

    var links = document.createElement("div");
    links.className = "mod-strike-modal-links";
    var prompt = document.createElement("div");
    prompt.className = "mod-strike-modal-guidelines-prompt";
    prompt.textContent = "Please review the guidelines below.";
    links.appendChild(prompt);
    var a = document.createElement("a");
    a.id = "modStrikeModalGuidelinesLink";
    a.href = "/community-guidelines.html";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Review Community Guidelines";
    links.appendChild(a);
    modal.appendChild(links);

    var actions = document.createElement("div");
    actions.className = "mod-strike-modal-actions";
    var btn = document.createElement("button");
    btn.id = "modStrikeModalAckBtn";
    btn.className = "mod-strike-modal-ack";
    btn.type = "button";
    btn.disabled = true;
    btn.textContent = "I understand (10)";
    actions.appendChild(btn);
    modal.appendChild(actions);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    // Prevent click-through dismissal.
    backdrop.addEventListener("click", function (ev) {
      // Only block clicks on the backdrop itself (allow clicks inside the modal, e.g. guidelines link).
      try {
        if (ev && ev.target === backdrop) {
          ev.preventDefault();
          ev.stopPropagation();
        }
      } catch (_) {}
    });

    // Prevent ESC from closing (best-effort).
    document.addEventListener("keydown", function (ev) {
      try {
        if (!strikeModalActive) return;
        if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
        }
      } catch (_) {}
    });

    btn.addEventListener("click", function () {
      if (strikeModalRemaining > 0) return;
      hideStrikeModal();
    });

    return backdrop;
  }

  function renderStrikeModalCountdown() {
    var btn = document.getElementById("modStrikeModalAckBtn");
    if (!btn) return;
    var remaining = Math.max(0, Math.floor(Number(strikeModalRemaining) || 0));
    if (remaining > 0) {
      btn.disabled = true;
      btn.textContent = "I understand (" + String(remaining) + ")";
    } else {
      btn.disabled = false;
      btn.textContent = "I understand";
    }
  }

  function showStrikeModal(triggerText, guidelinesUrl, ackTimeoutSec, strikes, max, banText, ruleKey) {
    strikeModalActive = true;
    lastStrikeTriggerText = String(triggerText || "").trim();
    lastStrikeGuidelinesUrl = String(guidelinesUrl || "/community-guidelines.html") || "/community-guidelines.html";
    lastStrikeCount = Math.max(0, Math.floor(Number(strikes) || 0));
    lastStrikeMax = Math.max(1, Math.floor(Number(max) || 2));
    lastStrikeBanText = String(banText || "");
    lastStrikeRuleKey = String(ruleKey || "");

    var backdrop = ensureStrikeModal();
    if (!backdrop) return;

    try {
      function inferRuleKeyFromText(text) {
        var t = String(text || "").toLowerCase();
        if (!t) return "";
        if (/\bhttps?:\/\/\S+/.test(t) || /\bwww\.\S+/.test(t) || /\b(?:t\.me|telegram\.me|discord\.gg)\b/.test(t)) return "spam_links";
        if (/\b(snap|snapchat|kik|whatsapp|telegram|insta|instagram|onlyfans|cashapp|venmo)\b/.test(t)) return "contact_solicitation";
        var sexual = /\b(nudes?|send\s*nudes?|pics?|rate\s*me|horny|sexy)\b/.test(t);
        var age = /\b(13|14|15|16|17|underage|minor)\b/.test(t);
        var asl = /\basl\b|\bage\?\b|how old are you\b/.test(t);
        if (sexual && age) return "possible_predator";
        if (sexual && asl) return "sexual_plus_asl";
        if (sexual) return "sexual_content";
        return "";
      }

      var r = document.getElementById("modStrikeModalRule");
      if (!r) {
        // Backward compatible + robust: insert rule row right before the text block if missing.
        var textEl = document.getElementById("modStrikeModalText");
        var modal = textEl && textEl.parentNode ? textEl.parentNode : null;
        if (modal) {
          r = document.createElement("div");
          r.id = "modStrikeModalRule";
          r.className = "mod-strike-modal-rule";
          r.textContent = "";
          try { modal.insertBefore(r, textEl); } catch (_) { try { modal.appendChild(r); } catch (_) {} }
        }
      }
      if (r) {
        var key = String(lastStrikeRuleKey || inferRuleKeyFromText(lastStrikeTriggerText) || "");
        var label = "";
        if (key === "spam_links") label = "Spam / suspicious links";
        else if (key === "contact_solicitation") label = "Contact solicitation (Snap/Kik/etc.)";
        else if (key === "repetitive_spam") label = "Repetitive spam";
        else if (key === "sexual_content") label = "Sexual content";
        else if (key === "sexual_plus_asl") label = "Sexual content + ASL/age";
        else if (key === "possible_predator") label = "Possible minor-related sexual content";
        else if (key === "cp_mention") label = "Child sexual abuse material (CSAM) mention";
        else if (key) label = key;
        if (!label) label = "Unknown";
        r.textContent = "Rule flagged: " + label;
        r.style.display = "";
      }
    } catch (_) {}

    try {
      var p = document.getElementById("modStrikeModalText");
      if (p) {
        var line1 = "You now have Strike " + String(lastStrikeCount) + "/" + String(lastStrikeMax) + ".";
        // Intentional: make the consequence very explicit for strike 1 UX.
        // We keep the strike counters dynamic, but the messaging matches the configured strike-ban policy.
        var line2 = "One more strike WILL result in a 7-day ban.";
        p.textContent = line1 + "\n" + line2;
      }
    } catch (_) {}

    try {
      var q = document.getElementById("modStrikeModalQuote");
      if (q) q.textContent = lastStrikeTriggerText ? ('"' + lastStrikeTriggerText + '"') : "(message unavailable)";
    } catch (_) {}

    try {
      var link = document.getElementById("modStrikeModalGuidelinesLink");
      if (link) link.href = lastStrikeGuidelinesUrl;
    } catch (_) {}

    // Disable chat controls until acknowledged.
    setChatControlsEnabled(false);

    // Show modal + start countdown.
    backdrop.style.display = "";
    strikeModalRemaining = Math.max(0, Math.floor(Number(ackTimeoutSec) || 10));
    renderStrikeModalCountdown();
    if (strikeModalTimer) {
      try { window.clearInterval(strikeModalTimer); } catch (_) {}
      strikeModalTimer = null;
    }
    strikeModalTimer = window.setInterval(function () {
      strikeModalRemaining = Math.max(0, strikeModalRemaining - 1);
      renderStrikeModalCountdown();
      if (strikeModalRemaining <= 0) {
        try {
          if (strikeModalTimer) window.clearInterval(strikeModalTimer);
        } catch (_) {}
        strikeModalTimer = null;
      }
    }, 1000);
  }

  function hideStrikeModal() {
    strikeModalActive = false;
    if (strikeModalTimer) {
      try { window.clearInterval(strikeModalTimer); } catch (_) {}
      strikeModalTimer = null;
    }
    strikeModalRemaining = 0;
    var backdrop = document.getElementById("modStrikeModalBackdrop");
    if (backdrop) backdrop.style.display = "none";
    // Re-enable chat controls after ack (best-effort).
    setChatControlsEnabled(true);
    try { focusMessageInputMaybe(); } catch (_) {}
  }

  function ensureSessionTimerEl() {
    var row = ensureMessageOverlayRowEl();
    if (!row) return null;
    var el = document.getElementById("sessionTimer");
    if (el) return el;
    el = document.createElement("div");
    el.id = "sessionTimer";
    el.className = "session-timer";
    el.setAttribute("aria-hidden", "true");
    el.style.display = "none";
    el.textContent = "00:00:00";
    row.appendChild(el);
    return el;
  }

  function fmtSessionMs(ms) {
    ms = Math.max(0, Number(ms) || 0);
    var sec = Math.floor(ms / 1000);
    var h = Math.floor(sec / 3600);
    sec -= h * 3600;
    var m = Math.floor(sec / 60);
    sec -= m * 60;
    function pad2(n) {
      n = Number(n) || 0;
      return n < 10 ? "0" + n : "" + n;
    }
    // Always show HH:MM:SS (supports 00:00:00).
    var hh = h < 10 ? "0" + String(h) : String(h);
    return hh + ":" + pad2(m) + ":" + pad2(sec);
  }

  function resetSessionTimer() {
    if (sessionTimerInterval) {
      try { window.clearInterval(sessionTimerInterval); } catch (_) {}
      sessionTimerInterval = null;
    }
    sessionTimerStartAt = 0;
    var el = document.getElementById("sessionTimer");
    if (el) el.style.display = "none";
  }

  // Freeze timer in-place so the user can see how long the last chat lasted.
  // It will be reset/restarted only when a new stranger match begins.
  function freezeSessionTimer() {
    if (sessionTimerInterval) {
      try { window.clearInterval(sessionTimerInterval); } catch (_) {}
      sessionTimerInterval = null;
    }
    var el = ensureSessionTimerEl();
    if (!el) return;
    el.style.display = "";
    if (sessionTimerStartAt) {
      el.textContent = fmtSessionMs(Date.now() - sessionTimerStartAt);
    }
  }

  function startSessionTimer() {
    var el = ensureSessionTimerEl();
    if (!el) return;
    // Reset visible value immediately when a new stranger starts.
    el.textContent = "00:00:00";
    sessionTimerStartAt = Date.now();
    el.style.display = "";
    function tick() {
      if (!sessionTimerStartAt) return;
      el.textContent = fmtSessionMs(Date.now() - sessionTimerStartAt);
    }
    tick();
    if (sessionTimerInterval) {
      try { window.clearInterval(sessionTimerInterval); } catch (_) {}
    }
    sessionTimerInterval = window.setInterval(tick, 1000);
  }

  function disableSkipButtonForMs(ms) {
    ms = Math.max(0, Number(ms || 0));
    cmdFreezeToken += 1;
    var token = cmdFreezeToken;
    if (cmdFreezeTimer) {
      try { window.clearTimeout(cmdFreezeTimer); } catch (_) {}
      cmdFreezeTimer = null;
    }
    var btn = $("skip-btn");
    if (!btn) return;
    var wasDisabled = !!btn.disabled;
    try {
      btn.dataset.cmdDisabled = "1";
      btn.dataset.cmdPrevDisabled = wasDisabled ? "1" : "0";
    } catch (_) {}
    btn.disabled = true;
    try {
      btn.style.opacity = "0.55";
      btn.style.cursor = "not-allowed";
      btn.title = "Disabled briefly";
    } catch (_) {}
    cmdFreezeTimer = window.setTimeout(function () {
      if (token !== cmdFreezeToken) return;
      var b = $("skip-btn");
      if (!b) return;
      var prevDisabled = false;
      try {
        prevDisabled = b.dataset && b.dataset.cmdPrevDisabled === "1";
      } catch (_) {}
      // Only re-enable if we were the one that disabled it.
      b.disabled = !!prevDisabled;
      try {
        b.style.opacity = "";
        b.style.cursor = "";
        b.title = "";
        if (b.dataset) {
          delete b.dataset.cmdDisabled;
          delete b.dataset.cmdPrevDisabled;
        }
      } catch (_) {}
    }, ms);
  }

  function sanitizeAutoMessageText(s) {
    var v = String(s || "");
    v = v.replace(/[\r\n]+/g, " ");
    v = v.replace(/\s+/g, " ").trim();
    if (v.length > 500) v = v.slice(0, 500).trim();
    return v;
  }

  function getSavedAutoMessageEnabled() {
    try {
      var v = localStorage.getItem(AUTO_MESSAGE_ENABLED_KEY);
      return v === "1";
    } catch (_) {
      return false;
    }
  }

  function setSavedAutoMessageEnabled(on) {
    try {
      localStorage.setItem(AUTO_MESSAGE_ENABLED_KEY, on ? "1" : "0");
    } catch (_) {}
  }

  function getSavedAutoMessageText() {
    try {
      return sanitizeAutoMessageText(localStorage.getItem(AUTO_MESSAGE_TEXT_KEY) || "");
    } catch (_) {
      return "";
    }
  }

  function setSavedAutoMessageText(text) {
    try {
      localStorage.setItem(AUTO_MESSAGE_TEXT_KEY, sanitizeAutoMessageText(text));
    } catch (_) {}
  }

  function syncAutoMessageControls() {
    var cb = $("autoMessageOnConnect");
    var inp = $("autoMessageText");
    var on = !!getSavedAutoMessageEnabled();
    if (cb) cb.checked = on;
    if (inp) {
      inp.value = getSavedAutoMessageText();
      inp.disabled = !on;
      try { inp.setAttribute("aria-disabled", on ? "false" : "true"); } catch (_) {}
    }
  }

  function wireAutoMessageControls() {
    var cb = $("autoMessageOnConnect");
    var inp = $("autoMessageText");
    // Controls exist inside postDisconnectActions; be tolerant if they aren't present.
    syncAutoMessageControls();
    if (cb) {
      try {
        if (cb.dataset && cb.dataset.bound === "1") return;
        if (cb.dataset) cb.dataset.bound = "1";
      } catch (_) {}
      cb.addEventListener("change", function () {
        var wantOn = !!cb.checked;
        if (!wantOn) {
          setSavedAutoMessageEnabled(false);
          syncAutoMessageControls();
          return;
        }
        // Gate enabling if no premium and no trial remaining (avoid "it works for free" confusion).
        fetchPremiumStatus(true).then(function (p) {
          if (p && p.premiumActive) {
            setSavedAutoMessageEnabled(true);
            syncAutoMessageControls();
            return;
          }
          var rem = Number(p && p.trialRemainingByFeature && p.trialRemainingByFeature.auto_message);
          if (isFinite(rem) && rem > 0) {
            setSavedAutoMessageEnabled(true);
            syncAutoMessageControls();
            return;
          }
          // Not allowed: revert toggle and show premium modal.
          try { cb.checked = false; } catch (_) {}
          setSavedAutoMessageEnabled(false);
          syncAutoMessageControls();
          addSystemMessage(premiumRequiredText("auto_message", p), true);
          try { showPremiumModal("auto_message", p); } catch (_) {}
        });
      });
    }
    if (inp) {
      inp.addEventListener("input", function () {
        setSavedAutoMessageText(inp.value || "");
      });
      inp.addEventListener("blur", function () {
        syncAutoMessageControls();
      });
    }
  }

  function cancelPendingAutoMessage() {
    autoMsgToken += 1;
    if (autoMsgTimer) {
      try { window.clearTimeout(autoMsgTimer); } catch (_) {}
      autoMsgTimer = null;
    }
  }

  function maybeScheduleAutoMessageOnConnect(mid) {
    cancelPendingAutoMessage();
    var token = autoMsgToken;
    autoMsgTimer = window.setTimeout(function () {
      if (token !== autoMsgToken) return;
      if (!wsClient || !matchId) return;
      if (String(matchId) !== String(mid)) return;
      if (!getSavedAutoMessageEnabled()) return;
      if (lastAutoMsgSentMatchId && String(lastAutoMsgSentMatchId) === String(matchId)) return;
      var text = getSavedAutoMessageText();
      if (!text) return;
      try {
        var input = $("message-input");
        if (input && String(input.value || "").trim()) return;
      } catch (_) {}
      lastAutoMsgSentMatchId = matchId;
      // Premium gate: auto-message consumes trial uses.
      consumePremium("auto_message").then(function (p) {
        if (!p || !p.ok) {
          setSavedAutoMessageEnabled(false);
          syncAutoMessageControls();
          addSystemMessage(premiumRequiredText("auto_message", p), true);
          try { showPremiumModal("auto_message", p); } catch (_) {}
          return;
        }
      try {
        wsClient.send({ type: "chat_message", matchId: matchId, text: text });
      } catch (_) {}
      });
    }, 350);
  }

  function clearMessageArea() {
    var messages = $("messages");
    if (!messages) return;
    // Keep the typing element (it's reused by showStatusLine()).
    var typing = $("typing");
    var actions = $("postDisconnectActions");
    messages.textContent = "";
    try { messages.classList.remove("messages-terminal-state"); } catch (_) {}
    if (typing) messages.appendChild(typing);
    if (actions) {
      actions.style.display = "none";
      messages.appendChild(actions);
    }
    messages.scrollTop = messages.scrollHeight;
  }

  function resetTypingIndicatorElement() {
    var typing = $("typing");
    if (!typing) return;
    // Restore defaults (CSS-driven) after showStatusLine() uses inline styles.
    typing.textContent = "";
    typing.style.fontWeight = "";
    typing.style.fontStyle = "";
    typing.style.textAlign = "";
    typing.style.alignSelf = "";
    typing.style.maxWidth = "";
    typing.style.fontSize = "";
  }

  function ensurePartnerTypingBubble() {
    var messages = $("messages");
    if (!messages) return null;
    var existing = document.getElementById("partnerTypingBubble");
    if (existing) return existing;
    var div = document.createElement("div");
    div.id = "partnerTypingBubble";
    div.className = "message message-stranger typing-bubble";
    div.setAttribute("aria-label", "Stranger is typing");
    div.setAttribute("role", "status");
    div.setAttribute("aria-live", "polite");

    ensurePremiumBadgeStyles();
    // Match the "Stranger:" prefix so it reads like the next incoming message.
    var who = document.createElement("span");
    who.className = "strange";
    renderNameWithPremiumBadge(who, "Stranger", !!partnerPremiumActive);
    who.appendChild(document.createTextNode(": "));
    div.appendChild(who);

    var t = document.createElement("span");
    t.className = "typing-text";
    t.textContent = "is typing";
    div.appendChild(t);

    var dots = document.createElement("span");
    dots.className = "typing-dots";
    dots.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 3; i++) {
      var d = document.createElement("span");
      d.className = "typing-dot";
      dots.appendChild(d);
    }
    div.appendChild(dots);
    return div;
  }

  function ensurePremiumBadgeStyles() {
    try {
      if (document.getElementById("premiumNameBadgeStyle")) return;
      var st = document.createElement("style");
      st.id = "premiumNameBadgeStyle";
      st.textContent =
        ".premIconBtn{" +
          "display:inline-flex;align-items:center;justify-content:center;" +
          "margin-right:6px;padding:0;" +
          "border:0;background:transparent;cursor:pointer;" +
          "transform:translateY(1px);" +
        "}" +
        ".premIconBtn:active{transform:translateY(2px);}" +
        ".premIconBtn:focus{outline:2px solid rgba(76,141,255,0.40);outline-offset:2px;border-radius:6px;}" +
        ".premIcon{" +
          "width:14px;height:14px;display:block;" +
          "filter:drop-shadow(0 1px 1px rgba(0,0,0,0.25));" +
        "}";
      (document.head || document.documentElement).appendChild(st);
    } catch (_) {}
  }

  function openPremiumInfoFromBadge(ev) {
    try { if (ev) { ev.preventDefault(); ev.stopPropagation(); } } catch (_) {}
    try {
      getPremiumStatus(true).then(function (p) {
        try { showPremiumModal("badge", p || null); } catch (_) {}
      }).catch(function () {
        try { showPremiumModal("badge", null); } catch (_) {}
      });
    } catch (_) {
      try { showPremiumModal("badge", null); } catch (_) {}
    }
  }

  function renderNameWithPremiumBadge(container, label, isPremium) {
    if (!container) return;
    container.textContent = "";
    try {
      if (isPremium) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "premIconBtn";
        b.title = "Premium Badge (click for info)";
        b.setAttribute("aria-label", "Premium Badge. Click for info.");
        b.addEventListener("click", openPremiumInfoFromBadge);

        var img = document.createElement("img");
        img.className = "premIcon";
        img.alt = "Premium Badge";
        img.src = "/assets/p.png";
        img.loading = "lazy";
        img.decoding = "async";
        b.appendChild(img);
        container.appendChild(b);
      }
    } catch (_) {}
    container.appendChild(document.createTextNode(String(label || "")));
  }

  function stopPartnerTypingDots() {
    if (partnerTypingDotsTimer) {
      window.clearInterval(partnerTypingDotsTimer);
      partnerTypingDotsTimer = null;
    }
    partnerTypingDotsPhase = 0;
    try {
      var el = document.getElementById("partnerTypingBubble");
      if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch (_) {}
  }

  function setPartnerTypingVisible(visible) {
    var messages = $("messages");
    if (!messages) return;
    // If the user is already near the bottom, ensure the typing line stays visible.
    // On mobile, toggling display can increase scrollHeight without updating scrollTop.
    var stickToBottom = false;
    if (messages) {
      var thresholdPx = 64;
      stickToBottom = messages.scrollHeight - (messages.scrollTop + messages.clientHeight) <= thresholdPx;
    }
    partnerIsTyping = !!visible;
    if (!visible) return stopPartnerTypingDots();

    // Insert bubble at the exact place the next Stranger message will appear (bottom-left).
    var bubble = ensurePartnerTypingBubble();
    if (!bubble) return;
    try {
      // Ensure the bubble is ALWAYS the last visible chat line (below all messages).
      messages.appendChild(bubble);
    } catch (_) {
      messages.appendChild(bubble);
    }
    if (stickToBottom) {
      window.requestAnimationFrame(function () {
        try { messages.scrollTop = messages.scrollHeight; } catch (_) {}
      });
    }
  }

  function clearTypingStopTimer() {
    if (typingStopTimer) {
      window.clearTimeout(typingStopTimer);
      typingStopTimer = null;
    }
  }

  function sendTypingState(isTypingNow) {
    if (!wsClient || !matchId) return;
    if (localIsTyping === isTypingNow) return;
    localIsTyping = isTypingNow;
    wsClient.send({ type: "typing", matchId: matchId, isTyping: isTypingNow });
  }

  function noteUserTyped(textNow) {
    if (!matchId) return;
    // If input is empty, stop typing immediately.
    if (!textNow) {
      clearTypingStopTimer();
      sendTypingState(false);
      return;
    }
    // Start typing now, then stop after a short idle period.
    sendTypingState(true);
    clearTypingStopTimer();
    typingStopTimer = window.setTimeout(function () {
      sendTypingState(false);
    }, 900);
  }

  function showStatusLine(baseText) {
    if (baseText === "Looking for people online") clearMessageArea();
    var typing = $("typing");
    if (!typing) return;
    statusLineToken += 1;
    var token = statusLineToken;
    // If we are using #typing for status/search, stop partner typing animation.
    stopPartnerTypingDots();
    typing.style.display = "";
    typing.style.fontWeight = "700";
    typing.style.fontStyle = "italic";
    typing.style.textAlign = "center";
    typing.style.alignSelf = "center";
    typing.style.maxWidth = "100%";
    typing.style.fontSize = "15px";
    if (statusDotsTimer) window.clearInterval(statusDotsTimer);
    statusDotsPhase = 0;
    var timerId = window.setInterval(function () {
      if (token !== statusLineToken || matchId || !isSearching) {
        try { window.clearInterval(timerId); } catch (_) {}
        if (statusDotsTimer === timerId) statusDotsTimer = null;
        return;
      }
      statusDotsPhase = (statusDotsPhase + 1) % 4;
      var dots = statusDotsPhase === 0 ? "" : new Array(statusDotsPhase + 1).join(".");
      typing.textContent = baseText + dots;
    }, 220);
    statusDotsTimer = timerId;
    typing.textContent = baseText + "...";
  }

  function getSavedInterests() {
    try {
      var raw = localStorage.getItem("ChatSphere_interests_v1");
      var v = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(v)) return [];
      var out = [];
      for (var i = 0; i < v.length; i++) {
        var s = String(v[i] || "").trim();
        if (!s) continue;
        out.push(s);
        if (out.length >= 10) break;
      }
      return out;
    } catch (_) {
      return [];
    }
  }

  // --- Country match preference (stored locally) ---
  var COUNTRY_PREF_KEY = "ChatSphere_country_pref_v1"; // desired partner country (2-letter ISO), or "" for Any

  function getSavedCountryPref() {
    try {
      var v = localStorage.getItem(COUNTRY_PREF_KEY);
      v = String(v || "").trim().toUpperCase();
      if (!v) return "";
      if (!/^[A-Z]{2}$/.test(v)) return "";
      return v;
    } catch (_) {
      return "";
    }
  }

  function setSavedCountryPref(cc) {
    try {
      var v = String(cc || "").trim().toUpperCase();
      if (!v) localStorage.setItem(COUNTRY_PREF_KEY, "");
      else if (/^[A-Z]{2}$/.test(v)) localStorage.setItem(COUNTRY_PREF_KEY, v);
      else localStorage.setItem(COUNTRY_PREF_KEY, "");
    } catch (_) {}
  }

  // Minimal country list (can expand later).
  var COUNTRY_OPTIONS = [
    { code: "", name: "Any country" },
    { code: "US", name: "United States" },
    { code: "CA", name: "Canada" },
    { code: "GB", name: "United Kingdom" },
    { code: "AU", name: "Australia" },
    { code: "NZ", name: "New Zealand" },
    { code: "IE", name: "Ireland" },
    { code: "DE", name: "Germany" },
    { code: "FR", name: "France" },
    { code: "ES", name: "Spain" },
    { code: "IT", name: "Italy" },
    { code: "NL", name: "Netherlands" },
    { code: "SE", name: "Sweden" },
    { code: "NO", name: "Norway" },
    { code: "DK", name: "Denmark" },
    { code: "FI", name: "Finland" },
    { code: "BR", name: "Brazil" },
    { code: "MX", name: "Mexico" },
    { code: "AR", name: "Argentina" },
    { code: "IN", name: "India" },
    { code: "PK", name: "Pakistan" },
    { code: "BD", name: "Bangladesh" },
    { code: "PH", name: "Philippines" },
    { code: "ID", name: "Indonesia" },
    { code: "JP", name: "Japan" },
    { code: "KR", name: "South Korea" },
    { code: "TR", name: "Turkey" }
  ];

  function countryNameFromCode(cc) {
    var c = String(cc || "").trim().toUpperCase();
    // For display purposes: empty/unknown should NEVER show "Any country" (that's a filter, not a location).
    if (!c) return "Unknown";
    for (var i = 0; i < COUNTRY_OPTIONS.length; i++) {
      if (COUNTRY_OPTIONS[i].code === c) return COUNTRY_OPTIONS[i].name;
    }
    return c ? c : "Unknown";
  }

  function flagEmoji(cc) {
    var c = String(cc || "").trim().toUpperCase();
    // Always show a "flag" even when country is unknown.
    if (!/^[A-Z]{2}$/.test(c)) return "🏳️";
    var a = c.charCodeAt(0) - 65;
    var b = c.charCodeAt(1) - 65;
    if (a < 0 || a > 25 || b < 0 || b > 25) return "🏳️";
    return String.fromCodePoint(0x1f1e6 + a, 0x1f1e6 + b);
  }

  function ensureCountryBar() {
    var controlsHost = document.getElementById("chat-controls");
    var messages = $("messages");
    var host = controlsHost || messages;
    if (!host) return null;
    var existing = $("countryBar");
    if (existing) return existing;
    var bar = document.createElement("div");
    bar.id = "countryBar";
    bar.className = "chat-controls-bar";

    // Prefer the dedicated chat-controls region; fallback to messages for older pages.
    try { host.appendChild(bar); } catch (_) {}
    return bar;
  }

  function renderCountryBar() {
    var bar = ensureCountryBar();
    if (!bar) return;
    bar.innerHTML = "";

    var wrap = document.createElement("div");
    wrap.className = "chat-controls-grid";

    var match = document.createElement("div");
    match.className = "chat-control chat-control-match";

    var sel = document.createElement("select");
    sel.id = "countrySelect";
    sel.className = "chat-control-select";
    sel.setAttribute("aria-label", "Match country");

    // Wrap the select so we can render a "Match" prefix INSIDE the control (without repeating it in every option).
    var selWrap = document.createElement("div");
    selWrap.className = "chat-select-wrap";
    selWrap.appendChild(sel);

    var cur = getSavedCountryPref();
    for (var i = 0; i < COUNTRY_OPTIONS.length; i++) {
      var opt = document.createElement("option");
      var code = String(COUNTRY_OPTIONS[i].code || "");
      var name = String(COUNTRY_OPTIONS[i].name || "");
      opt.value = code;
      if (!code) opt.textContent = "Any Country";
      else opt.textContent = code + " — " + name;
      if (COUNTRY_OPTIONS[i].code === cur) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", function () {
      var v = String(sel.value || "").trim().toUpperCase();
      // Match Any Country is always free. Specific countries require trial/premium.
      if (v && /^[A-Z]{2}$/.test(v)) {
        fetchPremiumStatus(true).then(function (p) {
          if (p && p.premiumActive) {
      setSavedCountryPref(v);
            return;
          }
          var rem = Number(p && p.trialRemainingByFeature && p.trialRemainingByFeature.country);
          if (isFinite(rem) && rem > 0) {
            setSavedCountryPref(v);
            return;
          }
          // No trial remaining: revert to Any Country.
          setSavedCountryPref("");
          try { sel.value = ""; } catch (_) {}
          addSystemMessage(premiumRequiredText("country", p), true);
          try { showPremiumModal("country", p); } catch (_) {}
        });
      } else {
        setSavedCountryPref("");
      }
      if (isSearching && !matchId) {
        var ints = getSavedInterests();
        var c2 = getSavedCountryPref();
        if (c2 && ints.length) showStatusLine("Searching " + c2 + " + interests " + formatInterestSummary(ints));
        else if (c2) showStatusLine("Searching " + c2);
        else if (ints.length) showStatusLine("Searching interests " + formatInterestSummary(ints));
        else showStatusLine("Looking for people online");
      }
    });
    match.appendChild(selWrap);

    // Auto-next (keep same id as legacy UI so existing logic keeps working)
    var autoNextLabel = document.createElement("label");
    autoNextLabel.className = "chat-toggle chat-toggle-compact";
    autoNextLabel.setAttribute("title", "Auto-next on disconnect");

    var autoNextCb = document.createElement("input");
    autoNextCb.id = "autoNextOnDisconnect";
    autoNextCb.type = "checkbox";
    autoNextCb.className = "chat-toggle-input";
    autoNextLabel.appendChild(autoNextCb);

    var autoNextUi = document.createElement("span");
    autoNextUi.className = "chat-toggle-ui";
    autoNextUi.setAttribute("aria-hidden", "true");
    autoNextLabel.appendChild(autoNextUi);

    var autoNextText = document.createElement("span");
    autoNextText.className = "chat-toggle-text";
    autoNextText.textContent = "Auto-next";
    autoNextLabel.appendChild(autoNextText);

    match.appendChild(autoNextLabel);
    wrap.appendChild(match);

    // Auto-message controls live next to Match country UI.
    var auto = document.createElement("div");
    auto.className = "chat-control chat-control-auto";

    var autoLabel = document.createElement("label");
    autoLabel.className = "chat-toggle";

    var autoCb = document.createElement("input");
    autoCb.id = "autoMessageOnConnect";
    autoCb.type = "checkbox";
    autoCb.className = "chat-toggle-input";
    autoLabel.appendChild(autoCb);

    var toggleUi = document.createElement("span");
    toggleUi.className = "chat-toggle-ui";
    toggleUi.setAttribute("aria-hidden", "true");
    autoLabel.appendChild(toggleUi);

    var toggleText = document.createElement("span");
    toggleText.className = "chat-toggle-text";
    toggleText.textContent = "Auto-message";
    autoLabel.appendChild(toggleText);

    auto.appendChild(autoLabel);

    var autoInput = document.createElement("input");
    autoInput.id = "autoMessageText";
    autoInput.type = "text";
    autoInput.className = "chat-control-input";
    autoInput.placeholder = "Auto message text...";
    autoInput.autocomplete = "off";
    autoInput.setAttribute("aria-label", "Auto message text");
    auto.appendChild(autoInput);
    wrap.appendChild(auto);
    bar.appendChild(wrap);

    try { wireAutoMessageControls(); } catch (_) {}
    try { syncAutoNextCheckbox(); } catch (_) {}
    try { wireAutoNextCheckbox(); } catch (_) {}
    try { updateVoteControls(); } catch (_) {}
  }

  function createFlagEl(countryCode) {
    var cc = String(countryCode || "").trim().toUpperCase();
    var wrap = document.createElement("span");
    wrap.style.display = "inline-flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "6px";
    wrap.style.marginRight = "0";
    wrap.style.verticalAlign = "middle";
    wrap.style.lineHeight = "1";
    wrap.style.fontSize = "14px";
    wrap.style.flex = "0 0 auto";
    wrap.style.alignSelf = "center";

    // Use emoji on mobile (renders reliably), image on desktop (emoji flags are inconsistent on some desktop setups).
    try {
      if (window && window.innerWidth <= 800) {
        wrap.appendChild(document.createTextNode(flagEmoji(cc)));
        return wrap;
      }
    } catch (_) {}

    // Prefer image flags on desktop so it always renders.
    if (/^[A-Z]{2}$/.test(cc)) {
      var img = document.createElement("img");
      img.alt = cc + " flag";
      img.width = 18;
      img.height = 12;
      img.decoding = "async";
      img.loading = "lazy";
      img.style.width = "18px";
      img.style.height = "12px";
      img.style.borderRadius = "2px";
      img.style.display = "block";
      img.style.objectFit = "cover";
      img.style.flex = "0 0 auto";
      img.src = "https://flagcdn.com/24x18/" + cc.toLowerCase() + ".png";
      img.addEventListener("error", function () {
        try {
          img.replaceWith(document.createTextNode(flagEmoji(cc)));
        } catch (_) {}
      });
      wrap.appendChild(img);
      return wrap;
    }

    wrap.appendChild(document.createTextNode("🏳️"));
    return wrap;
  }

  function renderPartnerLocationLine(el, countryCode, region, city) {
    if (!el) return;
    var cc = String(countryCode || "").trim().toUpperCase();
    el.textContent = "";
    el.appendChild(createFlagEl(cc));
    // Only show country (no city/region).
    el.appendChild(document.createTextNode(cc ? cc : "Unknown"));
  }

  function addLocationMessage(myCc, partnerCc, partnerRegion, partnerCity) {
    var messages = $("messages");
    if (!messages) return;
    try {
      var prev = document.getElementById("partnerLocationLine");
      if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
    } catch (_) {}
    var div = document.createElement("div");
    div.id = "partnerLocationLine";
    div.className = "message message-typing";
    div.style.textAlign = "center";
    div.style.alignSelf = "center";
    div.style.maxWidth = "100%";
    div.style.fontSize = "12px";
    div.style.fontWeight = "800";
    div.style.fontStyle = "normal";
    div.style.color = "var(--text-secondary)";
    div.style.lineHeight = "1.25";
    div.style.marginTop = "-2px";
    // Ensure the inline flag+text is vertically centered together on desktop.
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.justifyContent = "center";
    div.style.gap = "6px";

    renderPartnerLocationLine(div, partnerCc, partnerRegion, partnerCity);
    messages.appendChild(div);
  }
  function formatInterestSummary(list) {
    if (!list || !list.length) return "";
    var top = list
      .slice(0, 3)
      .map(function (s) {
        return '"' + s + '"';
      })
      .join(", ");
    if (list.length > 3) top += " +" + String(list.length - 3);
    return top;
  }

  function setSavedInterests(next) {
    try {
      var arr = Array.isArray(next) ? next : [];
      localStorage.setItem("ChatSphere_interests_v1", JSON.stringify(arr));
    } catch (_) {}
  }

  function ensureInterestBar() {
    var messages = $("messages");
    if (!messages) return null;
    var existing = $("interestBar");
    if (existing) return existing;
    var bar = document.createElement("div");
    bar.id = "interestBar";
    bar.style.display = "none";
    bar.style.margin = "8px 0 6px";
    bar.style.padding = "8px 10px";
    bar.style.borderRadius = "10px";
    bar.style.background = "rgba(255,255,255,0.06)";
    bar.style.border = "1px solid rgba(255,255,255,0.10)";
    bar.style.fontSize = "12px";
    bar.style.fontWeight = "800";
    bar.style.lineHeight = "1.2";
    bar.style.maxWidth = "100%";
    bar.style.overflow = "hidden";
    bar.style.textOverflow = "ellipsis";
    bar.style.whiteSpace = "normal";
    try {
      messages.insertBefore(bar, messages.firstChild);
    } catch (_) {
      messages.appendChild(bar);
    }
    return bar;
  }

  function renderInterestBar() {
    var bar = ensureInterestBar();
    if (!bar) return;
    var ints = getSavedInterests();
    if (!ints.length) {
      bar.style.display = "none";
      bar.innerHTML = "";
      return;
    }
    bar.style.display = "";
    bar.innerHTML = "";
    var label = document.createElement("span");
    label.textContent = "Interests:";
    label.style.opacity = "0.85";
    label.style.marginRight = "8px";
    bar.appendChild(label);

    ints.forEach(function (t, idx) {
      var pill = document.createElement("span");
      pill.style.display = "inline-flex";
      pill.style.alignItems = "center";
      pill.style.gap = "6px";
      pill.style.padding = "4px 8px";
      pill.style.margin = "4px 6px 0 0";
      pill.style.borderRadius = "999px";
      pill.style.background = "rgba(255,255,255,0.08)";
      pill.style.border = "1px solid rgba(255,255,255,0.10)";
      pill.style.userSelect = "none";

      var txt = document.createElement("span");
      txt.textContent = t;
      pill.appendChild(txt);

      var x = document.createElement("button");
      x.type = "button";
      x.textContent = "×";
      x.style.border = "0";
      x.style.background = "transparent";
      // Visible in both themes (light mode was invisible before).
      try {
        var isDark = document.documentElement && document.documentElement.getAttribute("data-theme") === "dark";
        x.style.color = isDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.55)";
      } catch (_) {
        x.style.color = "rgba(0,0,0,0.55)";
      }
      x.style.fontSize = "16px";
      x.style.lineHeight = "1";
      x.style.cursor = "pointer";
      x.addEventListener("click", function (ev) {
        try { ev.preventDefault(); ev.stopPropagation(); } catch (_) {}
        var cur = getSavedInterests();
        cur.splice(idx, 1);
        setSavedInterests(cur);
        renderInterestBar();
        if (isSearching && !matchId) {
          var now = getSavedInterests();
          if (now.length) showStatusLine("Searching interests " + formatInterestSummary(now));
          else showStatusLine("Looking for people online");
        }
      });
      pill.appendChild(x);

      bar.appendChild(pill);
    });
  }

  function hideStatusLine() {
    statusLineToken += 1;
    var typing = $("typing");
    if (typing) {
      typing.textContent = "";
      typing.style.display = "none";
    }
    if (statusDotsTimer) {
      window.clearInterval(statusDotsTimer);
      statusDotsTimer = null;
    }
    stopPartnerTypingDots();
    resetTypingIndicatorElement();
  }

  function addSystemMessage(text, isError) {
    var messages = $("messages");
    if (!messages) return null;
    var div = document.createElement("div");
    div.className = "message message-system";
    var normalized = String(text || "").toLowerCase();
    var isTerminalState =
      normalized.indexOf("vpn / proxy connections are not allowed") >= 0 ||
      normalized.indexOf("connection error.") >= 0;
    if (isTerminalState) {
      div.classList.add("message-system-terminal");
    }
    try {
      messages.classList.toggle(
        "messages-terminal-state",
        !!(isTerminalState || messages.querySelector(".message-system-terminal"))
      );
    } catch (_) {}
    var span = document.createElement("span");
    span.className = "system";
    span.textContent = text;
    if (isError) span.classList.add("system-error");
    div.appendChild(span);
    messages.appendChild(div);
    try {
      messages.classList.toggle(
        "messages-terminal-state",
        !!messages.querySelector(".message-system-terminal")
      );
    } catch (_) {}
    // Keep typing indicator visually under the latest message.
    var typing = $("typing");
    if (typing && typing.parentNode === messages) messages.appendChild(typing);
    // Mobile: ensure padding/insets are up to date before we pin to bottom (prevents text going under fixed UI).
    try { updateMessagesBottomInset(); } catch (_) {}
    messages.scrollTop = messages.scrollHeight;
    try {
      window.requestAnimationFrame(function () {
        try { updateMessagesBottomInset(); } catch (_) {}
        try { messages.scrollTop = messages.scrollHeight; } catch (_) {}
      });
    } catch (_) {}
    return div;
  }

  function addConnectPolicyNotice() {
    if (!ENABLE_CONNECT_POLICY_NOTICE) return;
    var el = addSystemMessage(CONNECT_POLICY_NOTICE, false);
    try {
      if (el) el.classList.add("message-policy-notice");
    } catch (_) {}
  }

  function showEphemeralToast(text) {
    // Floating toast bubble (do NOT attach to message-area; keep chat log clean).
    // Reused for small transient UX hints like "Please wait a moment."
    var host = document.body || document.documentElement;
    if (!host) return;
    try {
      if (!document.getElementById("ephemeralToastStyle")) {
        var st = document.createElement("style");
        st.id = "ephemeralToastStyle";
        st.textContent =
          ".ephemeral-toast{" +
          "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);" +
          "z-index:999999;max-width:min(520px, calc(100vw - 24px));" +
          "padding:10px 12px;border-radius:14px;" +
          "background:rgba(10,14,22,0.92);border:1px solid rgba(255,255,255,0.14);" +
          "color:rgba(255,255,255,0.92);font-weight:900;font-size:13px;" +
          "box-shadow:0 12px 30px rgba(0,0,0,0.45);" +
          "backdrop-filter:blur(10px);" +
          "opacity:0;transition:opacity 160ms ease, transform 160ms ease;" +
          "}" +
          ".ephemeral-toast.show{opacity:1;transform:translateX(-50%) translateY(-2px);}";
        host.appendChild(st);
      }
    } catch (_) {}
    try {
      var old = document.getElementById("ephemeralToast");
      if (old && old.parentNode) old.parentNode.removeChild(old);
    } catch (_) {}
    var el = document.createElement("div");
    el.id = "ephemeralToast";
    el.className = "ephemeral-toast";
    el.textContent = String(text || "");
    try { host.appendChild(el); } catch (_) {}
    try {
      // next tick -> animate in
      setTimeout(function () { try { el.classList.add("show"); } catch (_) {} }, 0);
    } catch (_) {}
    window.setTimeout(function () {
      try { if (el) el.classList.remove("show"); } catch (_) {}
      window.setTimeout(function () {
        try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch (_) {}
      }, 180);
    }, 1700);
  }

  function disconnectChatText(reason) {
    var r = String(reason || "").toLowerCase();
    if (r === "window_closed") return "Stranger closed the window.";
    return "Stranger disconnected...";
  }

  function addDisconnectChatMessage(reason) {
    var messages = $("messages");
    if (!messages) return;
    try { setPartnerTypingVisible(false); } catch (_) {}
    var div = document.createElement("div");
    div.className = "message message-disconnect";
    var span = document.createElement("span");
    span.className = "strange";
    span.textContent = disconnectChatText(reason);
    div.appendChild(span);
    messages.appendChild(div);
    try {
      var actions = $("postDisconnectActions");
      if (actions && actions.parentNode === messages) messages.appendChild(actions);
    } catch (_) {}
    try { updateMessagesBottomInset(); } catch (_) {}
  }

  function setPostDisconnectActionsVisible(show) {
    var el = $("postDisconnectActions");
    if (!el) return;
    el.style.display = show ? "flex" : "none";
    updateVoteControls();
    try {
      var messages = $("messages");
      if (messages && el.parentNode === messages) messages.appendChild(el);
    } catch (_) {}
    try { updateMessagesBottomInset(); } catch (_) {}
  }

  // Mobile: ensure system/disconnect messages never sit behind the fixed input bar or disconnect actions.
  function updateMessagesBottomInset() {
    try {
      if (!(window && window.matchMedia && window.matchMedia("(max-width: 800px)").matches)) return;
    } catch (_) {
      try { if (!(window && window.innerWidth <= 800)) return; } catch (_) {}
    }
    var area = document.getElementById("message-area");
    if (!area) return;
    var inputArea = document.getElementById("input-area");
    var ih = 0;
    try {
      if (inputArea && inputArea.getBoundingClientRect) ih = Math.ceil(inputArea.getBoundingClientRect().height || 0);
      else ih = inputArea ? inputArea.offsetHeight : 0;
    } catch (_) {}
    if (!isFinite(ih) || ih < 0) ih = 0;
    if (ih > 520) ih = 520;

    // Keep last message ~10px above the fixed input bar.
    var inset = ih + 10;
    if (!isFinite(inset) || inset < 0) inset = 10;
    if (inset > 520) inset = 520;
    try { area.style.setProperty("--messages-bottom-inset", String(inset) + "px"); } catch (_) {}
    try { area.style.setProperty("--input-area-height", String(ih) + "px"); } catch (_) {}

    // (messages-bottom-pad removed) We use --messages-bottom-inset directly in CSS padding.

  }

  var AUTO_NEXT_KEY = "ChatSphere_auto_next_on_disconnect_v1";
  var lastUserActivityAt = 0;
  var autoNextTimer = null;
  var autoNextToken = 0;
  var autoNextDisconnectAt = 0;
  var autoNextEarliestAt = 0;
  var AUTO_NEXT_RENDER_DELAY_MS = 700;
  var AUTO_NEXT_QUIET_MS = 250;

  // --- Premium (trial + subscription; enforced by server for country, and by client for auto features) ---
  var premiumCache = null;
  var premiumCacheAt = 0;
  var premiumInflight = null;
  var stripeJsPromise = null;
  var premiumEmbeddedCheckout = null;
  var premiumActivationPoll = 0;
  var banEmbeddedCheckout = null;
  function fetchBanStatus(force) {
    try {
      var now = Date.now();
      if (!force && banStatusCache && now - banStatusCacheAt < 120000) return Promise.resolve(banStatusCache);
      if (banStatusInflight) return banStatusInflight;
      banStatusInflight = window
        .fetch("/api/unban/status?ts=" + Date.now(), { method: "GET", cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          banStatusCache = j || { banned: false };
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
    return fetchBanStatus(force)
      .then(function (j) {
        if (j && j.banned) {
          banModalActive = true;
          autoSearchPending = false;
          lastBanPayload = j;
          try {
            if (wsClient && typeof wsClient.close === "function") wsClient.close();
          } catch (_) {}
          showBanModal(j);
          return true;
        }
        return false;
      })
      .catch(function () {
        return false;
      });
  }
  function fetchPremiumStatus(force) {
    try {
      var now = Date.now();
      if (!force && premiumCache && now - premiumCacheAt < 15000) return Promise.resolve(premiumCache);
      if (premiumInflight) return premiumInflight;
      premiumInflight = window
        .fetch("/api/premium/status", { method: "GET", cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          premiumCache = j || null;
          premiumCacheAt = Date.now();
          premiumInflight = null;
          return premiumCache;
        })
        .catch(function () {
          premiumInflight = null;
          return premiumCache || { ok: false, premiumActive: false, trialRemaining: 0, trialRemainingByFeature: { auto_message: 0, auto_next: 0, country: 0 }, trialMax: 10, priceUsd: 9.99, billingPeriod: "week" };
        });
      return premiumInflight;
    } catch (_) {
      return Promise.resolve(premiumCache || { ok: false, premiumActive: false, trialRemaining: 0, trialRemainingByFeature: { auto_message: 0, auto_next: 0, country: 0 }, trialMax: 10, priceUsd: 9.99, billingPeriod: "week" });
    }
  }
  function loadStripeJs() {
    try {
      if (window.Stripe) return Promise.resolve(window.Stripe);
      if (stripeJsPromise) return stripeJsPromise;
      stripeJsPromise = new Promise(function (resolve, reject) {
        try {
          var existing = document.querySelector('script[src="https://js.stripe.com/v3/"]');
          if (existing) {
            existing.addEventListener("load", function () { resolve(window.Stripe); }, { once: true });
            existing.addEventListener("error", function () { reject(new Error("stripe_js_failed")); }, { once: true });
            return;
          }
          var s = document.createElement("script");
          s.src = "https://js.stripe.com/v3/";
          s.async = true;
          s.onload = function () { resolve(window.Stripe); };
          s.onerror = function () { reject(new Error("stripe_js_failed")); };
          document.head.appendChild(s);
        } catch (e) {
          reject(e);
        }
      }).then(function (StripeCtor) {
        if (!StripeCtor) throw new Error("stripe_js_unavailable");
        return StripeCtor;
      });
      return stripeJsPromise;
    } catch (e) {
      return Promise.reject(e);
    }
  }
  function destroyEmbeddedCheckout(instance) {
    try {
      if (!instance) return;
      if (typeof instance.destroy === "function") instance.destroy();
      else if (typeof instance.unmount === "function") instance.unmount();
    } catch (_) {}
  }
  function stopPremiumActivationPoll() {
    try {
      if (premiumActivationPoll) clearInterval(premiumActivationPoll);
    } catch (_) {}
    premiumActivationPoll = 0;
  }
  function destroyPremiumEmbeddedCheckout() {
    destroyEmbeddedCheckout(premiumEmbeddedCheckout);
    premiumEmbeddedCheckout = null;
    try {
      var host = document.getElementById("premiumEmbeddedHost");
      if (host) host.innerHTML = "";
      var wrap = document.getElementById("premiumEmbeddedWrap");
      if (wrap) wrap.style.display = "none";
      var body = document.getElementById("premiumModalBody");
      if (body) body.style.display = "";
      var footer = document.getElementById("premiumModalFooter");
      if (footer) footer.style.display = "";
    } catch (_) {}
  }
  function showPremiumEmbeddedShell(message) {
    destroyPremiumEmbeddedCheckout();
    try {
      var wrap = document.getElementById("premiumEmbeddedWrap");
      var msg = document.getElementById("premiumEmbeddedMsg");
      var body = document.getElementById("premiumModalBody");
      var footer = document.getElementById("premiumModalFooter");
      if (msg) msg.textContent = String(message || "Loading secure checkout…");
      if (body) body.style.display = "none";
      if (footer) footer.style.display = "none";
      if (wrap) wrap.style.display = "block";
    } catch (_) {}
  }
  function beginPremiumActivationPoll() {
    stopPremiumActivationPoll();
    destroyPremiumEmbeddedCheckout();
    showPremiumResultModal("confirming", null);
    var tries = 0;
    premiumActivationPoll = setInterval(function () {
      tries += 1;
      fetchPremiumStatus(true)
        .then(function (p) {
          if (p && p.premiumActive) {
            stopPremiumActivationPoll();
            try {
              premiumCache = p;
              premiumCacheAt = Date.now();
            } catch (_) {}
            showPremiumResultModal("success", p || null);
            return;
          }
          if (tries >= 30) {
            stopPremiumActivationPoll();
            showPremiumResultModal("error", null);
          }
        })
        .catch(function () {
          if (tries >= 30) {
            stopPremiumActivationPoll();
            showPremiumResultModal("error", null);
          }
        });
    }, 1500);
  }
  function destroyBanEmbeddedCheckout() {
    destroyEmbeddedCheckout(banEmbeddedCheckout);
    banEmbeddedCheckout = null;
    try {
      var host = document.getElementById("ban-modal-checkout-host");
      if (host) host.innerHTML = "";
    } catch (_) {}
  }
  function startPremiumCheckout() {
    var returnTo = "";
    try {
      var u = new URL(location.href);
      u.searchParams.set("premium", "1");
      u.searchParams.delete("premium_cancel");
      u.searchParams.delete("premium_error");
      u.searchParams.delete("confirm_error");
      u.searchParams.delete("error");
      u.searchParams.delete("square_code");
      u.searchParams.delete("subscribed");
      u.searchParams.delete("sub_status");
      returnTo = u.toString();
    } catch (_) {
      try { returnTo = location.origin + location.pathname + "?premium=1"; } catch (_) { returnTo = "/?premium=1"; }
    }
    return window
      .fetch("/api/premium/create-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "trial", returnTo: returnTo }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.error) || "checkout_failed"); return j; }); })
      .then(function (j) {
        if (j && j.url) {
          window.location.href = String(j.url);
          return;
        }
        throw new Error("missing_checkout_payload");
      });
  }
  function startPremiumManage() {
    return window
      .fetch("/api/premium/portal", { method: "POST" })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.error) || "portal_failed"); return j; }); })
      .then(function (j) {
        if (j && j.url) {
          window.location.href = String(j.url);
          return;
        }
        if (j && j.action === "cancel_only") {
          return fetchPremiumStatus(true).then(function (p) { showPremiumResultModal("manage", p || {}); });
        }
        throw new Error("missing_manage_action");
      });
  }
  function premiumShortSuffix(p) {
    try {
      var bp = String(p && p.billingPeriod ? p.billingPeriod : "month").toLowerCase();
      return bp === "week" ? "/wk" : "/mo";
    } catch (_) {
      return "/mo";
    }
  }
  function formatPremiumPeriodEnd(value) {
    try {
      if (!value) return "";
      return new Date(value).toLocaleDateString();
    } catch (_) {
      return "";
    }
  }
  function premiumCancellationMessage(endDate) {
    return endDate
      ? ("Your subscription cancellation is confirmed. Premium stays active until " + endDate + ". You will not be charged again for this subscription.")
      : "Your subscription cancellation is confirmed. Premium stays active until the end of the current paid period. You will not be charged again for this subscription.";
  }

  // --- Premium modal (upgrade prompt) ---
  var premiumModalOpen = false;
  function ensurePremiumModal() {
    var existing = document.getElementById("premiumModalBackdrop");
    if (existing) return existing;

    try {
      var st = document.createElement("style");
      st.id = "premiumModalStyles";
      st.textContent =
        // z-index intentionally very high so it can appear above other modals.
        "#premiumModalBackdrop{position:fixed;inset:0;z-index:2147483800;background:rgba(0,0,0,0.55);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:none;align-items:center;justify-content:center;padding:14px;}" +
        "#premiumModal{width:min(420px,92vw);max-height:min(720px,86vh);border-radius:22px;border:1px solid rgba(0,0,0,0.08);background:#fff;box-shadow:0 24px 80px rgba(0,0,0,0.38);color:#0f172a;display:flex;flex-direction:column;overflow:hidden;}" +
        ".premTop{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 16px 12px;}" +
        ".premBrand{display:flex;align-items:flex-start;gap:10px;min-width:0;}" +
        ".premMark{width:12px;height:12px;border-radius:999px;background:linear-gradient(180deg,#22c55e,#16a34a);box-shadow:0 6px 16px rgba(34,197,94,0.35);margin-top:6px;flex:0 0 auto;}" +
        "#premiumModalTitle{font-size:18px;font-weight:900;letter-spacing:-0.02em;line-height:1.1;}" +
        "#premiumModalSub{margin-top:6px;font-size:12px;line-height:1.35;color:rgba(15,23,42,0.72);}" +
        ".premClose{border:0;background:rgba(2,6,23,0.06);color:rgba(2,6,23,0.75);width:36px;height:36px;border-radius:12px;cursor:pointer;font-size:16px;font-weight:900;display:flex;align-items:center;justify-content:center;flex:0 0 auto;}" +
        ".premBody{padding:0 16px 14px;overflow:auto;}" +
        ".premPill{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:900;color:#166534;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.25);border-radius:999px;padding:6px 10px;margin-bottom:10px;}" +
        "#premiumModalList{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px;}" +
        ".premLi{display:flex;gap:10px;align-items:flex-start;}" +
        ".premCheck{width:18px;height:18px;border-radius:6px;background:rgba(34,197,94,0.14);border:1px solid rgba(34,197,94,0.30);display:flex;align-items:center;justify-content:center;color:#15803d;font-weight:900;flex:0 0 auto;}" +
        ".premLiText{font-size:13px;line-height:1.25;color:rgba(15,23,42,0.90);}" +
        ".premNote{margin-top:12px;font-size:11px;line-height:1.3;color:rgba(15,23,42,0.55);}" +
        ".premFooter{padding:14px 16px 16px;border-top:1px solid rgba(15,23,42,0.08);background:linear-gradient(180deg,rgba(34,197,94,0.05),rgba(255,255,255,1));}" +
        ".premLoader{display:none;align-items:center;gap:10px;margin-bottom:10px;padding:10px 12px;border-radius:14px;border:1px solid rgba(34,197,94,0.18);background:rgba(34,197,94,0.08);color:rgba(15,23,42,0.82);font-size:12px;font-weight:800;}" +
        ".premLoaderSpinner{width:14px;height:14px;border-radius:999px;border:2px solid rgba(22,163,74,0.18);border-top-color:#16a34a;animation:premSpin .8s linear infinite;flex:0 0 auto;}" +
        ".premPriceRow{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;}" +
        ".premPriceLabel{font-size:12px;font-weight:900;color:rgba(15,23,42,0.70);}" +
        "#premiumModalPrice{font-size:16px;font-weight:900;color:#052e16;}" +
        "#premiumModalPrice.premPriceLoading{font-size:13px;color:rgba(15,23,42,0.62);}" +
        ".premBtnPrimary{width:100%;height:48px;border-radius:14px;border:1px solid rgba(21,128,61,0.35);background:linear-gradient(180deg,#22c55e,#16a34a);color:#fff;font-weight:900;font-size:14px;cursor:pointer;box-shadow:0 14px 30px rgba(34,197,94,0.25);}" +
        ".premBtnPrimary:disabled{opacity:0.65;cursor:not-allowed;}" +
        ".premBtnGhost{width:100%;height:44px;margin-top:10px;border-radius:14px;border:1px solid rgba(2,6,23,0.10);background:#fff;color:rgba(2,6,23,0.82);font-weight:900;font-size:13px;cursor:pointer;}" +
        "#premiumEmbeddedWrap{display:none;padding:0 16px 16px;}" +
        "#premiumEmbeddedMsg{margin:0 0 10px;font-size:12px;line-height:1.35;color:rgba(15,23,42,0.72);}" +
        ".premCheckoutCard{border:1px solid rgba(15,23,42,0.08);border-radius:18px;overflow:hidden;background:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,0.4);}" +
        "#premiumEmbeddedHost{min-height:420px;background:#fff;}" +
        "@keyframes premSpin{to{transform:rotate(360deg);}}" +
        "@media (max-width:480px){#premiumModal{width:94vw;max-height:86vh;border-radius:24px;}#premiumModalTitle{font-size:19px;}.premBtnPrimary{height:50px;}}";
      document.head.appendChild(st);
    } catch (_) {}

    var backdrop = document.createElement("div");
    backdrop.id = "premiumModalBackdrop";
    backdrop.style.display = "none";

    var modal = document.createElement("div");
    modal.id = "premiumModal";

    var top = document.createElement("div");
    top.className = "premTop";

    var brand = document.createElement("div");
    brand.className = "premBrand";
    var mark = document.createElement("div");
    mark.className = "premMark";
    var titleWrap = document.createElement("div");
    titleWrap.style.minWidth = "0";
    var title = document.createElement("div");
    title.id = "premiumModalTitle";
    title.textContent = "Premium";
    var sub = document.createElement("div");
    sub.id = "premiumModalSub";
    sub.textContent = "";
    titleWrap.appendChild(title);
    titleWrap.appendChild(sub);
    brand.appendChild(mark);
    brand.appendChild(titleWrap);

    var closeX = document.createElement("button");
    closeX.type = "button";
    closeX.className = "premClose";
    closeX.id = "premiumModalCloseBtn";
    closeX.setAttribute("aria-label", "Close");
    closeX.textContent = "✕";

    top.appendChild(brand);
    top.appendChild(closeX);
    modal.appendChild(top);

    var body = document.createElement("div");
    body.className = "premBody";
    body.id = "premiumModalBody";

    var pill = document.createElement("div");
    pill.className = "premPill";
    pill.textContent = "Unlock Premium features";
    body.appendChild(pill);

    var ul = document.createElement("ul");
    ul.id = "premiumModalList";
    ul.innerHTML =
      '<li class="premLi"><div class="premCheck">✓</div><div class="premLiText"><b>Upload files</b> (images &amp; videos) in chat</div></li>' +
      '<li class="premLi"><div class="premCheck">✓</div><div class="premLiText"><b>No face match required</b> (skip face checks on video)</div></li>' +
      '<li class="premLi"><div class="premCheck">✓</div><div class="premLiText"><b>Pick a specific country</b> (Any Country stays free)</div></li>' +
      '<li class="premLi"><div class="premCheck">✓</div><div class="premLiText"><b>Auto-message</b> on connect</div></li>' +
      '<li class="premLi"><div class="premCheck">✓</div><div class="premLiText"><b>Auto-next</b> on disconnect</div></li>';
    body.appendChild(ul);

    var note = document.createElement("div");
    note.className = "premNote";
    note.textContent = "Subscription is recurring and linked to your IP.";
    body.appendChild(note);
    modal.appendChild(body);

    var embeddedWrap = document.createElement("div");
    embeddedWrap.id = "premiumEmbeddedWrap";
    embeddedWrap.style.display = "none";
    var embeddedMsg = document.createElement("div");
    embeddedMsg.id = "premiumEmbeddedMsg";
    embeddedMsg.textContent = "Preparing secure checkout…";
    var embeddedCard = document.createElement("div");
    embeddedCard.className = "premCheckoutCard";
    var embeddedHost = document.createElement("div");
    embeddedHost.id = "premiumEmbeddedHost";
    embeddedCard.appendChild(embeddedHost);
    embeddedWrap.appendChild(embeddedMsg);
    embeddedWrap.appendChild(embeddedCard);
    modal.appendChild(embeddedWrap);

    var footer = document.createElement("div");
    footer.className = "premFooter";
    footer.id = "premiumModalFooter";

    var loader = document.createElement("div");
    loader.className = "premLoader";
    loader.id = "premiumModalLoader";
    var loaderSpinner = document.createElement("div");
    loaderSpinner.className = "premLoaderSpinner";
    var loaderText = document.createElement("div");
    loaderText.id = "premiumModalLoaderText";
    loaderText.textContent = "Loading plan details…";
    loader.appendChild(loaderSpinner);
    loader.appendChild(loaderText);
    footer.appendChild(loader);

    var priceRow = document.createElement("div");
    priceRow.className = "premPriceRow";
    var priceLabel = document.createElement("div");
    priceLabel.className = "premPriceLabel";
    priceLabel.textContent = "Price";
    var priceEl = document.createElement("div");
    priceEl.id = "premiumModalPrice";
    priceEl.textContent = "$—";
    priceRow.appendChild(priceLabel);
    priceRow.appendChild(priceEl);
    footer.appendChild(priceRow);

    var btnCheckout = document.createElement("button");
    btnCheckout.type = "button";
    btnCheckout.className = "premBtnPrimary";
    btnCheckout.id = "premiumModalCheckoutBtn";
    btnCheckout.textContent = "Subscribe";
    try { btnCheckout.setAttribute("data-action", "checkout"); } catch (_) {}

    var btnManage = document.createElement("button");
    btnManage.type = "button";
    btnManage.className = "premBtnGhost";
    btnManage.id = "premiumModalManageBtn";
    btnManage.textContent = "Manage subscription";
    btnManage.style.display = "none";

    var btnClose = document.createElement("button");
    btnClose.type = "button";
    btnClose.className = "premBtnGhost";
    btnClose.id = "premiumModalNotNowBtn";
    btnClose.textContent = "Not now";

    footer.appendChild(btnCheckout);
    footer.appendChild(btnManage);
    footer.appendChild(btnClose);
    modal.appendChild(footer);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    function hide() {
      stopPremiumActivationPoll();
      destroyPremiumEmbeddedCheckout();
      premiumModalOpen = false;
      backdrop.style.display = "none";
    }
    btnClose.addEventListener("click", function () { hide(); });
    closeX.addEventListener("click", function () { hide(); });
    backdrop.addEventListener("click", function (ev) {
      try {
        if (ev && ev.target === backdrop) {
          ev.preventDefault();
          ev.stopPropagation();
          hide();
        }
      } catch (_) {}
    });
    btnCheckout.addEventListener("click", function () {
      btnCheckout.disabled = true;
      btnCheckout.textContent = "Redirecting…";
      var act = "checkout";
      try { act = String(btnCheckout.getAttribute("data-action") || "checkout"); } catch (_) { act = "checkout"; }
      if (act === "cancel") {
        btnCheckout.textContent = "Canceling…";
        window
          .fetch("/api/premium/cancel", { method: "POST" })
          .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.error) || "cancel_failed"); return j; }); })
          .then(function () { return fetchPremiumStatus(true); })
          .then(function (p) { showPremiumResultModal("cancel_scheduled", p || {}); })
          .catch(function () { showPremiumResultModal("error", null); })
          .finally(function () {
            try {
              btnCheckout.disabled = false;
              btnCheckout.textContent = "Cancel subscription";
            } catch (_) {}
          });
        return;
      }
      startPremiumCheckout()
        .catch(function () { showPremiumResultModal("error", null); })
        .finally(function () {
          try {
            btnCheckout.disabled = false;
            btnCheckout.textContent = "Subscribe";
          } catch (_) {}
        });
    });

    btnManage.addEventListener("click", function () {
      btnManage.disabled = true;
      btnManage.textContent = "Opening…";
      startPremiumManage()
        .catch(function () {})
        .finally(function () {
          try {
            btnManage.disabled = false;
            btnManage.textContent = "Manage subscription";
          } catch (_) {}
        });
    });

    return backdrop;
  }
  function setPremiumModalLoading(isLoading) {
    try {
      var loader = document.getElementById("premiumModalLoader");
      var loaderText = document.getElementById("premiumModalLoaderText");
      var sub = document.getElementById("premiumModalSub");
      var priceLabel = document.querySelector(".premPriceLabel");
      var priceEl = document.getElementById("premiumModalPrice");
      var checkout = document.getElementById("premiumModalCheckoutBtn");
      var manage = document.getElementById("premiumModalManageBtn");
      if (loader) loader.style.display = isLoading ? "flex" : "none";
      if (loaderText) loaderText.textContent = isLoading ? "Loading plan details…" : "";
      if (sub && isLoading) sub.textContent = "Checking subscription…";
      if (priceLabel && isLoading) priceLabel.textContent = "Plan";
      if (priceEl) {
        if (isLoading) {
          priceEl.textContent = "Loading…";
          priceEl.classList.add("premPriceLoading");
        } else {
          priceEl.classList.remove("premPriceLoading");
        }
      }
      if (checkout && isLoading) {
        checkout.style.display = "";
        checkout.disabled = true;
        checkout.textContent = "Loading…";
      }
      if (manage && isLoading) manage.style.display = "none";
    } catch (_) {}
  }

  function showPremiumModal(contextKey, statusObj) {
    var backdrop = ensurePremiumModal();
    if (!backdrop) return;
    stopPremiumActivationPoll();
    destroyPremiumEmbeddedCheckout();
    premiumModalOpen = true;
    backdrop.style.display = "flex";
    // Always prefer fresh status when opening the modal so Premium users don't see the "buy" UI.
    if (!statusObj || typeof statusObj.premiumActive !== "boolean") {
      setPremiumModalLoading(true);
      try {
        fetchPremiumStatus(true)
          .then(function (p2) { try { showPremiumModal(contextKey, p2 || {}); } catch (_) {} })
          .catch(function () {});
      } catch (_) {}
      return;
    }

    var p = statusObj || {};
    var price = String((p && p.priceUsd) || 9.99);
    var suffix = premiumShortSuffix(p);
    var sub = document.getElementById("premiumModalSub");
    var checkout = document.getElementById("premiumModalCheckoutBtn");
    var manage = document.getElementById("premiumModalManageBtn");
    var priceEl = document.getElementById("premiumModalPrice");
    var list = document.getElementById("premiumModalList");
    var priceLabel = backdrop.querySelector ? backdrop.querySelector(".premPriceLabel") : null;
    var note = backdrop.querySelector ? backdrop.querySelector(".premNote") : null;
    var priceRow = backdrop.querySelector ? backdrop.querySelector(".premPriceRow") : null;
    setPremiumModalLoading(false);
    var isActive = !!(p && p.premiumActive);
    var manageAvailable = !!(p && p.manageAvailable);
    var trialDays = Math.max(0, Math.floor(Number((p && p.trialDays) || 1) || 1));
    if (sub) {
      var why =
        contextKey === "badge" ? "Premium subscriber." :
        contextKey === "upload" ? "Uploads are Premium." :
        contextKey === "auto_message" ? "Auto-message is Premium." :
        contextKey === "auto_next" ? "Auto-next is Premium." :
        contextKey === "country" ? "Specific country matching is Premium." :
        "This feature is Premium.";
      if (contextKey === "badge") {
        sub.textContent = why + " Premium includes:";
        if (list) {
          list.innerHTML =
            '<li class="premLi">' +
              '<div class="premCheck" style="width:18px;height:18px;border-radius:6px;background:transparent;border:0;display:flex;align-items:center;justify-content:center;">' +
                '<img src="/assets/p.png" alt="Premium Badge" style="width:14px;height:14px;display:block;" loading="lazy" decoding="async" />' +
              "</div>" +
              '<div class="premLiText"><b>Premium Badge</b> — shows next to your username. Preview: ' +
                '<span style="display:inline-flex;align-items:center;gap:6px;padding:2px 0;border-radius:999px;border:0;background:transparent;">' +
                  '<img src="/assets/p.png" alt="Premium Badge" style="width:12px;height:12px;display:block;" loading="lazy" decoding="async" />' +
                  '<span style="font-weight:900;">Stranger</span>' +
                "</span>" +
              "</div>" +
            "</li>" +
            '<li class="premLi"><div class="premCheck">✓</div><div class="premLiText"><b>Uploads</b> unlocked</div></li>' +
            '<li class="premLi"><div class="premCheck">✓</div><div class="premLiText"><b>No face match required</b> (skip face checks on video)</div></li>' +
            '<li class="premLi"><div class="premCheck">✓</div><div class="premLiText"><b>Country match</b> unlocked</div></li>' +
            '<li class="premLi"><div class="premCheck">✓</div><div class="premLiText"><b>Auto-message</b> unlocked</div></li>' +
            '<li class="premLi"><div class="premCheck">✓</div><div class="premLiText"><b>Auto-next</b> unlocked</div></li>';
        }
      } else {
        sub.textContent = isActive ? (why + " Premium is active on your connection.") : (why + " Subscribe to unlock it.");
      }
    }
    if (checkout) { checkout.style.display = isActive ? "none" : ""; }
    if (manage) { manage.style.display = isActive ? "" : "none"; }
    if (checkout && !isActive) {
      // Make it very clear the first charge is $0.00 when a free trial is offered.
      checkout.textContent = trialDays > 0 ? "Start free trial — $0.00 today" : "Subscribe";
      checkout.disabled = false;
    }
    if (manage && isActive) {
      // If Premium is manual (no Stripe customer), show the button but disable it with a clear message.
      manage.disabled = !manageAvailable;
      manage.textContent = manageAvailable ? "Manage subscription" : "Premium active (no subscription to manage)";
    }
    try { if (priceRow) priceRow.style.display = isActive ? "none" : ""; } catch (_) {}
    if (priceLabel) {
      priceLabel.textContent = isActive ? "Renews" : (trialDays > 0 ? "Today" : "Price");
    }
    if (note) {
      note.textContent = isActive
        ? (manageAvailable ? "Manage or cancel anytime in your subscription settings." : "Premium is active on your connection.")
        : (trialDays > 0
            ? ("$0.00 today. Free trial for " + String(trialDays) + " days, then $" + price + suffix + " billed " + (suffix === "/wk" ? "weekly" : "monthly") + ". Subscription is recurring and linked to your IP.")
            : ("Then $" + price + suffix + " billed " + (suffix === "/wk" ? "weekly" : "monthly") + ". Subscription is recurring and linked to your IP.")
          );
    }
    if (priceEl) {
      priceEl.textContent = isActive ? ("$" + price + suffix) : (trialDays > 0 ? "$0.00" : ("$" + price + suffix));
    }
  }

  function hidePremiumModal() {
    stopPremiumActivationPoll();
    destroyPremiumEmbeddedCheckout();
    try {
      var b = document.getElementById("premiumModalBackdrop");
      if (b) b.style.display = "none";
    } catch (_) {}
    premiumModalOpen = false;
  }

  function showPremiumResultModal(kind, statusObj) {
    var backdrop = ensurePremiumModal();
    if (!backdrop) return;
    destroyPremiumEmbeddedCheckout();
    premiumModalOpen = true;
    backdrop.style.display = "flex";
    var p = statusObj || {};

    var title = document.getElementById("premiumModalTitle");
    var sub = document.getElementById("premiumModalSub");
    var priceEl = document.getElementById("premiumModalPrice");
    var pill = backdrop.querySelector ? backdrop.querySelector(".premPill") : null;
    var list = document.getElementById("premiumModalList");
    var note = backdrop.querySelector ? backdrop.querySelector(".premNote") : null;
    var priceRow = backdrop.querySelector ? backdrop.querySelector(".premPriceRow") : null;
    var btnPrimary = document.getElementById("premiumModalCheckoutBtn");
    var btnGhost = document.getElementById("premiumModalNotNowBtn");
    var btnManage = document.getElementById("premiumModalManageBtn");

    // Hide price row for result views.
    try { if (priceRow) priceRow.style.display = "none"; } catch (_) {}
    try { if (priceEl) priceEl.textContent = ""; } catch (_) {}

    if (kind === "confirming") {
      if (title) title.textContent = "Confirming Premium…";
      if (sub) sub.textContent = "Hang tight — we’re verifying your payment.";
      if (pill) pill.textContent = "Payment status";
      if (list) list.innerHTML = '<li class="premLi"><div class="premCheck">✓</div><div class="premLiText">Confirming your subscription…</div></li>';
      if (note) note.textContent = "";
      if (btnPrimary) {
        btnPrimary.textContent = "Please wait…";
        btnPrimary.disabled = true;
      }
      if (btnGhost) {
        btnGhost.textContent = "Close";
        btnGhost.disabled = false;
        btnGhost.onclick = function () { hidePremiumModal(); };
      }
      return;
    }

    if (kind === "success") {
      if (title) title.textContent = "Premium activated";
      if (sub) sub.textContent = "You’re all set — Premium is now enabled for your connection.";
      if (pill) pill.textContent = "Success";
      if (list) list.innerHTML =
        '<li class="premLi"><div class="premCheck">✓</div><div class="premLiText"><b>Uploads</b> unlocked</div></li>' +
        '<li class="premLi"><div class="premCheck">✓</div><div class="premLiText"><b>No face match required</b> (skip face checks on video)</div></li>' +
        '<li class="premLi"><div class="premCheck">✓</div><div class="premLiText"><b>Country match</b>, <b>Auto-message</b>, <b>Auto-next</b> unlocked</div></li>';
      if (note) note.textContent = "Thanks for supporting the site.";
      if (btnPrimary) {
        try { btnPrimary.style.display = "none"; } catch (_) {}
        btnPrimary.disabled = true;
        try { btnPrimary.setAttribute("data-action", "checkout"); } catch (_) {}
      }
      if (btnManage) {
        try { btnManage.style.display = ""; } catch (_) {}
        btnManage.disabled = false;
        btnManage.textContent = "Manage subscription";
      }
      if (btnGhost) {
        btnGhost.textContent = "Close";
        btnGhost.disabled = false;
        btnGhost.onclick = function () { hidePremiumModal(); };
      }
      return;
    }

    if (kind === "cancel") {
      if (title) title.textContent = "Checkout canceled";
      if (sub) sub.textContent = "No charge was made. You can try again anytime.";
      if (pill) pill.textContent = "Canceled";
      if (list) list.innerHTML = '<li class="premLi"><div class="premCheck">✓</div><div class="premLiText">Tap below to restart checkout.</div></li>';
      if (note) note.textContent = "";
      if (btnPrimary) {
        btnPrimary.textContent = "Try again";
        btnPrimary.disabled = false;
        try { btnPrimary.setAttribute("data-action", "checkout"); } catch (_) {}
      }
      if (btnGhost) {
        btnGhost.textContent = "Close";
        btnGhost.disabled = false;
        btnGhost.onclick = function () { hidePremiumModal(); };
      }
      return;
    }

    if (kind === "manage") {
      var manageStatus = String((p && p.subscriptionStatus) || "").trim().toLowerCase();
      if (manageStatus === "canceling") {
        kind = "cancel_scheduled";
      } else {
      if (title) title.textContent = "Cancel Premium subscription";
      if (sub) sub.textContent = "Canceling stops future billing. You keep Premium through the current paid period.";
      if (pill) pill.textContent = "Subscription";
      if (list) {
        var cpe = (p && p.currentPeriodEnd) ? String(p.currentPeriodEnd) : "";
        var cpeLabel = formatPremiumPeriodEnd(cpe) || cpe;
        list.innerHTML =
          '<li class="premLi"><div class="premCheck">✓</div><div class="premLiText"><b>Status</b>: ' + String((p && p.subscriptionStatus) || "active") + "</div></li>" +
          (cpeLabel ? ('<li class="premLi"><div class="premCheck">✓</div><div class="premLiText"><b>Premium active through</b>: ' + cpeLabel + "</div></li>") : "");
      }
      if (note) note.textContent = "";
      if (btnManage) { try { btnManage.style.display = "none"; } catch (_) {} }
      if (btnPrimary) {
        try { btnPrimary.style.display = ""; } catch (_) {}
        btnPrimary.textContent = "Cancel subscription";
        btnPrimary.disabled = false;
        try { btnPrimary.setAttribute("data-action", "cancel"); } catch (_) {}
      }
      if (btnGhost) {
        btnGhost.textContent = "Close";
        btnGhost.disabled = false;
        btnGhost.onclick = function () { hidePremiumModal(); };
      }
      return;
      }
    }

    if (kind === "cancel_scheduled") {
      if (title) title.textContent = "Cancellation confirmed";
      if (pill) pill.textContent = "Canceled";
      if (list) {
        var cpe2 = (p && p.currentPeriodEnd) ? String(p.currentPeriodEnd) : "";
        var cpe2Label = formatPremiumPeriodEnd(cpe2) || cpe2;
        if (sub) sub.textContent = premiumCancellationMessage(cpe2Label);
        list.innerHTML = cpe2Label
          ? ('<li class="premLi"><div class="premCheck">✓</div><div class="premLiText"><b>Premium active through</b>: ' + cpe2Label + "</div></li>")
          : '<li class="premLi"><div class="premCheck">✓</div><div class="premLiText">Premium stays active until the end of the current paid period.</div></li>';
      }
      if (sub && !list) sub.textContent = premiumCancellationMessage("");
      if (note) note.textContent = "";
      if (btnPrimary) { try { btnPrimary.style.display = "none"; } catch (_) {} }
      if (btnManage) { try { btnManage.style.display = "none"; } catch (_) {} }
      if (btnGhost) {
        btnGhost.textContent = "Close";
        btnGhost.disabled = false;
        btnGhost.onclick = function () { hidePremiumModal(); };
      }
      return;
    }

    if (kind === "error") {
      if (title) title.textContent = "Something went wrong";
      if (sub) sub.textContent = "Please try again.";
      if (pill) pill.textContent = "Error";
      if (list) list.innerHTML = '<li class="premLi"><div class="premCheck">✓</div><div class="premLiText">Refresh the page and try again.</div></li>';
      if (note) note.textContent = "";
      if (btnPrimary) { try { btnPrimary.style.display = "none"; } catch (_) {} }
      if (btnManage) { try { btnManage.style.display = "none"; } catch (_) {} }
      if (btnGhost) {
        btnGhost.textContent = "Close";
        btnGhost.disabled = false;
        btnGhost.onclick = function () { hidePremiumModal(); };
      }
      return;
    }
  }

  // Premium: if user just returned from Stripe, show a Premium-styled success/cancel overlay.
	  (function maybeConfirmPremiumFromUrl() {
	    try {
	      var sp = new URLSearchParams(String(window.location.search || ""));
	      // Square confirm errors (server redirects back with premium_error=1&error=...).
	      if (sp.get("premium_error") === "1" || sp.get("confirm_error") === "1") {
	        showPremiumResultModal("cancel", null);
	        try {
	          sp.delete("premium_error");
	          sp.delete("confirm_error");
	          sp.delete("error");
	          sp.delete("square_code");
	          window.history.replaceState({}, "", window.location.pathname + (sp.toString() ? "?" + sp.toString() : ""));
	        } catch (_) {}
	        return;
	      }
	      if (sp.get("premium_cancel") === "1") {
	        showPremiumResultModal("cancel", null);
	        try {
	          sp.delete("premium_cancel");
	          window.history.replaceState({}, "", window.location.pathname + (sp.toString() ? "?" + sp.toString() : ""));
	        } catch (_) {}
	        return;
	      }
	      if (sp.get("premium") !== "1") return;
      var sid = String(sp.get("session_id") || "").trim();
      var sig = String(sp.get("sig") || "").trim();
      if (!sid) {
        showPremiumResultModal("success", null);
        try {
          sp.delete("premium");
          sp.delete("sig");
          window.history.replaceState({}, "", window.location.pathname + (sp.toString() ? "?" + sp.toString() : ""));
        } catch (_) {}
        return;
      }

      showPremiumResultModal("confirming", null);
      window
        .fetch("/api/premium/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sid, sig: sig })
        })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.ok && j.premiumActive) {
            try {
              premiumCache = premiumCache || {};
              premiumCache.premiumActive = true;
              premiumCacheAt = Date.now();
            } catch (_) {}
            showPremiumResultModal("success", null);
          } else {
            showPremiumResultModal("success", null);
          }
          // Best-effort clean URL
          try {
            sp.delete("session_id");
            sp.delete("premium");
            sp.delete("sig");
            window.history.replaceState({}, "", window.location.pathname + (sp.toString() ? "?" + sp.toString() : ""));
          } catch (_) {}
        })
        .catch(function () {
          showPremiumResultModal("success", null);
          try {
            sp.delete("session_id");
            sp.delete("premium");
            sp.delete("sig");
            window.history.replaceState({}, "", window.location.pathname + (sp.toString() ? "?" + sp.toString() : ""));
          } catch (_) {}
        });
    } catch (_) {}
  })();

  function premiumTrialMax(p) {
    var n = Number(p && p.trialMax);
    return isFinite(n) && n > 0 ? Math.floor(n) : 10;
  }

  function premiumRequiredText(contextKey, p) {
    var price = String((p && p.priceUsd) || 9.99);
    var suffix = premiumShortSuffix(p);
    var max = premiumTrialMax(p);
    if (contextKey === "country") {
      return "Specific country matching requires Premium ($" + price + " " + suffix + "). Free trial used up (" + String(max) + " uses). Matching Any Country instead.";
    }
    if (contextKey === "auto_message") {
      return "Auto-message requires Premium ($" + price + " " + suffix + "). Free trial used up (" + String(max) + " uses).";
    }
    if (contextKey === "auto_next") {
      return "Auto-next requires Premium ($" + price + " " + suffix + "). Free trial used up (" + String(max) + " uses).";
    }
    if (contextKey === "upload") {
      return "File uploads require Premium ($" + price + " " + suffix + ").";
    }
    return "This feature requires Premium ($" + price + " " + suffix + "). Free trial used up (" + String(max) + " uses).";
  }
  function consumePremium(feature) {
    return window
      .fetch("/api/premium/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature: String(feature || "unknown") })
      })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        premiumCache = j || premiumCache;
        premiumCacheAt = Date.now();
        return j;
      })
      .catch(function () {
        return { ok: false, premiumActive: false, trialRemaining: 0, trialRemainingByFeature: { auto_message: 0, auto_next: 0, country: 0 }, trialMax: 10, priceUsd: 9.99, billingPeriod: "week" };
      });
  }

  function cancelPendingAutoNext() {
    autoNextToken += 1;
    autoNextDisconnectAt = 0;
    autoNextEarliestAt = 0;
    if (autoNextTimer) {
      try { window.clearTimeout(autoNextTimer); } catch (_) {}
      autoNextTimer = null;
    }
  }

  function noteUserActivity() {
    lastUserActivityAt = Date.now();
    // If an auto-next is pending, reschedule to fire once the user stops moving.
    if (autoNextDisconnectAt) {
      if (autoNextTimer) {
        try { window.clearTimeout(autoNextTimer); } catch (_) {}
        autoNextTimer = null;
      }
      var token = autoNextToken;
      autoNextTimer = window.setTimeout(function () {
        if (token !== autoNextToken) return;
        tryAutoNextNow(token);
      }, AUTO_NEXT_QUIET_MS);
    }
  }
  function installAutoNextActivityGuards() {
    // If the user moves the mouse / touches the screen after disconnect,
    // PAUSE auto-next, then fire as soon as movement stops.
    try {
      document.addEventListener("mousemove", noteUserActivity, { passive: true });
      document.addEventListener("pointermove", noteUserActivity, { passive: true });
      document.addEventListener("touchstart", noteUserActivity, { passive: true });
    } catch (_) {}
  }
  function getAutoNextEnabled() {
    try {
      var v = localStorage.getItem(AUTO_NEXT_KEY);
      return v === "1" || v === "true";
    } catch (_) {
      return false;
    }
  }
  function setAutoNextEnabled(on) {
    try {
      localStorage.setItem(AUTO_NEXT_KEY, on ? "1" : "0");
    } catch (_) {}
  }
  function syncAutoNextCheckbox() {
    var cb = $("autoNextOnDisconnect");
    if (!cb) return;
    try {
      cb.checked = !!getAutoNextEnabled();
    } catch (_) {}
  }
  function wireAutoNextCheckbox() {
    var cb = $("autoNextOnDisconnect");
    if (!cb) return;
    syncAutoNextCheckbox();
    try {
      if (cb.dataset && cb.dataset.bound === "1") return;
      if (cb.dataset) cb.dataset.bound = "1";
    } catch (_) {}
    cb.addEventListener("change", function () {
      var wantOn = !!cb.checked;
      if (!wantOn) {
        try { setAutoNextEnabled(false); } catch (_) {}
        try { cancelPendingAutoNext(); } catch (_) {}
        return;
      }
      // Auto-next is FREE (no premium / trial gating).
      try { setAutoNextEnabled(true); } catch (_) {}
      try { syncAutoNextCheckbox(); } catch (_) {}
    });
  }
  function tryAutoNextNow(token) {
    if (token !== autoNextToken) return;
    if (!getAutoNextEnabled()) return cancelPendingAutoNext();
    if (matchId) return cancelPendingAutoNext();
    if (isSearching) return cancelPendingAutoNext();
    var now = Date.now();
    if (autoNextEarliestAt && now < autoNextEarliestAt) {
      if (autoNextTimer) {
        try { window.clearTimeout(autoNextTimer); } catch (_) {}
        autoNextTimer = null;
      }
      autoNextTimer = window.setTimeout(function () {
        tryAutoNextNow(token);
      }, Math.max(0, autoNextEarliestAt - now));
      return;
    }
    // If the user is still moving (recent activity), wait until quiet.
    if (lastUserActivityAt && now - lastUserActivityAt < AUTO_NEXT_QUIET_MS) {
      if (autoNextTimer) {
        try { window.clearTimeout(autoNextTimer); } catch (_) {}
        autoNextTimer = null;
      }
      autoNextTimer = window.setTimeout(function () {
        tryAutoNextNow(token);
      }, AUTO_NEXT_QUIET_MS);
      return;
    }
    // Auto-next is FREE (no premium / trial consumption).
    var sb = $("skip-btn");
    if (sb && typeof sb.click === "function") sb.click();
    cancelPendingAutoNext();
  }

  function maybeAutoNextAfterDisconnect() {
    if (!getAutoNextEnabled()) return;
    cancelPendingAutoNext();
    autoNextDisconnectAt = Date.now();
    autoNextEarliestAt = autoNextDisconnectAt + AUTO_NEXT_RENDER_DELAY_MS;
    var token = autoNextToken;
    // Initial schedule: after render delay, but can be delayed further by activity.
    autoNextTimer = window.setTimeout(function () {
      tryAutoNextNow(token);
    }, AUTO_NEXT_RENDER_DELAY_MS);
  }

  function openFeedback() {
    try {
      if (window.ChatSphereFeedback && typeof window.ChatSphereFeedback.open === "function") {
        window.ChatSphereFeedback.open();
        return;
      }
    } catch (_) {}
    // If the global feedback widget isn't available, do nothing (we want to use the same modal as index).
  }

  function addAnnouncementMessage(text) {
    var isNowTalking =
      String(text || "").indexOf("You are now talking to a stranger") === 0;
    if (isNowTalking) clearMessageArea();
    var messages = $("messages");
    if (!messages) return;
    var div = document.createElement("div");
    // Style this announcement like the "Looking for people online" status line.
    div.className =
      isNowTalking
        ? "message message-typing message-announce"
        : "message message-typing";
    div.textContent = text;
    div.style.fontWeight = "700";
    div.style.fontStyle = "italic";
    div.style.textAlign = "center";
    div.style.alignSelf = "center";
    div.style.maxWidth = "100%";
    div.style.fontSize = "15px";
    messages.appendChild(div);

    // Safety notice directly under the "now talking" line.
    // Only show on first match after page refresh, not when clicking "Next"
    if (ENABLE_GUIDELINES_NOTICE && isNowTalking && !guidelinesNoticeShown) {
      guidelinesNoticeShown = true;
      var notice = document.createElement("div");
      notice.className = "message message-typing";
      notice.style.textAlign = "center";
      notice.style.alignSelf = "center";
      notice.style.maxWidth = "100%";
      notice.style.fontSize = "12px";
      notice.style.fontWeight = "700";
      notice.style.fontStyle = "normal";
      notice.style.position = "relative";
      notice.style.paddingRight = "24px";
      // Don't use opacity here (it also dims the link); rely on text color instead.
      notice.style.color = "var(--text-secondary)";
      notice.style.lineHeight = "1.25";
      notice.style.marginTop = "-2px";

      var s1 = document.createElement("span");
      s1.textContent = "Keep it clean — inappropriate, sexual, or harassing messages can get you banned. ";
      notice.appendChild(s1);

      var a = document.createElement("a");
      a.href = "/community-guidelines.html";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Guidelines";
      a.style.textDecoration = "underline";
      a.style.color = "var(--color-primary)";
      a.style.fontWeight = "800";
      a.style.marginRight = "5px";
      notice.appendChild(a);

      // Close button
      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.textContent = "×";
      closeBtn.setAttribute("aria-label", "Dismiss guidelines notice");
      closeBtn.style.position = "absolute";
      closeBtn.style.right = "4px";
      closeBtn.style.top = "50%";
      closeBtn.style.transform = "translateY(-50%)";
      closeBtn.style.background = "transparent";
      closeBtn.style.border = "none";
      closeBtn.style.color = "var(--text-secondary)";
      closeBtn.style.fontSize = "22px";
      closeBtn.style.fontWeight = "700";
      closeBtn.style.lineHeight = "1";
      closeBtn.style.cursor = "pointer";
      closeBtn.style.padding = "2px 8px";
      closeBtn.style.borderRadius = "4px";
      closeBtn.style.opacity = "0.8";
      closeBtn.style.zIndex = "10";
      closeBtn.style.display = "block";
      closeBtn.style.minWidth = "24px";
      closeBtn.style.minHeight = "24px";
      closeBtn.addEventListener("mouseenter", function () {
        closeBtn.style.opacity = "1";
        closeBtn.style.background = "rgba(255,255,255,0.15)";
        closeBtn.style.color = "var(--text-primary)";
      });
      closeBtn.addEventListener("mouseleave", function () {
        closeBtn.style.opacity = "0.8";
        closeBtn.style.background = "transparent";
        closeBtn.style.color = "var(--text-secondary)";
      });
      closeBtn.addEventListener("click", function (e) {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch (_) {}
        try {
          if (notice.parentNode) notice.parentNode.removeChild(notice);
        } catch (_) {}
      });
      notice.appendChild(closeBtn);

      messages.appendChild(notice);
    }

    // Keep typing indicator visually under the latest message.
    var typing = $("typing");
    if (typing && typing.parentNode === messages) messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;
  }

  function formatNowTalkingLine(partnerCountryCode) {
    var cc = String(partnerCountryCode || "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(cc)) {
      return "Stranger is from " + flagEmoji(cc) + "  " + cc;
    }
    return "Connected";
  }

  function renderNowTalkingLineEl(el, partnerCountryCode) {
    if (!el) return;
    var cc = String(partnerCountryCode || "").trim().toUpperCase();
    var ok = /^[A-Z]{2}$/.test(cc);
    el.setAttribute("data-cc", ok ? cc : "");
    el.textContent = "";

    if (!ok) {
      el.textContent = "Connected";
      appendScorePill(el);
      return;
    }

    var countryName = countryNameFromCode(cc);

    // On mobile, avoid flex layout with a separate flag element (it causes awkward wraps).
    // Render as a single text node instead.
    try {
      if (window && window.innerWidth <= 800) {
        el.textContent = "Stranger is from " + countryName + "  " + flagEmoji(cc);
        appendScorePill(el);
        return;
      }
    } catch (_) {}

    // Inline flag icon on desktop (image) / mobile (emoji) via createFlagEl().
    el.appendChild(document.createTextNode("Stranger is from "));
    el.appendChild(document.createTextNode(countryName));
    el.appendChild(document.createTextNode("  "));
    el.appendChild(createFlagEl(cc));
    appendScorePill(el);
    // No trailing "!" for country variant.
  }

  function addNowTalkingAnnouncement(partnerCountryCode) {
    clearMessageArea();
    var messages = $("messages");
    if (!messages) return;

    var div = document.createElement("div");
    div.id = "nowTalkingLine";
    div.className = "message message-typing message-announce now-talking-banner";
    div.style.textAlign = "center";
    div.style.alignSelf = "center";
    div.style.maxWidth = "100%";
    renderNowTalkingLineEl(div, partnerCountryCode);
    messages.appendChild(div);

    // Safety notice directly under the "now talking" line.
    // Only show on first match after page refresh, not when clicking "Next"
    if (ENABLE_GUIDELINES_NOTICE && !guidelinesNoticeShown) {
      guidelinesNoticeShown = true;
      var notice = document.createElement("div");
      notice.className = "message message-typing";
      notice.style.textAlign = "center";
      notice.style.alignSelf = "center";
      notice.style.maxWidth = "100%";
      notice.style.fontSize = "12px";
      notice.style.fontWeight = "700";
      notice.style.fontStyle = "normal";
      notice.style.position = "relative";
      notice.style.paddingRight = "24px";
      // Don't use opacity here (it also dims the link); rely on text color instead.
      notice.style.color = "var(--text-secondary)";
      notice.style.lineHeight = "1.25";
      notice.style.marginTop = "-2px";

      var s1 = document.createElement("span");
      s1.textContent = "Keep it clean — inappropriate, sexual, or harassing messages can get you banned. ";
      notice.appendChild(s1);

      var a = document.createElement("a");
      a.href = "/community-guidelines.html";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Guidelines";
      a.style.textDecoration = "underline";
      a.style.color = "var(--color-primary)";
      a.style.fontWeight = "800";
      a.style.marginRight = "5px";
      notice.appendChild(a);

      // Close button
      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.textContent = "×";
      closeBtn.setAttribute("aria-label", "Dismiss guidelines notice");
      closeBtn.style.position = "absolute";
      closeBtn.style.right = "4px";
      closeBtn.style.top = "50%";
      closeBtn.style.transform = "translateY(-50%)";
      closeBtn.style.background = "transparent";
      closeBtn.style.border = "none";
      closeBtn.style.color = "var(--text-secondary)";
      closeBtn.style.fontSize = "22px";
      closeBtn.style.fontWeight = "700";
      closeBtn.style.lineHeight = "1";
      closeBtn.style.cursor = "pointer";
      closeBtn.style.padding = "2px 8px";
      closeBtn.style.borderRadius = "4px";
      closeBtn.style.opacity = "0.8";
      closeBtn.style.zIndex = "10";
      closeBtn.style.display = "block";
      closeBtn.style.minWidth = "24px";
      closeBtn.style.minHeight = "24px";
      closeBtn.addEventListener("mouseenter", function () {
        closeBtn.style.opacity = "1";
        closeBtn.style.background = "rgba(255,255,255,0.15)";
        closeBtn.style.color = "var(--text-primary)";
      });
      closeBtn.addEventListener("mouseleave", function () {
        closeBtn.style.opacity = "0.8";
        closeBtn.style.background = "transparent";
        closeBtn.style.color = "var(--text-secondary)";
      });
      closeBtn.addEventListener("click", function (e) {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch (_) {}
        try {
          if (notice.parentNode) notice.parentNode.removeChild(notice);
        } catch (_) {}
      });
      notice.appendChild(closeBtn);
      messages.appendChild(notice);
    }

    // Keep typing indicator / actions under the latest message.
    var typing = $("typing");
    if (typing && typing.parentNode === messages) messages.appendChild(typing);
    var actions = $("postDisconnectActions");
    if (actions && actions.parentNode === messages) messages.appendChild(actions);
    messages.scrollTop = messages.scrollHeight;
  }

  function decodeHtmlEntities(input) {
    var s = input == null ? "" : String(input);
    if (s.indexOf("&") === -1) return s;
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, function (m, ent) {
      if (ent === "amp") return "&";
      if (ent === "lt") return "<";
      if (ent === "gt") return ">";
      if (ent === "quot") return '"';
      if (ent === "apos") return "'";
      try {
        if (ent && ent.indexOf("#x") === 0) {
          var n1 = parseInt(ent.slice(2), 16);
          if (isFinite(n1)) return String.fromCodePoint(n1);
        }
        if (ent && ent.indexOf("#") === 0) {
          var n2 = parseInt(ent.slice(1), 10);
          if (isFinite(n2)) return String.fromCodePoint(n2);
        }
      } catch (_) {}
      return m;
    });
  }

  function addChatMessage(prefix, text, isPremium) {
    var messages = $("messages");
    if (!messages) return;
    // If a real message arrives, remove the typing bubble so it "turns into" the next Stranger message position.
    try { setPartnerTypingVisible(false); } catch (_) {}
    var div = document.createElement("div");
    div.className = "message";
    var span = document.createElement("span");
    // CSS expects ".you" and ".strange" labels (see public/css/video2.css)
    span.className = prefix === "You" ? "you" : "strange";
    ensurePremiumBadgeStyles();
    renderNameWithPremiumBadge(span, prefix, !!isPremium);
    span.appendChild(document.createTextNode(": "));
    div.appendChild(span);

    function parseSharedFile(textValue) {
      if (!textValue) return null;
      var raw = String(textValue).trim();
      // New format: "__file__:<url>|<filename>"
      if (raw.indexOf("__file__:") === 0) {
        var rest = raw.slice("__file__:".length);
        var parts = rest.split("|");
        var url0 = (parts[0] || "").trim();
        var name0 = (parts.slice(1).join("|") || "").trim();
        if (url0.indexOf("/uploads/") !== 0) return null;
        return { url: url0, name: name0 || null };
      }
      // Back-compat: just a /uploads/... url
      if (raw.indexOf("/uploads/") === 0) return { url: raw, name: null };
      return null;
    }

    function classifyMediaUrl(u) {
      if (!u) return null;
      var url = String(u).trim();
      // Only render same-origin /uploads links for safety.
      if (url.indexOf("/uploads/") !== 0) return null;
      var pathOnly = url.split("?")[0].split("#")[0].toLowerCase();
      if (pathOnly.endsWith(".png") || pathOnly.endsWith(".jpg") || pathOnly.endsWith(".jpeg") || pathOnly.endsWith(".gif") || pathOnly.endsWith(".webp")) {
        return { kind: "image", url: url };
      }
      if (pathOnly.endsWith(".mp4") || pathOnly.endsWith(".webm") || pathOnly.endsWith(".mov") || pathOnly.endsWith(".ogg")) {
        return { kind: "video", url: url };
      }
      return null;
    }

    var shared = parseSharedFile(text);
    var media = shared ? classifyMediaUrl(shared.url) : null;
    if (media) {
      var wrap = document.createElement("div");
      wrap.className = "file-message";
      var fileUrl = media.url;

      if (media.kind === "image") {
        var a = document.createElement("a");
        a.href = fileUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        var img = document.createElement("img");
        img.src = fileUrl;
        img.alt = "Shared image";
        // Images load async; ensure we stay scrolled to bottom once it renders.
        try {
          img.addEventListener("load", function () {
            try { messages.scrollTop = messages.scrollHeight; } catch (_) {}
          });
        } catch (_) {}
        a.appendChild(img);
        wrap.appendChild(a);
      } else {
        var v = document.createElement("video");
        v.controls = true;
        // Videos load async; keep scroll pinned when metadata/data arrives.
        try {
          v.addEventListener("loadedmetadata", function () {
            try { messages.scrollTop = messages.scrollHeight; } catch (_) {}
          });
          v.addEventListener("loadeddata", function () {
            try { messages.scrollTop = messages.scrollHeight; } catch (_) {}
          });
        } catch (_) {}
        var src = document.createElement("source");
        src.src = fileUrl;
        v.appendChild(src);
        wrap.appendChild(v);
      }

      var fileNameRow = document.createElement("div");
      fileNameRow.className = "file-name";

      var nameSpan = document.createElement("span");
      // Prefer sender-provided filename; otherwise derive from URL.
      var derivedName = (fileUrl.split("?")[0].split("#")[0].split("/").pop() || "file").trim();
      nameSpan.textContent = (shared && shared.name ? shared.name : derivedName);
      fileNameRow.appendChild(nameSpan);

      var dl = document.createElement("a");
      dl.href = fileUrl;
      dl.className = "download-btn";
      dl.setAttribute("download", nameSpan.textContent || "file");
      dl.textContent = "Download";
      fileNameRow.appendChild(dl);

      wrap.appendChild(fileNameRow);
      div.appendChild(wrap);
    } else {
      var t = document.createElement("span");
      t.textContent = decodeHtmlEntities(text);
      div.appendChild(t);
    }

    messages.appendChild(div);
    // Keep typing indicator visually under the latest message.
    var typing = $("typing");
    if (typing && typing.parentNode === messages) messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;
  }

  function uploadFile(file, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", "/upload");
      xhr.upload.addEventListener("progress", function (ev) {
        if (ev.lengthComputable && typeof onProgress === "function") {
          onProgress((ev.loaded / ev.total) * 100);
        }
      });
      xhr.addEventListener("load", function () {
        if (xhr.status < 200 || xhr.status >= 300) {
          if (xhr.status === 402) {
            reject(new Error("Premium required to upload files."));
            return;
          }
          reject(new Error("Upload failed (" + xhr.status + ")"));
          return;
        }
        var data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (_) {
          reject(new Error("Invalid upload response"));
          return;
        }
        if (!data || !data.url) {
          reject(new Error("Upload failed"));
          return;
        }
        resolve(String(data.url));
      });
      xhr.addEventListener("error", function () {
        reject(new Error("Upload failed"));
      });

      var form = new FormData();
      form.append("file", file);
      xhr.send(form);
    });
  }

  function setPeopleOnline(n) {
    var el = $("peopleOnline");
    if (!el) return;
    var span = el.querySelector("p.online-text span");
    if (span) span.textContent = String(n);
  }

  function updateReportAvailability(enabled) {
    reportAvailable = !!enabled;
    var btn = $("report-link");
    if (!btn) return;
    var visible = !!(reportAvailable || reportGraceMatchId);
    btn.style.display = visible ? "" : "none";
    btn.setAttribute("aria-hidden", visible ? "false" : "true");
    try { refreshReportModalCopy(); } catch (_) {}
  }

  function clearReportGrace() {
    if (reportGraceTimer) {
      try { window.clearTimeout(reportGraceTimer); } catch (_) {}
      reportGraceTimer = null;
    }
    reportGraceMatchId = null;
    updateReportAvailability(reportAvailable);
    try { refreshReportModalCopy(); } catch (_) {}
  }

  function beginReportGrace(matchId0) {
    var mid = String(matchId0 || "").trim();
    if (!mid) return;
    reportGraceMatchId = mid;
    updateReportAvailability(reportAvailable);
    try { refreshReportModalCopy(); } catch (_) {}
    if (reportGraceTimer) {
      try { window.clearTimeout(reportGraceTimer); } catch (_) {}
    }
    reportGraceTimer = window.setTimeout(function () {
      reportGraceTimer = null;
      reportGraceMatchId = null;
      updateReportAvailability(reportAvailable);
    }, REPORT_GRACE_MS);
  }

  function getReportTargetMatchId() {
    return String(matchId || reportGraceMatchId || "").trim();
  }

  function clearVoteGrace() {
    if (voteGraceTimer) {
      try { window.clearTimeout(voteGraceTimer); } catch (_) {}
      voteGraceTimer = null;
    }
    voteGraceMatchId = null;
    updateVoteControls();
  }

  function beginVoteGrace(matchId0) {
    var mid = String(matchId0 || "").trim();
    if (!mid) return;
    voteGraceMatchId = mid;
    updateVoteControls();
    if (voteGraceTimer) {
      try { window.clearTimeout(voteGraceTimer); } catch (_) {}
    }
    voteGraceTimer = window.setTimeout(function () {
      voteGraceTimer = null;
      voteGraceMatchId = null;
      updateVoteControls();
    }, REPORT_GRACE_MS);
  }

  function getVoteTargetMatchId() {
    return String(matchId || voteGraceMatchId || "").trim();
  }

  function formatPublicScore(score) {
    var n = Number(score && score.score);
    if (!isFinite(n)) n = 0;
    return "Stranger's Score " + (n > 0 ? "+" : "") + String(n);
  }

  function setPartnerVoteScore(score) {
    partnerVoteScore = {
      upvotes: Math.max(0, Number(score && score.upvotes) || 0),
      downvotes: Math.max(0, Number(score && score.downvotes) || 0),
      score: Number(score && score.score) || 0
    };
    var el = $("partnerScorePill");
    if (el) {
      el.textContent = formatPublicScore(partnerVoteScore);
      el.title = String(partnerVoteScore.upvotes) + " up / " + String(partnerVoteScore.downvotes) + " down";
      el.classList.toggle("is-positive", partnerVoteScore.score > 0);
      el.classList.toggle("is-negative", partnerVoteScore.score < 0);
      el.classList.toggle("is-neutral", partnerVoteScore.score === 0);
    }
  }

  function appendScorePill(parent) {
    if (!parent) return;
    if (String(parent.id || "") !== "voteActions" && String(parent.id || "") !== "countryBar") return;
    var existing = $("partnerScorePill");
    if (existing && existing.parentNode === parent) return;
    if (existing && existing.parentNode) {
      try { existing.parentNode.removeChild(existing); } catch (_) {}
    }
    var pill = document.createElement("span");
    pill.id = "partnerScorePill";
    pill.className = "user-score-pill";
    pill.textContent = formatPublicScore(partnerVoteScore);
    pill.title = String(partnerVoteScore.upvotes) + " up / " + String(partnerVoteScore.downvotes) + " down";
    pill.classList.toggle("is-positive", partnerVoteScore.score > 0);
    pill.classList.toggle("is-negative", partnerVoteScore.score < 0);
    pill.classList.toggle("is-neutral", partnerVoteScore.score === 0);
    parent.appendChild(pill);
  }

  function ensureVoteControls() {
    var actions = $("countryBar") || (matchId ? $("chat-controls") : $("postDisconnectActions"));
    if (!actions) actions = $("postDisconnectActions") || $("chat-controls");
    if (!actions) return null;
    var wrap = $("voteActions");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "voteActions";
      wrap.className = "vote-actions user-vote-panel";
      appendScorePill(wrap);
      var up = document.createElement("button");
      up.id = "upvoteBtn";
      up.className = "vote-btn vote-up";
      up.type = "button";
      up.textContent = "Upvote";
      var down = document.createElement("button");
      down.id = "downvoteBtn";
      down.className = "vote-btn vote-down";
      down.type = "button";
      down.textContent = "Downvote";
      wrap.appendChild(up);
      wrap.appendChild(down);
      up.addEventListener("click", function () { sendUserVote(1); });
      down.addEventListener("click", function () { sendUserVote(-1); });
    } else {
      wrap.classList.add("user-vote-panel");
      appendScorePill(wrap);
    }
    if (wrap.parentNode !== actions) actions.appendChild(wrap);
    return wrap;
  }

  function updateVoteControls() {
    var wrap = ensureVoteControls();
    if (!wrap) return;
    var mid = getVoteTargetMatchId();
    var show = !!(mid && (matchId || voteGraceMatchId));
    wrap.style.display = show ? "inline-flex" : "none";
    wrap.setAttribute("data-state", matchId ? "live" : "grace");
    var selected = mid ? Number(userVoteByMatchId[mid] || 0) : 0;
    var up = $("upvoteBtn");
    var down = $("downvoteBtn");
    if (up) up.classList.toggle("is-selected", selected === 1);
    if (down) down.classList.toggle("is-selected", selected === -1);
  }

  function sendUserVote(vote) {
    if (!wsClient) return;
    var mid = getVoteTargetMatchId();
    if (!mid) {
      showEphemeralToast("No recent stranger is available to vote on.");
      return;
    }
    vote = Number(vote) === -1 ? -1 : 1;
    userVoteByMatchId[mid] = vote;
    updateVoteControls();
    wsClient.send({ type: "user_vote", matchId: mid, vote: vote });
  }

  function refreshReportModalCopy() {
    var title = $("reportTitle");
    var sub = $("reportSub");
    var alert = $("reportAlert");
    var submit = $("submitReport");
    var grace = !!(reportGraceMatchId && !matchId);
    if (title) title.textContent = grace ? "Report your last stranger" : "Report this user";
    if (sub) {
      sub.textContent = grace
        ? "You can still report the last stranger from this session after disconnect. Flag underage users, harassment, sexual content, spam, or other behavior that breaks the rules."
        : "Flag underage users, harassment, sexual content, spam, or other behavior that breaks the rules.";
    }
    if (alert) {
      alert.textContent = grace
        ? "The last stranger from this session is attached automatically. Use this only for actual violations."
        : "Reports help moderation remove repeat offenders faster. Use this only for actual violations.";
    }
    if (submit) submit.textContent = grace ? "Report Last Stranger" : "Submit Report";
  }

  function setSkipLabel(label) {
    var btn = $("skip-btn");
    if (btn) btn.childNodes[0].nodeValue = label;
  }

  var inlineErrorTimer = null;
  function hideInlineError() {
    var bar = document.getElementById("inline-error-bar");
    if (!bar) return;
    try {
      if (inlineErrorTimer) window.clearTimeout(inlineErrorTimer);
    } catch (_) {}
    inlineErrorTimer = null;
    try { bar.classList.remove("show"); } catch (_) {}
  }
  function showInlineError(text) {
    var t = String(text || "").trim();
    if (!t) t = "Something went wrong.";
    // Prefer showing short messages (avoid repeating "Error:" prefix).
    if (t.toLowerCase().indexOf("error:") === 0) t = t.slice(6).trim();

    // For the common "Please wait..." throttling message, use a transient toast bubble instead
    // of injecting an inline bar into the chat UI.
    if (t && /\bplease\s+wait\b/i.test(t)) {
      try { showEphemeralToast(t); } catch (_) {}
      return;
    }

    var messageArea = $("message-area");
    if (!messageArea) return addSystemMessage("Error: " + t, true);
    var bar = document.getElementById("inline-error-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "inline-error-bar";
      bar.className = "inline-error-bar";
      bar.setAttribute("role", "status");
      bar.setAttribute("aria-live", "polite");

      var left = document.createElement("div");
      left.className = "inline-error-left";
      var icon = document.createElement("div");
      icon.className = "inline-error-icon";
      icon.textContent = "!";
      var msg = document.createElement("div");
      msg.className = "inline-error-text";
      left.appendChild(icon);
      left.appendChild(msg);

      var close = document.createElement("button");
      close.type = "button";
      close.className = "inline-error-close";
      close.setAttribute("aria-label", "Dismiss");
      close.textContent = "×";
      close.addEventListener("click", function () {
        try { bar.classList.remove("show"); } catch (_) {}
      });

      bar.appendChild(left);
      bar.appendChild(close);
      messageArea.appendChild(bar);
    }

    try {
      var msgEl = bar.querySelector(".inline-error-text");
      if (msgEl) msgEl.textContent = t;
    } catch (_) {}

    try { bar.classList.add("show"); } catch (_) {}

    // Auto-hide after a moment
    try {
      if (inlineErrorTimer) window.clearTimeout(inlineErrorTimer);
    } catch (_) {}
    inlineErrorTimer = window.setTimeout(function () {
      try { bar.classList.remove("show"); } catch (_) {}
    }, 2500);
  }

  function showTerminalSystemState(text) {
    var t = String(text || "").trim();
    if (!t) return;
    hideInlineError();
    addSystemMessage(t, true);
  }

  function activateMessageInput() {
    var input = $("message-input");
    if (!input) return;
    try {
      input.disabled = false;
      input.readOnly = false;
      input.removeAttribute("disabled");
      input.removeAttribute("readonly");
      input.setAttribute("aria-disabled", "false");
    } catch (_) {}

    // Mobile UX: don't auto-focus on connect/next (it opens the keyboard every time).
    // Let the user tap the input when they actually want to type.
    try {
      if (window && window.innerWidth <= 800) return;
    } catch (_) {}

    function tryFocus() {
      try {
        // Some browsers support preventScroll.
        input.focus({ preventScroll: true });
        return true;
      } catch (_) {}
      try {
        input.focus();
        return true;
      } catch (_) {
        return false;
      }
    }

    // Attempt now (may be blocked if not user-initiated).
    try {
      window.setTimeout(function () {
        tryFocus();
      }, 0);
    } catch (_) {}

    // Fallback: focus on the next user gesture (mobile Safari/Chrome restrictions).
    try {
      var once = function () {
        tryFocus();
      };
      window.addEventListener("pointerdown", once, { once: true, passive: true });
      window.addEventListener("touchstart", once, { once: true, passive: true });
      window.addEventListener("mousedown", once, { once: true, passive: true });
    } catch (_) {}
  }

  function handleWsMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === "ui_action") {
      // Server-driven UI effects (admin tools / moderation).
      try {
        var action = String(msg.action || "");
        var ms = Number(msg.ms || 0);
        if (action === "disable_skip" && ms > 0) disableSkipButtonForMs(ms);
        if (action === "mod_strike") {
          showModStrike(msg.strikes, msg.max, msg.banText || "");
          // Forced popup acknowledgment (if server requests it).
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

    if (msg.type === "banned") {
      banModalActive = true;
      lastBanPayload = msg;
      showBanModal(msg);
      return;
    }

    if (msg.type === "session") {
      myUserId = msg.userId;
      void myUserId;
      return;
    }
    if (msg.type === "system") {
      addSystemMessage(msg.text || "");
      return;
    }
    if (msg.type === "showIpResponse") {
      var d = msg.data;
      if (d && typeof d === "object") {
        var peerIp = d.peerIp || "";
        var url = d.url || "";
        var label = d.message || "Remote Peer IP";
        if (peerIp && url) {
          var messages = $("messages");
          if (messages) {
            var div = document.createElement("div");
            div.className = "message message-system";
            var span = document.createElement("span");
            span.className = "system";
            span.textContent = label + ": ";
            div.appendChild(span);
            var a = document.createElement("a");
            a.href = url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = peerIp;
            div.appendChild(a);
            messages.appendChild(div);
            var typing = $("typing");
            if (typing && typing.parentNode === messages) messages.appendChild(typing);
            messages.scrollTop = messages.scrollHeight;
          }
        } else {
          addSystemMessage("No peer connected");
        }
      } else {
        addSystemMessage(d || "");
      }
      return;
    }
    if (msg.type === "redirect") {
      var url = msg.url || "/chat";
      try {
        window.location.href = url;
      } catch (_) {}
      return;
    }
    if (msg.type === "error") {
      // Generic terminal connection error: stop reconnect loop + show minimal message.
      try {
        if (String(msg.code || "") === "connection error") {
          connectionErrorActive = true;
          banModalActive = true;
          try { showTerminalSystemState("Connection error."); } catch (_) {}
          try { if (wsClient && typeof wsClient.close === "function") wsClient.close(); } catch (_) {}
          isSearching = false;
          try { setSkipLabel("Start"); } catch (_) {}
          try { hideStatusLine(); } catch (_) {}
          try { stopSearchWatchdog(); } catch (_) {}
          return;
        }
      } catch (_) {}
      // VPN/proxy block is a terminal policy decision: stop reconnect loop + show a stable message.
      try {
        if (String(msg.code || "") === "vpn_blocked") {
          vpnBlockedActive = true;
          banModalActive = true;
          try { showTerminalSystemState("VPN / proxy connections are not allowed."); } catch (_) {}
          try { if (wsClient && typeof wsClient.close === "function") wsClient.close(); } catch (_) {}
          isSearching = false;
          try { setSkipLabel("Start"); } catch (_) {}
          try { hideStatusLine(); } catch (_) {}
          try { stopSearchWatchdog(); } catch (_) {}
          return;
        }
      } catch (_) {}
      showInlineError(msg.message || msg.code || "Please wait a moment.");
      try {
        if (isSearching && !matchId) {
          setSkipLabel("Start");
          hideStatusLine();
          isSearching = false;
          stopSearchWatchdog();
        }
      } catch (_) {}
      return;
    }
    if (msg.type === "match_found") {
      clearReportGrace();
      clearVoteGrace();
      matchId = msg.matchId;
      if (matchId && gaMatchFoundSentId !== String(matchId)) {
        gaMatchFoundSentId = String(matchId);
        sendTextAnalyticsEvent("text_match_found", {
          match_id_present: 1,
          match_mode: String(msg.matchMode || "random")
        });
      }
      partnerUserId = msg.partnerUserId;
      void partnerUserId;
      myPremiumActive = !!msg.yourPremiumActive;
      partnerPremiumActive = !!msg.partnerPremiumActive;
      setPartnerVoteScore(msg.partnerVoteScore || { upvotes: 0, downvotes: 0, score: 0 });
      try { cancelPendingAutoNext(); } catch (_) {}
      addNowTalkingAnnouncement(msg.partnerCountryCode);
      addConnectPolicyNotice();
      activateMessageInput();
      lastAutoMsgSentMatchId = null;
      maybeScheduleAutoMessageOnConnect(matchId);
      try { startSessionTimer(); } catch (_) {}
      try {
        var ints = getSavedInterests();
        if (msg && msg.matchMode === "interest" && msg.matchedInterest) {
          addSystemMessage('Matched on interest: "' + String(msg.matchedInterest) + '"');
        } else if (ints.length) {
          addSystemMessage("Matched randomly (no shared interests found).");
        }
      } catch (_) {}
      try { renderInterestBar(); } catch (_) {}
      try { renderCountryBar(); } catch (_) {}
      updateReportAvailability(true);
      setSkipLabel("Next");
      hideStatusLine();
      isSearching = false;
      stopSearchWatchdog();
      setPartnerTypingVisible(false);
      setPostDisconnectActionsVisible(false);
      return;
    }
    if (msg.type === "partner_geo") {
      if (!matchId || msg.matchId !== matchId) return;
      try {
        var el = document.getElementById("nowTalkingLine");
        if (el) renderNowTalkingLineEl(el, msg.partnerCountryCode);
      } catch (_) {}
      return;
    }
    if (msg.type === "partner_disconnected") {
      // IMPORTANT: ignore stale disconnects from a previous match.
      // Otherwise a late "partner_disconnected" can overwrite UI even after we matched a new stranger.
      if (!matchId) return;
      if (msg.matchId && msg.matchId !== matchId) return;
      var prevMatchId = matchId;
      sendTextAnalyticsEvent("text_match_ended", {
        match_id_present: prevMatchId ? 1 : 0,
        reason: String(msg.reason || "partner_disconnected")
      });
      setPartnerTypingVisible(false);
      addDisconnectChatMessage(msg.reason);
      clearTypingStopTimer();
      localIsTyping = false;
      matchId = null;
      partnerUserId = null;
      myPremiumActive = false;
      partnerPremiumActive = false;
      cancelPendingAutoMessage();
      lastAutoMsgSentMatchId = null;
      try { freezeSessionTimer(); } catch (_) {}
      beginReportGrace(prevMatchId);
      beginVoteGrace(prevMatchId);
      updateReportAvailability(false);
      setPostDisconnectActionsVisible(true);
      try { maybeAutoNextAfterDisconnect(); } catch (_) {}
      setSkipLabel("Start");
      hideStatusLine();
      isSearching = false;
      stopSearchWatchdog();
      return;
    }
    if (msg.type === "partner_typing") {
      if (!matchId || msg.matchId !== matchId) return;
      setPartnerTypingVisible(!!msg.isTyping);
      return;
    }
    if (msg.type === "chat_message") {
      if (!msg.text) return;
      if (msg.from === "you") addChatMessage("You", msg.text, myPremiumActive);
      else addChatMessage("Stranger", msg.text, partnerPremiumActive);
      return;
    }

    if (msg.type === "vote_update") {
      if (msg.matchId && getVoteTargetMatchId() && String(msg.matchId) !== getVoteTargetMatchId()) return;
      if (msg.targetScore) setPartnerVoteScore(msg.targetScore);
      if (msg.ok && msg.matchId && msg.vote) userVoteByMatchId[String(msg.matchId)] = Number(msg.vote) === -1 ? -1 : 1;
      updateVoteControls();
      return;
    }

    if (msg.type === "stats") {
      setPeopleOnline(msg.online || 0);
      return;
    }
  }

  function parseExpiresMs(expiresAt) {
    if (expiresAt == null) return 0;
    if (typeof expiresAt === "number" && isFinite(expiresAt)) return expiresAt;
    var s = String(expiresAt || "").trim();
    if (!s) return 0;
    if (/^\d+$/.test(s)) {
      var n = Number(s);
      if (isFinite(n)) return n;
    }
    var iso = s.indexOf("T") >= 0 ? s : s.replace(" ", "T") + "Z";
    var t = Date.parse(iso);
    if (!isFinite(t)) t = Date.parse(s);
    return isFinite(t) ? t : 0;
  }

  function fmtEst(v) {
    try {
      var t = parseExpiresMs(v);
      if (!t) return String(v || "");
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
      return String(v || "");
    }
  }

  function fmtRemaining(expiresAt) {
    if (!expiresAt) return "Permanent";
    var t = parseExpiresMs(expiresAt);
    if (!t) return "Temporary";
    var ms = Math.max(0, t - Date.now());
    var sec = Math.floor(ms / 1000);
    var days = Math.floor(sec / 86400);
    sec -= days * 86400;
    var hrs = Math.floor(sec / 3600);
    sec -= hrs * 3600;
    var mins = Math.floor(sec / 60);
    sec -= mins * 60;
    if (days > 0) return days + "d " + hrs + "h " + mins + "m";
    if (hrs > 0) return hrs + "h " + mins + "m";
    if (mins > 0) return mins + "m " + sec + "s";
    return sec + "s";
  }

  function showBanModal(payload) {
    try {
      var existing = document.getElementById("ban-modal-overlay");
      if (existing) return;
      var dismissBanModal = function () {
        try {
          var el = document.getElementById("ban-modal-overlay");
          if (el && el.parentNode) el.parentNode.removeChild(el);
        } catch (_) {}
        try {
          document.documentElement.style.overflow = "";
          document.body.style.overflow = "";
        } catch (_) {}
        try {
          banModalActive = false;
        } catch (_) {}
      };
      // Auto-dismiss when unbanned (Stripe webhook): poll edge status and refresh when cleared.
      try {
        var unbanPoll = setInterval(function () {
          try {
            fetch("/api/unban/status?ts=" + Date.now(), { method: "GET", cache: "no-store" })
              .then(function (r) {
                return r.text().then(function (t) {
                  var j = null;
                  try {
                    j = JSON.parse(t || "{}");
                  } catch (_) {}
                  return { j: j || {}, ok: !!r.ok, status: Number(r.status || 0) || 0, text: String(t || "") };
                });
              })
              .then(function (out) {
                var j = out && out.j ? out.j : {};
                if (j && j.banned === false) {
                  try {
                    clearInterval(unbanPoll);
                  } catch (_) {}
                  try {
                    dismissBanModal();
                    setTimeout(function () {
                      try {
                        window.location.href = "/?unbanned=1";
                      } catch (_) {}
                    }, 50);
                  } catch (_) {}
                }
              })
              .catch(function () {});
          } catch (_) {}
        }, 2000);
        window.addEventListener(
          "beforeunload",
          function () {
            try {
              clearInterval(unbanPoll);
            } catch (_) {}
          },
          { once: true }
        );
      } catch (_) {}
      try {
        document.documentElement.style.overflow = "hidden";
        document.body.style.overflow = "hidden";
      } catch (_) {}

      var overlay = document.createElement("div");
      overlay.id = "ban-modal-overlay";
      overlay.className = "ban-modal-overlay";

      var card = document.createElement("div");
      card.className = "ban-modal-card";

      var top = document.createElement("div");
      top.className = "ban-modal-top";
      var brand = document.createElement("div");
      brand.className = "ban-modal-brand";
      var mark = document.createElement("div");
      mark.className = "ban-modal-mark";
      var titleWrap = document.createElement("div");
      titleWrap.style.minWidth = "0";
      var h = document.createElement("div");
      h.className = "ban-modal-title";
      h.textContent = "You are banned";
      var sub = document.createElement("div");
      sub.className = "ban-modal-sub";
      sub.textContent = "Your access has been restricted.";
      titleWrap.appendChild(h);
      titleWrap.appendChild(sub);
      brand.appendChild(mark);
      brand.appendChild(titleWrap);
      top.appendChild(brand);
      card.appendChild(top);

      var pill = document.createElement("div");
      pill.className = "ban-modal-pill";
      pill.textContent = "Access restricted";
      card.appendChild(pill);

      // Always keep reasons vague (do not reveal enforcement details).
      try {
        var reason = document.createElement("div");
        reason.className = "ban-modal-copy";
        reason.textContent =
          "Your access was restricted because we detected activity that violates our Community Guidelines.";
        card.appendChild(reason);
      } catch (_) {}

      // Guidelines link (simple link, not a button).
      try {
        var gl = document.createElement("div");
        gl.className = "ban-modal-panel ban-modal-guidance";
        gl.innerHTML =
          'Please review our <a class="ban-modal-link" href="/community-guidelines.html" target="_blank" rel="noopener noreferrer">Community Guidelines</a>.';
        card.appendChild(gl);
      } catch (_) {}

      // Extra info (timestamps).
      try {
        var info = document.createElement("div");
        info.className = "ban-modal-panel ban-modal-meta";
        var bannedAt = payload && payload.bannedAt ? String(payload.bannedAt) : "";
        var expiresAt = payload && payload.expiresAt ? String(payload.expiresAt) : "";
        var bannedAtLine = "Banned at: " + (bannedAt ? fmtEst(bannedAt) : "—");
        var expiresAtLine = "Expires: " + (expiresAt ? fmtEst(expiresAt) : "Permanent");
        info.innerHTML =
          '<div class="ban-modal-meta-row">' +
            '<div class="ban-modal-meta-label">Banned at</div>' +
            '<div class="ban-modal-meta-value ban-modal-mono">' + (bannedAt ? fmtEst(bannedAt) : "—") + "</div>" +
          "</div>" +
          '<div class="ban-modal-meta-row">' +
            '<div class="ban-modal-meta-label">Expires</div>' +
            '<div class="ban-modal-meta-value ban-modal-mono">' + (expiresAt ? fmtEst(expiresAt) : "Permanent") + "</div>" +
          "</div>";
        card.appendChild(info);
      } catch (_) {}

      var dur = document.createElement("div");
      dur.className = "ban-modal-panel ban-modal-meta-row";
      dur.innerHTML = '<div class="ban-modal-meta-label">Duration</div>';
      var durSpan = document.createElement("span");
      durSpan.className = "ban-modal-meta-value ban-modal-mono";
      durSpan.id = "ban-remaining";
      durSpan.textContent = fmtRemaining(payload.expiresAt);
      dur.appendChild(durSpan);
      card.appendChild(dur);

      // Live countdown (updates every second)
      if (payload && payload.expiresAt) {
        var lastText = durSpan.textContent || "";
        var timer = setInterval(function () {
          try {
            var el = document.getElementById("ban-remaining");
            if (!el) return clearInterval(timer);
            var next = fmtRemaining(payload.expiresAt);
            if (next !== lastText) {
              lastText = next;
              el.textContent = next;
            }
          } catch (_) {}
        }, 1000);
      }

      if (payload.lastScreenshot && payload.lastScreenshot.filename) {
        var imgWrap = document.createElement("div");
        imgWrap.className = "ban-modal-imgwrap";
        var img = document.createElement("img");
        var fn = String(payload.lastScreenshot.filename || "");
        var safe = encodeURIComponent(fn).replace(/%2F/g, "/").replace(/%5C/g, "/");
        img.src = "/view-images/" + safe;
        img.addEventListener("error", function () {
          try {
            img.src = "/e/screenshots/" + safe;
          } catch (_) {}
        });
        img.alt = "Last screenshot";
        img.loading = "lazy";
        img.decoding = "async";
        imgWrap.appendChild(img);
        card.appendChild(imgWrap);
      }

      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Unban for $" + String(payload.unbanPrice || 10.99);
      btn.className = "ban-modal-unban-btn";
      btn.addEventListener("click", function () {
        var checkoutWrap = document.getElementById("ban-modal-checkout-wrap");
        var checkoutMsg = document.getElementById("ban-modal-checkout-msg");
        var checkoutDemo = document.getElementById("ban-modal-checkout-demo");
        if (payload && payload.demoMode) {
          btn.disabled = true;
          btn.style.display = "none";
          try {
            if (checkoutWrap) checkoutWrap.style.display = "block";
            if (checkoutMsg) checkoutMsg.textContent = "Visual test mode. This is where Stripe Checkout will appear for a real banned user.";
            if (checkoutDemo) checkoutDemo.style.display = "block";
            if (note) note.textContent = "Visual test only. /showbanned does not create a real payment session.";
          } catch (_) {}
          return;
        }
        btn.disabled = true;
        btn.textContent = "Redirecting to payment...";
        window
          .fetch("/api/unban/create-checkout", { method: "POST" })
          .then(function (r) {
            return r.json().then(function (j) {
              if (!r.ok) throw new Error((j && j.error) || "checkout_failed");
              return j;
            });
          })
          .then(function (j) {
            if (j && j.url) {
              window.location.href = String(j.url);
              return;
            }
            throw new Error("missing_checkout_payload");
          })
          .catch(function () {
            btn.disabled = false;
            btn.textContent = "Unban for $" + String(payload.unbanPrice || 10.99);
            if (note) note.textContent = "This screen cannot be closed. Complete payment to regain access.";
          });
      });
      card.appendChild(btn);

      var note = document.createElement("div");
      note.className = "ban-modal-note";
      note.textContent = "This screen cannot be closed. Complete payment to regain access.";
      card.appendChild(note);

      var checkoutWrap = document.createElement("div");
      checkoutWrap.id = "ban-modal-checkout-wrap";
      checkoutWrap.style.display = "none";
      checkoutWrap.style.marginTop = "12px";
      var checkoutMsg = document.createElement("div");
      checkoutMsg.id = "ban-modal-checkout-msg";
      checkoutMsg.style.marginBottom = "10px";
      checkoutMsg.style.fontSize = "12px";
      checkoutMsg.style.lineHeight = "1.35";
      checkoutMsg.style.color = "rgba(15,23,42,0.72)";
      checkoutMsg.textContent = "Preparing secure checkout…";
      var checkoutHost = document.createElement("div");
      checkoutHost.id = "ban-modal-checkout-host";
      checkoutHost.style.border = "1px solid rgba(15,23,42,0.08)";
      checkoutHost.style.borderRadius = "18px";
      checkoutHost.style.overflow = "hidden";
      checkoutHost.style.background = "#fff";
      checkoutHost.style.minHeight = "420px";
      var checkoutDemo = document.createElement("div");
      checkoutDemo.id = "ban-modal-checkout-demo";
      checkoutDemo.style.display = "none";
      checkoutDemo.style.padding = "18px";
      checkoutDemo.style.background = "linear-gradient(180deg,#ffffff,#f8fafc)";
      checkoutDemo.style.minHeight = "420px";
      checkoutDemo.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid rgba(15,23,42,0.08);border-radius:14px;background:#fff;">' +
          '<div>' +
            '<div style="font-size:13px;font-weight:900;color:#0f172a;">Stripe Checkout</div>' +
            '<div style="margin-top:4px;font-size:12px;color:rgba(15,23,42,0.68);">Embedded payment form preview</div>' +
          '</div>' +
          '<div style="font-size:12px;font-weight:900;color:#2563eb;">$' + String(payload.unbanPrice || 10.99) + '</div>' +
        '</div>' +
        '<div style="margin-top:14px;padding:14px;border:1px solid rgba(15,23,42,0.08);border-radius:14px;background:#fff;">' +
          '<div style="font-size:11px;font-weight:900;color:rgba(15,23,42,0.56);text-transform:uppercase;letter-spacing:.08em;">Card information</div>' +
          '<div style="margin-top:10px;height:42px;border:1px solid rgba(15,23,42,0.12);border-radius:12px;background:#f8fafc;"></div>' +
          '<div style="display:flex;gap:10px;margin-top:10px;">' +
            '<div style="flex:1;height:42px;border:1px solid rgba(15,23,42,0.12);border-radius:12px;background:#f8fafc;"></div>' +
            '<div style="width:120px;height:42px;border:1px solid rgba(15,23,42,0.12);border-radius:12px;background:#f8fafc;"></div>' +
          '</div>' +
          '<div style="margin-top:16px;height:46px;border-radius:14px;background:linear-gradient(180deg,#635bff,#4f46e5);"></div>' +
        '</div>';
      checkoutWrap.appendChild(checkoutMsg);
      checkoutWrap.appendChild(checkoutHost);
      checkoutWrap.appendChild(checkoutDemo);
      card.appendChild(checkoutWrap);

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      overlay.addEventListener("click", function (e) {
        try {
          // Only block clicks on the backdrop. Allow clicks inside the card (links/buttons).
          if (e && e.target === overlay) {
            e.preventDefault();
            e.stopPropagation();
          }
        } catch (_) {}
      });
    } catch (_) {}
  }

  function findPartner() {
    if (!wsClient || banModalActive) return;
    preflightBanCheck(true).then(function (blocked) {
      if (blocked || !wsClient || banModalActive) return;
      seq += 1;
      var prefs = {};
      try {
        var raw = localStorage.getItem("ChatSphere_interests_v1");
        var v = raw ? JSON.parse(raw) : [];
        if (Array.isArray(v) && v.length) prefs.interests = v;
      } catch (_) {}
      try {
        var cc = getSavedCountryPref();
        if (cc) prefs.country = cc;
      } catch (_) {}
      wsClient.send({ type: "find_partner", seq: seq, bucket: "global", chatType: "text", prefs: prefs });
      sendTextAnalyticsEvent("text_search_started", { search_kind: "start" });
      var ints = getSavedInterests();
      var c2 = getSavedCountryPref();
      if (c2 && ints.length) showStatusLine("Searching " + c2 + " + interests " + formatInterestSummary(ints));
      else if (c2) showStatusLine("Searching " + c2);
      else if (ints.length) showStatusLine("Searching interests " + formatInterestSummary(ints));
      else showStatusLine("Looking for people online");
      try { renderInterestBar(); } catch (_) {}
      try { renderCountryBar(); } catch (_) {}
      updateReportAvailability(false);
      setSkipLabel("Cancel");
      isSearching = true;
      startSearchWatchdog();
    });
  }

  function cancelOrNext() {
    seq += 1;
    if (matchId) {
      clearTypingStopTimer();
      sendTypingState(false);
      setPartnerTypingVisible(false);
      cancelPendingAutoMessage();
      var prefs = {};
      try {
        var raw = localStorage.getItem("ChatSphere_interests_v1");
        var v = raw ? JSON.parse(raw) : [];
        if (Array.isArray(v) && v.length) prefs.interests = v;
      } catch (_) {}
      try {
        var cc = getSavedCountryPref();
        if (cc) prefs.country = cc;
      } catch (_) {}
      wsClient.send({ type: "next", seq: seq, bucket: "global", chatType: "text", prefs: prefs });
      sendTextAnalyticsEvent("text_next_requested", { previous_match: 1 });
      var ints = getSavedInterests();
      var c2 = getSavedCountryPref();
      if (c2 && ints.length) showStatusLine("Searching " + c2 + " + interests " + formatInterestSummary(ints));
      else if (c2) showStatusLine("Searching " + c2);
      else if (ints.length) showStatusLine("Searching interests " + formatInterestSummary(ints));
      else showStatusLine("Looking for people online");
      try { renderInterestBar(); } catch (_) {}
      try { renderCountryBar(); } catch (_) {}
      matchId = null;
      partnerUserId = null;
      lastAutoMsgSentMatchId = null;
      try { freezeSessionTimer(); } catch (_) {}
      updateReportAvailability(false);
      setSkipLabel("Cancel");
      isSearching = true;
      startSearchWatchdog();
      return;
    }
    wsClient.send({ type: "cancel", seq: seq, chatType: "text" });
    addSystemMessage("Cancelled.");
    clearTypingStopTimer();
    localIsTyping = false;
    setPartnerTypingVisible(false);
    setSkipLabel("Start");
    hideStatusLine();
    isSearching = false;
    stopSearchWatchdog();
    updateReportAvailability(false);
  }

  function stopNow() {
    if (!wsClient) return;
    if (!isSearching && !matchId) return;
    seq += 1;
    // "cancel" ends an active match WITHOUT re-queueing (unlike "next").
    wsClient.send({ type: "cancel", seq: seq, chatType: "text" });
    if (matchId) addSystemMessage("Disconnected.");
    else addSystemMessage("Cancelled.");
    clearTypingStopTimer();
    localIsTyping = false;
    sendTypingState(false);
    setPartnerTypingVisible(false);
    hideStatusLine();
    setSkipLabel("Start");
    matchId = null;
    partnerUserId = null;
    cancelPendingAutoMessage();
    lastAutoMsgSentMatchId = null;
    try { freezeSessionTimer(); } catch (_) {}
    isSearching = false;
    stopSearchWatchdog();
    updateReportAvailability(false);
  }

  function sendChat() {
    if (strikeModalActive) {
      // Re-open modal if user tries to send without acknowledging.
      showStrikeModal(
        lastStrikeTriggerText,
        lastStrikeGuidelinesUrl,
        strikeModalRemaining || 10,
        lastStrikeCount,
        lastStrikeMax,
        lastStrikeBanText,
        lastStrikeRuleKey
      );
      return;
    }
    var input = $("message-input");
    if (!input) return;
    var text = (input.value || "").trim();
    if (!text) return;
    if (text === "/showbanned") {
      showBanModal({
        reason: "Violation of community guidelines.",
        bannedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        lastScreenshot: null,
        unbanPrice: 10.99,
        demoMode: true
      });
      input.value = "";
      return;
    }
    if (text === "/clear") {
      clearMessageArea();
      input.value = "";
      return;
    }
    if (text === "/stop") {
      // Anyone can hard-stop: cancel searching OR disconnect current session (without reconnecting).
      if (isSearching || matchId) stopNow();
      else addSystemMessage("Nothing to stop.");
      input.value = "";
      return;
    }
    if (text.indexOf("/ban") === 0) {
      // Admin-only on the server (by IP). Client just forwards.
      var parts = text.split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        addSystemMessage("Usage: /ban <ip> [minutes]");
        input.value = "";
        return;
      }
      var ip = parts[1];
      var mins = parts.length >= 3 ? parts[2] : "";
      var cmd = "/cmd ban " + ip + (mins ? " " + mins : "");
      wsClient.send({ type: "cmd", text: cmd });
      input.value = "";
      return;
    }
    // Allow admin /cmd even when not connected.
    if (text.indexOf("/cmd ") === 0 || text === "/cmd") {
      wsClient.send({ type: "cmd", text: text });
      input.value = "";
      return;
    }
    if (!matchId) {
      showEphemeralToast("You are not connected yet.");
      return;
    }
    clearTypingStopTimer();
    sendTypingState(false);
    wsClient.send({ type: "chat_message", matchId: matchId, text: text });
    input.value = "";
  }

  function wireUi() {
    var skipBtn = $("skip-btn");
    var sendBtn = $("send-btn");
    var input = $("message-input");
    var reportBtn = $("report-link");
    var premiumBtn = $("premiumUiBtn");
    var safetyNoticeLink = $("safety-notice-link");
    var headerMenuBtn = $("headerMenuBtn");
    var headerMenuPanel = $("headerMenuPanel");
    var safetyNoticeModal = $("safetyNoticeModal");
    var safetyNoticeClose = $("safetyNoticeClose");
    var reportModal = $("reportModal");
    var reportModalClose = $("reportModalClose");
    var reportForm = $("reportForm");
    var cancelReport = $("cancelReport");
    var uploadBtn = $("upload-btn");
    var fileUpload = $("file-upload");
    var uploadProgress = $("upload-progress");
    var uploadToast = $("upload-toast");
    var newStrangerBtn = $("newStrangerBtn");
    var submitFeedbackLink = $("submitFeedbackLink");
    wireAutoNextCheckbox();
    wireAutoMessageControls();
    updateReportAvailability(false);
    // Warm premium cache early so upload click can open file picker synchronously on mobile.
    try { fetchPremiumStatus(false).catch(function () {}); } catch (_) {}

    // Header overflow menu (⋯)
    (function wireHeaderMenu() {
      if (!headerMenuBtn || !headerMenuPanel) return;
      // Portal menu panel to <body> while open so it positions correctly on desktop and mobile.
      var panelHome = { parent: headerMenuPanel.parentNode, next: headerMenuPanel.nextSibling };
      function closeMenu() {
        try { headerMenuPanel.classList.remove("isOpen"); } catch (_) {}
        try { headerMenuBtn.setAttribute("aria-expanded", "false"); } catch (_) {}
        try {
          if (panelHome.parent && headerMenuPanel.parentNode !== panelHome.parent) {
            panelHome.parent.insertBefore(headerMenuPanel, panelHome.next || null);
          }
        } catch (_) {}
        try {
          headerMenuPanel.style.top = "";
          headerMenuPanel.style.right = "";
          headerMenuPanel.style.left = "";
          headerMenuPanel.style.position = "";
          headerMenuPanel.style.maxWidth = "";
        } catch (_) {}
      }
      function openMenu() {
        try {
          if (headerMenuPanel.parentNode !== document.body) {
            panelHome.parent = headerMenuPanel.parentNode;
            panelHome.next = headerMenuPanel.nextSibling;
            document.body.appendChild(headerMenuPanel);
          }
        } catch (_) {}
        try { headerMenuPanel.classList.add("isOpen"); } catch (_) {}
        try { headerMenuBtn.setAttribute("aria-expanded", "true"); } catch (_) {}
        // Positioning: always anchor under the hamburger button (desktop + mobile).
        try {
          var r = headerMenuBtn.getBoundingClientRect();
          headerMenuPanel.style.position = "fixed";
          headerMenuPanel.style.top = String(Math.round(r.bottom + 8)) + "px";
          headerMenuPanel.style.right = String(Math.max(12, Math.round(window.innerWidth - r.right))) + "px";
          headerMenuPanel.style.left = "";
          headerMenuPanel.style.maxWidth = "calc(100vw - 24px)";
        } catch (_) {}
      }
      function toggleMenu() {
        var open = false;
        try { open = headerMenuPanel.classList.contains("isOpen"); } catch (_) {}
        if (open) closeMenu(); else openMenu();
      }
      headerMenuBtn.addEventListener("click", function (ev) {
        try { ev.preventDefault(); ev.stopPropagation(); } catch (_) {}
        toggleMenu();
      });
      document.addEventListener("click", function (ev) {
        try {
          if (!headerMenuPanel || !headerMenuBtn) return;
          if (headerMenuPanel.contains(ev.target) || headerMenuBtn.contains(ev.target)) return;
        } catch (_) {}
        closeMenu();
      });
      window.addEventListener("resize", function () {
        try {
          if (!headerMenuPanel.classList.contains("isOpen")) return;
          var r2 = headerMenuBtn.getBoundingClientRect();
          headerMenuPanel.style.position = "fixed";
          headerMenuPanel.style.top = String(Math.round(r2.bottom + 8)) + "px";
          headerMenuPanel.style.right = String(Math.max(12, Math.round(window.innerWidth - r2.right))) + "px";
          headerMenuPanel.style.left = "";
          headerMenuPanel.style.maxWidth = "calc(100vw - 24px)";
        } catch (_) {}
      });
      document.addEventListener("keydown", function (ev) {
        if (!ev) return;
        if (ev.key === "Escape") closeMenu();
      });
      // Close menu after selecting an item
      headerMenuPanel.addEventListener("click", function () { closeMenu(); });
    })();

    if (skipBtn) {
      skipBtn.addEventListener("click", function () {
        try { setPostDisconnectActionsVisible(false); } catch (_) {}
        if (!matchId) {
          if (skipBtn.childNodes[0] && (skipBtn.childNodes[0].nodeValue || "").trim() === "Cancel") {
            cancelOrNext();
          } else {
            findPartner();
          }
        } else {
          cancelOrNext();
        }
      });
    }

    if (newStrangerBtn) {
      newStrangerBtn.addEventListener("click", function (ev) {
        try { ev.preventDefault(); } catch (_) {}
        try { setPostDisconnectActionsVisible(false); } catch (_) {}
        try {
          var sb = $("skip-btn");
          if (sb && typeof sb.click === "function") sb.click();
        } catch (_) {}
      });
    }
    if (submitFeedbackLink) {
      submitFeedbackLink.addEventListener("click", function (ev) {
        try { ev.preventDefault(); } catch (_) {}
        openFeedback();
      });
    }
    if (premiumBtn) {
      premiumBtn.addEventListener("click", function (ev) {
        try { ev.preventDefault(); } catch (_) {}
        var cached = null;
        var hasCachedStatus = false;
        try {
          if (premiumCache && Date.now() - premiumCacheAt < 15000) {
            cached = premiumCache;
            hasCachedStatus = typeof premiumCache.premiumActive === "boolean";
          }
        } catch (_) {}
        try { showPremiumModal("premium", hasCachedStatus ? cached : null); } catch (_) {}
        if (!hasCachedStatus) return;
        fetchPremiumStatus(true)
          .then(function (p) {
            if (!premiumModalOpen) return;
            try { showPremiumModal("premium", p || {}); } catch (_) {}
          })
          .catch(function () {});
      });
    }

    function openSafetyNoticeModal() {
      if (!safetyNoticeModal) return;
      safetyNoticeModal.style.display = "block";
      safetyNoticeModal.setAttribute("aria-hidden", "false");
    }
    function closeSafetyNoticeModal() {
      if (!safetyNoticeModal) return;
      safetyNoticeModal.style.display = "none";
      safetyNoticeModal.setAttribute("aria-hidden", "true");
    }
    if (safetyNoticeLink) {
      safetyNoticeLink.addEventListener("click", function (ev) {
        try { if (ev && ev.preventDefault) ev.preventDefault(); } catch (_) {}
        openSafetyNoticeModal();
      });
    }
    if (safetyNoticeClose) safetyNoticeClose.addEventListener("click", closeSafetyNoticeModal);
    if (safetyNoticeModal) {
      safetyNoticeModal.addEventListener("click", function (ev) {
        if (ev && ev.target === safetyNoticeModal) closeSafetyNoticeModal();
      });
    }

    if (sendBtn) sendBtn.addEventListener("click", sendChat);
    if (input) {
      input.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") sendChat();
      });
      input.addEventListener("input", function () {
        noteUserTyped((input.value || "").trim());
      });
      input.addEventListener("blur", function () {
        clearTypingStopTimer();
        sendTypingState(false);
      });
    }

    if (uploadBtn && fileUpload) {
      uploadBtn.addEventListener("click", function () {
        // Mobile browsers require file picker to open synchronously from a user gesture.
        try {
          if (premiumCache && premiumCache.premiumActive) {
            fileUpload.click();
            return;
          }
        } catch (_) {}
        // If not cached yet, fetch in background and tell user what to do next.
        fetchPremiumStatus(true)
          .then(function (p) {
            if (p && p.premiumActive) {
              showEphemeralToast("Premium verified — tap upload again.");
              return;
            }
            try { showPremiumModal("upload", p); } catch (_) {}
          })
          .catch(function () {
            try { showPremiumModal("upload", null); } catch (_) {}
          });
      });
      fileUpload.addEventListener("change", function () {
        var file = fileUpload.files && fileUpload.files[0];
        if (!file) return;
        fetchPremiumStatus(true)
          .then(function (p) {
            if (!(p && p.premiumActive)) {
              try { showPremiumModal("upload", p); } catch (_) {}
              fileUpload.value = "";
              return;
            }

            if (file.size > MAX_UPLOAD_BYTES) {
              addSystemMessage("File is too large (max 50MB).", true);
              fileUpload.value = "";
              return;
            }
            if (!(file.type || "").startsWith("image/") && !(file.type || "").startsWith("video/")) {
              addSystemMessage("Only image/video files are allowed.", true);
              fileUpload.value = "";
              return;
            }
            if (!matchId) {
              showEphemeralToast("You are not connected yet.");
              fileUpload.value = "";
              return;
            }

            if (uploadProgress) {
              uploadProgress.style.display = "block";
              uploadProgress.innerHTML =
                '<div class="upload-progress-text">Uploading file...</div><div class="progress-text">0%</div><div class="spinner"></div>';
            }

            uploadFile(file, function (pct) {
              if (!uploadProgress) return;
              var pt = uploadProgress.querySelector(".progress-text");
              if (pt) pt.textContent = String(Math.round(pct)) + "%";
            })
              .then(function (url) {
                if (uploadProgress) uploadProgress.style.display = "none";
                clearTypingStopTimer();
                sendTypingState(false);
                // Send with filename so receiver can show it.
                wsClient.send({ type: "chat_message", matchId: matchId, text: "__file__:" + url + "|" + (file.name || "") });
              })
              .catch(function (err) {
                if (uploadProgress) uploadProgress.style.display = "none";
                if (uploadToast) {
                  var msgEl = uploadToast.querySelector ? uploadToast.querySelector(".toast-message") : null;
                  if (msgEl) msgEl.textContent = err && err.message ? err.message : "Upload failed";
                  else uploadToast.textContent = err && err.message ? err.message : "Upload failed";
                  uploadToast.style.display = "block";
                  window.setTimeout(function () {
                    uploadToast.style.display = "none";
                  }, 3000);
                } else {
                  addSystemMessage(err && err.message ? err.message : "Upload failed", true);
                }
              })
              .finally(function () {
                fileUpload.value = "";
              });
          })
          .catch(function () {
            // If we couldn't confirm premium, be safe and block.
            try { showPremiumModal("upload", null); } catch (_) {}
            fileUpload.value = "";
          });
      });
    }

    function openReportModal() {
      if (!reportModal) return;
      try { refreshReportModalCopy(); } catch (_) {}
      reportModal.style.display = "block";
      reportModal.setAttribute("aria-hidden", "false");
    }
    function closeReportModal() {
      if (!reportModal) return;
      reportModal.style.display = "none";
      reportModal.setAttribute("aria-hidden", "true");
    }

    if (reportBtn) {
      reportBtn.addEventListener("click", function (ev) {
        try { if (ev && ev.preventDefault) ev.preventDefault(); } catch (_) {}
        if (!reportAvailable && !reportGraceMatchId) {
          showEphemeralToast("No recent stranger is available to report.");
          return;
        }
        if (!getReportTargetMatchId()) {
          showEphemeralToast("No recent stranger is available to report.");
          return;
        }
        openReportModal();
      });
    }
    if (reportModalClose) reportModalClose.addEventListener("click", closeReportModal);
    if (cancelReport) cancelReport.addEventListener("click", closeReportModal);
    if (reportModal) {
      reportModal.addEventListener("click", function (e) {
        if (e && e.target === reportModal) closeReportModal();
      });
    }
    if (reportForm) {
      reportForm.addEventListener("submit", function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (!wsClient) return;
        var reportMatchId = getReportTargetMatchId();
        if (!reportMatchId) {
          closeReportModal();
          showEphemeralToast("This stranger is no longer reportable.");
          return;
        }
        var typeEl = $("reportType");
        var reasonEl = $("reportReason");
        var reportType = typeEl && typeEl.value ? String(typeEl.value) : "other";
        var reason = reasonEl && reasonEl.value ? String(reasonEl.value) : "";
        wsClient.send({ type: "report", matchId: reportMatchId, reportType: reportType, reason: reason });
        closeReportModal();
        // Server sends a {type:"system"} ack; avoid double messages.
      });
    }

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") {
        if (safetyNoticeModal && safetyNoticeModal.style.display === "block") {
          closeSafetyNoticeModal();
          return;
        }
        // Close report modal with ESC
        if (reportModal && reportModal.style.display === "block") {
          closeReportModal();
          return;
        }
        // ESC hotkey: Start when idle, Cancel when searching, Skip when in chat.
        if (matchId || isSearching) {
          cancelOrNext();
          return;
        }
        findPartner();
      }
    });
  }

  function start() {
    setSkipLabel("Start");
    wireUi();
    try { updateMessagesBottomInset(); } catch (_) {}
    try {
      window.addEventListener("resize", function () {
        try { updateMessagesBottomInset(); } catch (_) {}
      });
    } catch (_) {}
    try { syncAutoNextCheckbox(); } catch (_) {}
    try { installAutoNextActivityGuards(); } catch (_) {}
    hideStatusLine();
    function connectSocket() {
      wsClient = window.ChatSphereCommon.createSocket({
      onStatus: function (s) {
        // If banned modal is active, suppress reconnect spam/auto-actions.
        if (banModalActive || vpnBlockedActive || connectionErrorActive) {
          if (s && s.state === "closed") {
            try {
              hideStatusLine();
            } catch (_) {}
          }
          return;
        }
        // (no "Connected." text)
        if (s.state === "open") {
          // Text chat can auto-search immediately.
          if (autoSearchPending && !matchId && !isSearching) {
            autoSearchPending = false;
            findPartner();
          }
        }
        if (s.state === "closed") {
          updateReportAvailability(false);
          var willReconnect = true;
          try {
            if (s && typeof s.willReconnect === "boolean") willReconnect = s.willReconnect;
          } catch (_) {}
          var reason = "";
          try { reason = s && s.reason ? String(s.reason || "") : ""; } catch (_) {}
          if (!willReconnect && reason === "vpn_blocked") {
            vpnBlockedActive = true;
            banModalActive = true;
            try { showTerminalSystemState("VPN / proxy connections are not allowed."); } catch (_) {}
            hideStatusLine();
            isSearching = false;
            try { setSkipLabel("Start"); } catch (_) {}
            return;
          }
          if (!willReconnect && reason === "connection_error") {
            connectionErrorActive = true;
            banModalActive = true;
            try { showTerminalSystemState("Connection error."); } catch (_) {}
            hideStatusLine();
            isSearching = false;
            try { setSkipLabel("Start"); } catch (_) {}
            return;
          }
          addSystemMessage(willReconnect ? "Disconnected. Reconnecting..." : "Disconnected.");
          hideStatusLine();
        }
      },
      onMessage: handleWsMessage
      });
    }
    preflightBanCheck(true)
      .then(function (blocked) {
        if (blocked) return;
        connectSocket();
      })
      .catch(function () {
        connectSocket();
      });
  }

  function bootOnce() {
    if (window.__ChatSphere_started) return;
    window.__ChatSphere_started = true;
    start();
    try { renderInterestBar(); } catch (_) {}
    try { renderCountryBar(); } catch (_) {}
  }

  // Auto-start (captcha removed). Keep window.main for backward compatibility.
  window.main = bootOnce;
  document.addEventListener("DOMContentLoaded", bootOnce);
})();
