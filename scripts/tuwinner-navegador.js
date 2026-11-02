// Tu Winner al sistema (pedido de Hernán, 2 nov 2026): en app.tuwinner.com, con la sesión de Ecomfive, lee los productos ganadores de Panamá y México
// (los que Tu Winner marca con «ventas diarias») con su ID de Dropi, precio, proveedor, plataforma, stock y el stock de cada día de la última semana, y los sube
// a la dirección firmada que da el sistema. Solo lee: no cambia nada en Tu Winner. La sesión (el token de Tu Winner) no sale de la página.
// Lo corre la extensión «Ecomfive · Dropi» (lector `tuwinner`, copia exacta en extension/ecomfive-dropi/lectores/tuwinner.js) o, a mano, la consola:
//   leerTuWinner({ tuwinner: "<dirección firmada>" }); "iniciado"
//   JSON.stringify(window.__tuwinner)
// México va por la ruta «mex» de su API (no «mx»). Costa Rica no está en Tu Winner.

async function leerTuWinner(subida) {
  const estado = (window.__tuwinner = { fase: "inicio", productos: 0, inicio: new Date().toISOString(), fin: null, resultado: null, error: null });
  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
  try {
    const token = localStorage.getItem("old_user_t");
    if (!token || location.pathname.startsWith("/auth")) throw new Error("No hay sesión de Tu Winner en esta página: entra con la cuenta de Ecomfive.");
    const RUTAS = { PA: "pa", MX: "mex" };
    const salida = { leido_en: new Date().toISOString(), paises: {} };
    for (const [pais, ruta] of Object.entries(RUTAS)) {
      estado.fase = pais;
      const items = [];
      for (let pagina = 1; pagina <= 20; pagina++) {
        const q = new URLSearchParams({ expand: "product.supplier.platform", sort: "-difference", page: String(pagina), perPage: "50", filter: "(daily_sells = true)" });
        let r = null;
        for (let intento = 0; intento < 3 && !r; intento++) {
          r = await fetch(`https://api.tuwinner.com/${ruta}/api/collections/sales_7_day/records?${q}`, { headers: { token } }).catch(() => null);
          if (!r) await espera(3000);
        }
        if (!r) throw new Error(`Tu Winner no respondió (${pais}).`);
        if (r.status === 401 || r.status === 403) throw new Error("La sesión de Tu Winner venció: vuelve a entrar con la cuenta de Ecomfive.");
        if (!r.ok) throw new Error(`Tu Winner respondió ${r.status} (${pais}).`);
        const j = await r.json();
        for (const it of j.items || []) {
          const p = (it.expand && it.expand.product) || {};
          const s = (p.expand && p.expand.supplier) || {};
          const pl = (s.expand && s.expand.platform) || {};
          items.push({
            tw_id: it.id,
            dropi_id: String(it.internal_id || p.internal_id || ""),
            nombre: it.name || p.name || "",
            precio: it.price ?? p.price ?? null,
            sugerido: p.suggested_price ?? null,
            proveedor: s.name || null,
            proveedor_id: s.internal_id ? String(s.internal_id) : null,
            plataforma: pl.name || null,
            categoria: p.categories_names || null,
            stock: it.latest_quantity ?? null,
            ventas7: it.difference ?? null,
            imagen_v: p.image_version || 0,
            dias: (it.entries_json || []).map((e) => [String(e.date).slice(0, 10), Number(e.countNumber)]),
          });
        }
        estado.productos += (j.items || []).length;
        if (pagina >= (j.totalPages || 1)) break;
        await espera(700);
      }
      salida.paises[pais] = items;
    }
    estado.fase = "subida";
    const r = await fetch(subida.tuwinner, { method: "PUT", headers: { "x-upsert": "true", "content-type": "application/json" }, body: new Blob([JSON.stringify(salida)], { type: "application/json" }) });
    if (!r.ok) throw new Error(`No se pudo pasar la lectura al sistema (${r.status}).`);
    estado.resultado = Object.fromEntries(Object.entries(salida.paises).map(([k, v]) => [k, v.length]));
  } catch (e) {
    estado.error = String((e && e.message) || e);
  }
  estado.fase = "listo";
  estado.fin = new Date().toISOString();
  return estado;
}
