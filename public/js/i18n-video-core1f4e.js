(function () {
  "use strict";

  var STORAGE_KEY = "ChatSphere_lang_v1";
  var VERSION = "20260824-video-review2";
  var SITE_ORIGIN = "https://ChatSphere.com";
  var SUPPORTED = ["en", "es", "fr", "de", "pt", "it", "nl", "tr", "id", "hi", "ar", "ja", "ko", "zh", "ru"];
  var LANGUAGE_LABELS = {
    auto: { code: "Auto", flag: "🌐", name: "Browser default" },
    en: { code: "EN", flag: "🇺🇸", flagSrc: "https://flagcdn.com/w40/us.png", name: "English" },
    es: { code: "ES", flag: "🇪🇸", flagSrc: "https://flagcdn.com/w40/es.png", name: "Español" },
    fr: { code: "FR", flag: "🇫🇷", flagSrc: "https://flagcdn.com/w40/fr.png", name: "Français" },
    de: { code: "DE", flag: "🇩🇪", flagSrc: "https://flagcdn.com/w40/de.png", name: "Deutsch" },
    pt: { code: "PT", flag: "🇧🇷", flagSrc: "https://flagcdn.com/w40/br.png", name: "Português" },
    it: { code: "IT", flag: "🇮🇹", flagSrc: "https://flagcdn.com/w40/it.png", name: "Italiano" },
    nl: { code: "NL", flag: "🇳🇱", flagSrc: "https://flagcdn.com/w40/nl.png", name: "Nederlands" },
    tr: { code: "TR", flag: "🇹🇷", flagSrc: "https://flagcdn.com/w40/tr.png", name: "Türkçe" },
    id: { code: "ID", flag: "🇮🇩", flagSrc: "https://flagcdn.com/w40/id.png", name: "Bahasa Indonesia" },
    hi: { code: "HI", flag: "🇮🇳", flagSrc: "https://flagcdn.com/w40/in.png", name: "हिन्दी" },
    ar: { code: "AR", flag: "🇸🇦", flagSrc: "https://flagcdn.com/w40/sa.png", name: "العربية" },
    ja: { code: "JA", flag: "🇯🇵", flagSrc: "https://flagcdn.com/w40/jp.png", name: "日本語" },
    ko: { code: "KO", flag: "🇰🇷", flagSrc: "https://flagcdn.com/w40/kr.png", name: "한국어" },
    zh: { code: "ZH", flag: "🇨🇳", flagSrc: "https://flagcdn.com/w40/cn.png", name: "中文" },
    ru: { code: "RU", flag: "🇷🇺", flagSrc: "https://flagcdn.com/w40/ru.png", name: "Русский" }
  };
  var ATTRS = ["placeholder", "aria-label", "title"];
  var SKIP_SELECTOR = [
    "script",
    "style",
    "noscript",
    "template",
    "code",
    "pre",
    "textarea",
    "svg",
    "canvas",
    "video",
    "audio",
    "#messages",
    ".message-text",
    ".message-author",
    ".mono",
    ".notranslate",
    "[data-no-i18n]",
    "[contenteditable='true']"
  ].join(",");

  var DICT = window.__ChatSphere_I18N_DICTIONARIES__ || (window.__ChatSphere_I18N_DICTIONARIES__ = {});

  function normalize(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function baseLang(value) {
    var raw = String(value || "").toLowerCase().replace("_", "-");
    if (!raw) return "";
    if (raw.indexOf("zh") === 0) return "zh";
    return raw.split("-")[0];
  }

  function isSupported(lang) {
    return SUPPORTED.indexOf(lang) !== -1;
  }

  function langFromPath() {
    var parts;
    try {
      parts = String(window.location.pathname || "/").split("/").filter(Boolean);
    } catch (_) {
      parts = [];
    }
    if (!parts.length) return "";
    var first = baseLang(parts[0]);
    if (first && isSupported(first)) return first;
    var second = baseLang(parts[1] || "");
    if (second && isSupported(second) && /^(video|chat|blog|text)$/i.test(parts[0] || "")) return second;
    return "";
  }

  function canonicalBasePath() {
    var path = "/";
    try { path = String(window.location.pathname || "/"); } catch (_) { path = "/"; }
    var parts = path.split("/").filter(Boolean);
    if (parts.length && isSupported(baseLang(parts[0]))) {
      parts.shift();
      path = "/" + parts.join("/");
      if (!parts.length) path = "/";
    } else if (parts.length > 1 && isSupported(baseLang(parts[1])) && /^(video|chat|blog|text)$/i.test(parts[0] || "")) {
      parts.splice(1, 1);
      path = "/" + parts.join("/");
    }
    path = path.replace(/\/index\.html$/i, "/");
    path = path.replace(/\/video\.html$/i, "/video");
    path = path.replace(/\/chat\.html$/i, "/chat");
    if (path === "/blog") path = "/blog/";
    if (!path) path = "/";
    return path;
  }

  function supportsSeoLanguageAlternates(path) {
    return path === "/" || path === "/video" || path === "/chat" || path === "/blog/";
  }

  function localizedSeoPath(targetLang, basePath) {
    var path = basePath || canonicalBasePath();
    if (targetLang === "en") return path;
    return "/" + targetLang + (path === "/" ? "/" : path);
  }

  function absoluteUrlForPath(path) {
    return SITE_ORIGIN + (path || "/");
  }

  function detectLang() {
    var forced = "";
    forced = langFromPath();
    if (forced && isSupported(forced)) {
      try { localStorage.setItem(STORAGE_KEY, forced); } catch (_) {}
      return forced;
    }
    try {
      var params = new URLSearchParams(window.location.search || "");
      forced = baseLang(params.get("lang") || "");
      if (forced === "auto") {
        localStorage.removeItem(STORAGE_KEY);
        forced = "";
      } else if (forced && isSupported(forced)) {
        localStorage.setItem(STORAGE_KEY, forced);
        return forced;
      }
    } catch (_) {}
    try {
      forced = baseLang(localStorage.getItem(STORAGE_KEY) || "");
      if (forced && isSupported(forced)) return forced;
    } catch (_) {}
    var langs = [];
    try { langs = Array.prototype.slice.call(navigator.languages || []); } catch (_) { langs = []; }
    try { if (navigator.language) langs.push(navigator.language); } catch (_) {}
    for (var i = 0; i < langs.length; i += 1) {
      var lang = baseLang(langs[i]);
      if (lang && isSupported(lang)) return lang;
    }
    return "en";
  }

  function storedLang() {
    try {
      var saved = baseLang(localStorage.getItem(STORAGE_KEY) || "");
      return saved && isSupported(saved) ? saved : "";
    } catch (_) {
      return "";
    }
  }

  function selectorValue() {
    return storedLang() || "auto";
  }

  var lang = detectLang();
  var dict = DICT[lang] || {};
  var originalTextNodes = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  var originalAttrs = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  var originalMetaContent = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  var originalTitle = "";
  var isApplyingLanguage = false;
  var documentObserver = null;
  var hasAppliedNonEnglish = false;
  var languageApplyGeneration = 0;

  function clearLangQueryParam() {
    try {
      var url = new URL(window.location.href);
      if (!url.searchParams.has("lang")) return;
      url.searchParams.delete("lang");
      window.history.replaceState(window.history.state, document.title, url.toString());
    } catch (_) {}
  }


  var localeLoads = {};
  function loadLanguageDictionary(value) {
    var requested = baseLang(value || "");
    if (!requested || requested === "en" || DICT[requested]) return Promise.resolve();
    if (localeLoads[requested]) return localeLoads[requested];
    localeLoads[requested] = new Promise(function (resolve) {
      var script = document.createElement("script");
      script.async = true;
      script.src = "/js/i18n-locales/" + encodeURIComponent(requested) + ".js?v=" + encodeURIComponent(VERSION);
      script.onload = function () { resolve(); };
      script.onerror = function () { resolve(); };
      document.head.appendChild(script);
    });
    return localeLoads[requested];
  }

  function activateLanguage(value) {
    var requested = baseLang(value || "") || "en";
    lang = requested;
    dict = DICT[requested] || {};
    applyDocumentLanguage();
    syncPublicApi();
    loadLanguageDictionary(requested).then(function () {
      if (lang !== requested) return;
      dict = DICT[requested] || {};
      scheduleDocumentLanguageApply();
    });
  }

  function setLanguage(value) {
    var next = baseLang(value || "");
    if (next === "auto") {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      clearLangQueryParam();
      activateLanguage(detectLang());
      return true;
    }
    if (!isSupported(next)) return false;
    try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
    clearLangQueryParam();
    activateLanguage(next);
    return true;
  }

  function scheduleDocumentLanguageApply() {
    var generation = ++languageApplyGeneration;
    applyDocumentLanguage();
    syncPublicApi();
    (window.requestAnimationFrame || window.setTimeout)(function () {
      window.setTimeout(function () {
        if (generation !== languageApplyGeneration) return;
        applyLanguageNow(document);
      }, 0);
    }, 16);
  }

  function setFlagNode(flag, meta) {
    if (!flag || !meta) return;
    if (meta.flagSrc) {
      flag.textContent = "";
      flag.classList.add("is-image");
      flag.style.backgroundImage = "url('" + meta.flagSrc + "')";
    } else {
      flag.classList.remove("is-image");
      flag.style.backgroundImage = "";
      flag.textContent = meta.flag || "🌐";
    }
  }

  function activeLanguageMeta() {
    var current = selectorValue();
    var active = current === "auto" ? lang : current;
    return {
      current: current,
      active: active,
      meta: LANGUAGE_LABELS[active] || LANGUAGE_LABELS.auto,
      controlMeta: LANGUAGE_LABELS[current] || LANGUAGE_LABELS[active] || LANGUAGE_LABELS.auto
    };
  }

  function languageChoices() {
    return ["auto"].concat(SUPPORTED);
  }

  function updateLanguageSelect(select) {
    if (!select) return;
    var current = selectorValue();
    try { select.value = current; } catch (_) {}
    var shell = select.closest ? select.closest(".ChatSphere-i18n-header") : null;
    if (shell) {
      var state = activeLanguageMeta();
      var meta = state.meta;
      var flag = shell.querySelector(".ChatSphere-i18n-flag");
      var code = shell.querySelector(".ChatSphere-i18n-code");
      setFlagNode(flag, meta);
      if (code) code.textContent = (state.controlMeta || meta || LANGUAGE_LABELS.auto).code || "Auto";
      try { shell.setAttribute("aria-label", "Language: " + (meta.name || state.active)); } catch (_) {}
    }
  }

  function updateHeaderLanguageControl(shell) {
    if (!shell) return;
    var state = activeLanguageMeta();
    var flag = shell.querySelector(".ChatSphere-i18n-flag");
    var code = shell.querySelector(".ChatSphere-i18n-code");
    var label = shell.querySelector(".ChatSphere-i18n-label");
    var menuTitle = shell.querySelector(".ChatSphere-i18n-menu-title");
    var toggle = shell.querySelector(".ChatSphere-i18n-toggle");
    setFlagNode(flag, state.meta);
    if (label) label.textContent = t("Language");
    if (menuTitle) menuTitle.textContent = t("Language");
    if (code) code.textContent = (state.controlMeta || state.meta || LANGUAGE_LABELS.auto).code || "Auto";
    if (toggle) {
      toggle.setAttribute("aria-label", "Language: " + (state.meta.name || state.active));
      toggle.title = state.meta.name || state.active;
    }
    Array.prototype.forEach.call(shell.querySelectorAll("[data-i18n-lang-option]"), function (option) {
      var value = option.getAttribute("data-i18n-lang-option") || "auto";
      var checked = value === state.current;
      option.setAttribute("aria-checked", checked ? "true" : "false");
      option.classList.toggle("is-active", checked);
    });
  }

  function buildHeaderLanguageMenu(shell) {
    var menu = shell && shell.querySelector ? shell.querySelector(".ChatSphere-i18n-menu") : null;
    if (!menu || menu.getAttribute("data-i18n-menu-built") === "1") return;
    menu.setAttribute("data-i18n-menu-built", "1");
    var head = document.createElement("div");
    head.className = "ChatSphere-i18n-menu-head";
    head.setAttribute("role", "presentation");
    head.setAttribute("aria-hidden", "true");
    head.innerHTML =
      '<span class="ChatSphere-i18n-menu-spacer"></span>' +
      '<span class="ChatSphere-i18n-menu-title">Language</span>';
    menu.appendChild(head);
    languageChoices().forEach(function (value) {
      var meta = LANGUAGE_LABELS[value] || LANGUAGE_LABELS.auto;
      var option = document.createElement("button");
      option.type = "button";
      option.className = "ChatSphere-i18n-option";
      option.setAttribute("role", "menuitemradio");
      option.setAttribute("data-i18n-lang-option", value);
      option.innerHTML =
        '<span class="ChatSphere-i18n-option-flag" aria-hidden="true"></span>' +
        '<span class="ChatSphere-i18n-option-text"><span class="ChatSphere-i18n-option-code"></span><span class="ChatSphere-i18n-option-name"></span></span>';
      setFlagNode(option.querySelector(".ChatSphere-i18n-option-flag"), meta);
      var code = option.querySelector(".ChatSphere-i18n-option-code");
      var name = option.querySelector(".ChatSphere-i18n-option-name");
      if (code) code.textContent = meta.code || value.toUpperCase();
      if (name) name.textContent = meta.name || value;
      menu.appendChild(option);
    });
  }

  function closeHeaderLanguageMenus(except) {
    try {
      Array.prototype.forEach.call(document.querySelectorAll(".ChatSphere-i18n-header.is-open"), function (shell) {
        if (except && shell === except) return;
        shell.classList.remove("is-open");
        var toggle = shell.querySelector(".ChatSphere-i18n-toggle");
        var menu = shell.querySelector(".ChatSphere-i18n-menu");
        if (toggle) toggle.setAttribute("aria-expanded", "false");
        if (menu) menu.hidden = true;
      });
    } catch (_) {}
  }

  var headerLanguageDocumentBound = false;
  function bindHeaderLanguageControls(root) {
    root = root || document;
    var shells = [];
    try {
      if (root.matches && root.matches(".ChatSphere-i18n-header")) shells.push(root);
      Array.prototype.push.apply(shells, root.querySelectorAll ? root.querySelectorAll(".ChatSphere-i18n-header") : []);
    } catch (_) {
      shells = [];
    }
    shells.forEach(function (shell) {
      buildHeaderLanguageMenu(shell);
      updateHeaderLanguageControl(shell);
      if (shell.getAttribute("data-i18n-header-bound") === "1") return;
      shell.setAttribute("data-i18n-header-bound", "1");
      var toggle = shell.querySelector(".ChatSphere-i18n-toggle");
      var menu = shell.querySelector(".ChatSphere-i18n-menu");
      if (toggle && menu) {
        toggle.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          var isOpen = shell.classList.contains("is-open");
          closeHeaderLanguageMenus(shell);
          shell.classList.toggle("is-open", !isOpen);
          menu.hidden = isOpen;
          toggle.setAttribute("aria-expanded", isOpen ? "false" : "true");
        });
      }
      if (menu) {
        menu.addEventListener("click", function (event) {
          var option = event.target && event.target.closest ? event.target.closest("[data-i18n-lang-option]") : null;
          if (!option) return;
          event.preventDefault();
          event.stopPropagation();
          closeHeaderLanguageMenus();
          setLanguage(option.getAttribute("data-i18n-lang-option") || "auto");
        });
      }
      shell.addEventListener("keydown", function (event) {
        if (event.key === "Escape") closeHeaderLanguageMenus();
      });
    });
    if (!headerLanguageDocumentBound) {
      headerLanguageDocumentBound = true;
      document.addEventListener("click", function () { closeHeaderLanguageMenus(); });
    }
  }

  function bindLanguageSelectors(root) {
    root = root || document;
    var nodes = [];
    try {
      if (root.matches && root.matches("[data-i18n-lang-select]")) nodes.push(root);
      Array.prototype.push.apply(nodes, root.querySelectorAll ? root.querySelectorAll("[data-i18n-lang-select]") : []);
    } catch (_) {
      nodes = [];
    }
    nodes.forEach(function (select) {
      updateLanguageSelect(select);
      if (select.getAttribute("data-i18n-bound") === "1") return;
      select.setAttribute("data-i18n-bound", "1");
      select.addEventListener("change", function () {
        var next = select.value || "auto";
        setLanguage(next);
      });
    });
  }

  function createHeaderLanguageControl(className) {
    var host = document.querySelector(".header-right") ||
      document.querySelector("#top-bar .header-right") ||
      document.querySelector(".duck-header") ||
      document.querySelector("#top-bar") ||
      document.querySelector("header") ||
      document.body;
    var shell = document.createElement("div");
    shell.className = "ChatSphere-i18n-header" + (className ? " " + className : "");
    shell.setAttribute("data-no-i18n", "");
    shell.innerHTML =
      '<button type="button" class="ChatSphere-i18n-toggle" aria-haspopup="menu" aria-expanded="false">' +
      '<span class="ChatSphere-i18n-flag" aria-hidden="true">🌐</span>' +
      '<span class="ChatSphere-i18n-label">Language</span>' +
      '<span class="ChatSphere-i18n-code" aria-hidden="true">Auto</span>' +
      '<span class="ChatSphere-i18n-caret" aria-hidden="true"></span>' +
      '</button>' +
      '<div class="ChatSphere-i18n-menu" role="menu" hidden></div>';
    return { host: host, shell: shell };
  }

  function injectHeaderLanguageControl() {
    var desktop = document.querySelector(".ChatSphere-i18n-desktop");
    var created = createHeaderLanguageControl("ChatSphere-i18n-desktop");
    var host = created && created.host;
    var shell = created && created.shell;
    if (host && shell && !desktop) {
      try {
        var before = host.querySelector && host.querySelector("#toggleAccordion, .menu, #headerMenuBtn");
        if (before && before.parentNode === host) host.insertBefore(shell, before);
        else host.appendChild(shell);
      } catch (_) {}
      bindHeaderLanguageControls(shell);
    }
    var accordion = document.querySelector("body.index-page #accordion");
    if (accordion && !accordion.querySelector(".ChatSphere-i18n-mobile-nav")) {
      var mobile = createHeaderLanguageControl("ChatSphere-i18n-mobile-nav");
      var mobileShell = mobile && mobile.shell;
      if (mobileShell) {
        try { accordion.insertBefore(mobileShell, accordion.firstChild); } catch (_) {}
        bindHeaderLanguageControls(mobileShell);
      }
    }
    var videoMenu = document.querySelector("body.video-page #headerMenuPanel");
    if (videoMenu && !videoMenu.querySelector(".ChatSphere-i18n-video-menu")) {
      var videoMobile = createHeaderLanguageControl("ChatSphere-i18n-video-menu");
      var videoShell = videoMobile && videoMobile.shell;
      if (videoShell) {
        try { videoMenu.insertBefore(videoShell, videoMenu.firstChild); } catch (_) {}
        bindHeaderLanguageControls(videoShell);
      }
    }
  }

  function injectHeaderLanguageStyles() {
    if (document.getElementById("ChatSphere-i18n-style")) return;
    var style = document.createElement("style");
    style.id = "ChatSphere-i18n-style";
    style.textContent =
      ".ChatSphere-i18n-header{position:relative;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;z-index:80;}" +
      ".ChatSphere-i18n-toggle{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:64px;height:34px;padding:0 8px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(15,23,42,.62);color:#fff;font:800 12px/1 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.18);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);cursor:pointer;}" +
      ".ChatSphere-i18n-flag{width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;font-size:16px;line-height:1;background-size:cover;background-position:center;background-repeat:no-repeat;box-shadow:0 0 0 1px rgba(255,255,255,.28),0 1px 4px rgba(0,0,0,.22);overflow:hidden;}" +
      ".ChatSphere-i18n-flag.is-image{background-color:rgba(255,255,255,.14);}" +
      ".ChatSphere-i18n-label{display:none;}" +
      ".ChatSphere-i18n-code{font-size:11px;letter-spacing:.02em;}" +
      ".ChatSphere-i18n-caret{width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid currentColor;opacity:.8;}" +
      ".ChatSphere-i18n-menu{position:absolute;right:0;top:calc(100% + 8px);display:grid;grid-template-columns:1fr;gap:2px;min-width:205px;max-height:min(420px,calc(100vh - 96px));padding:8px;border:1px solid rgba(15,23,42,.12);border-radius:12px;background:#fff;color:#142033;box-shadow:0 18px 44px rgba(15,23,42,.22);overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:rgba(1,127,254,.46) rgba(226,232,240,.72);}" +
      ".ChatSphere-i18n-menu-head{display:none;}" +
      ".ChatSphere-i18n-menu::-webkit-scrollbar{width:10px;height:10px;}" +
      ".ChatSphere-i18n-menu::-webkit-scrollbar-track{background:rgba(226,232,240,.72);border-radius:999px;margin:8px 0;}" +
      ".ChatSphere-i18n-menu::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#2f9bff,#017ffe);border:2px solid rgba(255,255,255,.86);border-radius:999px;box-shadow:inset 0 0 0 1px rgba(1,95,186,.22);}" +
      ".ChatSphere-i18n-menu::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#188cff,#016edc);}" +
      ".ChatSphere-i18n-menu[hidden]{display:none!important;}" +
      ".ChatSphere-i18n-option{display:flex;align-items:center;gap:10px;width:100%;min-height:36px;padding:6px 8px;border:0;border-radius:8px;background:transparent;color:inherit;text-align:left;font:700 13px/1.15 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;cursor:pointer;}" +
      ".ChatSphere-i18n-option:hover,.ChatSphere-i18n-option:focus-visible,.ChatSphere-i18n-option.is-active{background:rgba(1,127,254,.10);outline:0;}" +
      ".ChatSphere-i18n-option.is-active{color:#015fba;}" +
      ".ChatSphere-i18n-option-flag{flex:0 0 22px;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;font-size:16px;line-height:1;background-size:cover;background-position:center;background-repeat:no-repeat;box-shadow:0 0 0 1px rgba(15,23,42,.12),0 1px 4px rgba(15,23,42,.12);overflow:hidden;}" +
      ".ChatSphere-i18n-option-flag.is-image{background-color:#eef3f8;}" +
      ".ChatSphere-i18n-option-text{display:flex;align-items:baseline;gap:8px;min-width:0;}" +
      ".ChatSphere-i18n-option-code{flex:0 0 34px;font-size:12px;font-weight:900;letter-spacing:.02em;}" +
      ".ChatSphere-i18n-option-name{min-width:0;font-size:12px;font-weight:700;color:#42526a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".ChatSphere-i18n-desktop .ChatSphere-i18n-menu{min-width:245px;}" +
      ".ChatSphere-i18n-desktop .ChatSphere-i18n-menu-head{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;align-items:center;padding:3px 8px 7px;margin:0 0 4px;border-bottom:1px solid rgba(15,23,42,.08);color:#64748b;font:900 10px/1 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:0;text-transform:uppercase;}" +
      ".ChatSphere-i18n-desktop .ChatSphere-i18n-option{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;align-items:center;}" +
      ".ChatSphere-i18n-desktop .ChatSphere-i18n-option-text{display:block;min-width:0;}" +
      ".ChatSphere-i18n-desktop .ChatSphere-i18n-option-code{display:none;}" +
      "body.index-page .ChatSphere-i18n-toggle{border-color:rgba(1,127,254,.18);background:rgba(255,255,255,.76);color:#12324f;box-shadow:inset 0 1px 0 rgba(255,255,255,.88),0 8px 18px -16px rgba(14,34,56,.35);}" +
      ".duck-header .ChatSphere-i18n-header,.header-right .ChatSphere-i18n-header{flex:0 0 auto;}" +
      ".ChatSphere-i18n-mobile-nav{display:none!important;}" +
      ".ChatSphere-i18n-video-menu{display:none!important;}" +
      "@media(max-width:640px){.ChatSphere-i18n-toggle{min-width:44px;width:44px;padding:0;gap:0}.ChatSphere-i18n-code,.ChatSphere-i18n-caret{display:none}.ChatSphere-i18n-flag{font-size:18px}.ChatSphere-i18n-menu{position:fixed;left:10px;right:10px;top:56px;width:auto;min-width:0;max-width:none;max-height:calc(100vh - 72px);max-height:calc(100dvh - 72px);padding:8px 6px}.ChatSphere-i18n-option{min-height:40px;padding:8px 10px;align-items:flex-start}.ChatSphere-i18n-option-text{flex:1 1 auto;align-items:flex-start;gap:6px}.ChatSphere-i18n-option-code{flex:0 0 32px}.ChatSphere-i18n-option-name{white-space:normal;overflow:visible;text-overflow:clip;line-height:1.25}body.video-page .ChatSphere-i18n-desktop{display:none!important}body.video-page #headerMenuPanel .ChatSphere-i18n-video-menu{display:block!important;position:relative;margin:0 0 6px;padding:0 0 8px;border-bottom:1px solid rgba(255,255,255,.10);z-index:1}body.video-page #headerMenuPanel .ChatSphere-i18n-video-menu .ChatSphere-i18n-toggle{width:100%;min-width:0;height:40px;justify-content:flex-start;border-radius:10px;padding:0 10px;gap:8px;background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.12);box-shadow:none;color:#fff}body.video-page #headerMenuPanel .ChatSphere-i18n-video-menu .ChatSphere-i18n-label{display:inline;min-width:0;font-size:13px;font-weight:900;line-height:1.1}body.video-page #headerMenuPanel .ChatSphere-i18n-video-menu .ChatSphere-i18n-code{display:inline;margin-left:auto;font-size:12px}body.video-page #headerMenuPanel .ChatSphere-i18n-video-menu .ChatSphere-i18n-caret{display:block;margin-left:0}body.video-page #headerMenuPanel .ChatSphere-i18n-video-menu .ChatSphere-i18n-flag{width:22px;height:22px}body.video-page #headerMenuPanel .ChatSphere-i18n-video-menu .ChatSphere-i18n-menu{position:static;left:auto;right:auto;top:auto;width:100%;min-width:0;max-height:min(420px,58vh);max-height:min(420px,58dvh);margin-top:8px;padding:6px;border-radius:10px;box-shadow:none}body.index-page .ChatSphere-i18n-desktop{display:none!important}body.index-page #accordion .ChatSphere-i18n-mobile-nav{display:block!important;position:relative;margin:0 0 8px;padding:0 0 10px;border-bottom:1px solid rgba(1,127,254,.12);z-index:1}body.index-page #accordion .ChatSphere-i18n-mobile-nav .ChatSphere-i18n-toggle{width:100%;min-width:0;height:42px;justify-content:flex-start;border-radius:12px;padding:0 13px;gap:9px;background:rgba(1,127,254,.08);border-color:rgba(1,127,254,.16);box-shadow:none;color:#17324d}body.index-page #accordion .ChatSphere-i18n-mobile-nav .ChatSphere-i18n-label{display:inline;min-width:0;font-size:13px;font-weight:900;line-height:1.1}body.index-page #accordion .ChatSphere-i18n-mobile-nav .ChatSphere-i18n-code{display:inline;margin-left:auto;font-size:12px}body.index-page #accordion .ChatSphere-i18n-mobile-nav .ChatSphere-i18n-caret{display:block;margin-left:0}body.index-page #accordion .ChatSphere-i18n-mobile-nav .ChatSphere-i18n-flag{width:22px;height:22px}body.index-page #accordion .ChatSphere-i18n-mobile-nav .ChatSphere-i18n-menu{position:static;left:auto;right:auto;top:auto;width:100%;min-width:0;max-height:min(420px,58vh);max-height:min(420px,58dvh);margin-top:8px;padding:6px;border-radius:12px;box-shadow:none}.index-nav+.ChatSphere-i18n-header{display:inline-flex}}";
    try { document.head.appendChild(style); } catch (_) {}
  }

  function format(template, vars) {
    return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, key) {
      return Object.prototype.hasOwnProperty.call(vars || {}, key) ? String(vars[key]) : "";
    });
  }

  function translatePremiumPricePhrase(value) {
    var out = String(value || "");
    out = out.replace(/\/\s*week/i, dict["/ week"] || "/ week");
    out = out.replace(/\/\s*month/i, dict["/ month"] || "/ month");
    return out;
  }

  function translatePattern(key) {
    var m = key.match(/^Score\s+(.+)$/i);
    if (m && dict["Score {score}"]) return format(dict["Score {score}"], { score: m[1] });
    m = key.match(/^([A-Z]{2})\s+-\s+(.+)$/);
    if (m && window.Intl && typeof window.Intl.DisplayNames === "function") {
      try {
        var regionNames = new window.Intl.DisplayNames([lang], { type: "region" });
        var regionName = regionNames.of(m[1]);
        if (regionName) return m[1] + " - " + regionName;
      } catch (_) {}
    }
    m = key.match(/^Your subscription cancellation is confirmed\. Premium stays active until (.+)\. You will not be charged again for this subscription\.$/i);
    if (m && dict["Your subscription cancellation is confirmed. Premium stays active until {date}. You will not be charged again for this subscription."]) {
      return format(dict["Your subscription cancellation is confirmed. Premium stays active until {date}. You will not be charged again for this subscription."], { date: m[1] });
    }
    m = key.match(/^Rule flagged:\s*(.+)$/i);
    if (m && dict["Rule flagged: {rule}"]) return format(dict["Rule flagged: {rule}"], { rule: m[1] });
    m = key.match(/^Stranger country\s+([A-Z]{2})$/i);
    if (m && dict["Stranger country {code}"]) return format(dict["Stranger country {code}"], { code: m[1].toUpperCase() });
    m = key.match(/^Strike\s+([0-9]+)\/([0-9]+)$/i);
    if (m && dict["Strike {n}/{max}"]) return format(dict["Strike {n}/{max}"], { n: m[1], max: m[2] });
    m = key.match(/^I understand\s+\(([0-9]+)\)$/i);
    if (m && dict["I understand ({n})"]) return format(dict["I understand ({n})"], { n: m[1] });
    m = key.match(/^Pay\s+\$([0-9]+(?:\.[0-9]+)?)\s+to unban$/i);
    if (m && dict["Pay ${price} to unban"]) return String(dict["Pay ${price} to unban"]).replace("${price}", "$" + m[1]);
    m = key.match(/^Subscribe for (.+?)\. Checkout opens securely off-site\. Cancel anytime\.$/i);
    if (m && dict["Subscribe for {price}. Checkout opens securely off-site. Cancel anytime."]) {
      return format(dict["Subscribe for {price}. Checkout opens securely off-site. Cancel anytime."], {
        price: translatePremiumPricePhrase(m[1])
      });
    }
    m = key.match(/^Premium cancellation is scheduled\. Access remains active until (.+)\.$/i);
    if (m && dict["Premium cancellation is scheduled. Access remains active until {date}."]) {
      return format(dict["Premium cancellation is scheduled. Access remains active until {date}."], { date: m[1] });
    }
    m = key.match(/^Premium cancellation scheduled\. Access remains active until (.+)\.$/i);
    if (m && dict["Premium cancellation scheduled. Access remains active until {date}."]) {
      return format(dict["Premium cancellation scheduled. Access remains active until {date}."], { date: m[1] });
    }
    m = key.match(/^Access remains active until (.+)\.$/i);
    if (m && dict["Access remains active until {date}."]) return format(dict["Access remains active until {date}."], { date: m[1] });
    m = key.match(/^Camera:\s+(.+)$/i);
    if (m && dict["Camera: {label}"]) return format(dict["Camera: {label}"], { label: m[1] });
    m = key.match(/^Remove\s+(.+)$/i);
    if (m && dict["Remove {item}"]) return format(dict["Remove {item}"], { item: m[1] });
    m = key.match(/^You now have Strike\s+([0-9]+)\/([0-9]+)\. Another strike may result in a ban\.$/i);
    if (m && dict["You now have Strike {n}/{max}. Another strike may result in a ban."]) {
      return format(dict["You now have Strike {n}/{max}. Another strike may result in a ban."], { n: m[1], max: m[2] });
    }
    m = key.match(/^Unable to start checkout:\s+(.+)\. Please try again\.$/i);
    if (m && dict["Unable to start checkout: {message}. Please try again."]) {
      return format(dict["Unable to start checkout: {message}. Please try again."], { message: m[1] });
    }
    return "";
  }

  function t(value, vars) {
    var key = normalize(value);
    if (!key) return String(value == null ? "" : value);
    var translated = dict[key] || translatePattern(key) || key;
    return vars ? format(translated, vars) : translated;
  }

  function shouldSkip(node) {
    var el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el) return true;
    try {
      if (el.closest && el.closest("[data-i18n-allow]")) return false;
      if (el.matches && el.matches("#messages") && el.querySelector("[data-i18n-allow]")) return false;
      return !!(el.closest && el.closest(SKIP_SELECTOR));
    } catch (_) {
      return false;
    }
  }

  function withOriginalWhitespace(raw, translated) {
    var leading = String(raw || "").match(/^\s*/);
    var trailing = String(raw || "").match(/\s*$/);
    return (leading ? leading[0] : "") + translated + (trailing ? trailing[0] : "");
  }

  function translateSourceText(source) {
    var key = normalize(source);
    if (!key || lang === "en") return String(source == null ? "" : source);
    var translated = t(key);
    return translated && translated !== key ? withOriginalWhitespace(source, translated) : String(source == null ? "" : source);
  }

  function getOriginalText(node) {
    var raw = node.nodeValue || "";
    if (!originalTextNodes) return raw;
    if (!originalTextNodes.has(node)) {
      originalTextNodes.set(node, raw);
      return raw;
    }
    var source = originalTextNodes.get(node);
    if (!isApplyingLanguage) {
      var expected = translateSourceText(source);
      if (raw !== source && raw !== expected) {
        source = raw;
        originalTextNodes.set(node, source);
      }
    }
    return source;
  }

  function getOriginalAttr(el, attr, raw) {
    if (!originalAttrs) return raw;
    var attrs = originalAttrs.get(el);
    if (!attrs) {
      attrs = {};
      originalAttrs.set(el, attrs);
    }
    if (!Object.prototype.hasOwnProperty.call(attrs, attr)) {
      attrs[attr] = raw;
      return raw;
    }
    var source = attrs[attr];
    if (!isApplyingLanguage) {
      var expected = normalize(translateSourceText(source));
      var normalizedRaw = normalize(raw);
      if (normalizedRaw !== normalize(source) && normalizedRaw !== expected) {
        source = raw;
        attrs[attr] = source;
      }
    }
    return source;
  }

  function translateTextNode(node) {
    if (!node || node.nodeType !== 3 || shouldSkip(node)) return;
    var source = getOriginalText(node);
    var key = normalize(source);
    if (!key) return;
    var translated = translateSourceText(source);
    if ((node.nodeValue || "") !== translated) node.nodeValue = translated;
  }

  function translateElement(el) {
    if (!el || el.nodeType !== 1 || shouldSkip(el)) return;
    for (var i = 0; i < ATTRS.length; i += 1) {
      var attr = ATTRS[i];
      if (!el.hasAttribute || !el.hasAttribute(attr)) continue;
      var raw = el.getAttribute(attr);
      var source = getOriginalAttr(el, attr, raw);
      var key = normalize(source);
      if (!key) continue;
      var translated = lang === "en" ? source : t(key);
      if (translated && translated !== raw) el.setAttribute(attr, translated);
    }
  }

  function translateTree(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      translateTextNode(root);
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) translateElement(root);
    var walker;
    try {
      walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (node) {
          return shouldSkip(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
      });
    } catch (_) {
      return;
    }
    var node = walker.currentNode;
    while (node) {
      if (node.nodeType === 3) translateTextNode(node);
      else if (node.nodeType === 1) translateElement(node);
      node = walker.nextNode();
    }
  }

  function applyDocumentLanguage() {
    try {
      document.documentElement.setAttribute("lang", lang);
      document.documentElement.setAttribute("data-i18n-lang", lang);
    } catch (_) {}
  }

  function upsertHeadLink(selector, attrs) {
    var el;
    try {
      el = document.head.querySelector(selector);
      if (!el) {
        el = document.createElement("link");
        document.head.appendChild(el);
      }
      Object.keys(attrs || {}).forEach(function (key) {
        el.setAttribute(key, attrs[key]);
      });
    } catch (_) {}
    return el;
  }

  function applySeoLanguageLinks() {
    var basePath = canonicalBasePath();
    if (!supportsSeoLanguageAlternates(basePath) || !document.head) return;
    try {
      Array.prototype.forEach.call(document.head.querySelectorAll("link[rel='alternate'][hreflang],link[data-i18n-hreflang]"), function (el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    } catch (_) {}
    var pathLang = langFromPath();
    if (pathLang) {
      upsertHeadLink("link[rel='canonical']", {
        rel: "canonical",
        href: absoluteUrlForPath(localizedSeoPath(pathLang, basePath))
      });
      try {
        Array.prototype.forEach.call(document.head.querySelectorAll("meta[property='og:url']"), function (meta) {
          meta.setAttribute("content", absoluteUrlForPath(localizedSeoPath(pathLang, basePath)));
        });
      } catch (_) {}
    }
    var links = [{ code: "en", href: absoluteUrlForPath(localizedSeoPath("en", basePath)) }];
    SUPPORTED.forEach(function (code) {
      if (code !== "en") links.push({ code: code, href: absoluteUrlForPath(localizedSeoPath(code, basePath)) });
    });
    links.push({ code: "x-default", href: absoluteUrlForPath(localizedSeoPath("en", basePath)) });
    links.forEach(function (item) {
      var link = document.createElement("link");
      link.setAttribute("rel", "alternate");
      link.setAttribute("hreflang", item.code);
      link.setAttribute("href", item.href);
      link.setAttribute("data-i18n-hreflang", "1");
      try { document.head.appendChild(link); } catch (_) {}
    });
  }

  function applyMeta() {
    try {
      var currentTitle = document.title || "";
      if (!originalTitle || (!isApplyingLanguage && currentTitle !== translateSourceText(originalTitle) && currentTitle !== originalTitle)) {
        originalTitle = currentTitle;
      }
      var nextTitle = translateSourceText(originalTitle);
      if (nextTitle && document.title !== nextTitle) document.title = nextTitle;
    } catch (_) {}
    try {
      Array.prototype.forEach.call(document.querySelectorAll("meta[content]"), function (meta) {
        var raw = meta.getAttribute("content");
        var source = raw;
        if (originalMetaContent) {
          if (!originalMetaContent.has(meta)) {
            originalMetaContent.set(meta, raw);
          } else {
            source = originalMetaContent.get(meta);
            if (!isApplyingLanguage) {
              var expected = normalize(translateSourceText(source));
              var normalizedRaw = normalize(raw);
              if (normalizedRaw !== normalize(source) && normalizedRaw !== expected) {
                source = raw;
                originalMetaContent.set(meta, source);
              }
            }
          }
          source = originalMetaContent.get(meta);
        }
        var translated = translateSourceText(source);
        if (translated && translated !== raw) meta.setAttribute("content", translated);
      });
    } catch (_) {}
    applySeoLanguageLinks();
  }

  function syncPublicApi() {
    try {
      if (window.ChatSphereI18n) window.ChatSphereI18n.lang = lang;
    } catch (_) {}
  }

  function applyLanguageNow(root) {
    root = root || document;
    isApplyingLanguage = true;
    try {
      applyDocumentLanguage();
      injectHeaderLanguageStyles();
      injectHeaderLanguageControl();
      bindHeaderLanguageControls(root);
      bindLanguageSelectors(root);
      if (lang !== "en" || hasAppliedNonEnglish) {
        translateTree(root.nodeType ? root : (document.body || document.documentElement));
      }
      applyMeta();
      syncPublicApi();
      if (lang !== "en") hasAppliedNonEnglish = true;
    } finally {
      isApplyingLanguage = false;
    }
  }

  var pending = false;
  var pendingRoots = [];
  function scheduleTranslate(root) {
    if (lang === "en" && !hasAppliedNonEnglish) return;
    if (root) pendingRoots.push(root);
    if (pending) return;
    pending = true;
    (window.requestAnimationFrame || window.setTimeout)(function () {
      pending = false;
      var roots = pendingRoots.slice();
      pendingRoots.length = 0;
      isApplyingLanguage = true;
      try {
        for (var i = 0; i < roots.length; i += 1) {
          var item = roots[i];
          if (!item || !item.isConnected) continue;
          bindHeaderLanguageControls(item);
          bindLanguageSelectors(item);
          translateTree(item);
        }
      } finally {
        isApplyingLanguage = false;
      }
    }, 16);
  }

  function observe() {
    if (!window.MutationObserver || !document.body || documentObserver) return;
    documentObserver = new MutationObserver(function (mutations) {
      if (lang === "en" && !hasAppliedNonEnglish) return;
      for (var i = 0; i < mutations.length; i += 1) {
        var m = mutations[i];
        if (m.type === "attributes") {
          translateElement(m.target);
          continue;
        }
        if (m.type === "characterData") {
          translateTextNode(m.target);
          continue;
        }
        if (m.addedNodes && m.addedNodes.length) {
          for (var j = 0; j < m.addedNodes.length; j += 1) scheduleTranslate(m.addedNodes[j]);
        }
      }
    });
    documentObserver.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS
    });
  }

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true });
    else fn();
  }

  window.ChatSphereI18n = {
    version: VERSION,
    lang: lang,
    supported: SUPPORTED.slice(),
    t: t,
    setLanguage: setLanguage,
    apply: function (root) {
      applyLanguageNow(root || document);
    }
  };

  ready(function () {
    loadLanguageDictionary(lang).then(function () {
      dict = DICT[lang] || {};
      applyLanguageNow(document);
      observe();
    });
  });
})();
