'use strict';

/* ── Header height → CSS var (keeps Hero below sticky navbar on every layout) ── */
(function () {
  const nav = document.querySelector('.navbar');
  if (!nav) return;
  const apply = () => {
    const h = Math.round(nav.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty('--header-h', h + 'px');
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  // React to layout shifts (DevTools open, font load, mobile menu toggle).
  if (window.ResizeObserver) new ResizeObserver(apply).observe(nav);
  // Re-check after fonts/layout settle.
  window.addEventListener('load', apply);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(apply);
})();

/* ── OS Detection ─────────────────────────────────────────────────────────── */
const NEOTUN_OS = (() => {
  const u = navigator.userAgent;
  if (/Windows/.test(u)) return 'windows';
  if (/Android/.test(u)) return 'android';
  if (/iPhone|iPad|iPod/.test(u)) return 'ios';
  if (/Mac OS X/.test(u)) return 'macos';
  if (/Linux/.test(u)) return 'linux';
  return 'unknown';
})();
window.NEOTUN_OS = NEOTUN_OS;

(function () {
  const banner = document.querySelector('.os-detect-banner');
  if (!banner || NEOTUN_OS === 'unknown') return;
  const labels = { windows: 'Windows', android: 'Android', ios: 'iOS', macos: 'macOS', linux: 'Linux' };
  const urls = {
    windows: '/download/', android: '/download/', ios: '/download/', macos: '/download/', linux: '/download/'
  };
  const name = labels[NEOTUN_OS];
  if (!name) return;
  const nEl = banner.querySelector('.os-name');
  const lEl = banner.querySelector('.os-link');
  if (nEl) nEl.textContent = name;
  if (lEl) lEl.href = urls[NEOTUN_OS] || '/download/';
  banner.classList.add('visible');
})();

/* ── Navbar scroll ────────────────────────────────────────────────────────── */
(function () {
  const nav = document.querySelector('.navbar');
  if (!nav) return;
  const update = () => nav.classList.toggle('navbar-scrolled', window.scrollY > 12);
  window.addEventListener('scroll', update, { passive: true });
  update();
})();

/* ── Mobile menu ──────────────────────────────────────────────────────────── */
document.querySelector('.navbar-menu-btn')?.addEventListener('click', e => {
  e.stopPropagation();
  document.querySelector('.navbar')?.classList.toggle('menu-open');
});
document.addEventListener('click', e => {
  const nb = document.querySelector('.navbar');
  if (nb && !nb.contains(e.target)) nb.classList.remove('menu-open');
});
// Close on link click
document.querySelectorAll('.navbar-mobile-menu a').forEach(a => {
  a.addEventListener('click', () => {
    document.querySelector('.navbar')?.classList.remove('menu-open');
  });
});

/* ── Smooth scroll ────────────────────────────────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href').slice(1);
    const el = document.getElementById(id);
    if (el) {
      e.preventDefault();
      const offset = 80;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

/* ── FAQ ──────────────────────────────────────────────────────────────────── */
function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
  if (!isOpen) item.classList.add('open');
}
window.toggleFaq = toggleFaq;

/* ── Toast ────────────────────────────────────────────────────────────────── */
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' toast-' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}
window.showToast = showToast;

/* ── Scroll reveal ────────────────────────────────────────────────────────── */
(function () {
  if (!window.IntersectionObserver) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('revealed'));
    return;
  }
  const obs = new IntersectionObserver(entries => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        // Stagger siblings
        const siblings = Array.from(e.target.parentElement?.querySelectorAll('.reveal') || []);
        const idx = siblings.indexOf(e.target);
        setTimeout(() => e.target.classList.add('revealed'), idx * 70);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -28px 0px' });

  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
})();

/* ── Active nav link highlight on scroll ─────────────────────────────────── */
(function () {
  const sections = document.querySelectorAll('section[id]');
  const links = document.querySelectorAll('.navbar-links a[href^="#"]');
  if (!sections.length || !links.length) return;

  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(l => l.classList.remove('active'));
        const active = document.querySelector(`.navbar-links a[href="#${e.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });

  sections.forEach(s => obs.observe(s));
})();

/* ── Analytics ────────────────────────────────────────────────────────────── */
(function () {
  function track(event, params) {
    if (window.ym) { try { ym(108370851, 'reachGoal', event, params); } catch (e) {} }
    if (window.gtag) { try { gtag('event', event, params); } catch (e) {} }
  }

  document.querySelectorAll('.hero-cta, .cta-btn').forEach(el => {
    el.addEventListener('click', () => track('cta_click', { event_label: el.textContent.trim() }));
  });

  document.addEventListener('click', e => {
    const btn = e.target.closest('.plan-card .btn');
    if (btn) {
      const name = btn.closest('.plan-card')?.querySelector('.plan-name')?.textContent || 'unknown';
      track('plan_click', { event_label: name });
    }
  });

  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => track('faq_open', { event_label: btn.textContent.trim() }));
  });

  const depths = [25, 50, 75, 100];
  const reached = new Set();
  window.addEventListener('scroll', () => {
    const pct = Math.round((window.scrollY + window.innerHeight) / document.body.scrollHeight * 100);
    depths.forEach(d => {
      if (pct >= d && !reached.has(d)) {
        reached.add(d);
        track('scroll_depth', { event_label: d + '%' });
      }
    });
  }, { passive: true });

  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (a && a.hostname && a.hostname !== location.hostname) {
      track('outbound_click', { event_label: a.href });
    }
  });
})();
