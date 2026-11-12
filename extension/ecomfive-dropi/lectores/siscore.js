// SISCORE (portal de clientes de Servientrega Panamá) al sistema (pedido de Hernán, 12 nov 2026): en servientrega-clientes.appsiscore.com, con la
// sesión que la persona abrió (cuenta de la tienda, Kenku primero), lee el informe de guías de los últimos `dias` días (infgen.php) y el rastreo de cada
// guía (guiaa.php: cada paso con fecha y hora, y lo que se cobra), y lo sube a la dirección firmada que da el sistema.
// **SOLO LECTURA**: solo consultas (informe y rastreo). Nunca anula, crea guías, recolecciones ni confirmaciones. La sesión (cookie) no sale de la página.
// Lo corre la extensión «Ecomfive · Dropi» (lector `siscore`) o, a mano, la consola de la pestaña de SISCORE:
//   leerSiscore({ siscore: "<dirección firmada>" }, { pedidos: 45 }); "iniciado"
//   JSON.stringify(window.__siscore)

async function leerSiscore(subida, dias) {
  const estado = (window.__siscore = { fase: "inicio", productos: 0, hechos: 0, inicio: new Date().toISOString(), fin: null, resultado: null, error: null });
  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const BASE = "/app/app-cliente/";
  // Las páginas dicen UTF-8 pero algunas traen las tildes en Windows-1252: se prueba UTF-8 y, si no es, Windows-1252.
  const html = async (r) => {
    const b = new Uint8Array(await r.arrayBuffer());
    let t;
    try {
      t = new TextDecoder("utf-8", { fatal: true }).decode(b);
    } catch {
      t = new TextDecoder("windows-1252").decode(b);
    }
    return new DOMParser().parseFromString(t, "text/html");
  };
  const limpio = (s) => (s || "").replace(/\s+/g, " ").trim();
  const filas = (tabla) => [...tabla.rows].map((r) => [...r.cells].map((c) => limpio(c.innerText || c.textContent)));
  const aDia = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  const traer = async (url, init) => {
    for (let intento = 0; intento < 3; intento++) {
      const r = await fetch(url, { credentials: "include", ...init }).catch(() => null);
      if (r && r.ok) {
        // Sin sesión, SISCORE manda a la página de entrar.
        if (/\/index\.php$/.test(new URL(r.url).pathname) && !/index\.php/.test(url)) throw new Error("La sesión de SISCORE venció: vuelve a entrar con la cuenta de la tienda.");
        return r;
      }
      await espera(2000);
    }
    throw new Error("SISCORE no respondió.");
  };
  try {
    if (!location.pathname.startsWith(BASE) || /index\.php$/.test(location.pathname)) throw new Error("No hay sesión de SISCORE en esta página: entra con la cuenta de la tienda.");
    // El cliente (la tienda) de la cuenta: «sent=KENKU» en la dirección, o lo que dice la búsqueda.
    let cliente = new URLSearchParams(location.search).get("sent");
    if (!cliente) {
      const d = await html(await traer(`${BASE}busqueda.php`));
      const m = limpio(d.body.innerText).match(/Destinatario\s+([A-Z0-9 ._-]{2,40}?)\s+Volver/);
      cliente = m ? m[1].trim() : null;
    }
    if (!cliente) throw new Error("No se pudo saber de qué tienda es la cuenta de SISCORE.");
    const n = Number(dias && dias.pedidos) > 0 ? Math.min(120, Number(dias.pedidos)) : 45;
    const hasta = aDia(new Date());
    const desde = aDia(new Date(Date.now() - (n - 1) * 86400000));

    // 1. El informe de guías del periodo (todas: entregadas, devueltas y pendientes).
    estado.fase = "informe";
    const d = await html(await traer(`${BASE}infgen.php?criterio=${encodeURIComponent(cliente)}&finicio=${desde}&ffinal=${hasta}&tinf=%25`));
    const tabla = [...d.querySelectorAll("table")].sort((a, b) => b.rows.length - a.rows.length)[0];
    const todas = tabla ? filas(tabla) : [];
    const i = todas.findIndex((f) => f.some((x) => /^Nro\.? ?Gu[ií]a$/i.test(x)));
    if (i < 0) throw new Error("El informe de guías de SISCORE cambió de forma.");
    const cab = todas[i].map((x) => x.toLowerCase());
    const col = (re) => cab.findIndex((x) => re.test(x));
    const C = { cliente: col(/^cliente/), guia: col(/gu[ií]a/), factura: col(/factura/), destino: col(/destino/), servicio: col(/referencia/), proceso: col(/proceso/), estado: col(/^estado$/), fechaEstado: col(/fecha estado/), emision: col(/emisi/) };
    const guias = [];
    for (const f of todas.slice(i + 1)) {
      const g = f[C.guia];
      if (!g || !/^[0-9A-Za-z-]{4,40}$/.test(g)) continue;
      // Sin el nombre ni la dirección del destinatario (no hacen falta: el cliente ya está en el pedido).
      guias.push({
        guia: g,
        cliente: f[C.cliente] || cliente,
        factura: f[C.factura] || null,
        destino: f[C.destino] || null,
        servicio: f[C.servicio] || null,
        proceso: f[C.proceso] || null,
        estado: f[C.estado] || null,
        fecha_estado: f[C.fechaEstado] || null,
        fecha_emision: f[C.emision] || null,
        recaudo: null,
        historial: [],
      });
    }
    estado.productos = guias.length;

    // 2. El rastreo de cada guía (de a 3 a la vez): los pasos con fecha y hora, y lo que se cobra.
    estado.fase = "rastreo";
    let siguiente = 0;
    const trabajar = async () => {
      while (siguiente < guias.length) {
        const g = guias[siguiente++];
        try {
          const r = await traer(`${BASE}guiaa.php`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ guia: g.guia }) });
          const p = await html(r);
          // Las tablas pueden traer filas vacías antes del encabezado: se busca la fila del encabezado en cada una.
          for (const t of p.querySelectorAll("table")) {
            const fs = filas(t);
            const ih = fs.findIndex((x) => x[0] === "Estado" && x[1] === "Fecha");
            if (ih >= 0) g.historial = fs.slice(ih + 1).filter((x) => x[0] && /^\d{4}-\d{2}-\d{2}$/.test(x[1] || "")).map((x) => ({ estado: x[0], fecha: x[1], hora: x[2] || null }));
            const ir = fs.findIndex((x) => x.some((c) => /^recaudo$/i.test(c)));
            if (ir >= 0 && fs[ir + 1]) {
              const k = fs[ir].findIndex((c) => /^recaudo$/i.test(c));
              const v = Number(String(fs[ir + 1][k] || "").replace(/,/g, ""));
              if (Number.isFinite(v)) g.recaudo = v;
            }
          }
        } catch (e) {
          if (/sesi[oó]n/i.test(String(e && e.message))) throw e;
        }
        estado.hechos++;
        await espera(150);
      }
    };
    await Promise.all([trabajar(), trabajar(), trabajar()]);

    estado.fase = "subida";
    const salida = { leido_en: new Date().toISOString(), cliente, desde, hasta, guias };
    const r = await fetch(subida.siscore, { method: "PUT", headers: { "x-upsert": "true", "content-type": "application/json" }, body: new Blob([JSON.stringify(salida)], { type: "application/json" }) });
    if (!r.ok) throw new Error(`No se pudo pasar la lectura al sistema (${r.status}).`);
    estado.resultado = { cliente, guias: guias.length, conRastreo: guias.filter((g) => g.historial.length).length };
  } catch (e) {
    estado.error = String((e && e.message) || e);
  } finally {
    estado.fase = "fin";
    estado.fin = new Date().toISOString();
  }
}
