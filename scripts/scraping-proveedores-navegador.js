// Lo que corre DENTRO de la página de Dropi (con la sesión de un dropshipper ya iniciada) para leer todos los productos de un
// proveedor y mandarlos al receptor local (`npx tsx scripts/scraping-proveedores.ts recibir`). La sesión de Dropi nunca sale
// de la página: solo viajan los productos y las cifras del encabezado.
//
// Uso (en la consola de la página o con la herramienta del navegador de Claude):
//   await scrapingProveedor(3243, "http://127.0.0.1:4322/puente/<código que imprime el receptor>")
//   …la pestaña pasa al puente, que guarda la lectura y muestra el resultado.
//
// El navegador no deja que una página de internet llame directo a 127.0.0.1 (ni abrir otra pestaña sin un clic): por eso
// la pestaña navega al «puente» del receptor con la lectura en el fragmento de la dirección.
//
// Dropi deja 50 consultas por minuto: se espera 1,3 s entre páginas. Sin `order_by` el orden es aleatorio y las páginas se
// repiten; ordenado por fecha de creación (más recientes primero) sale cada producto una vez. Una página puede traer menos de
// 100 (Dropi filtra después de paginar): se sigue hasta que una llegue vacía.

async function scrapingProveedor(dropiId, puente) {
  const inicio = new Date();
  const t0 = performance.now();
  const token = JSON.parse(localStorage.getItem("DROPI_token") || "null");
  const login = JSON.parse(localStorage.getItem("DROPI_LoginResult") || "{}");
  if (!token) throw new Error("No hay sesión de Dropi en esta página.");
  const pais = login?.countries?.[0]?.name || "MEXICO";
  const host = login?.countries?.[0]?.code?.toLowerCase() || "";
  const api = location.hostname.replace(/^app\./, "api.");
  const apiV2 = location.hostname.replace(/^app\./, "api-v2.");
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

  const productos = new Map();
  const paginas = [];
  for (let desde = 0; desde < 10000; desde += 100) {
    let r;
    for (let intento = 0; intento < 3; intento++) {
      r = await fetch(`https://${api}/api/products/v4/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "x-authorization": "Bearer " + token },
        body: JSON.stringify({
          pageSize: 100, startData: desde, supplier_id: dropiId, privated_product: false, userVerified: false, favorite: false,
          with_collection: true, get_stock: false, no_count: true, search_type: "simple", country: pais,
          order_by: "created_at", order_type: "desc",
        }),
      });
      if (r.status !== 429) break;
      await pausa(30000);
    }
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.isSuccess) throw new Error(`Dropi respondió ${r.status} en la página ${desde / 100 + 1}`);
    const objetos = j.objects || [];
    paginas.push(objetos.length);
    for (const o of objetos) {
      productos.set(o.id, {
        id: o.id, sku: o.sku, name: o.name, type: o.type, sale_price: o.sale_price, suggested_price: o.suggested_price,
        privated_product: o.privated_product, created_at: o.created_at,
        gallery: (o.gallery || []).map((g) => ({ urlS3: g.urlS3, url: g.url, main: g.main })),
        categories: (o.categories || []).map((c) => ({ name: c.name })),
        warehouse_product: (o.warehouse_product || []).map((w) => ({ stock: w.stock })),
        variations: (o.variations || []).map((v) => ({ warehouse_product_variation: (v.warehouse_product_variation || []).map((w) => ({ stock: w.stock })) })),
      });
    }
    if (!objetos.length) break;
    await pausa(1300);
  }

  let metricas = null;
  try {
    const m = await fetch(`https://${apiV2}/indicators/supplier/${dropiId}/metrics`, {
      headers: { "X-Authorization": "Bearer " + token, "X-Host": host },
    }).then((x) => x.json());
    const d = m?.data;
    if (d) metricas = { productos: d.total_monthly_products, ordenes: d.total_monthly_orders, dropshippers: d.total_monthly_dropshippers };
  } catch {}
  // El título de la pestaña es «Proveedor: NOMBRE | Dropi».
  const nombre = /^Proveedor:\s*(.+?)\s*\|/.exec(document.title)?.[1] || null;

  const cuerpo = {
    dropiId, pais: location.hostname.split(".").pop(), url: location.href, nombre, inicio: inicio.toISOString(),
    duracionMs: Math.round(performance.now() - t0), paginas, metricas, productos: [...productos.values()],
  };
  // La lectura viaja comprimida en el fragmento (#) de la dirección del puente: el fragmento no sale del navegador y el
  // puente (127.0.0.1) la manda al receptor. La pestaña queda en el puente, que muestra el resultado.
  const gz = new Blob([JSON.stringify(cuerpo)]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(gz).arrayBuffer());
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const datos = btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  setTimeout(() => location.assign(`${puente}#${datos}`), 50);
  return { enviados: cuerpo.productos.length, paginas, duracionMs: cuerpo.duracionMs, kb: Math.round(datos.length / 1024) };
}

