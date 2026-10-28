// Dropi al sistema, cada mañana (tarea programada «dropi-diario»): en app.dropi.pa, con la sesión del PROVEEDOR (ECOMFIVE), lee
// los pedidos de los últimos 30 días (estados al día), la cartera de los últimos 7, los retiros y el stock de nuestros productos,
// y los sube a la carpeta temporal de Storage con las direcciones firmadas que da `npx tsx scripts/dropi-diario.ts subida`.
// Después `npx tsx scripts/dropi-diario.ts cargar` los guarda con los cargadores de siempre. Solo lee en Dropi: nunca cambia nada.
//
// Se recorta todo a lo que usan los cargadores: del pedido no sube el cliente (nombre, teléfono, dirección) y del retiro no sube
// la cuenta del usuario (documento, claves), solo el saldo. El token de Dropi no sale de la página.
//
// Se arranca sin esperarla (tarda 2 a 5 minutos y la herramienta del navegador corta a los 45 s); el avance queda en
// window.__dropiDiario:
//   window.dropiDiario(<lo que imprimió «subida»>); "iniciado"
//   JSON.stringify(window.__dropiDiario)
// Panamá, 22 oct 2026: unos 15.000 pedidos en 30 días, ~250 movimientos de cartera por día, 140 retiros, 414 productos.

