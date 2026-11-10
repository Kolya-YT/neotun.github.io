const SOURCE_URL = "https://h1cloud.net/api/check-status.json";

export default async () => {
  try {
    const response = await fetch(SOURCE_URL, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return new Response(JSON.stringify({ ok: false, error: "Источник статусов временно недоступен" }), {
        status: 502,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    const payload = await response.json();
    if (!payload || !Array.isArray(payload.nodes)) {
      throw new Error("Unexpected status feed format");
    }

    // Only expose fields required by the browser checker. Never proxy arbitrary URLs.
    const nodes = payload.nodes
      .filter((node) =>
        node &&
        typeof node.name === "string" &&
        typeof node.host === "string" &&
        /^[a-z0-9.-]+$/i.test(node.host) &&
        Number.isInteger(Number(node.port)) &&
        Number(node.port) > 0 &&
        Number(node.port) <= 65535
      )
      .map((node) => ({
        name: node.name,
        host: node.host,
        port: Number(node.port),
        status: typeof node.status === "string" ? node.status : "unknown",
        rf_banned: node.rf_banned === true,
        ...(typeof node.probe === "string" && /^[a-z0-9.-]+$/i.test(node.probe) ? { probe: node.probe } : {}),
        ...(node.repair === true ? { repair: true } : {}),
        ...(Number.isFinite(Number(node.confirmed_tspu_until)) ? { confirmed_tspu_until: Number(node.confirmed_tspu_until) } : {}),
      }));

    return new Response(JSON.stringify({
      ok: true,
      updated: payload.updated ?? null,
      generated: payload.generated ?? null,
      max_age: payload.max_age ?? 600,
      nodes,
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=60",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: "Не удалось получить актуальный список локаций" }), {
      status: 502,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
};
