// Desempeño › Ventas Dropi (y las ventas de cada publicación en Gestión de IDs Dropi): lo que corre DENTRO de app.dropi.pa
// con la sesión de ECOMFIVE (la cuenta de proveedor; una de dropshipper no ve el Historial de Existencia). Lista todos los
// productos de ECOMFIVE (activos y archivados), baja el Historial de Existencia de cada uno y sube las dos lecturas a la
// carpeta temporal de Storage con las direcciones firmadas que da `npx tsx scripts/ventas-dropi.ts subida`. Después,
// `npx tsx scripts/ventas-dropi.ts cargar` las baja a datos-privados/ y las carga (scripts/importar-ventas-dropi.ts).
// La sesión de Dropi nunca sale de la página: solo viajan los movimientos.
//
// Uso (con la herramienta del navegador de Claude): asignar la función a window y arrancarla SIN esperarla (tarda unos
// 2 a 4 minutos y la herramienta corta a los 45 s); el avance queda en window.__ventasDropi:
//   window.ventasDropi(<lo que imprimió «subida»>); "iniciado"
//   JSON.stringify({ ...window.__ventasDropi, errores: Object.keys(window.__ventasDropi.errores).length })
// Termina cuando `fin` tiene fecha: `resultado` trae las cifras y `error` lo que falló (si falla, no sube nada: una carga
// incompleta borraría las ventas de los productos que faltan).

