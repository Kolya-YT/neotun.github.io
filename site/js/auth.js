'use strict';

const BASE = 'https://app.neotun.ru';
const API = BASE + '/api/v1';
const APP_URL = BASE + '/';

const _planParam = new URLSearchParams(window.location.search).get('plan') || '';
const _planHash = _planParam ? '&plan=' + encodeURIComponent(_planParam) : '';

const steps = {
  choose: document.getElementById('step-choose'),
  email:  document.getElementById('step-email'),
  otp:    document.getElementById('step-otp'),
};

function showStep(name) {
  Object.values(steps).forEach(s => s?.classList.add('hidden'));
  steps[name]?.classList.remove('hidden');
  const progress = { choose: 33, email: 66, otp: 100 };
  const fill = document.getElementById('auth-steps-fill');
  const label = document.getElementById('auth-steps-label');
  const stepNum = { choose: 1, email: 2, otp: 3 };
  if (fill) { fill.style.width = (progress[name] || 0) + '%'; }
  if (label) { label.textContent = 'Шаг ' + (stepNum[name] || 1) + ' из 3'; }
}

// ── Telegram Login ────────────────────────────────────────────────────────────
(async () => {
  const tg = window.Telegram?.WebApp;
  if (tg?.initData) { loginWithTelegram(tg.initData); return; }

  // Handle callback params (redirect from /auth/telegram/callback)
  const urlParams = new URLSearchParams(window.location.search);
  const jwt = urlParams.get('jwt');
  if (jwt) {
    localStorage.setItem('jwt_token', jwt);
    window.location.href = APP_URL + '#jwt=' + encodeURIComponent(jwt) + _planHash;
    return;
  }
  const err = urlParams.get('error');
  if (err) {
    const msgs = { expired: 'Сессия истекла', banned: 'Аккаунт заблокирован', invalid_signature: 'Ошибка подписи' };
    showToast(msgs[err] || 'Ошибка: ' + err, 'error');
  }

  try {
    const r = await fetch(API + '/bot-info');
    const d = await r.json();
    const username = (d.bot_username || '').replace(/^@/, '').trim();
    const botId = d.bot_id || '';
    const btnOpen = document.getElementById('btn-tg-open');
    const wrap = document.getElementById('tg-widget-wrap');

    if (!username) {
      if (btnOpen) btnOpen.style.display = 'none';
      if (wrap) wrap.style.display = 'none';
      return;
    }

    // Hide old button, show widget area
    if (btnOpen) btnOpen.style.display = 'none';
    if (wrap) wrap.style.display = 'block';

    const container = document.getElementById('tg-login-widget');
    if (!container) return;

    // New Telegram Login library (https://core.telegram.org/bots/telegram-login)
    const loginScript = document.createElement('script');
    loginScript.src = 'https://telegram.org/js/telegram-login.js';
    loginScript.async = true;
    loginScript.onload = () => {
      if (!window.Telegram?.Login) {
        _showTgFallback(wrap, btnOpen, username);
        return;
      }
      // Create login button container
      const btn = document.createElement('div');
      btn.id = '_tg-login-btn';
      container.appendChild(btn);

      window.Telegram.Login.init(
        {
          client_id: parseInt(botId),
          request_access: ['write'],
          lang: 'ru',
        },
        async (data) => {
          if (data.error) {
            showToast('Ошибка Telegram: ' + data.error, 'error');
            return;
          }
          // Send id_token to backend for verification
          try {
            const r = await fetch(BASE + '/auth/telegram/oidc', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id_token: data.id_token, user: data.user }),
            });
            const d = await r.json().catch(() => ({}));
            if (d.ok) {
              localStorage.setItem('jwt_token', d.token);
              window.location.href = APP_URL + '#jwt=' + encodeURIComponent(d.token) + _planHash;
            } else {
              showToast('Ошибка: ' + (d.error || 'unknown'), 'error');
            }
          } catch(e) { showToast('Ошибка сети', 'error'); }
        }
      );

      // Render the login button
      const loginBtn = document.createElement('button');
      loginBtn.className = 'btn btn-primary btn-full btn-lg';
      loginBtn.style.marginBottom = '12px';
      loginBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg> Войти через Telegram`;
      loginBtn.onclick = () => window.Telegram.Login.open();
      container.appendChild(loginBtn);
    };
    loginScript.onerror = () => _showTgFallback(wrap, btnOpen, username);
    document.head.appendChild(loginScript);
  } catch(e) {
    console.error('[TG] Error:', e);
  }
})();

function _showTgFallback(wrap, btnOpen, username) {
  if (wrap) wrap.style.display = 'none';
  if (btnOpen) {
    btnOpen.textContent = '🔗 Войти через Telegram';
    btnOpen.onclick = () => { window.location.href = `https://t.me/${username}`; };
    btnOpen.style.display = '';
  }
}

