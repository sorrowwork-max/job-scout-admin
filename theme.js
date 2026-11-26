/* Job Scout – shared theme controller (popup, settings, activity).
   Persists in chrome.storage.local under the existing "popupTheme" key and
   mirrors to localStorage so every page paints the right theme on first frame. */
(() => {
  const KEY = 'popupTheme';
  const MIRROR = 'jobscout-theme';
  const root = document.documentElement;
  const norm = t => (t === 'light' ? 'light' : 'dark');
  let current;

  function apply(theme) {
    current = norm(theme);
    root.dataset.theme = current;
    root.style.colorScheme = current;
    const sw = document.getElementById('themeToggle');
    if (sw) {
      sw.setAttribute('aria-checked', String(current === 'dark'));
      sw.title = current === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    }
    document.querySelectorAll('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === current)));
  }

  function persist(theme) {
    try { localStorage.setItem(MIRROR, theme); } catch (_) {}
    try { chrome.storage.local.set({ [KEY]: theme }); } catch (_) {}
  }

  // Animated switch: a circular liquid reveal from the control, where supported.
  function set(theme, origin) {
    theme = norm(theme);
    if (theme === current) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !reduce) {
      const x = origin?.x ?? innerWidth / 2, y = origin?.y ?? 0;
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const transition = document.startViewTransition(() => apply(theme));
      transition.ready.then(() => root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 720, easing: 'cubic-bezier(.22,.8,.24,1)', pseudoElement: '::view-transition-new(root)' }
      )).catch(() => {});
    } else {
      apply(theme);
    }
    persist(theme);
  }

  // 1) Paint immediately from the mirror (default: dark, as before).
  let early = null;
  try { early = localStorage.getItem(MIRROR); } catch (_) {}
  apply(early);

  // 2) Reconcile with the stored value and follow changes made on other pages.
  try {
    chrome.storage.local.get(KEY).then(d => {
      if (d[KEY] === undefined) { persist(current); return; }
      const stored = norm(d[KEY]);
      if (stored !== current) apply(stored);
      try { localStorage.setItem(MIRROR, stored); } catch (_) {}
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[KEY] && norm(changes[KEY].newValue) !== current) apply(changes[KEY].newValue);
    });
  } catch (_) {}

  document.addEventListener('DOMContentLoaded', () => {
    apply(current);
    const center = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    document.getElementById('themeToggle')?.addEventListener('click', e =>
      set(current === 'dark' ? 'light' : 'dark', center(e.currentTarget)));
    document.querySelectorAll('[data-theme-set]').forEach(b =>
      b.addEventListener('click', () => set(b.dataset.themeSet, center(b))));
    requestAnimationFrame(() => root.classList.add('ready'));
  });
})();
