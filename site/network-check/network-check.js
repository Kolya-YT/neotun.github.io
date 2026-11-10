'use strict';
(() => {
  const API = 'https://api.globalping.io/v1';
  const form = document.getElementById('check-form');
  const targetEl = document.getElementById('target');
  const typeEl = document.getElementById('test-type');
  const locationEl = document.getElementById('location');
  const limitEl = document.getElementById('limit');
  const runBtn = document.getElementById('run');
  const progress = document.getElementById('progress');
  const errorBox = document.getElementById('error');
  const results = document.getElementById('results');
  const progressTitle = document.getElementById('progress-title');
  const progressState = document.getElementById('progress-state');
  const progressMessage = document.getElementById('progress-message');
  const progressBar = document.getElementById('progress-bar');
  const $ = id => document.getElementById(id);
  let lastResult = null;
  let pollTimer = null;

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
  }
  function setProgress(title, state, message, percent) {
    progress.classList.remove('hidden');
    progressTitle.textContent = title;
    progressState.textContent = state;
    progressMessage.textContent = message;
    progressBar.style.width = percent + '%';
  }
  function validTarget(value) {
    if (!value || value.length > 253 || /[\s/@?#]/.test(value)) return false;
    if (/^(localhost|.*\.localhost|.*\.local)$/i.test(value)) return false;
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
      const p = value.split('.').map(Number);
      if (p.some(n => n > 255)) return false;
      const [a,b] = p;
      return !(a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224);
    }
    return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(value) && value.includes('.') && !value.includes('..');
  }
  function locationValue() {
    const value = locationEl.value;
    if (value === 'world') return 'World';
    return value;
  }
  async function api(path, options) {
    const response = await fetch(API + path, { ...options, headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message || body.message || 'Globalping API вернул HTTP ' + response.status);
    return body;
  }
  function extractRows(data) {
    const measurements = data.measurements || data.results || [];
    return measurements.map(item => {
      const probe = item.probe || item.location || {};
      const result = item.result || {};
      let value = '—';
      if (typeof result === 'string') value = result.slice(0, 160);
      else if (result.avg !== undefined) value = result.avg + ' ms';
      else if (result.rtt !== undefined) value = result.rtt + ' ms';
      else if (result.status !== undefined) value = String(result.status);
      else if (result.resolvedAddress) value = result.resolvedAddress;
      else if (result.rawOutput) value = String(result.rawOutput).slice(0, 160);
      const ok = item.status === 'finished' || item.status === 'success' || result.status === 'success';
      return { probe: probe.name || probe.city || probe.network || 'Измерительная точка', country: probe.country || probe.region || 'Не указано', provider: probe.network || probe.asn || 'Globalping', value, ok, status: item.status || (ok ? 'success' : 'unknown') };
    });
  }
  function render(data) {
    lastResult = data;
    const rows = extractRows(data);
    const successes = rows.filter(x => x.ok).length;
    const values = rows.map(x => Number.parseFloat(x.value)).filter(Number.isFinite);
    const avg = values.length ? (values.reduce((a,b)=>a+b,0)/values.length).toFixed(1) : '—';
    $('result-subtitle').textContent = targetEl.value + ' · ' + typeEl.value.toUpperCase() + ' · источник: Globalping';
    $('summary').innerHTML = [
      ['Получено результатов', rows.length],
      ['Успешные ответы', rows.length ? successes + '/' + rows.length : '—'],
      ['Среднее значение', avg === '—' ? '—' : avg + ' ms']
    ].map(([label,value]) => '<div class="metric"><small>' + label + '</small><strong>' + value + '</strong></div>').join('');
    $('result-rows').innerHTML = rows.length ? rows.map(row => '<tr><td>' + escapeHtml(row.probe) + '</td><td>' + escapeHtml(row.country) + '</td><td>' + escapeHtml(String(row.provider)) + '</td><td>' + escapeHtml(row.value) + '</td><td><span class="status ' + (row.ok ? '' : 'bad') + '">' + escapeHtml(row.status) + '</span></td></tr>').join('') : '<tr><td colspan="5">Поставщик не вернул нормализованные результаты. Проверьте исходный ответ ниже.</td></tr>';
    $('raw-output').textContent = JSON.stringify(data, null, 2);
    results.classList.remove('hidden');
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  async function poll(id, deadline) {
    const data = await api('/measurements/' + encodeURIComponent(id));
    const status = data.status || 'in-progress';
    if (status === 'finished' || status === 'failed' || status === 'error') {
      const finalData = data.results ? data : await api('/measurements/' + encodeURIComponent(id) + '/results');
      setProgress('Проверка завершена', status, 'Получены результаты внешних измерительных точек.', 100);
      render(finalData);
      runBtn.disabled = false;
      runBtn.querySelector('span').textContent = 'Запустить снова';
      return;
    }
    if (Date.now() > deadline) throw new Error('Проверка выполняется дольше ожидаемого. Попробуйте открыть её позже или запустить снова.');
    const percent = Math.min(90, 20 + Math.floor((Date.now() - (deadline - 90000)) / 90000 * 65));
    setProgress('Измерение выполняется', status, 'Ожидаем ответы от распределённых точек…', percent);
    pollTimer = setTimeout(() => poll(id, deadline).catch(fail), 2500);
  }
  function fail(error) {
    clearTimeout(pollTimer);
    runBtn.disabled = false;
    runBtn.querySelector('span').textContent = 'Повторить проверку';
    setProgress('Не удалось завершить проверку', 'Ошибка', 'Проверьте соединение и повторите запрос.', 100);
    showError(error.message || 'Неизвестная ошибка API');
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    clearTimeout(pollTimer);
    errorBox.classList.add('hidden');
    results.classList.add('hidden');
    const target = targetEl.value.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
    if (!validTarget(target)) return showError('Укажите корректный публичный домен или публичный IPv4-адрес. Локальные и приватные адреса не допускаются.');
    if (typeEl.value === 'dns' && /^\d/.test(target)) return showError('Для DNS-проверки укажите доменное имя.');
    targetEl.value = target;
    runBtn.disabled = true;
    runBtn.querySelector('span').textContent = 'Запускаем…';
    setProgress('Создание измерения', 'Подключение', 'Отправляем задание в Globalping…', 12);
    try {
      const payload = { type: typeEl.value, target, locations: [{limit: Number(limitEl.value), magic: locationValue()}], measurementOptions: {protocol: 'ICMP'} };
      const created = await api('/measurements', { method: 'POST', body: JSON.stringify(payload) });
      const id = created.id || created.measurement?.id;
      if (!id) throw new Error('Globalping не вернул идентификатор измерения.');
      setProgress('Измерение создано', 'В очереди', 'ID измерения: ' + id + '. Ожидаем результаты…', 25);
      await poll(id, Date.now() + 120000);
    } catch (error) { fail(error); }
  });
  $('copy-results').addEventListener('click', async () => {
    if (!lastResult) return;
    try { await navigator.clipboard.writeText(JSON.stringify(lastResult, null, 2)); $('copy-results').textContent = 'Скопировано ✓'; }
    catch { $('copy-results').textContent = 'Копирование недоступно'; }
    setTimeout(() => $('copy-results').textContent = 'Копировать JSON', 1800);
  });
})();