// Called by old widget (data-onauth) — kept for compatibility
window.onTelegramAuth = async function(user) {
  try {
    const r = await fetch(BASE + '/auth/telegram/widget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });
    const d = await r.json().catch(() => ({}));
    if (d.ok) {
      localStorage.setItem('jwt_token', d.token);
      window.location.href = APP_URL + '#jwt=' + encodeURIComponent(d.token) + _planHash;
    } else {
      showToast('Ошибка: ' + (d.error || 'unknown'), 'error');
    }
  } catch(e) { showToast('Ошибка сети', 'error'); }
};

async function loginWithTelegram(initData) {
  try {
    const r = await fetch(BASE + '/auth/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ init_data: initData }),
    });
    const d = await r.json();
    if (d.ok) {
      localStorage.setItem('jwt_token', d.token);
      window.location.href = APP_URL + '#jwt=' + encodeURIComponent(d.token) + _planHash;
    } else {
      showToast('Ошибка Telegram-авторизации: ' + d.error, 'error');
    }
  } catch { showToast('Ошибка сети', 'error'); }
}

// ── Email flow ────────────────────────────────────────────────────────────────
document.getElementById('btn-email-start')?.addEventListener('click', () => showStep('email'));
document.getElementById('btn-back-email')?.addEventListener('click', () => showStep('choose'));
document.getElementById('btn-back-otp')?.addEventListener('click', () => showStep('email'));

let _currentEmail = '';

document.getElementById('btn-send-otp')?.addEventListener('click', sendOtp);
document.getElementById('email-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendOtp(); });

async function sendOtp() {
  const emailInput = document.getElementById('email-input');
  const errEl = document.getElementById('email-error');
  const email = emailInput.value.trim().toLowerCase();
  errEl.classList.add('hidden');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = 'Введите корректный email';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('btn-send-otp');
  btn.classList.add('btn-loading'); btn.disabled = true;

  try {
    const r = await fetch(BASE + '/auth/email/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const d = await r.json();
    if (d.ok) {
      _currentEmail = email;
      document.getElementById('otp-email').textContent = email;
      showStep('otp');
      startResendTimer();
    } else {
      const msgs = { rate_limited: 'Слишком много запросов. Подождите час.', invalid_email: 'Некорректный email' };
      errEl.textContent = msgs[d.error] || 'Ошибка: ' + d.error;
      errEl.classList.remove('hidden');
    }
  } catch {
    errEl.textContent = 'Ошибка сети';
    errEl.classList.remove('hidden');
  } finally {
    btn.classList.remove('btn-loading'); btn.disabled = false;
  }
}

// ── OTP verify ────────────────────────────────────────────────────────────────
document.getElementById('btn-verify-otp')?.addEventListener('click', verifyOtp);
document.getElementById('otp-input')?.addEventListener('input', function() {
  this.value = this.value.replace(/\D/g, '').slice(0, 6);
});
document.getElementById('otp-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') verifyOtp(); });

async function verifyOtp() {
  const code = document.getElementById('otp-input').value.trim();
  const errEl = document.getElementById('otp-error');
  errEl.classList.add('hidden');

  if (code.length !== 6) {
    errEl.textContent = 'Введите 6-значный код';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('btn-verify-otp');
  btn.classList.add('btn-loading'); btn.disabled = true;

  try {
    const r = await fetch(BASE + '/auth/email/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: _currentEmail, code }),
    });
    const d = await r.json();
    if (d.ok) {
      localStorage.setItem('jwt_token', d.token);
      window.location.href = APP_URL + '#jwt=' + encodeURIComponent(d.token) + _planHash;
    } else {
      const msgs = {
        invalid: 'Неверный код', expired: 'Код истёк — запросите новый',
        max_attempts: 'Слишком много попыток', blocked: 'Временная блокировка.',
        not_found: 'Код не найден — запросите новый',
      };
      errEl.textContent = msgs[d.error] || 'Ошибка: ' + d.error;
      errEl.classList.remove('hidden');
    }
  } catch {
    errEl.textContent = 'Ошибка сети';
    errEl.classList.remove('hidden');
  } finally {
    btn.classList.remove('btn-loading'); btn.disabled = false;
  }
}

// ── Resend timer ──────────────────────────────────────────────────────────────
function startResendTimer() {
  const btn = document.getElementById('btn-resend');
  const timerEl = document.getElementById('resend-timer');
  if (!btn || !timerEl) return;
  btn.disabled = true;
  let sec = 60;
  timerEl.textContent = sec;
  const iv = setInterval(() => {
    sec--;
    timerEl.textContent = sec;
    if (sec <= 0) { clearInterval(iv); btn.disabled = false; btn.textContent = 'Отправить повторно'; }
  }, 1000);
  btn.onclick = () => { clearInterval(iv); sendOtp(); };
}
