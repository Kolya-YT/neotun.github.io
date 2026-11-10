(() => {
  "use strict";
  const API = "/api/h1cloud-status";
  const $ = (id) => document.getElementById(id);
  const els = {
    run: $("runCheck"), copy: $("copyResult"), progress: $("progressLabel"),
    bar: $("progressBar"), available: $("availableCount"), unavailable: $("unavailableCount"),
    average: $("averagePing"), ip: $("visitorIp"), list: $("nodeList"),
    meta: $("listMeta"), updated: $("updatedAt"), theme: $("themeToggle"),
  };
  let nodes = [], results = [], visitorIp = "не определён", finished = false, running = false, statusSnapshot = null;

  const countryFlags = [
    ["финлянд","🇫🇮"],["польша","🇵🇱"],["нидерланд","🇳🇱"],["голланд","🇳🇱"],
    ["германи","🇩🇪"],["испан","🇪🇸"],["сша","🇺🇸"],["швейцар","🇨🇭"],
    ["литв","🇱🇹"],["эстон","🇪🇪"],["латв","🇱🇻"],["франц","🇫🇷"],
    ["швец","🇸🇪"],["турц","🇹🇷"],["израил","🇮🇱"],["беларус","🇧🇾"],
    ["казахстан","🇰🇿"],["япон","🇯🇵"],["британ","🇬🇧"],["чех","🇨🇿"],
    ["австри","🇦🇹"],["румын","🇷🇴"],["итал","🇮🇹"],["канад","🇨🇦"],
    ["сингапур","🇸🇬"],["гонконг","🇭🇰"],["нидерланды","🇳🇱"]
  ];
  const flagFor = (name) => {
    const lower = String(name || "").toLowerCase();
    const match = countryFlags.find(([part]) => lower.includes(part));
    return match ? match[1] : "🌐";
  };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const timeoutFetch = async (url, timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = performance.now();
    try {
      // no-cors intentionally mirrors H1Cloud: an opaque response means the
      // browser completed the network/TLS exchange even without readable CORS headers.
      await fetch(url, { mode: "no-cors", cache: "no-store", signal: controller.signal });
      return { ok: true, ping: Math.max(1, Math.round(performance.now() - started)) };
    } catch {
      return { ok: false, ping: null };
    } finally {
      clearTimeout(timer);
    }
  };
  const classify = (node, check) => {
    const now = Math.floor(Date.now() / 1000);
    if (check.ok) return { state: "ok", label: "Доступна", ping: check.ping };
    if (Number(node.confirmed_tspu_until) > now) return { state: "bad", label: "Заблокирована ТСПУ" };
    if (node.repair === true) return { state: "warn", label: "Перебои — чиним" };
    if (node.status === "down" || node.status === "offline") return { state: "bad", label: "Недоступна" };
    if (node.rf_banned === true) return { state: "bad", label: "Заблокирована ТСПУ" };
    if (node.status === "repair" || node.status === "degraded") return { state: "warn", label: "Перебои — чиним" };
    return { state: "unknown", label: "Не удалось проверить" };
  };
  const renderRow = (node, result, index) => {
    const status = result || { state: "unknown", label: "Ожидает проверки" };
    const ping = status.ping ? `<span class="node-ping"><i class="signal"></i>${status.ping} мс</span>` : "";
    return `<div class="node-row" data-index="${index}">
      <span class="flag">${flagFor(node.name)}</span>
      <div class="node-info"><div class="node-name">${escapeHtml(node.name)}</div><div class="node-host">${escapeHtml(node.host)}</div></div>
      ${ping}<span class="status ${status.state === "ok" ? "ok" : status.state === "bad" ? "bad" : status.state === "warn" ? "warn" : ""}">${escapeHtml(status.label)}</span>
    </div>`;
  };
  const renderAll = () => {
    els.list.innerHTML = nodes.map((n, i) => renderRow(n, results[i], i)).join("") || '<div class="empty-state">Список локаций пуст.</div>';
    const done = results.filter(Boolean);
    const good = done.filter(x => x.state === "ok");
    const bad = done.filter(x => x.state === "bad");
    const pings = good.map(x => x.ping).filter(Number.isFinite);
    els.available.textContent = finished ? good.length : (done.length ? good.length : "—");
    els.unavailable.textContent = finished ? bad.length : (done.length ? bad.length : "—");
    els.average.innerHTML = pings.length ? `${Math.round(pings.reduce((a,b)=>a+b,0)/pings.length)}<small> мс</small>` : "—";
    els.progress.textContent = `${done.length} / ${nodes.length}`;
    els.meta.textContent = `${nodes.length} локаций`;
    els.bar.style.width = nodes.length ? `${done.length / nodes.length * 100}%` : "0%";
    els.copy.disabled = !finished;
  };
  const loadVisitorIp = async () => {
    try {
      const response = await fetch("https://api.ipify.org?format=json", { cache: "no-store", signal: AbortSignal.timeout(5000) });
      const data = await response.json();
      visitorIp = data.ip || "не определён";
    } catch { visitorIp = "не удалось определить"; }
    els.ip.textContent = visitorIp;
  };
  const loadNodes = async () => {
    const response = await fetch(`${API}?t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("Не удалось загрузить список локаций");
    const data = await response.json();
    if (!data.ok || !Array.isArray(data.nodes)) throw new Error("Источник вернул некорректный список");
    // The feed is authoritative and dynamic: no local hard-coded node list.
    nodes = data.nodes;
    const updated = data.updated ? new Date(data.updated * 1000) : null;
    els.updated.textContent = updated && !Number.isNaN(updated.getTime())
      ? `Источник статусов обновлён: ${updated.toLocaleString("ru-RU", { dateStyle:"short", timeStyle:"short", timeZone:"UTC" })} UTC`
      : "Список локаций получен из актуального источника статусов.";
  };
  const workerPool = async (items, concurrency, task) => {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        await task(items[index], index);
      }
    });
    await Promise.all(workers);
  };
  const run = async () => {
    if (running) return;
    running = true; finished = false; results = new Array(nodes.length);
    els.run.disabled = true; els.copy.disabled = true;
    els.progress.textContent = "Проверка…"; renderAll();
    await workerPool(nodes, 6, async (node, index) => {
      const target = node.probe || node.host;
      let check = await timeoutFetch(`https://${target}:${node.port}/`, 8000);
      if (!check.ok) check = await timeoutFetch(`https://${target}:${node.port}/`, 5000);
      results[index] = classify(node, check);
      renderAll();
    });
    finished = true; running = false; els.run.disabled = false;
    els.progress.textContent = `${nodes.length} / ${nodes.length}`;
    renderAll();
  };
  const start = async () => {
    els.run.disabled = true; els.progress.textContent = "Загрузка списка…";
    try {
      await Promise.all([loadNodes(), loadVisitorIp()]);
      results = new Array(nodes.length); renderAll();
      await run();
    } catch (error) {
      els.list.innerHTML = `<div class="empty-state">${escapeHtml(error.message || "Ошибка загрузки")}. Попробуйте обновить страницу.</div>`;
      els.progress.textContent = "Ошибка";
      els.run.disabled = false; running = false;
    }
  };
  const summary = () => {
    const available = results.filter(x => x?.state === "ok");
    const unavailable = results.filter(x => x?.state === "bad");
    const pings = available.map(x => x.ping).filter(Number.isFinite);
    const lines = [
      `Проверка локаций H1Cloud — ${new Date().toISOString().replace("T"," ").slice(0,16)} UTC`,
      `IP: ${visitorIp}`,
      `Доступно (${available.length}): ${nodes.filter((n,i)=>results[i]?.state==="ok").map((n,i)=>n.name + " (" + results[nodes.indexOf(n)].ping + " мс)").join(", ") || "нет"}`,
      `Недоступно/проблемы (${unavailable.length}): ${nodes.filter((n,i)=>results[i]?.state==="bad" || results[i]?.state==="warn" || results[i]?.state==="unknown").map((n,i)=>n.name + " — " + results[nodes.indexOf(n)].label).join(", ") || "нет"}`,
      `Средний пинг: ${pings.length ? Math.round(pings.reduce((a,b)=>a+b,0)/pings.length) + " мс" : "нет данных"}`,
    ];
    return lines.join("\n");
  };
  els.copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(summary());
      els.copy.textContent = "Скопировано ✓";
      setTimeout(() => els.copy.textContent = "Скопировать результат", 1800);
    } catch { els.copy.textContent = "Не удалось скопировать"; }
  });
  els.run.addEventListener("click", start);
  els.theme.addEventListener("click", () => document.body.classList.toggle("light"));
  start();
})();