/* =====================================================================
 * ChatSphere theme toggle (light <-> dark)
 *
 * - Loaded synchronously in <head> so the correct theme is applied
 *   BEFORE first paint (no flash of light mode / FOUC).
 * - Persists choice in localStorage under 'ChatSphere_theme'.
 * - Falls back to the OS preference (prefers-color-scheme) on first visit.
 * - Works by toggling body.dark-mode (CSS overrides in chat-app/style.css).
 * ===================================================================== */

(function () {
  var STORAGE_KEY = 'ChatSphere_theme';
  var saved;
  try { saved = window.localStorage.getItem(STORAGE_KEY); } catch (_) { saved = null; }

  // First visit: respect OS dark-mode preference
  var prefersDark = false;
  try {
    prefersDark = window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch (_) {}

  var initial = saved || (prefersDark ? 'dark' : 'light');

  function applyTheme(theme) {
    var body = document.body;
    if (!body) {
      // Body not parsed yet — wait for DOMContentLoaded
      document.documentElement.setAttribute('data-pending-theme', theme);
      return;
    }
    if (theme === 'dark') {
      body.classList.add('dark-mode');
      body.setAttribute('data-theme', 'dark');
    } else {
      body.classList.remove('dark-mode');
      body.setAttribute('data-theme', 'light');
    }
    var btn = document.getElementById('themeToggleBtn');
    if (btn) {
      var icon = btn.querySelector('i');
      if (theme === 'dark') {
        if (icon) icon.className = 'bi bi-sun-fill';
        btn.title = 'Switch to light mode';
        btn.setAttribute('aria-pressed', 'true');
      } else {
        if (icon) icon.className = 'bi bi-moon-stars-fill';
        btn.title = 'Switch to dark mode';
        btn.setAttribute('aria-pressed', 'false');
      }
    }
  }

  // Apply immediately if <body> already exists, otherwise queue for DOMContentLoaded.
  if (document.body) {
    applyTheme(initial);
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      var pending = document.documentElement.getAttribute('data-pending-theme') || initial;
      applyTheme(pending);
    });
  }

  // Wire up the toggle button (after DOM is ready)
  function wireToggle() {
    var btn = document.getElementById('themeToggleBtn');
    if (!btn || btn.__themeWired) return;
    btn.__themeWired = true;
    btn.addEventListener('click', function () {
      var current = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
      var next = current === 'dark' ? 'light' : 'dark';
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
      applyTheme(next);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireToggle);
  } else {
    wireToggle();
  }
})();
