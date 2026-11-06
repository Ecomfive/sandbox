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
  // El logo y la categoría («VERIFICADO») de la página del proveedor (migración 0225; 3 nov 2026): la ruta en el CDN de Dropi.
  let logo = null;
  let categoria = null;
  try {
    const i = await fetch(`https://${apiV2}/indicators/supplier/${dropiId}/information`, {
      headers: { "X-Authorization": "Bearer " + token, "X-Host": host },
    }).then((x) => x.json());
    logo = i?.data?.logo || null;
    categoria = i?.data?.category || null;
  } catch {}
  // El título de la pestaña es «Proveedor: NOMBRE | Dropi».
  const nombre = /^Proveedor:\s*(.+?)\s*\|/.exec(document.title)?.[1] || null;

  const cuerpo = {
    dropiId, pais: location.hostname.split(".").pop(), url: location.href, nombre, inicio: inicio.toISOString(),
    duracionMs: Math.round(performance.now() - t0), paginas, metricas, logo, categoria, productos: [...productos.values()],
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
  // Las variaciones de cada producto activo con variaciones, para «Privatizar en Dropi»: la lista no las trae (5 nov 2026). Si una no se puede leer, la lectura sigue sin ella.
  const api = location.hostname.replace(/^app\./, "api.");
  for (const p of productos.filter((x) => x.type === "VARIABLE" && !x.archivado)) {
    const j = await fetch(`https://${api}/api/products/${p.id}`, { headers: { "X-Authorization": "Bearer " + token, Accept: "application/json" } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (Array.isArray(j?.objects?.variations)) p.variations = j.objects.variations.map((v) => ({ id: v.id, sku: v.sku, deleted_at: v.deleted_at, attribute_values: v.attribute_values, warehouse_product_variation: (v.warehouse_product_variation || []).map((w) => ({ warehouse_id: w.warehouse_id, stock: w.stock })) }));
    await new Promise((ok) => setTimeout(ok, 300));
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

// Análisis de competencia con Drop (6 nov 2026; migración 0234): TODO el catálogo de Drop, con el proveedor de cada producto. Se corre en
// app.soydrop.com/dropshipping con la sesión de un DROPSHIPPER y sin «Ver en USD». Pulsa «Ver más productos» hasta el final (40 cada vez) y lee cada tarjeta;
// la categoría y la fecha de creación salen de la ficha de cada producto, de a 4 a la vez (si una falla, queda sin ellas). Los revisa
// src/lib/competencia/drop.ts y los guarda scripts/competencia-catalogo-guardar.ts. Como arriba, la pestaña navega al puente.
//   await scrapingCompetenciaDrop("http://127.0.0.1:4322/puente/<código>")
// Costa Rica, 6 nov 2026: 205 productos de 11 proveedores.
async function scrapingCompetenciaDrop(puente) {
  if (location.hostname !== "app.soydrop.com" || location.pathname !== "/dropshipping") throw new Error("Esto se corre en app.soydrop.com/dropshipping, con la sesión de dropshipper.");
  const inicio = new Date();
  const t0 = performance.now();
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const enlaces = () => [...document.querySelectorAll('a[href^="/dropshipping/product/"]')];
  document.querySelector('button[aria-label="Vista grilla"]')?.click();
  await pausa(300);
  const paginas = [enlaces().length];
  for (let i = 0; i < 200; i++) {
    const mas = [...document.querySelectorAll("button")].find((b) => /Ver más productos/.test(b.innerText));
    if (!mas) break;
    const antes = enlaces().length;
    mas.click();
    let crecio = false;
    for (let j = 0; j < 80 && !crecio; j++) {
      await pausa(150);
      crecio = enlaces().length > antes;
    }
    if (!crecio) throw new Error("«Ver más productos» dejó de responder: el catálogo quedó a medias.");
    paginas.push(enlaces().length - antes);
  }
  const productos = new Map();
  for (const a of enlaces()) {
    const dropId = /\/product\/([0-9a-f]{24})/.exec(a.getAttribute("href"))?.[1];
    if (!dropId || productos.has(dropId)) continue;
    let tarjeta = a;
    while (tarjeta && !/Precio proveedor/.test(tarjeta.innerText ?? "")) tarjeta = tarjeta.parentElement;
    if (!tarjeta) continue;
    const lineas = tarjeta.innerText.split("\n").map((l) => l.trim()).filter(Boolean);
    const i = lineas.findIndex((l) => /^ID-[A-Z0-9]+$/.test(l));
    const tras = (t) => lineas[lineas.findIndex((l) => l.startsWith(t)) + 1] ?? "";
    if (/\$/.test(tras("Precio proveedor"))) throw new Error("Los precios están en dólares: quita «Ver en USD» y vuelve a correr la lectura.");
    productos.set(dropId, {
      dropId,
      codigo: lineas[i] ?? null,
      nombre: lineas[i - 2] ?? "",
      proveedor: lineas[i - 1] ?? "",
      stock: lineas[i + 1] ?? "",
      precio: tras("Precio proveedor"),
      sugerido: tras("Precio sugerido"),
      foto: tarjeta.querySelector("img")?.getAttribute("src") ?? null,
    });
  }
  const cola = [...productos.values()];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let p = cola.shift(); p; p = cola.shift()) {
        try {
          const html = await (await fetch(`/dropshipping/product/${p.dropId}`, { headers: { accept: "text/html" } })).text();
          const plano = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map((m) => JSON.parse(`"${m[1]}"`)).join("");
          p.creado = /"createdAt":"([^"]+)","vendor":/.exec(plano)?.[1] ?? null;
          p.categoria = /"category":"([^"]*)"/.exec(plano)?.[1] ?? null;
        } catch {
          // Sin la ficha el producto se guarda igual, sin categoría ni fecha.
        }
      }
    }),
  );
  if (!productos.size) throw new Error("No se leyó ningún producto de Drop: revisa que la sesión sea la de dropshipper.");
  const cuerpo = { tipo: "competencia-drop", pais: "cr", inicio: inicio.toISOString(), duracionMs: Math.round(performance.now() - t0), paginas, productos: [...productos.values()] };
  const gz = new Blob([JSON.stringify(cuerpo)]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(gz).arrayBuffer());
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const datos = btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  setTimeout(() => location.assign(`${puente}#${datos}`), 50);
  return { enviados: cuerpo.productos.length, paginas: paginas.length, duracionMs: cuerpo.duracionMs, kb: Math.round(datos.length / 1024) };
}

