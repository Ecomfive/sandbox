// «Descubrir proveedores» (26 oct 2026): TODO el catálogo de Dropi del país de esta pestaña, con la sesión de un DROPSHIPPER (una
// cuenta de proveedor no ve el catálogo: Dropi responde 401). Por cada producto guarda lo justo para resumir por proveedor
// (src/lib/scraping/descubrir.ts): [id, proveedor, stock, creado, precio, nombre, foto]. Lo sube a la dirección firmada del sistema.
// Solo lee. Va despacio (Dropi permite unas 50 consultas por minuto). El avance queda en window.__catalogo.

async function leerCatalogo(subida) {
  const estado = (window.__catalogo = { fase: "catalogo", paginas: 0, productos: 0, inicio: new Date().toISOString(), fin: null, resultado: null, error: null });
  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
  try {
    const token = JSON.parse(localStorage.getItem("DROPI_token") || "null");
    const login = JSON.parse(localStorage.getItem("DROPI_LoginResult") || "{}");
    if (!token) throw new Error("No hay sesión de Dropi en esta página.");
    if (login?.objects?.type_user === "SUPPLIER") throw new Error("Esta sesión es de proveedor: el catálogo lo ve una cuenta de dropshipper.");
    const pais = login?.countries?.[0]?.name || "MEXICO";
    const api = location.hostname.replace(/^app\./, "api.");
    const proveedores = {};
    const productos = new Map();
    for (let desde = 0; desde < 300000; desde += 100) {
      let r;
      for (let intento = 0; intento < 6; intento++) {
        try {
          r = await fetch(`https://${api}/api/products/v4/index`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "x-authorization": "Bearer " + token },
            body: JSON.stringify({
              pageSize: 100, startData: desde, privated_product: false, userVerified: false, favorite: false, with_collection: true,
              get_stock: false, no_count: true, search_type: "simple", country: pais, order_by: "created_at", order_type: "desc",
            }),
          });
        } catch {
          await espera(5000);
          continue;
        }
        if (r.status === 401) throw new Error("La sesión de Dropi expiró (401).");
        if (r.status !== 429 && r.status < 500) break;
        await espera(r.status === 429 ? 30000 : 5000);
      }
      const j = r ? await r.json().catch(() => null) : null;
      if (!r || !r.ok || !j?.isSuccess) throw new Error(`Dropi respondió ${r ? r.status : 0} en la página ${desde / 100 + 1}.`);
      const objetos = j.objects || [];
      for (const o of objetos) {
        const prov = Number(o.user?.id);
        if (!prov) continue;
        if (o.user?.name) proveedores[prov] = o.user.name;
        const simple = (o.warehouse_product || []).reduce((a, w) => a + (Number(w.stock) || 0), 0);
        const variaciones = (o.variations || []).reduce((a, v) => a + (v.warehouse_product_variation || []).reduce((b, w) => b + (Number(w.stock) || 0), 0), 0);
        const g = (o.gallery || []).find((x) => x.main) || (o.gallery || [])[0];
        productos.set(o.id, [o.id, prov, simple + variaciones, String(o.created_at || "").slice(0, 10), o.sale_price === null || o.sale_price === undefined ? null : Number(o.sale_price), String(o.name || "").slice(0, 120), g ? g.urlS3 || g.url || null : null]);
      }
      estado.paginas++;
      estado.productos = productos.size;
      if (objetos.length < 100) break;
      await espera(1300);
    }
    estado.fase = "subida";
    const cuerpo = { pais: location.hostname.split(".").pop(), leido: new Date().toISOString(), proveedores, productos: [...productos.values()] };
    const r = await fetch(subida.catalogo, { method: "PUT", headers: { "x-upsert": "true", "content-type": "application/json" }, body: new Blob([JSON.stringify(cuerpo)], { type: "application/json" }) });
    if (!r.ok) throw new Error(`No se pudo subir la lectura (${r.status}).`);
    estado.resultado = { productos: productos.size, proveedores: Object.keys(proveedores).length, paginas: estado.paginas, segundos: Math.round((Date.now() - new Date(estado.inicio).getTime()) / 1000) };
  } catch (e) {
    estado.error = String(e?.message ?? e);
  }
  estado.fase = "listo";
  estado.fin = new Date().toISOString();
  return estado;
}