async function dropiDiario(subida, dias = { pedidos: 30, cartera: 7 }) {
  const estado = (window.__dropiDiario = { fase: "inicio", pedidos: 0, cartera: 0, retiros: 0, productos: 0, inicio: new Date().toISOString(), fin: null, resultado: null, error: null });
  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
  try {
    const token = JSON.parse(localStorage.getItem("DROPI_token") || "null");
    const usuario = JSON.parse(localStorage.getItem("DROPI_LoginResult") || "{}")?.objects;
    if (!token || !usuario?.id) throw new Error("No hay sesión de Dropi en esta página.");
    const pais = location.hostname.split(".").pop();
    // Panamá: la cuenta de proveedor ECOMFIVE. Costa Rica (28 oct 2026): su cuenta de proveedor.
    if (usuario.type_user !== "SUPPLIER" || (pais === "pa" && usuario.store_name !== "ECOMFIVE"))
      throw new Error(pais === "pa" ? "Esta sesión no es la del proveedor ECOMFIVE." : "Esta sesión no es de una cuenta de proveedor.");
    const api = location.hostname.replace(/^app\./, "api.");
    const apiV2 = location.hostname.replace(/^app\./, "api-v2.");
    const cabeceras = { "X-Authorization": "Bearer " + token, Accept: "application/json" };

    // Fechas del país (la cartera llega en UTC y se pasa a la hora del país, como la da el Excel de Dropi): Panamá UTC−5, Costa Rica UTC−6.
    const zona = pais === "cr" ? "America/Costa_Rica" : "America/Panama";
    const desfase = pais === "cr" ? 6 : 5;
    const diaPais = (d) => d.toLocaleDateString("en-CA", { timeZone: zona });
    const hoy = diaPais(new Date());
    const haceDias = (n) => diaPais(new Date(Date.now() - n * 86400000));
    const horaPais = (iso) => {
      const d = new Date(new Date(iso).getTime() - desfase * 3600000);
      const p = (n) => String(n).padStart(2, "0");
      return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
    };

    // Una consulta con reintentos: 429 (Dropi limita las consultas por minuto) o un fallo de red esperan y vuelven a pedir.
    async function pedir(url, opciones = {}) {
      for (let intento = 0; intento < 5; intento++) {
        let r;
        try {
          r = await fetch(url, { headers: cabeceras, ...opciones });
        } catch {
          await espera(5000);
          continue;
        }
        if (r.status === 401) throw new Error("La sesión de Dropi expiró (401).");
        if (r.status === 429 || r.status >= 500) {
          await espera(r.status === 429 ? 30000 : 5000);
          continue;
        }
        const j = await r.json().catch(() => null);
        if (!r.ok || !j) throw new Error(`Dropi respondió ${r.status} en ${url.split("?")[0]}`);
        return j;
      }
      throw new Error(`Dropi no respondió en ${url.split("?")[0]} después de 5 intentos.`);
    }

    // 1. Pedidos (de proveedor), del más viejo al más nuevo para que los nuevos que entren mientras se lee no corran las páginas.
    estado.fase = "pedidos";
    const pedidos = new Map();
    const desdePedidos = haceDias(dias.pedidos);
    for (let start = 0; start < 200000; start += 100) {
      const q = new URLSearchParams({ orderBy: "id", orderDirection: "asc", result_number: 100, start, textToSearch: "", status: "null", supplier_id: usuario.id, user_id: "null", from: desdePedidos, until: hoy, filter_product: "undefined", radio_downloaded: "IMPRESAS Y NO IMPRESAS", tag_id: "", warranty: "false", filter_date_by: "null", invoiced: "null" });
      const j = await pedir(`https://${api}/api/orders/myorders/v2?${q}`);
      const lista = j.objects || [];
      for (const o of lista)
        pedidos.set(o.id, {
          id: o.id, status: o.status, total_order: o.total_order, created_at: o.created_at, user_id: o.user_id, shop_id: o.shop_id,
          shop: o.shop?.name ? { name: o.shop.name } : null, shipping_company: o.shipping_company, shipping_guide: o.shipping_guide,
          warehouse_id: o.warehouse_id, rate_type: o.rate_type,
          orderdetails: (o.orderdetails || []).map((d) => ({ product_id: d.product_id, variation_id: d.variation_id, product: d.product ? { id: d.product.id, sku: d.product.sku, name: d.product.name, sale_price: d.product.sale_price } : null })).filter((d) => d.product),
        });
      estado.pedidos = pedidos.size;
      if (lista.length < 100) break;
      await espera(400);
    }

    // 2. Cartera: los movimientos de la billetera, con las columnas del Excel «Descargar en Excel» (las que espera el cargador).
    estado.fase = "cartera";
    const cartera = new Map();
    for (let start = 0; start < 100000; start += 100) {
      const q = new URLSearchParams({ orderBy: "id", orderDirection: "asc", result_number: 100, start, textToSearch: "", type: "", id: "", identification_code: "", user_id: usuario.id, from: haceDias(dias.cartera), until: hoy, wallet_id: "" });
      const j = await pedir(`https://${api}/api/historywallet?${q}`);
      const lista = j.objects || [];
      for (const m of lista)
        cartera.set(m.id, { ID: m.id, FECHA: horaPais(m.created_at), TIPO: m.type, MONTO: Number(m.amount), "ORDEN ID": m.order_id ?? null, "NUMERO DE GUIA": m.order?.shipping_guide ?? null, "DESCRIPCIÓN": m.description ?? null });
      estado.cartera = cartera.size;
      if (lista.length < 100) break;
      await espera(400);
    }

    // 3. Retiros: el historial completo (Dropi lo da de una vez) y el saldo de la billetera.
    estado.fase = "retiros";
    const jr = await pedir(`https://${api}/api/withdrawal?${new URLSearchParams({ user_id: usuario.id })}`);
    const retiros = (jr.objects || []).map((w) => ({
      id: w.id, amount: w.amount, status: w.status, created_at: w.created_at, updated_at: w.updated_at, concept: w.concept,
      user_bank: { bank: { name: w.user_bank?.bank?.name ?? null } }, user: { wallets: (w.user?.wallets || []).map((x) => ({ amount: x.amount })) },
    }));
    estado.retiros = retiros.length;

    // 4. Stock: nuestros productos (activos y archivados) con su bodega, como en «Mis productos» (igual que leerNuestrosProductos).
    estado.fase = "stock";
    const t0 = performance.now();
    const productos = [];
    for (const archivo of [false, true]) {
      for (let page = 1; page <= 100; page++) {
        const j = await pedir(`https://${apiV2}/bff/catalog/products/produit/${usuario.id}/owner`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "X-Authorization": "Bearer " + token, "X-Host": pais },
          body: JSON.stringify({ keywords: "", pageSize: 100, page, warehouse_id: null, get_stock: true, user_id: usuario.id, ...(archivo ? { archive: true } : {}) }),
        });
        if (!j.is_successful) throw new Error(`Dropi no dio la página ${page} de productos${archivo ? " archivados" : ""}.`);
        const lista = j.data?.record || [];
        for (const o of lista)
          productos.push({
            id: o.id, name: o.name, type: o.type, sale_price: o.sale_price, suggested_price: o.suggested_price, total_stock: o.total_stock,
            private_stock: o.private_stock, private_product: o.private_product, created_at: o.created_at,
            warehouses: (o.warehouses || []).map((w) => ({ id: w.id, name: w.name, stock: w.stock })),
            variation_warehouses: (o.variation_warehouses || []).map((w) => ({ id: w.id, name: w.name, stock: w.stock })),
            gallery: (o.gallery || []).map((g) => ({ urlS3: g.urlS3, url: g.url, main: g.main, variation_id: g.variation_id })), categories: (o.categories || []).map((c) => ({ name: c.name })), archivado: archivo,
          });
        estado.productos = productos.length;
        if (lista.length < 100) break;
        await espera(1300);
      }
    }
    const stock = { tipo: "nuestros", pais, inicio: new Date().toISOString(), duracionMs: Math.round(performance.now() - t0), productos };

    // 5. Subida (cada dirección vale para un archivo y 2 horas).
    estado.fase = "subida";
    const subir = async (url, obj) => {
      const r = await fetch(url, { method: "PUT", headers: { "x-upsert": "true", "content-type": "application/json" }, body: new Blob([JSON.stringify(obj)], { type: "application/json" }) });
      if (!r.ok) throw new Error(`No se pudo subir la lectura (${r.status}).`);
    };
    await subir(subida.pedidos, { desde: desdePedidos, hasta: hoy, pedidos: [...pedidos.values()] });
    await subir(subida.cartera, [...cartera.values()]);
    await subir(subida.retiros, retiros);
    await subir(subida.stock, stock);
    estado.resultado = { desde: desdePedidos, hasta: hoy, pedidos: pedidos.size, cartera: cartera.size, retiros: retiros.length, productos: productos.length, segundos: Math.round((Date.now() - new Date(estado.inicio).getTime()) / 1000) };
  } catch (e) {
    estado.error = String(e?.message ?? e);
  }
  estado.fase = "listo";
  estado.fin = new Date().toISOString();
  return estado;
}
