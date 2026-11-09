// Dunamixfy al sistema (pedido de Hernán, 9 nov 2026: «lo que hicimos con Dropi, con Effi y con Drop… con Dunamixfy»). En dunamixfy.cr, con la cuenta de
// PROVEEDOR de Costa Rica («Dunamix EF»), lee por la API interna de la página (la misma que usa Dunamixfy para dibujarse) los productos con su stock y precio
// (Gestión de IDs Dunamixfy e Inventario) y todos los pedidos (las ventas por producto y día y los dropshippers que venden), y lo sube a las direcciones firmadas
// que da el sistema. Solo lee: no cambia nada en Dunamixfy. La sesión (una cookie) no sale de la página. De los pedidos solo se sube lo del producto y de quién lo
// vendió: número, estado del envío, fechas, producto, cantidad y el dropshipper; nada del cliente (nombre, teléfono, dirección).
// Lo corre la extensión «Ecomfive · Dropi» (lector `dunamixfy_cr`) o, a mano, la consola:
//   leerDunamixfy({ dunamixfy: "<dirección firmada>", dunamixfyventas: "<dirección firmada>" }); "iniciado"
//   JSON.stringify(window.__leerDunamixfy)

async function leerDunamixfy(subida, opciones) {
  const estado = (window.__leerDunamixfy = { fase: "inicio", productos: 0, pedidos: 0, inicio: new Date().toISOString(), fin: null, resultado: null, error: null });
  const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const api = async (ruta) => {
    const r = await fetch(ruta, { credentials: "include", headers: { accept: "application/json" } });
    if (r.status === 401 || r.status === 403) throw new Error("La sesión de Dunamixfy se cerró: vuelve a entrar con la cuenta de proveedor.");
    if (!r.ok) throw new Error(`Dunamixfy respondió ${r.status} en ${ruta.split("?")[0]}.`);
    return r.json();
  };
  try {
    if (!/(^|\.)dunamixfy\.cr$/.test(location.hostname)) throw new Error("Esto se corre en dunamixfy.cr.");
    const yo = await api("/api/me");
    if ((yo && yo.user && yo.user.role) !== "SUPPLIER") throw new Error("La sesión de Dunamixfy no es la de proveedor: entra con la cuenta de proveedor de Costa Rica.");

    // 1) Los productos con sus inventarios (también los inactivos: el sistema decide qué cuenta).
    estado.fase = "productos";
    const productos = new Map();
    for (let salto = 0; salto < 5000; salto += 50) {
      const r = await api(`/api/products?take=50&skip=${salto}&search=&stockFilter=all&hideZeroStock=false&hideInactive=false&includeDeleted=false&sortBy=stock&sortDirection=desc`);
      const lista = (r && r.products) || [];
      for (const p of lista)
        if (p && p.productNumberId != null && !productos.has(p.productNumberId))
          productos.set(p.productNumberId, {
            id: p.id,
            productNumberId: p.productNumberId,
            name: p.name,
            sku: p.sku,
            category: p.category,
            images: (p.images || []).slice(0, 3),
            isActive: p.isActive,
            isPrivate: p.isPrivate,
            deletedAt: p.deletedAt,
            createdAt: p.createdAt,
            inventories: (p.inventories || []).map((i) => ({
              stock: i.stock,
              reserved: i.reserved,
              price: i.price,
              suggestedPrice: i.suggestedPrice,
              isActive: i.isActive,
              deletedAt: i.deletedAt,
              privateUserId: i.privateUserId,
              warehouse: i.warehouse ? { isPrincipal: !!i.warehouse.isPrincipal } : null,
            })),
          });
      estado.productos = productos.size;
      if (lista.length < 50) break;
      await pausa(300);
    }
    if (!productos.size) throw new Error("No se leyó ningún producto de Dunamixfy: revisa que la sesión sea la del proveedor.");
    const lecturaProductos = { tipo: "dunamixfy", pais: "cr", inicio: estado.inicio, productos: [...productos.values()] };

    // 2) Todos los pedidos desde el primer día (de a 100 por página).
    estado.fase = "pedidos";
    const hoy = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const desde = (opciones && opciones.desde) || "2025-01-01";
    const pedidos = new Map();
    for (let pagina = 1; pagina <= 500; pagina++) {
      const r = await api(`/api/orders?page=${pagina}&limit=100&dateFrom=${desde}&dateTo=${hoy}&timezone=America%2FCosta_Rica`);
      const lista = (r && r.data) || [];
      let nuevos = 0;
      for (const o of lista) {
        if (!o || !o.id || pedidos.has(o.id)) continue;
        const historial = o.shippingStatusHistory || [];
        const devolucion = historial
          .filter((h) => h && h.status === "DEVOLUCION" && h.createdAt)
          .map((h) => h.createdAt)
          .sort()[0];
        pedidos.set(o.id, {
          id: String(o.id),
          numero: o.orderNumber ?? null,
          envio: o.shippingStatus ?? null,
          creado: o.createdAt || null,
          despachado: o.dispatchedAt || null,
          devuelto: devolucion || o.returnReceivedAt || null,
          vendedor: o.ownerId ? { id: String(o.ownerId), nombre: String((o.owner && o.owner.name) || ""), tienda: o.store ? String(o.store) : null } : null,
          productos: (o.items || []).map((i) => ({ id: String(i.productId ?? ""), nombre: String(i.productName || ""), cantidad: Number(i.quantity) || 0 })),
        });
        nuevos++;
      }
      estado.pedidos = pedidos.size;
      const total = r && r.meta && r.meta.totalPages;
      if (!lista.length || !nuevos || (total && pagina >= total)) break;
      await pausa(400);
    }
    const lecturaPedidos = { tipo: "dunamixfy-pedidos", pais: "cr", inicio: estado.inicio, pedidos: [...pedidos.values()] };

    // 3) Al sistema.
    estado.fase = "subida";
    for (const [archivo, cuerpo] of [
      ["dunamixfy", lecturaProductos],
      ["dunamixfyventas", lecturaPedidos],
    ]) {
      const r = await fetch(subida[archivo], { method: "PUT", headers: { "x-upsert": "true", "content-type": "application/json" }, body: new Blob([JSON.stringify(cuerpo)], { type: "application/json" }) });
      if (!r.ok) throw new Error(`No se pudo pasar la lectura de Dunamixfy al sistema (${r.status}).`);
    }
    estado.resultado = { productos: productos.size, pedidos: pedidos.size };
  } catch (e) {
    estado.error = String((e && e.message) || e);
  }
  estado.fase = "listo";
  estado.fin = new Date().toISOString();
  return estado;
}