async function ventasDropi(subida) {
  const estado = (window.__ventasDropi = { fase: "productos", productos: 0, hechos: 0, movimientos: 0, errores: {}, inicio: new Date().toISOString(), fin: null, resultado: null, error: null });
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const token = JSON.parse(localStorage.getItem("DROPI_token") || "null");
    const login = JSON.parse(localStorage.getItem("DROPI_LoginResult") || "{}");
    if (!token) throw new Error("No hay sesión de Dropi en esta página.");
    const uid = login?.objects?.id;
    const api = location.hostname.replace(/^app\./, "api.");
    const apiV2 = location.hostname.replace(/^app\./, "api-v2.");
    const host = location.hostname.split(".").pop();

    // 1. Los productos de la cuenta (lo mismo que «Activos» y «Archivados» de Productos).
    // Ojo: esta consulta de Dropi no es estable (21 oct 2026): a veces una página llega con 100 productos de OTRA cuenta (y su
    // `count_record`), y pasada la última página propia sigue entregando páginas ajenas. Por eso cada página se vuelve a pedir
    // hasta que todos sus productos sean de esta cuenta, se corta en la primera con menos de 100 y la cantidad debe calzar con
    // el `count_record` de esa última página propia (así salió igual tres veces seguidas: 218 activos y 196 archivados).
    const productos = new Map();
    const pagina = async (archive, page) => {
      for (let intento = 0; intento < 8; intento++) {
        const r = await fetch(`https://${apiV2}/bff/catalog/products/produit/${uid}/owner`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "X-Authorization": "Bearer " + token, "X-Host": host },
          body: JSON.stringify({ keywords: "", pageSize: 100, page, warehouse_id: null, get_stock: false, user_id: uid, archive }),
        }).catch(() => null);
        const j = await r?.json().catch(() => null);
        if (r && (r.status === 401 || r.status === 403)) throw new Error(`Dropi respondió ${r.status} al listar los productos (¿la sesión no es la de ECOMFIVE?).`);
        const lote = j?.is_successful ? j.data?.record || [] : null;
        if (lote && lote.every((p) => p.user_id === uid)) return { lote, total: Number(j.data?.count_record ?? -1) };
        await pausa(800 * (intento + 1));
      }
      throw new Error(`Dropi no devolvió la página ${page} de los productos ${archive ? "archivados" : "activos"} de esta cuenta.`);
    };
    for (const archive of [false, true]) {
      const propios = new Set();
      for (let page = 1; page < 100; page++) {
        const { lote, total } = await pagina(archive, page);
        for (const p of lote) {
          propios.add(p.id);
          productos.set(p.id, { id: p.id, nombre: p.name, lista: archive ? "archivado" : "activo", privado: p.private_product ? 1 : 0, tipo: p.type === "VARIABLE" || p.is_variation ? "V" : "S", stock: Number(p.total_stock ?? 0), precio: p.sale_price ?? null });
        }
        if (lote.length < 100) {
          if (propios.size !== total) throw new Error(`La lista de productos ${archive ? "archivados" : "activos"} no calza (${propios.size} leídos, Dropi dice ${total}).`);
          break;
        }
      }
    }
    if (!productos.size) throw new Error("Dropi no devolvió productos: ¿la sesión es la de ECOMFIVE?");
    estado.productos = productos.size;

    // 2. El Historial de Existencia de cada producto, de a tres a la vez, con reintentos.
    estado.fase = "historial";
    const historial = async (id, tam = 1000) => {
      const out = [];
      for (let off = 0, total = Infinity; off < total; off += tam) {
        let r;
        for (let intento = 0; intento < 4; intento++) {
          r = await fetch(`https://${api}/api/inventories/history?pageSize=${tam}&offSet=${off}&idSelect=${id}&search=null&filterBy=&movement=null&warehouse=null`, {
            headers: { Authorization: "Bearer " + token, "x-authorization": "Bearer " + token },
          }).catch(() => null);
          if (r && r.ok) break;
          await pausa(r?.status === 429 ? 30000 : 3000 * (intento + 1));
        }
        if (!r || !r.ok) throw new Error(`HTTP ${r?.status ?? "sin respuesta"}`);
        const j = await r.json();
        total = Number(j.count ?? 0);
        const lote = j.object || [];
        out.push(...lote);
        if (!lote.length) break;
      }
      return out;
    };
    const CLASES = ["pedido", "cancelada", "rechazada", "devolucion", "garantia", "ingreso", "retiro"];
    const clase = (m) => {
      const c = m.concept || "";
      if (m.type === "SALIDA") return /por garantia/i.test(c) ? "garantia" : /creacion de orden/i.test(c) ? "pedido" : "retiro";
      if (/orden cancelada/i.test(c)) return "cancelada";
      if (/orden rechazada/i.test(c)) return "rechazada";
      if (/devoluc|devolution/i.test(c)) return "devolucion";
      return "ingreso";
    };
    const usuarios = {};
    const movimientos = {};
    const leer = async (id, tam) => {
      try {
        movimientos[id] = (await historial(id, tam)).map((m) => {
          if (m.user_id && m.user) usuarios[m.user_id] = `${m.user.name || ""} ${m.user.surname || ""}`.trim();
          return [m.id, CLASES.indexOf(clase(m)), Number(m.quantity), String(m.created_at).slice(0, 16), m.order_id ?? null, m.user_id ?? null, m.warehouse_id ?? null, Number(m.current_quantity), m.variation_id ?? null];
        });
        estado.movimientos += movimientos[id].length;
        delete estado.errores[id];
      } catch (e) {
        estado.errores[id] = String(e?.message ?? e);
      }
    };
    const cola = [...productos.keys()];
    const trabajador = async () => {
      while (cola.length) {
        await leer(cola.shift());
        estado.hechos++;
      }
    };
    await Promise.all([trabajador(), trabajador(), trabajador()]);
    // Con tres a la vez Dropi a veces no responde (21 oct 2026: de 4 a 9 por lectura; de a uno y con páginas de 500 respondían): segunda vuelta de a uno.
    for (let vuelta = 0; vuelta < 2 && Object.keys(estado.errores).length; vuelta++) {
      estado.fase = "reintentos";
      for (const id of Object.keys(estado.errores)) {
        await pausa(2000);
        await leer(Number(id), 500);
      }
    }
    const fallidos = Object.keys(estado.errores);
    if (fallidos.length) throw new Error(`No se pudo leer el historial de ${fallidos.length} productos (${fallidos.slice(0, 5).join(", ")}…); no se subió nada.`);

    // 3. Subir las dos lecturas a la carpeta temporal (las direcciones firmadas valen para un solo archivo y 2 horas).
    estado.fase = "subida";
    const cabecera = ["id", "nombre", "lista", "privado", "tipo", "stock", "precio"];
    const resumen = { generado: new Date().toISOString(), cabecera, productos: [...productos.values()].map((p) => cabecera.map((k) => p[k])) };
    const movs = { clases: CLASES, columnas: ["id", "clase", "cantidad", "fecha_utc", "orden", "usuario", "bodega", "existencia_despues", "variacion"], usuarios, movimientos };
    const subir = async (url, obj) => {
      const r = await fetch(url, { method: "PUT", headers: { "x-upsert": "true", "content-type": "application/json" }, body: new Blob([JSON.stringify(obj)], { type: "application/json" }) });
      if (!r.ok) throw new Error(`Storage respondió ${r.status} al subir: ${(await r.text()).slice(0, 120)}`);
    };
    await subir(subida.resumen, resumen);
    await subir(subida.movimientos, movs);
    estado.resultado = { productos: productos.size, activos: [...productos.values()].filter((p) => p.lista === "activo").length, movimientos: estado.movimientos, segundos: Math.round((Date.now() - new Date(estado.inicio).getTime()) / 1000) };
  } catch (e) {
    estado.error = String(e?.message ?? e);
  }
  estado.fase = "listo";
  estado.fin = new Date().toISOString();
  return estado;
}