// Análisis de competencia con Effi (6 nov 2026; migración 0239): TODO el catálogo de dropshipping de Effi, con proveedor, stock y ventas. Se corre en
// effi.com.co con nuestra propia sesión (no hay API para esto): recorre `/app/articulo_dropshipping?page=N`, de a 3 páginas a la vez, y lee cada tarjeta. La sesión
// no sale de la página. Los revisa src/lib/competencia/effi.ts y los guarda scripts/competencia-catalogo-guardar.ts. Como arriba, la pestaña navega al puente.
//   await scrapingCompetenciaEffi("http://127.0.0.1:4322/puente/<código>")
// Costa Rica, 6 nov 2026: 2.109 artículos de 32 proveedores en 15 s.
async function scrapingCompetenciaEffi(puente) {
  if (location.hostname !== "effi.com.co") throw new Error("Esto se corre en effi.com.co, con la sesión abierta.");
  const inicio = new Date();
  const t0 = performance.now();
  const pagina = async (n) => {
    const r = await fetch(`/app/articulo_dropshipping?page=${n}`);
    if (!r.ok) throw new Error(`Effi respondió ${r.status} en la página ${n}.`);
    return new DOMParser().parseFromString(await r.text(), "text/html");
  };
  const primera = await pagina(1);
  const total = Math.max(1, ...[...primera.querySelectorAll(".pagination a[data-page]")].map((a) => Number(a.getAttribute("data-page")) || 1));
  if (!primera.querySelector(".product-card")) throw new Error("No se ve el catálogo de Effi: revisa que la sesión siga abierta.");
  const cifra = (t, nombre) => new RegExp(`${nombre}:\\s*(-?[\\d,]+)`).exec(t)?.[1] ?? "";
  const productos = [];
  const paginas = Array(total).fill(0);
  const leer = (doc, n) => {
    const tarjetas = [...doc.querySelectorAll(".product-card")];
    paginas[n - 1] = tarjetas.length;
    for (const c of tarjetas) {
      const enlaces = c.querySelectorAll(".product-meta a");
      const detalle = c.querySelector(".ver-detalles");
      const stats = c.querySelector(".product-stats")?.textContent ?? "";
      const precio = c.querySelector(".price-block")?.textContent.replace(/\s+/g, " ") ?? "";
      productos.push({
        codigo: detalle?.getAttribute("data-codigo") ?? null,
        nombre: c.querySelector(".product-title")?.textContent ?? "",
        foto: detalle?.getAttribute("data-url_foto") ?? null,
        proveedor: enlaces[0]?.textContent ?? "",
        proveedorId: /proveedor=(\d+)/.exec(enlaces[0]?.getAttribute("href") ?? "")?.[1] ?? "",
        categoria: enlaces[1]?.textContent ?? "",
        stock: cifra(stats, "Stock"),
        ventas: cifra(stats, "Ventas"),
        precio: /Costo:\s*([^\s]+)/.exec(precio)?.[1] ?? "",
        sugerido: /Sugerido:\s*([^\s]+)/.exec(precio)?.[1] ?? "",
      });
    }
  };
  leer(primera, 1);
  const cola = Array.from({ length: total - 1 }, (_, i) => i + 2);
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let n = cola.shift(); n; n = cola.shift()) leer(await pagina(n), n);
    }),
  );
  const cuerpo = { tipo: "competencia-effi", pais: "cr", inicio: inicio.toISOString(), duracionMs: Math.round(performance.now() - t0), paginas, productos };
  const gz = new Blob([JSON.stringify(cuerpo)]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(gz).arrayBuffer());
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const datos = btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  setTimeout(() => location.assign(`${puente}#${datos}`), 50);
  return { enviados: productos.length, paginas: paginas.length, duracionMs: cuerpo.duracionMs, kb: Math.round(datos.length / 1024) };
}

