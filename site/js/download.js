'use strict';
/**
 * NeoTUN Downloads — config-driven, GitHub-Releases-backed page.
 *
 * NeoTUN — это сервис, совместимый с открытыми клиентами. Все приложения
 * разрабатываются их авторами и скачиваются напрямую из официальных
 * GitHub Releases. Эта страница лишь помогает выбрать нужное приложение
 * и ведёт на оригинальные файлы.
 *
 * Архитектура:
 *  - clients.json описывает приложения (название, репозиторий, платформы,
 *    предпочтительные имена файлов). Добавление приложения = один объект.
 *  - Версия и ссылки берутся строго из GitHub API (релизы разработчика)
 *    в момент выбора платформы. Новые релизы и файлы появляются автоматически.
 *  - Перенаправления на сайты/магазины разработчиков НЕ используются:
 *    скачивание идёт только напрямую из официальных GitHub Releases.
 *  - Если подходящих файлов несколько — показывается выбор, затем загрузка.
 */

const PLATFORM_ICON = {
  windows: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 20h8M12 18v2"/></svg>',
  android: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/><path d="M9 5L7 3M15 5l2-2"/></svg>',
  linux:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20a7 7 0 0 1 14 0"/><circle cx="9" cy="9" r="2"/><circle cx="15" cy="9" r="2"/><path d="M12 11v4"/></svg>',
  macos:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  ios:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>',
  tv:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/></svg>'
};

const ALL_PLATFORMS = ['windows', 'android', 'linux', 'macos', 'ios', 'tv', 'tv-android'];
const state = { app: null, platform: null };

/* Cache to respect GitHub's unauthenticated rate limit. */
const _cache = new Map();
async function ghJSON(url) {
  if (_cache.has(url)) return _cache.get(url);
  const r = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('GitHub ' + r.status);
  const data = await r.json();
  _cache.set(url, data);
  return data;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtSize(bytes) {
  if (!bytes) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0, n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n : n.toFixed(n < 10 ? 1 : 0)) + ' ' + u[i];
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}
/* Return ALL assets matching the given glob patterns (case-insensitive). */
function matchAssets(assets, patterns) {
  if (!assets || !assets.length || !patterns || !patterns.length) return [];
  const rxs = patterns.map(p =>
    new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i'));
  return assets.filter(a => rxs.some(rx => rx.test(a.name)));
}

function setStep(active) {
  document.querySelectorAll('.dl-step').forEach(el => {
    const n = +el.dataset.step;
    el.classList.toggle('active', n === active);
    el.classList.toggle('done', n < active);
  });
}

function revealObserve(root) {
  if (!window.IntersectionObserver) {
    root.querySelectorAll('.reveal').forEach(el => el.classList.add('revealed'));
    return;
  }
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('revealed'); obs.unobserve(e.target); } });
  }, { threshold: 0.06 });
  root.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

/* ── Step 1: application cards ─────────────────────────────────────────────── */
const STATUS_LABEL = { recommended: 'Рекомендуем', new: 'Новинка', popular: 'Популярное' };
function renderApps(cfg) {
  const wrap = document.getElementById('dl-apps');
  wrap.innerHTML = cfg.apps.map((a) => {
    const plats = Object.keys(a.platforms);
    const chips = plats.map(p => `<span class="dl-pchip">${esc((cfg.platforms[p] || { label: p }).label)}</span>`).join('');
    const badge = a.status && STATUS_LABEL[a.status]
      ? `<span class="dl-status dl-status-${esc(a.status)}">${esc(STATUS_LABEL[a.status])}</span>`
      : (a.preferred ? `<span class="dl-status dl-status-recommended">Рекомендуем</span>` : '');
    const desc = (a.description || '').length > 70 ? (a.description.slice(0, 68) + '…') : (a.description || '');
    return `
      <button class="dl-client reveal" data-app="${esc(a.id)}" style="--c:${esc(a.preferred || a.status === 'recommended' ? 'var(--accent)' : '#9b8fff')}">
        ${badge ? `<div class="dl-client-badge">${badge}</div>` : ''}
        <div class="dl-client-top">
          <div class="dl-client-logo">${esc(a.name.trim().charAt(0))}</div>
          <div class="dl-client-name">${esc(a.name)}</div>
        </div>
        <div class="dl-client-desc">${esc(desc)}</div>
        <div class="dl-client-platforms">${chips}</div>
      </button>`;
  }).join('');
  wrap.querySelectorAll('.dl-client').forEach(btn =>
    btn.addEventListener('click', () => selectApp(cfg, btn.dataset.app)));
  revealObserve(wrap);
}

