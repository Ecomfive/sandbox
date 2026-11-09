// Drop al sistema (pedido de Hernán, 7 nov 2026: «el botón de actualizar así como en Panamá» para Costa Rica). En app.soydrop.com, con la cuenta de
// PROVEEDOR de Costa Rica, lee «Mis productos» (precio, estado, inventario: Gestión de IDs Drop e Inventario) y todos los pedidos (lo que salió de la
// bodega de Drop por producto y día: Inventario › Cuadro), y lo sube a las direcciones firmadas que da el sistema. Solo lee: no cambia nada en Drop.
// La sesión de Drop (una cookie) no sale de la página. De los pedidos solo se sube lo del producto: número, estado, fechas, producto y cantidad; nada del
// cliente (nombre, teléfono, dirección).
// Lo corre la extensión «Ecomfive · Dropi» (lector `drop_cr`) o, a mano, la consola:
//   leerDropProveedor({ drop: "<dirección firmada>", dropventas: "<dirección firmada>" }); "iniciado"
//   JSON.stringify(window.__leerDrop)
// «Mis productos» se lee como lo hacía scripts/scraping-proveedores-navegador.js › leerDrop (la tabla, página por página). Los pedidos vienen dentro de cada
// página de /vendor/orders (los datos con que Drop la dibuja, «initialOrders»), de a 500.

async function leerDropProveedor(subida) {
  const estado = (window.__leerDrop = { fase: "inicio", productos: 0, pedidos: 0, inicio: new Date().toISOString(), fin: null, resultado: null, error: null });
  const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
  try {
    if (location.hostname !== "app.soydrop.com") throw new Error("Esto se corre en app.soydrop.com.");
    // Con otra cuenta, Drop manda «Mis productos» de proveedor al catálogo (dropshipper) o a entrar.
    const prueba = await fetch("/vendor/products", { credentials: "include" });
    if (!new URL(prueba.url).pathname.startsWith("/vendor")) throw new Error("La sesión de Drop no es la de proveedor: entra con la cuenta de proveedor de Costa Rica.");

    // 1) «Mis productos»: la tabla de cada página, en un marco oculto.
    estado.fase = "productos";
    const t0 = performance.now();
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
            await pausa(300);
            const cabeza = [...doc.querySelectorAll("table thead th")].map((th) => th.innerText.trim().toLowerCase());
            const col = (nombre) => cabeza.findIndex((c) => c.startsWith(nombre));
            const celda = (tr, nombre) => (col(nombre) >= 0 ? (tr.querySelectorAll("td")[col(nombre)]?.innerText ?? "") : "");
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
          if (doc?.readyState === "complete" && doc.querySelector("table thead") && ++vacia > 16) return [];
        }
        throw new Error(`La página ${n} de «Mis productos» de Drop no cargó: revisa que la sesión siga abierta.`);
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
      estado.productos = productos.size;
      if (filas.length < 10 || !nuevas) break;
    }
    if (!productos.size) throw new Error("No se leyó ningún producto de Drop: revisa que la sesión sea la del proveedor.");
    const lecturaProductos = { tipo: "drop", pais: "cr", inicio: estado.inicio, duracionMs: Math.round(performance.now() - t0), paginas, productos: [...productos.values()] };

    // 2) Los pedidos: los datos de cada página de /vendor/orders, de a 500, del más nuevo al más viejo. Sin periodo, Drop solo da los últimos 30 días (9 nov 2026: las
    // ventas empezaban el 8 de octubre), así que se pide desde antes de que existiera la cuenta hasta hoy: unos 6.000 pedidos desde mayo de 2026, 2 a 3 minutos.
    estado.fase = "pedidos";
    const POR_PAGINA = 500;
    const DESDE = "2025-01-01";
    const HASTA = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
    async function datosDePagina(n) {
      let html = null;
      for (let intento = 0; intento < 3 && html === null; intento++) {
        const r = await fetch(`/vendor/orders?tab=all&limit=${POR_PAGINA}&all.page=${n}&all.from=${DESDE}&all.to=${HASTA}`, { credentials: "include" }).catch(() => null);
        if (r && r.ok && new URL(r.url).pathname.startsWith("/vendor")) html = await r.text();
        else if (r && !new URL(r.url).pathname.startsWith("/vendor")) throw new Error("La sesión de Drop venció mientras se leían los pedidos.");
        else await pausa(3000);
      }
      if (html === null) throw new Error(`Drop no respondió la página ${n} de pedidos.`);
      let flujo = "";
      const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
      let m;
      while ((m = re.exec(html))) flujo += JSON.parse(m[1]);
      const i = flujo.indexOf('"initialOrders":');
      if (i < 0) throw new Error("Drop cambió la página de pedidos: no se encontraron los datos.");
      const j = flujo.indexOf("[", i);
      let d = 0;
      let enTexto = false;
      let escape = false;
      for (let k = j; k < flujo.length; k++) {
        const c = flujo[k];
        if (enTexto) {
          if (escape) escape = false;
          else if (c === "\\") escape = true;
          else if (c === '"') enTexto = false;
          continue;
        }
        if (c === '"') enTexto = true;
        else if (c === "[" || c === "{") d++;
        else if (c === "]" || c === "}") {
          d--;
          if (d === 0) return JSON.parse(flujo.slice(j, k + 1));
        }
      }
      throw new Error("Drop cambió la página de pedidos: los datos vinieron cortados.");
    }
    const pedidos = new Map();
    for (let n = 1; n <= 200; n++) {
      const lista = await datosDePagina(n);
      let nuevos = 0;
      for (const o of lista) {
        if (!o || !o.id || pedidos.has(o.id)) continue;
        const info = o.orderInfo || {};
        const linea = (info.statusTimeline || []).map((s) => ({ estado: String(s.status ?? ""), en: s.occurredAt || null }));
        pedidos.set(o.id, {
          id: String(o.id),
          numero: info.orderNumber ? String(info.orderNumber) : null,
          estado: info.status != null ? String(info.status) : null,
          creado: info.createdAt || null,
          despachado: info.dispatchedAt || linea.find((s) => s.estado === "fulfilled")?.en || null,
          linea,
          productos: (o.productSnapshots || []).map((p) => ({ id: String(p.productId || ""), variante: p.productVariantId ? String(p.productVariantId) : null, nombre: String(p.productName || ""), cantidad: Number(p.quantity) || 0 })),
        });
        nuevos++;
      }
      estado.pedidos = pedidos.size;
      if (lista.length < POR_PAGINA || !nuevos) break;
      await pausa(500);
    }
    const lecturaPedidos = { tipo: "drop-pedidos", pais: "cr", inicio: estado.inicio, pedidos: [...pedidos.values()] };

    // 3) Al sistema.
    estado.fase = "subida";
    for (const [archivo, cuerpo] of [
      ["drop", lecturaProductos],
      ["dropventas", lecturaPedidos],
    ]) {
      const r = await fetch(subida[archivo], { method: "PUT", headers: { "x-upsert": "true", "content-type": "application/json" }, body: new Blob([JSON.stringify(cuerpo)], { type: "application/json" }) });
      if (!r.ok) throw new Error(`No se pudo pasar la lectura de Drop al sistema (${r.status}).`);
    }
    estado.resultado = { productos: productos.size, pedidos: pedidos.size };
  } catch (e) {
    estado.error = String((e && e.message) || e);
  }
  estado.fase = "listo";
  estado.fin = new Date().toISOString();
  return estado;
}