// Gestión de IDs Drop (3 nov 2026, pedido de Hernán; migración 0221): «Mis productos» de ECOMFIVE en Drop (app.soydrop.com, Costa Rica, en colones).
// Se corre en app.soydrop.com con la sesión del PROVEEDOR. Drop no da una dirección con todos los productos: la pestaña abre cada página de la lista
// (`/vendor/products?page=N`, 10 por página) en un marco invisible, espera a que se dibuje la tabla y lee el texto de cada fila (los revisa
// src/lib/publicaciones-drop/lectura.ts; los guarda scripts/drop-guardar.ts). La sesión no sale de la página. Como arriba, la pestaña navega al puente.
//   await leerDrop("http://127.0.0.1:4322/puente/<código>")
// Costa Rica, 3 nov 2026: 89 productos en 9 páginas.
async function leerDrop(puente) {
  if (location.hostname !== "app.soydrop.com") throw new Error("Esto se corre en app.soydrop.com, con la sesión del proveedor.");
  const inicio = new Date();
  const t0 = performance.now();
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  async function filasDePagina(n) {
    const marco = document.createElement("iframe");
    marco.style.cssText = "position:fixed;left:-5000px;top:0;width:1400px;height:900px;border:0";
    marco.src = `/vendor/products?page=${n}`;
    document.body.appendChild(marco);
    try {
      let vacia = 0;
      for (let i = 0; i < 120; i++) {
        await pausa(250);
        const doc = marco.contentDocument;
        const filas = doc ? [...doc.querySelectorAll("table tbody tr")].filter((tr) => tr.querySelector("a[href*='/details/']")) : [];
        if (filas.length) {
          await pausa(300); // que termine de dibujar la página
          const cabeza = [...doc.querySelectorAll("table thead th")].map((th) => th.innerText.trim().toLowerCase());
          const col = (nombre) => cabeza.findIndex((c) => c.startsWith(nombre));
          const celda = (tr, nombre) => (col(nombre) >= 0 ? tr.querySelectorAll("td")[col(nombre)]?.innerText ?? "" : "");
          return [...doc.querySelectorAll("table tbody tr")]
            .filter((tr) => tr.querySelector("a[href*='/details/']"))
            .map((tr) => ({
              dropId: /\/details\/([0-9a-f]{24})/.exec(tr.querySelector("a[href*='/details/']").getAttribute("href"))?.[1] ?? "",
              producto: celda(tr, "producto"),
              sku: celda(tr, "sku"),
              estado: celda(tr, "estado"),
              precio: celda(tr, "precio"),
              inventario: celda(tr, "inventario"),
              creado: celda(tr, "creado"),
              foto: tr.querySelector("img")?.getAttribute("src") ?? null,
            }));
        }
        // Página sin productos (después de la última): la tabla se dibujó pero sin filas.
        if (doc?.readyState === "complete" && doc.querySelector("table thead") && ++vacia > 16) return [];
      }
      throw new Error(`La página ${n} de Drop no cargó: revisa que la sesión siga abierta.`);
    } finally {
      marco.remove();
    }
  }
  const productos = new Map();
  const paginas = [];
  for (let n = 1; n <= 300; n++) {
    const filas = await filasDePagina(n);
    paginas.push(filas.length);
    let nuevas = 0;
    for (const f of filas) if (f.dropId && !productos.has(f.dropId)) (productos.set(f.dropId, f), nuevas++);
    if (filas.length < 10 || !nuevas) break;
  }
  if (!productos.size) throw new Error("No se leyó ningún producto de Drop: revisa que la sesión sea la del proveedor.");
  const cuerpo = { tipo: "drop", pais: "cr", inicio: inicio.toISOString(), duracionMs: Math.round(performance.now() - t0), paginas, productos: [...productos.values()] };
  const gz = new Blob([JSON.stringify(cuerpo)]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(gz).arrayBuffer());
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const datos = btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  setTimeout(() => location.assign(`${puente}#${datos}`), 50);
  return { enviados: cuerpo.productos.length, paginas: paginas.length, duracionMs: cuerpo.duracionMs, kb: Math.round(datos.length / 1024) };
}