// Análisis de competencia: TODO el catálogo de Dropi del país de la sesión (sin proveedor), con el proveedor de cada
// producto. Se corre en cualquier página de app.dropi.<país> con la sesión de un DROPSHIPPER (una cuenta de proveedor no ve
// el catálogo: Dropi responde 401). Igual que arriba, la pestaña navega al puente del receptor con la lectura comprimida.
//   await scrapingCompetencia("http://127.0.0.1:4322/puente/<código>")
// Panamá, 14 oct 2026: 1.452 productos de 93 proveedores en unos 10 s.
async function scrapingCompetencia(puente) {
  const inicio = new Date();
  const t0 = performance.now();
  const token = JSON.parse(localStorage.getItem("DROPI_token") || "null");
  const login = JSON.parse(localStorage.getItem("DROPI_LoginResult") || "{}");
  if (!token) throw new Error("No hay sesión de Dropi en esta página.");
  const pais = login?.countries?.[0]?.name || "PANAMA";
  const api = location.hostname.replace(/^app\./, "api.");
  const productos = new Map();
  const paginas = [];
  for (let desde = 0; desde < 100000; desde += 100) {
    let r;
    for (let intento = 0; intento < 5; intento++) {
      r = await fetch(`https://${api}/api/products/v4/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "x-authorization": "Bearer " + token },
        body: JSON.stringify({
          pageSize: 100, startData: desde, privated_product: false, userVerified: false, favorite: false, with_collection: true,
          get_stock: false, no_count: true, search_type: "simple", country: pais, order_by: "created_at", order_type: "desc",
        }),
      });
      if (r.status !== 429) break;
      await new Promise((ok) => setTimeout(ok, 30000));
    }
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.isSuccess) throw new Error(`Dropi respondió ${r.status} en la página ${desde / 100 + 1}`);
    const objetos = j.objects || [];
    paginas.push(objetos.length);
    for (const o of objetos) {
      productos.set(o.id, {
        id: o.id, sku: o.sku, name: o.name, type: o.type, sale_price: o.sale_price, suggested_price: o.suggested_price,
        privated_product: o.privated_product, created_at: o.created_at, user: { id: o.user?.id, name: o.user?.name },
        gallery: (o.gallery || []).map((g) => ({ urlS3: g.urlS3, url: g.url, main: g.main })),
        categories: (o.categories || []).map((c) => ({ name: c.name })),
        warehouse_product: (o.warehouse_product || []).map((w) => ({ stock: w.stock })),
        variations: (o.variations || []).map((v) => ({ warehouse_product_variation: (v.warehouse_product_variation || []).map((w) => ({ stock: w.stock })) })),
        // Para Gestión de IDs Dropi › Optimización (migración 0129): cuántos videos (cualquier campo de Dropi que diga «video»;
        // sin ninguno, no se sabe) y el largo de la descripción sin etiquetas. Las fotos se cuentan con la galería.
        videos: (() => {
          let n = null;
          for (const [k, v] of Object.entries(o)) if (/video/i.test(k)) n = (n ?? 0) + (Array.isArray(v) ? v.length : v ? 1 : 0);
          return n;
        })(),
        descripcion_largo: typeof o.description === "string" ? o.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length : null,
      });
    }
    if (!objetos.length) break;
  }
  const cuerpo = {
    tipo: "competencia", dropiId: 0, pais: location.hostname.split(".").pop(), url: location.href, nombre: null,
    inicio: inicio.toISOString(), duracionMs: Math.round(performance.now() - t0), paginas, metricas: null, productos: [...productos.values()],
  };
  const gz = new Blob([JSON.stringify(cuerpo)]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(gz).arrayBuffer());
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const datos = btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  setTimeout(() => location.assign(`${puente}#${datos}`), 50);
  return { enviados: cuerpo.productos.length, paginas: paginas.length, duracionMs: cuerpo.duracionMs, kb: Math.round(datos.length / 1024) };
}

// Gestión de IDs Dropi › Bodegas: NUESTROS productos (activos y archivados) con la bodega y el stock de cada uno, como los ve
// ECOMFIVE en «Mis productos». Se corre en app.dropi.<país> con la sesión del PROVEEDOR (la consulta es la de esa pantalla:
// api-v2 `bff/catalog/products/produit/<usuario>/owner`; `archive: true` trae la pestaña Archivados). El receptor la guarda con
// scripts/publicaciones-sincronizar-dropi.ts y pone en cada publicación la ubicación, el precio, el tipo y el estado de Dropi.
//   await leerNuestrosProductos("http://127.0.0.1:4322/puente/<código>")
// Panamá, 22 oct 2026: 218 activos y 196 archivados en unos 10 s.
async function leerNuestrosProductos(puente) {
  const inicio = new Date();
  const t0 = performance.now();
  const token = JSON.parse(localStorage.getItem("DROPI_token") || "null");
  const usuario = JSON.parse(localStorage.getItem("DROPI_LoginResult") || "{}")?.objects;
  if (!token || !usuario?.id) throw new Error("No hay sesión de Dropi en esta página.");
  if (usuario.type_user !== "SUPPLIER") throw new Error("Esta sesión no es de proveedor: entra con la cuenta de ECOMFIVE.");
  const pais = location.hostname.split(".").pop();
  const apiV2 = location.hostname.replace(/^app\./, "api-v2.");
  const productos = [];
  for (const archivo of [false, true]) {
    for (let page = 1; page <= 100; page++) {
      let r;
      for (let intento = 0; intento < 5; intento++) {
        r = await fetch(`https://${apiV2}/bff/catalog/products/produit/${usuario.id}/owner`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "X-Authorization": "Bearer " + token, "X-Host": pais },
          body: JSON.stringify({ keywords: "", pageSize: 100, page, warehouse_id: null, get_stock: true, user_id: usuario.id, ...(archivo ? { archive: true } : {}) }),
        });
        if (r.status !== 429) break;
        await new Promise((ok) => setTimeout(ok, 30000));
      }
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.is_successful) throw new Error(`Dropi respondió ${r.status} en la página ${page}${archivo ? " de archivados" : ""}`);
      const lista = j.data?.record || [];
      for (const o of lista) {
        productos.push({
          id: o.id, name: o.name, type: o.type, sale_price: o.sale_price, suggested_price: o.suggested_price, total_stock: o.total_stock,
          private_stock: o.private_stock, private_product: o.private_product, created_at: o.created_at,
          warehouses: (o.warehouses || []).map((w) => ({ id: w.id, name: w.name, stock: w.stock })),
          variation_warehouses: (o.variation_warehouses || []).map((w) => ({ id: w.id, name: w.name, stock: w.stock })),
          gallery: (o.gallery || []).map((g) => ({ urlS3: g.urlS3, url: g.url, main: g.main, variation_id: g.variation_id })), categories: (o.categories || []).map((c) => ({ name: c.name })), archivado: archivo,
        });
      }
      if (lista.length < 100) break;
      await new Promise((ok) => setTimeout(ok, 1300));
    }
  }
  const cuerpo = { tipo: "nuestros", pais, inicio: inicio.toISOString(), duracionMs: Math.round(performance.now() - t0), productos };
  const gz = new Blob([JSON.stringify(cuerpo)]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(gz).arrayBuffer());
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const datos = btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  setTimeout(() => location.assign(`${puente}#${datos}`), 50);
  return { enviados: productos.length, activos: productos.filter((p) => !p.archivado).length, duracionMs: cuerpo.duracionMs, kb: Math.round(datos.length / 1024) };
}