/* ── Step 2: platform selection ───────────────────────────────────────────── */
function selectApp(cfg, id) {
  const a = cfg.apps.find(x => x.id === id);
  if (!a) return;
  state.app = a;
  state.platform = null;

  document.querySelectorAll('.dl-client').forEach(b => b.classList.toggle('selected', b.dataset.app === id));

  const block = document.getElementById('dl-platforms-block');
  block.classList.remove('hidden');
  setStep(2);
  const notify = document.getElementById('dl-result');
  if (notify) notify.innerHTML = '';

  const meta = cfg.platforms;
  const grid = document.getElementById('dl-platforms');
  grid.innerHTML = ALL_PLATFORMS.map(key => {
    const p = a.platforms[key];
    const m = meta[key] || { label: key };
    const recommended = (window.NEOTUN_OS === key) ? '<span class="dl-rec-os">для вашей ОС</span>' : '';
    if (!p || p.status === 'soon') {
      return `
        <div class="dl-platform disabled">
          <div class="dl-platform-ico">${PLATFORM_ICON[key]}</div>
          <div class="dl-platform-name">${esc(m.label)}</div>
          <div class="dl-platform-type">${esc(p && p.status === 'soon' ? 'Скоро' : 'Недоступно')}</div>
        </div>`;
    }
    return `
      <button class="dl-platform" data-platform="${esc(key)}" aria-label="Скачать ${esc(a.name)} для ${esc(m.label)}">
        <div class="dl-platform-ico">${PLATFORM_ICON[key]}</div>
        <div class="dl-platform-name">${esc(m.label)}${recommended}</div>
        <div class="dl-platform-type">${esc(p.type || m.arch || '')}</div>
        <div class="dl-platform-hint">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></svg>
          Нажмите, чтобы скачать
        </div>
      </button>`;
  }).join('');

  grid.querySelectorAll('.dl-platform:not(.disabled)').forEach(btn =>
    btn.addEventListener('click', () => selectPlatform(cfg, btn.dataset.platform)));
  block.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Step 3: auto-download on platform select ─────────────────────────────── */
async function selectPlatform(cfg, key) {
  const a = state.app;
  if (!a) return;
  const p = a.platforms[key];
  if (!p || p.status === 'soon') return;
  state.platform = key;

  document.querySelectorAll('.dl-platform').forEach(b => b.classList.toggle('selected', b.dataset.platform === key));

  const notify = document.getElementById('dl-result');
  const meta = cfg.platforms[key] || { label: key };
  setStep(3);

  const repo = p.repository || a.repository;
  const releasesUrl = repo ? `https://github.com/${repo}/releases` : '#';

  notify.innerHTML = `<div class="dl-progress"><div class="dl-spinner"></div><div class="dl-progress-text">Ищем официальную сборку <b>${esc(a.name)}</b> для ${esc(meta.label)}…</div></div>`;
  notify.scrollIntoView({ behavior: 'smooth', block: 'center' });

  try {
    const rel = await ghJSON(`https://api.github.com/repos/${repo}/releases/latest`);
    const assets = rel.assets || [];
    const ver = (rel.tag_name || '').replace(/^v/i, '');
    const matches = matchAssets(assets, p.assetPatterns || []);

    if (!matches.length) {
      const storeBtn = (p.store)
        ? `<a class="btn btn-primary" href="${esc(p.store)}" target="_blank" rel="noopener">Открыть в ${esc(p.storeLabel || 'магазине')} →</a>`
        : '';
      const storeNote = (p.store)
        ? `<p>Для «${esc(meta.label)}» нет прямой сборки в GitHub Releases — ${esc(a.name)} распространяется через ${esc(p.storeLabel || 'магазин')}.</p>`
        : `<p>В последнем релизе ${esc(a.name)} (v${esc(ver)}) нет файла для «${esc(meta.label)}».</p>`;
      notify.innerHTML = `
        <div class="dl-toast-card dl-toast-warn">
          <div class="dl-toast-ico">!</div>
          <div class="dl-toast-body">
            <h3>${storeBtn ? 'Откройте приложение в магазине' : 'Для данной платформы официальная сборка пока отсутствует'}</h3>
            ${storeNote}
            <div class="dl-toast-actions">
              ${storeBtn}
              <a class="btn btn-ghost" href="${esc(releasesUrl)}" target="_blank" rel="noopener">Открыть страницу релизов GitHub →</a>
              <button class="btn btn-ghost" onclick="backToPlatforms()">Другие платформы</button>
            </div>
          </div>
        </div>`;
      loadChangelog(a, repo);
      return;
    }

    // Single matching file → download immediately.
    if (matches.length === 1) {
      triggerDownload(matches[0]);
      renderDoneToast(a, meta, rel, matches[0]);
      loadChangelog(a, repo);
      return;
    }

    // Multiple files → let the user choose, then download.
    notify.innerHTML = `
      <div class="dl-toast-card">
        <div class="dl-toast-ico">⤓</div>
        <div class="dl-toast-body">
          <h3>Выберите файл для скачивания</h3>
          <p>Найдено несколько официальных сборок ${esc(a.name)} для ${esc(meta.label)} (v${esc(ver)}).</p>
          <div class="dl-files">
            ${matches.map(asset => `
              <button class="dl-file" data-url="${esc(asset.browser_download_url)}" data-name="${esc(asset.name)}">
                <div class="dl-file-ico">${fileIcon(asset.name)}</div>
                <div class="dl-file-info">
                  <div class="dl-file-name">${esc(asset.name)}</div>
                  <div class="dl-file-meta">${esc(fmtSize(asset.size))}</div>
                </div>
                <div class="dl-file-go">↓</div>
              </button>`).join('')}
          </div>
          <div class="dl-toast-actions">
            <button class="btn btn-ghost" onclick="backToPlatforms()">Другие платформы</button>
            <a class="btn btn-ghost" href="${esc(releasesUrl)}" target="_blank" rel="noopener">Все релизы →</a>
          </div>
        </div>
      </div>`;
    notify.querySelectorAll('.dl-file').forEach(btn =>
      btn.addEventListener('click', () => {
        const asset = matches.find(m => m.browser_download_url === btn.dataset.url);
        triggerDownload(asset);
        renderDoneToast(a, meta, rel, asset);
      }));
    loadChangelog(a, repo);
  } catch (e) {
    notify.innerHTML = `
      <div class="dl-toast-card dl-toast-warn">
        <div class="dl-toast-ico">!</div>
        <div class="dl-toast-body">
          <h3>Не удалось получить последнюю версию</h3>
          <p>Проверьте подключение или откройте страницу релизов вручную.</p>
          <div class="dl-toast-actions">
            <a class="btn btn-outline" href="${esc(releasesUrl)}" target="_blank" rel="noopener">Открыть страницу релизов GitHub →</a>
            <button class="btn btn-ghost" onclick="backToPlatforms()">Другие платформы</button>
          </div>
        </div>
      </div>`;
  }
}

function triggerDownload(asset) {
  if (!asset) return;
  const aEl = document.createElement('a');
  aEl.href = asset.browser_download_url;
  aEl.download = asset.name;
  aEl.rel = 'noopener';
  document.body.appendChild(aEl);
  aEl.click();
  aEl.remove();
}

function renderDoneToast(a, meta, rel, asset) {
  const notify = document.getElementById('dl-result');
  notify.innerHTML = `
    <div class="dl-toast-card dl-toast-ok">
      <div class="dl-toast-ico">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
      </div>
      <div class="dl-toast-body">
        <h3>Скачивание началось</h3>
        <p><b>${esc(a.name)}</b> для ${esc(meta.label)} · v${esc((rel.tag_name || '').replace(/^v/i, ''))} · ${esc(fmtSize(asset.size))}</p>
        <div class="dl-toast-actions">
          <a class="btn btn-outline" href="${esc(asset.browser_download_url)}" target="_blank" rel="noopener" download>Скачать ещё раз</a>
          <button class="btn btn-ghost" onclick="backToPlatforms()">Другие платформы</button>
          <a class="btn btn-ghost" href="${esc(rel.html_url)}" target="_blank" rel="noopener">История релизов →</a>
        </div>
      </div>
    </div>`;
}

function fileIcon(name) {
  const n = (name || '').toLowerCase();
  if (n.endsWith('.apk')) return '📱';
  if (n.endsWith('.dmg') || n.endsWith('.pkg')) return '🍎';
  if (n.endsWith('.deb') || n.endsWith('.rpm') || n.endsWith('.pkg.tar.zst')) return '🐧';
  if (n.endsWith('.appimage')) return '🐧';
  if (n.endsWith('.msi') || n.endsWith('.exe')) return '🪟';
  if (n.endsWith('.zip') || n.endsWith('.tar.gz') || n.endsWith('.tar.zst') || n.endsWith('.7z')) return '🗜️';
  return '📄';
}

/* Return to platform selection (from a notification). */
function backToPlatforms() {
  const block = document.getElementById('dl-platforms-block');
  if (block) {
    block.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const notify = document.getElementById('dl-result');
  if (notify) notify.innerHTML = '';
}
window.backToPlatforms = backToPlatforms;

/* ── Changelog (last releases of the selected app) ────────────────────────── */
async function loadChangelog(a, repo) {
  const wrap = document.getElementById('dl-changelog');
  repo = repo || a.repository;
  if (!wrap || !repo) return;
  wrap.innerHTML = '<div class="dl-loading"><div class="dl-spinner"></div>История изменений…</div>';
  try {
    const releases = await ghJSON(`https://api.github.com/repos/${repo}/releases?per_page=6`);
    const shown = (Array.isArray(releases) ? releases : []).slice(0, 5);
    if (!shown.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = shown.map(r => `
      <div class="changelog-item">
        <div class="changelog-date">${esc(fmtDate(r.published_at))} · ${esc((r.tag_name || '').replace(/^v/i, ''))}</div>
        <div class="changelog-title">${esc(r.name || r.tag_name || 'Релиз')}</div>
        <div class="changelog-desc">${esc((r.body || 'Подробности в описании релиза на GitHub.').split('\n').slice(0, 4).join(' ').slice(0, 280))}</div>
        <a href="${esc(r.html_url)}" target="_blank" rel="noopener" style="font-size:13px;color:var(--accent2)">Открыть на GitHub →</a>
      </div>`).join('');
  } catch (e) { wrap.innerHTML = ''; }
}

/* ── Help blocks (steps + FAQ) from config ────────────────────────────────── */
function renderHelp(cfg) {
  const ht = document.getElementById('dl-howto');
  if (ht && cfg.help && cfg.help.steps) {
    ht.innerHTML = cfg.help.steps.map(s => `
      <div class="dl-howto-item reveal">
        <div class="dl-howto-num">${s.n}</div>
        <div class="dl-howto-title">${esc(s.title)}</div>
        <div class="dl-howto-text">${esc(s.text)}</div>
      </div>`).join('');
    revealObserve(ht);
  }
  const faq = document.getElementById('dl-faq');
  if (faq && cfg.help && cfg.help.faq) {
    faq.innerHTML = cfg.help.faq.map(f => `
      <div class="faq-item reveal">
        <button class="faq-q" onclick="toggleFaq(this)">${esc(f.q)}<span class="faq-arrow">▾</span></button>
        <div class="faq-a">${esc(f.a)}</div>
      </div>`).join('');
    revealObserve(faq);
  }
}

/* ── Boot ─────────────────────────────────────────────────────────────────── */
(async function () {
  let cfg;
  try {
    cfg = await (await fetch('clients.json')).json();
  } catch (e) {
    document.getElementById('dl-apps').innerHTML =
      '<div class="dl-error">Не удалось загрузить список приложений.</div>';
    return;
  }
  window.__cfg = cfg;
  renderApps(cfg);
  renderHelp(cfg);
})();
