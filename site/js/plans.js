'use strict';
/**
 * plans.js — loads tariff plans from API and renders them.
 */

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function monthWord(n) {
  if (n === 1) return 'месяц';
  if (n >= 2 && n <= 4) return 'месяца';
  return 'месяцев';
}

function perMonthPrice(price, months) {
  if (!months || months <= 1) return null;
  return Math.round(price / months);
}

function renderPlans(grid, plans) {
  if (!plans.length) {
    grid.innerHTML = '<p class="plans-empty">Тарифы скоро появятся</p>';
    return;
  }

  const isLoggedIn = !!localStorage.getItem('jwt_token');

  // Sort by months ascending
  const sorted = [...plans].sort((a, b) => (a.months || 0) - (b.months || 0));

  // Featured = middle plan (or last if 2, or only if 1)
  const featuredIdx = sorted.length === 1 ? 0
    : sorted.length === 2 ? 1
    : Math.floor(sorted.length / 2);

  grid.innerHTML = sorted.map((p, i) => {
    const featured = i === featuredIdx;
    const months = p.months || 1;
    const price = Math.round(p.price);
    const ppm = perMonthPrice(p.price, months);
    const buyHref = isLoggedIn ? '/app/' : '/login.html';
    const buyLabel = isLoggedIn ? 'Купить' : 'Войти и купить';

    // Savings badge for multi-month plans
    let savingsBadge = '';
    if (months >= 3 && sorted[0]) {
      const baseMonthly = sorted[0].price / (sorted[0].months || 1);
      const thisMonthly = p.price / months;
      const savePct = Math.round((1 - thisMonthly / baseMonthly) * 100);
      if (savePct >= 5) {
        savingsBadge = `<div class="plan-savings">Экономия ${savePct}%</div>`;
      }
    }

    const features = [
      'Все серверы включены',
      'Без ограничений скорости',
      'Безлимитный трафик',
      'Поддержка 24/7',
      'Все устройства',
    ];

    return `
      <div class="plan-card ${featured ? 'plan-card-featured' : ''} reveal">
        ${featured ? '<div class="plan-badge">Популярный</div>' : ''}
        ${savingsBadge}
        <div class="plan-name">${escHtml(p.plan_name)}</div>
        <div class="plan-price">${price}<span> ₽</span></div>
        <div class="plan-period">
          ${months} ${monthWord(months)}
          ${ppm ? `<span class="plan-ppm"> · ${ppm} ₽/мес</span>` : ''}
        </div>
        <ul class="plan-features">
          ${features.map(f => `<li>${f}</li>`).join('')}
        </ul>
        <a href="${buyHref}" class="btn btn-primary btn-full">${buyLabel}</a>
      </div>`;
  }).join('');

  // Trigger reveal for newly added cards
  if (window.IntersectionObserver) {
    const obs = new IntersectionObserver(entries => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          const siblings = Array.from(e.target.parentElement?.querySelectorAll('.reveal') || []);
          const idx = siblings.indexOf(e.target);
          setTimeout(() => e.target.classList.add('revealed'), idx * 80);
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.06 });
    grid.querySelectorAll('.reveal').forEach(el => obs.observe(el));
  } else {
    grid.querySelectorAll('.reveal').forEach(el => el.classList.add('revealed'));
  }
}

async function loadPlans() {
  const grid = document.getElementById('plans-grid');
  if (!grid) return;

  try {
    const token = localStorage.getItem('jwt_token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const r = await fetch('/api/v1/plans', { headers });
    if (!r.ok) throw new Error('api error');
    const d = await r.json();
    renderPlans(grid, d.plans || []);
  } catch {
    grid.innerHTML = '<p class="plans-empty">Тарифы временно недоступны</p>';
  }
}

loadPlans();
