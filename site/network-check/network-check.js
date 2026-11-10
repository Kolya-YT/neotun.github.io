/* NeoTUN Network Check — Globalping public API */
(() => {
  'use strict';
  const API = 'https://api.globalping.io/v1';
  const $ = id => document.getElementById(id);
  const form = $('check-form'), target = $('target'), type = $('test-type');
  const region = $('location'), limit = $('limit'), run = $('run');
  const progress = $('progress'), error = $('error'), results = $('results');
  let lastResult = null, pollHandle = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function showError(message) { error.textContent = message; error.classList.remove('hidden'); }
  function setProgress(title, status, message, pct) {
    progress.classList.remove('hidden');
    $('progress-title').textContent = title;
    $('progress-state').textContent = status;
    $('progress-message').textContent = message;
    $('progress-bar').style.width = pct + '%';
  }
  function isPublicTarget(input) {
    const value = input.trim();
    if (!value || value.length > 253 || /[\s/@?#]/.test(value) || /(^|\.)localhost$/i.test(value) || /\.local$/i.test(value)) return false;
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
      const p = value.split('.').map(Number), [a,b] = p;
      if (p.some(n => n > 255)) return false;
      return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168));
    }
    return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(value) && value.includes('.') && !value.includes('..');
  }
  async function request(path, options = {}) {
    const response = await fetch(API + path, { ...options, headers: { 'Content-Type':'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data.error?.message || data.message || (response.status === 429 ? 'Лимит запросов Globalping исчерпан. Попробуйте позже.' : 'Globalping вернул HTTP ' + response.status);
      throw new Error(detail);
    }
    return { data, response };
  }
  function getMeasurementId(data, response) {
    const header = response.headers.get('Location');
    const fromHeader = header && header.match(/\/measurements\/([^/?#]+)/);
    return data.id || (fromHeader && fromHeader[1]) || data.measurement?.id || null;
  }
  function normalize(data) {
    const list = data.results || [];
    return list.map(item => {
      const p = item.probe || {}, r = item.result || {};
      const status = r.status || item.status || 'unknown';
      let value = '—';
      if (r.stats?.rtt?.avg != null) value = Number(r.stats.rtt.avg).toFixed(2) + ' ms';
      else if (r.avg != null) value = r.avg + ' ms';
      else if (r.resolvedAddress) value = r.resolvedAddress;
      else if (r.rawOutput) value = String(r.rawOutput).split('\n').slice(0,2).join(' · ');
      else if (r.status) value = r.status;
      return {
        point: [p.city,p.country].filter(Boolean).join(', ') || 'Измерительная точка',
        country: p.country || '—',
        network: p.network || (p.asn ? 'AS' + p.asn : '—'),
        value, status, ok: status === 'finished' || status === 'success'
      };
    });
  }
  function render(data) {
    lastResult = data;
    const rows = normalize(data), finished = rows.filter(r => r.ok).length;
    const avg = rows.map(r => parseFloat(r.value)).filter(Number.isFinite);
    const average = avg.length ? (avg.reduce((a,b)=>a+b,0)/avg.length).toFixed(1) + ' ms' : '—';
    $('result-subtitle').textContent = target.value + ' · ' + type.value.toUpperCase() + ' · Globalping';
    $('summary').innerHTML = [
      ['Результатов',rows.length],
      ['Успешно завершено',rows.length ? finished + ' / ' + rows.length : '—'],
      ['Среднее значение',average]
    ].map(([k,v])=>'<div class="metric"><small>'+esc(k)+'</small><strong>'+esc(v)+'</strong></div>').join('');
    $('result-rows').innerHTML = rows.length ? rows.map(r=>'<tr><td>'+esc(r.point)+'</td><td>'+esc(r.country)+'</td><td>'+esc(r.network)+'</td><td>'+esc(r.value)+'</td><td><span class="status '+(r.ok?'':'bad')+'">'+esc(r.status)+'</span></td></tr>').join('') : '<tr><td colspan="5">Результатов пока нет. Откройте исходный ответ ниже.</td></tr>';
    $('raw-output').textContent = JSON.stringify(data,null,2);
    results.classList.remove('hidden');
  }
  async function poll(id, started) {
    const {data} = await request('/measurements/' + encodeURIComponent(id));
    if (data.status && data.status !== 'in-progress') {
      setProgress('Проверка завершена',data.status,'Результаты получены от внешних исполнителей.',100);
      render(data); finish(); return;
    }
    if (Date.now() - started > 90000) throw new Error('Превышено время ожидания. Проверьте позже или запустите новый тест.');
    setProgress('Измерение выполняется','В работе','Получаем ответы из выбранных регионов…',Math.min(90,20 + Math.round((Date.now()-started)/90000*65)));
    // Globalping documents polling at a maximum of two requests per second per measurement.
    pollHandle = setTimeout(()=>poll(id,started).catch(fail),1200);
  }
  function finish() { clearTimeout(pollHandle); run.disabled=false; run.querySelector('span').textContent='Запустить снова'; }
  function fail(err) {
    finish();
    setProgress('Проверка не завершена','Ошибка','Не удалось получить полный результат.',100);
    showError(err.message || 'Неизвестная ошибка.');
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    clearTimeout(pollHandle); error.classList.add('hidden'); results.classList.add('hidden');
    const value = target.value.trim().replace(/^https?:\/\//i,'').replace(/\/$/,'');
    if (!isPublicTarget(value)) { showError('Укажите публичный домен или IPv4-адрес. Локальные и частные адреса не поддерживаются.'); return; }
    if (type.value === 'dns' && /^\d/.test(value)) { showError('Для DNS-проверки укажите доменное имя.'); return; }
    target.value = value; run.disabled=true; run.querySelector('span').textContent='Запускаем…';
    setProgress('Создание измерения','Подключение','Отправляем задание в глобальную сеть измерений…',12);
    try {
      const payload = { type:type.value, target:value, locations:[{magic:region.value,limit:Number(limit.value)}], inProgressUpdates:true };
      const {data,response} = await request('/measurements',{method:'POST',body:JSON.stringify(payload)});
      const id = getMeasurementId(data,response);
      if (!id) throw new Error('API не вернул ID измерения или Location header.');
      setProgress('Задание принято','В очереди','ID измерения: '+id,25);
      await poll(id,Date.now());
    } catch (err) { fail(err); }
  });
  $('copy-results').addEventListener('click', async () => {
    if (!lastResult) return;
    try { await navigator.clipboard.writeText(JSON.stringify(lastResult,null,2)); $('copy-results').textContent='Скопировано ✓'; }
    catch { $('copy-results').textContent='Не удалось скопировать'; }
    setTimeout(()=>$('copy-results').textContent='Копировать JSON',1600);
  });
})();