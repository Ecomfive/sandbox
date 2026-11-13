// El favorito «Aplicar en Dropi» de punta a punta contra un Dropi simulado (24 oct 2026): archivar y sacar de Archivados, la descripción y las
// fotos de un cambio, y publicar un producto nuevo. Se corre el código real del favorito (el mismo que va en el marcador) con un `fetch`
// que se porta como las rutas de Dropi que usa, y se comprueba lo que quedó en el «Dropi» y lo que el favorito le devolvió a la ventana.

import assert from "node:assert/strict";
import test from "node:test";
import { GARANTIAS_DROPI, type DatosCrearDropi } from "./crear-dropi";
import { marcadorAplicarDropi } from "./marcador-aplicar-dropi";

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ORIGEN = "https://sistema.test";
const BODEGA = { id: 81, name: "Proveedor Ecomfive", address: "Ave Centenario, Costa del Este", city: { id: 501, name: "CIUDAD DE PANAMA" }, warehouse_white_brand: false };

function productoBase(id: number, extra: Obj = {}): Obj {
  return {
    id, name: "Aceite Veganic", description: "<p>corta</p>", dropi_app_description: null, type: "SIMPLE", sale_price: "5.90", suggested_price: "5.90", user_id: 2094,
    privated_product: false, active: true, sku: "ACEITE/VEGANIC", weight: "120", length: "8", width: "8", height: "12", variations: [], categories: [{ id: 4, name: "Belleza" }],
    add_stock_in_return: false, private_product_inventories: [], user_profit_percentage_product: [], is_warehouse_white_brand: false, name_in_guide: "", shipping_method: null, bar_code: null,
    dropi_product_supplier_increment_fixed: false, archived: null,
    warehouse_product: [{ warehouse_id: 81, stock: 224, warehouse: BODEGA }],
    gallery: [{ id: 1, main: true, urlS3: "panama/products/1/1779000000base.jpg", url: null, variation_id: null }],
    ...extra,
  };
}

/** Un Dropi de mentira con las rutas que usa el favorito. */
function crearDropi(opciones: { noTomaEntradas?: boolean; usuarios?: Record<string, Obj>; fallaAsignar?: boolean; stockAlCrear?: boolean; noArchiva?: boolean; categorias?: Obj[]; fallaCrear?: boolean; respuestaCrear?: "sinId" | "anidado"; fotos?: "rechaza" | "soloXAuth" | "fallaLaPrincipal"; cdnSinCache?: boolean; cdnBloqueado?: boolean; fallaPutDe?: number; quitarReservaSaca?: boolean; reservaLibre?: boolean } = {}) {
  const productos = new Map<number, Obj>();
  const llamadas: string[] = [];
  const garantias = new Map<number, Obj[]>();
  const fallo = { veces: 0, hecho: false };
  let siguiente = 9001;
  const stockDe = (p: Obj) => Object.fromEntries((p.warehouse_product as Obj[]).map((w) => [w.warehouse_id, Number(w.stock)]));
  const responder = (objeto: unknown, status = 200) => new Response(JSON.stringify(typeof objeto === "object" && objeto !== null && "isSuccess" in objeto ? objeto : { isSuccess: status < 400, objects: objeto }), { status });

  const fetchFalso = async (entrada: string | URL, init: RequestInit = {}): Promise<Response> => {
    const url = String(entrada);
    const metodo = (init.method ?? "GET").toUpperCase();
    // Una foto que el favorito baja de Storage para subirla a Dropi.
    // Como el navegador con una copia guardada que no deja leer: la dirección tal cual falla; con «?r=…» sale bien.
    // El CDN de Dropi sin la cabecera CORS (lo que pasa de verdad desde la pestaña de Dropi): el navegador no deja leer la foto.
    if (opciones.cdnBloqueado && url.startsWith("https://d39ru7awumhhs2.cloudfront.net/")) throw new TypeError("Failed to fetch");
    if (url.startsWith("https://x.supabase.co/") || url.startsWith("https://d39ru7awumhhs2.cloudfront.net/")) return new Response(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], { type: "image/jpeg" }));
    const ruta = url.replace("https://api.dropi.pa/api", "");
    llamadas.push(`${metodo} ${ruta}`);
    const cuerpo: Obj | null = typeof init.body === "string" ? JSON.parse(init.body) : null;
    if (metodo === "GET" && ruta === "/users/2094") return responder({ id: 2094, warehouses: [BODEGA] });
    // El stock de una variación por bodega (lo que pide la pantalla de Dropi para mover el stock de un producto con variaciones).
    if (metodo === "POST" && ruta === "/products/get_warehouses_stock") {
      const vid = Number(cuerpo!.variation_id);
      for (const p of productos.values()) {
        const v = ((p.variations as Obj[] | undefined) ?? []).find((x) => x.id === vid);
        if (v) return responder((v.warehouse_product_variation as Obj[]).map((w) => ({ variation_id: vid, warehouse_id: w.warehouse_id, stock: w.stock, fullName: "Proveedor Ecomfive(Ave Centenario)", warehouse_white_brand: false })));
      }
      return responder({ isSuccess: false, message: "Variación no encontrada" }, 404);
    }
    if (metodo === "GET" && ruta === "/categories") return responder(opciones.categorias ?? [{ id: 4, name: "Belleza", parent_category: 0 }, { id: 7, name: "Salud", parent_category: 0 }]);
    // La cuenta de Dropi de un correo (para privatizar): `existemail`.
    const em = ruta.match(/^\/users\/existemail\/([^/]+)\/false$/);
    if (metodo === "GET" && em) {
      const u = (opciones.usuarios ?? {})[decodeURIComponent(em[1])];
      return u ? responder(structuredClone(u)) : responder({ isSuccess: false, message: "No existe ese correo" }, 404);
    }
    const m = ruta.match(/^\/products\/(\d+)(\/[A-Za-z]+)?$/);
    if (metodo === "GET" && m && !m[2]) {
      const p = productos.get(Number(m[1]));
      return p ? responder(structuredClone(p)) : responder({ isSuccess: false }, 404);
    }
    if (metodo === "POST" && ruta === "/products") {
      if (opciones.fallaCrear) return responder({ isSuccess: false, message: "Rechazado por Dropi" }, 400);
      // Dropi dice que sí pero no crea nada ni da el ID (lo que pasó con el 8751 el 25 oct 2026).
      if (opciones.respuestaCrear === "sinId") return responder({ isSuccess: true, status: 200, message: "Ok" });
      // Un producto con variaciones: los atributos y las variaciones nuevos llevan `id: null`; el stock de cada una viene en la lista de bodegas de su posición.
      if (cuerpo!.type === "VARIABLE") {
        if (!Array.isArray(cuerpo!.attribute) || !cuerpo!.attribute.length) return responder({ isSuccess: false, message: "Faltan los atributos" }, 422);
        const nuevo = siguiente++;
        const atributos = (cuerpo!.attribute as Obj[]).map((a, i) => ({ ...a, id: nuevo * 100 + i, product_id: nuevo, values: (a.values as Obj[]).map((v, j) => ({ ...v, id: nuevo * 1000 + i * 10 + j, attribute_id: nuevo * 100 + i })) }));
        const variaciones = (cuerpo!.variations as Obj[]).map((v, i) => ({
          ...v, id: nuevo * 10 + i, product_id: nuevo,
          warehouse_product_variation: opciones.stockAlCrear === false
            ? [] // Dropi real: un producto recién creado no trae ninguna bodega en sus variaciones (visto el 5 nov 2026 en el 11711 y el 11841).
            : ((cuerpo!.warehouselected as Obj[][])[i] ?? []).map((w) => ({ variation_id: nuevo * 10 + i, warehouse_id: w.warehouse_id, stock: w.stock, warehouse: BODEGA })),
        }));
        productos.set(nuevo, productoBase(nuevo, { type: "VARIABLE", privated_product: cuerpo!.privated_product === true, name: cuerpo!.name, description: cuerpo!.description, categories: cuerpo!.categories, attributes: atributos, variations: variaciones, warehouse_product: [], gallery: [] }));
        return responder({ id: nuevo });
      }
      const id = siguiente++;
      productos.set(id, productoBase(id, {
        privated_product: cuerpo!.privated_product === true, name: cuerpo!.name, description: cuerpo!.description, sale_price: String(cuerpo!.sale_price), suggested_price: String(cuerpo!.suggested_price), categories: cuerpo!.categories, sku: cuerpo!.sku,
        weight: String(cuerpo!.weight), length: String(cuerpo!.length), width: String(cuerpo!.width), height: String(cuerpo!.height), gallery: [],
        warehouse_product: opciones.stockAlCrear === false ? [] : (cuerpo!.warehouselected as Obj[]).map((w) => ({ warehouse_id: w.warehouse_id, stock: w.stock, warehouse: BODEGA })),
      }));
      return responder(opciones.respuestaCrear === "anidado" ? { product: { id } } : { id });
    }
    if (metodo === "PUT" && m && !m[2]) {
      if (opciones.fallaPutDe === Number(m[1])) return responder({ isSuccess: false, message: "Error al guardar" }, 500);
      const p = productos.get(Number(m[1]))!;
      // «Productos privados»: la reserva nueva (`change`) se agrega; una con `deleted_at` y `change` se quita; no se puede reservar más que el stock.
      const reservas = (cuerpo!.private_product_inventories as Obj[] | undefined) ?? [];
      if (reservas.some((x) => x.change === true)) {
        if (opciones.fallaAsignar) return responder({ isSuccess: false, message: "Error al asignar" }, 500);
        for (const x of reservas.filter((y) => y.change === true)) {
          const viva = (p.private_product_inventories as Obj[]).find((y) => y.user_id === x.user_id && !y.deleted_at && (y.variation_id ?? null) === (x.variation_id ?? null));
          const bodega = (p.warehouse_product as Obj[]).find((w) => w.warehouse_id === 81);
          const libreAhora = ((p.warehouse_product as Obj[]) ?? []).reduce((t, w) => t + Number(w.stock), 0);
          if (x.deleted_at) {
            if (viva) viva.deleted_at = "2026-10-26";
            // Como el Dropi de verdad (2 nov 2026, el 8822): al quitar la reserva, él mismo saca esas unidades de la bodega.
            if (viva && opciones.quitarReservaSaca) {
              const fila = (p.warehouse_product as Obj[]).find((w) => w.warehouse_id === 81)!;
              fila.stock = Number(fila.stock) - Number(viva.stock);
            }
            // Dropi que muestra solo lo libre (10 nov 2026, José Sinisterra): al quitar la reserva sus unidades vuelven a la bodega.
            if (viva && opciones.reservaLibre && bodega) bodega.stock = Number(bodega.stock) + Number(viva.stock);
          } else if (viva) {
            // Cambiar las unidades de una reserva que ya tenía (8 nov 2026, «Stock reservado por correo»). Dropi compara el valor nuevo con lo que muestra libre
            // (reservaLibre) o, si la bodega cuenta todo, con lo reservado a los demás correos más el valor nuevo.
            if (opciones.reservaLibre) {
              if (Number(x.stock) > libreAhora) return responder({ isSuccess: false, message: "La cantidad en stock es menor" }, 422);
              if (bodega) bodega.stock = libreAhora - (Number(x.stock) - Number(viva.stock));
            } else {
              const otras = (p.private_product_inventories as Obj[]).filter((y) => y !== viva && !y.deleted_at && (y.variation_id ?? null) === (x.variation_id ?? null)).reduce((t, y) => t + Number(y.stock), 0);
              if (otras + Number(x.stock) > libreAhora) return responder({ isSuccess: false, message: "La cantidad en stock es menor" }, 422);
            }
            viva.stock = x.stock;
          } else if (!viva) {
            // Con variaciones, la reserva se compara con el stock de su variación (`privateVariationStockFix`).
            const variacion = (p.variations as Obj[] | undefined)?.find((v) => v.id === x.variation_id);
            const stock = ((variacion?.warehouse_product_variation ?? p.warehouse_product) as Obj[]).reduce((t, w) => t + Number(w.stock), 0);
            const ya = (p.private_product_inventories as Obj[]).filter((y) => !y.deleted_at && (y.variation_id ?? null) === (x.variation_id ?? null)).reduce((t, y) => t + Number(y.stock), 0);
            if (opciones.reservaLibre && !variacion) {
              if (Number(x.stock) > stock) return responder({ isSuccess: false, message: "La cantidad en stock es menor" }, 422);
              if (bodega) bodega.stock = stock - Number(x.stock);
            } else if (ya + Number(x.stock) > stock) return responder({ isSuccess: false, message: "La cantidad en stock es menor" }, 422);
            p.private_product_inventories.push({ id: 500 + p.private_product_inventories.length, product_id: p.id, variation_id: x.variation_id ?? null, user_id: x.user_id, email: x.email, stock: x.stock, deleted_at: null });
          }
        }
      }
      Object.assign(p, { name: cuerpo!.name, description: cuerpo!.description, sale_price: String(cuerpo!.sale_price), suggested_price: String(cuerpo!.suggested_price), name_in_guide: cuerpo!.name_in_guide });
      // Un producto con variaciones: Dropi pide los atributos y las bodegas van en una lista por variación; cada movimiento lleva su `variation_id`.
      if (p.type === "VARIABLE") {
        if (!Array.isArray(cuerpo!.attribute) || !cuerpo!.attribute.length) return responder({ isSuccess: false, message: "Faltan los atributos" }, 422);
        // Los precios de cada variación (por ID), como los guarda Dropi.
        for (const nv of (cuerpo!.variations as Obj[] | undefined) ?? []) {
          const v = (p.variations as Obj[]).find((x) => x.id === nv.id);
          if (v && nv.sale_price != null) Object.assign(v, { sale_price: String(nv.sale_price), suggested_price: String(nv.suggested_price) });
        }
        // Las variaciones que no se tocan van en null, como en la pantalla.
        for (const grupo of cuerpo!.warehouselected as (Obj[] | null)[]) {
          for (const e of grupo ?? []) {
            if (!e.type_movement) continue;
            const v = (p.variations as Obj[]).find((x) => x.id === e.variation_id);
            let fila = (v?.warehouse_product_variation as Obj[] | undefined)?.find((x) => x.warehouse_id === e.warehouse_id);
            // Una fila sin `stock` es la bodega que la variación aún no tenía: Dropi la crea.
            if (!fila && v && e.stock === undefined) (v.warehouse_product_variation as Obj[]).push((fila = { variation_id: v.id, warehouse_id: e.warehouse_id, stock: 0, warehouse: BODEGA }));
            if (!fila) return responder({ isSuccess: false, message: "Esa variación no tiene esa bodega" }, 422);
            if (e.type_movement === "ENTRADA" && opciones.noTomaEntradas) continue;
            fila.stock = Number(fila.stock) + (e.type_movement === "ENTRADA" ? 1 : -1) * Number(e.quantity);
          }
        }
      }
      for (const w of cuerpo!.warehouselected as (Obj | null)[]) {
        if (!w?.type_movement) continue;
        let fila = (p.warehouse_product as Obj[]).find((x) => x.warehouse_id === w.warehouse_id);
        if (!fila) p.warehouse_product.push((fila = { warehouse_id: w.warehouse_id, stock: 0, warehouse: BODEGA }));
        fila.stock = Number(fila.stock) + (w.type_movement === "ENTRADA" ? 1 : -1) * Number(w.quantity);
      }
      return responder(true);
    }
    if (metodo === "POST" && ruta === "/products/photos/upload") {
      if (opciones.fotos === "rechaza") return responder({ isSuccess: false, message: "Formato no permitido" }, 422);
      if (opciones.fotos === "fallaLaPrincipal" && (init.body as FormData).get("main") === "true" && !fallo.hecho) {
        fallo.veces++;
        fallo.hecho = true;
        return responder({ isSuccess: false, message: "Error temporal" }, 500);
      }
      if (opciones.fotos === "soloXAuth" && (init.headers as Record<string, string>).Authorization) return responder({ isSuccess: false, message: "Unauthorized" }, 401);
      const f = init.body as FormData;
      const p = productos.get(Number(f.get("id")))!;
      const archivo = f.get("files") as File;
      p.gallery.push({ id: p.gallery.length + 100, main: f.get("main") === "true", urlS3: `panama/products/${p.id}/1779999999${archivo.name}`, url: null, variation_id: null });
      return responder(true);
    }
    if (metodo === "POST" && ruta === "/productwarranty/create") {
      garantias.set(Number(cuerpo!.id), (cuerpo!.warranties as Obj[]).map((w) => ({ name: w.name, time: w.time, quantity_time: w.quantity, description: w.description || "NULL" })));
      return responder(true);
    }
    if (metodo === "POST" && ruta === "/productwarranty/show") return responder(garantias.get(Number(cuerpo!.product_id)) ?? []);
    if (metodo === "POST" && m && m[2] === "/archiveProduct") {
      // Lo que dice Dropi de verdad (8 nov 2026): responde 200 con isSuccess false.
      if (opciones.noArchiva) return responder({ isSuccess: false, message: `El producto ${m[1]} tiene órdenes en estatus PENDIENTE, GUIA GENERADA o SIN MOVIMIENTOS, por lo tanto debe despacharlos primero o comunicarse con soporte de Dropi` }, 200);
      productos.get(Number(m[1]))!.archived = true;
      return responder(true);
    }
    // Lo que hace el botón de «Mis productos» de Dropi para sacar un producto de Archivados.
    if (metodo === "POST" && m && m[2] === "/activateProduct") {
      productos.get(Number(m[1]))!.archived = null;
      return responder(true);
    }
    // Dropi acepta esta ruta (responde bien) pero no desarchiva: lo que le pasó al 8537 el 28 oct 2026.
    if (metodo === "POST" && m && m[2] === "/unarchive") return responder(true);
    return responder({ isSuccess: false, message: `Ruta no simulada: ${metodo} ${ruta}` }, 404);
  };
  return { productos, llamadas, fetchFalso, stockDe, garantias, fotoPorPlataforma: true };
}

/** Pulsa el favorito con esos cambios y devuelve lo que la ventana recibió. */
async function aplicar(dropi: ReturnType<typeof crearDropi>, cambios: Obj[]): Promise<Obj[]> {
  const codigo = decodeURIComponent(marcadorAplicarDropi(ORIGEN).slice("javascript:".length));
  const mensajes: Obj[] = [];
  const oyentes = new Set<(e: Obj) => unknown>();
  // La ventana de la plataforma: guarda lo que recibe y, si el favorito le pide una foto, se la devuelve como lo hace la de verdad.
  const ventana = {
    postMessage: (m: Obj) => {
      mensajes.push(m);
      if (m.tipo === "foto")
        setTimeout(() => {
          const data = dropi.fotoPorPlataforma ? { tipo: "foto", id: m.id, blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 9])], { type: "image/jpeg" }) } : { tipo: "foto", id: m.id, error: "502: sin foto" };
          for (const f of [...oyentes]) f({ origin: ORIGEN, source: ventana, data });
        }, 0);
    },
  };
  let oyente: ((e: Obj) => Promise<void>) | null = null;
  const ventanaGlobal = {
    open: () => ventana,
    addEventListener: (_t: string, f: (e: Obj) => Promise<void>) => {
      oyentes.add(f);
      if (!oyente) oyente = f;
    },
    removeEventListener: (_t: string, f: (e: Obj) => unknown) => oyentes.delete(f),
  };
  const localStorageFalso = { getItem: (k: string) => (k === "DROPI_token" ? JSON.stringify("tok") : k === "DROPI_LoginResult" ? JSON.stringify({ objects: { id: 2094, type_user: "SUPPLIER" } }) : null) };
  new Function("location", "localStorage", "window", "alert", "fetch", codigo)({ hostname: "app.dropi.pa" }, localStorageFalso, ventanaGlobal, (m: string) => assert.fail(`alert: ${m}`), dropi.fetchFalso);
  assert.ok(oyente, "el favorito debe quedar escuchando a la ventana");
  await (oyente as (e: Obj) => Promise<void>)({ origin: ORIGEN, source: ventana, data: { tipo: "pendientes", cambios } });
  const final = mensajes.find((m) => m.tipo === "resultados");
  assert.ok(final, "el favorito debe devolver los resultados");
  return final.resultados as Obj[];
}

const base = { quitarPrivados: false, restaurar: false, nuevo: null, nombre: null, guia: null, precio: null, sugerido: null, descripcion: null, fotos: [], datos: null };
const foto = (n: string) => ({ url: `https://x.supabase.co/storage/v1/object/public/wms-productos/publicaciones/p/ia/${n}`, nombre: n });

test("archivar: lo archiva en Dropi y lo comprueba; sacar de Archivados lo devuelve; si ya estaba, no hace nada", async () => {
  const d = crearDropi();
  d.productos.set(8751, productoBase(8751));
  let [r] = await aplicar(d, [{ ...base, id: "a1", tipo: "archivar", producto: 8751 }]);
  assert.equal(r.ok, true);
  assert.equal(d.productos.get(8751)!.archived, true);
  // Ya archivado: ok sin volver a pedirlo.
  const antes = d.llamadas.filter((l) => l.endsWith("/archiveProduct")).length;
  [r] = await aplicar(d, [{ ...base, id: "a2", tipo: "archivar", producto: 8751 }]);
  assert.equal(r.ok, true);
  assert.equal(d.llamadas.filter((l) => l.endsWith("/archiveProduct")).length, antes);
  // Sacarlo de Archivados.
  [r] = await aplicar(d, [{ ...base, id: "a3", tipo: "archivar", restaurar: true, producto: 8751 }]);
  assert.equal(r.ok, true);
  assert.ok(!d.productos.get(8751)!.archived);
  assert.ok(d.llamadas.includes("POST /products/8751/activateProduct"));
  assert.ok(!d.llamadas.some((l) => l.endsWith("/unarchive")), "no usa la ruta que Dropi acepta pero no aplica");
});

test("archivar: si Dropi no deja (órdenes pendientes) queda con error y el motivo, para reintentar", async () => {
  const d = crearDropi({ noArchiva: true });
  d.productos.set(8751, productoBase(8751));
  const [r] = await aplicar(d, [{ ...base, id: "a1", tipo: "archivar", producto: 8751 }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /órdenes en estatus PENDIENTE/);
  assert.ok(!d.productos.get(8751)!.archived);
});

test("archivar: no toca un producto que no es de este proveedor", async () => {
  const d = crearDropi();
  d.productos.set(5, productoBase(5, { user_id: 1 }));
  const [r] = await aplicar(d, [{ ...base, id: "a1", tipo: "archivar", producto: 5 }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /no es de este proveedor/);
});

test("descripción y fotos: se guarda la descripción nueva, se suben las fotos y, al repetir, no se duplican", async () => {
  const d = crearDropi();
  d.productos.set(8751, productoBase(8751));
  const descripcion = `<p>${"Aceite natural para el cuidado del cabello, de uso diario. ".repeat(5)}</p>`;
  const cambio = { ...base, id: "c1", tipo: "cambio", producto: 8751, descripcion, fotos: [foto("1-beneficios.png"), foto("2-uso.png")] };
  let [r] = await aplicar(d, [cambio]);
  assert.equal(r.ok, true, String(r.error));
  const p = d.productos.get(8751)!;
  assert.equal(p.description, descripcion);
  assert.equal(p.gallery.length, 3);
  assert.equal(p.gallery.filter((g: Obj) => g.main).length, 1, "las fotos que se suman no son la principal");
  // Repetir (un reintento): ni vuelve a subir las fotos.
  [r] = await aplicar(d, [cambio]);
  assert.equal(r.ok, true);
  assert.equal(p.gallery.length, 3);
});

test("solo fotos: no guarda el producto (nada de nombre, precio ni descripción que cambiar)", async () => {
  const d = crearDropi();
  d.productos.set(8751, productoBase(8751));
  const [r] = await aplicar(d, [{ ...base, id: "c1", tipo: "cambio", producto: 8751, fotos: [foto("3-detalle.png")] }]);
  assert.equal(r.ok, true);
  assert.equal(d.llamadas.filter((l) => l.startsWith("PUT ")).length, 0);
  assert.equal(d.productos.get(8751)!.gallery.length, 2);
});

test("una descripción de menos de 200 caracteres no se manda", async () => {
  const d = crearDropi();
  d.productos.set(8751, productoBase(8751));
  const [r] = await aplicar(d, [{ ...base, id: "c1", tipo: "cambio", producto: 8751, descripcion: "<p>muy corta</p>" }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /200 caracteres/);
  assert.equal(d.llamadas.filter((l) => l.startsWith("PUT ")).length, 0);
});

test("lo de siempre sigue igual: un cambio de nombre y precio", async () => {
  const d = crearDropi();
  d.productos.set(8751, productoBase(8751));
  const [r] = await aplicar(d, [{ ...base, id: "n1", tipo: "cambio", producto: 8751, nombre: "Aceite Veganic 120 ml", guia: "ACEITE/VEGANIC", precio: 6.5, sugerido: 6.5 }]);
  assert.equal(r.ok, true, String(r.error));
  const p = d.productos.get(8751)!;
  assert.equal(p.name, "Aceite Veganic 120 ml");
  assert.equal(p.sale_price, "6.5");
});

const completo: DatosCrearDropi = {
  nombre: "Crema Hidratante 50 g",
  nombreGuia: "CREMA/HIDRATANTE/50",
  precio: 9.9,
  precioSugerido: 9.9,
  peso: 120,
  largo: 8,
  ancho: 8,
  alto: 12,
  categorias: ["belleza"],
  descripcion: `<p>${"Crema hidratante de uso diario para la piel del rostro y del cuerpo. ".repeat(4)}</p>`,
  descripcionApp: "",
  sku: "CREMA/HIDRATANTE/50",
  codigoBarras: null,
  bodegas: [{ id: 81, unidades: 120 }],
  fotos: ["1.jpg", "2.jpg", "3.jpg"].map(foto),
};

test("publicar: crea el producto, sube las 3 fotos (la primera principal), pone las garantías y el stock, y devuelve el ID", async () => {
  const d = crearDropi();
  const [r] = await aplicar(d, [{ ...base, id: "p1", tipo: "crear", producto: 0, datos: completo }]);
  assert.equal(r.ok, true, String(r.error));
  assert.equal(r.nuevo, 9001);
  assert.equal(r.fotos, 3);
  assert.equal(r.stock, 120);
  const p = d.productos.get(9001)!;
  assert.equal(p.name, "Crema Hidratante 50 g");
  assert.deepEqual(p.categories, [{ id: 4, name: "Belleza", parent_category: 0 }]);
  assert.deepEqual(p.gallery.map((g: Obj) => g.main), [true, false, false]);
  assert.equal(d.llamadas.filter((l) => l === "POST /productwarranty/create").length, 1);
  assert.deepEqual(GARANTIAS_DROPI.length, 4);
  assert.equal(d.llamadas.filter((l) => l === "POST /products").length, 1);
});

test("publicar: si Dropi no toma el stock al crear, se le da con una entrada y se comprueba", async () => {
  const d = crearDropi({ stockAlCrear: false });
  const [r] = await aplicar(d, [{ ...base, id: "p1", tipo: "crear", producto: 0, datos: completo }]);
  assert.equal(r.ok, true, String(r.error));
  assert.deepEqual(d.stockDe(d.productos.get(9001)!), { 81: 120 });
  assert.ok(d.llamadas.includes("PUT /products/9001"));
});

test("publicar: un reintento sigue desde el producto ya creado (no crea otro, no repite garantías ni fotos)", async () => {
  const d = crearDropi();
  await aplicar(d, [{ ...base, id: "p1", tipo: "crear", producto: 0, datos: completo }]);
  const [r] = await aplicar(d, [{ ...base, id: "p1", tipo: "crear", producto: 9001, nuevo: 9001, datos: completo }]);
  assert.equal(r.ok, true);
  assert.equal(r.nuevo, 9001);
  assert.equal(d.productos.size, 1);
  assert.equal(d.llamadas.filter((l) => l === "POST /products").length, 1);
  assert.equal(d.llamadas.filter((l) => l === "POST /productwarranty/create").length, 1);
  assert.equal(d.productos.get(9001)!.gallery.length, 3);
});

test("publicar: una categoría que Dropi no tiene se avisa antes de crear nada", async () => {
  const d = crearDropi();
  const [r] = await aplicar(d, [{ ...base, id: "p1", tipo: "crear", producto: 0, datos: { ...completo, categorias: ["Mascotas"] } }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /Mascotas/);
  assert.equal(d.productos.size, 0);
  assert.ok(!d.llamadas.includes("POST /products"));
});

test("publicar: si Dropi rechaza el producto, no queda nada creado y se dice por qué", async () => {
  const d = crearDropi({ fallaCrear: true });
  const [r] = await aplicar(d, [{ ...base, id: "p1", tipo: "crear", producto: 0, datos: completo }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /Rechazado por Dropi/);
  assert.equal(r.nuevo, undefined);
  assert.equal(d.productos.size, 0);
});

test("publicar: varios cambios juntos se aplican en orden y cada uno devuelve su resultado", async () => {
  const d = crearDropi();
  d.productos.set(8751, productoBase(8751));
  const r = await aplicar(d, [
    { ...base, id: "x1", tipo: "archivar", producto: 8751 },
    { ...base, id: "x2", tipo: "crear", producto: 0, datos: completo },
  ]);
  assert.deepEqual(r.map((x) => [x.id, x.ok]), [["x1", true], ["x2", true]]);
});

test("crear: si Dropi responde bien pero sin ID, no sigue y el error dice lo que respondió", async () => {
  const d = crearDropi({ respuestaCrear: "sinId" });
  const [r] = await aplicar(d, [{ ...base, id: "p1", tipo: "crear", producto: 0, datos: completo }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /no devolvió el ID.*respondió 200: Ok; llaves: isSuccess, status, message/);
  assert.equal(r.nuevo, undefined);
});

test("crear: el ID del producto nuevo también se lee si Dropi lo manda dentro de «product»", async () => {
  const d = crearDropi({ respuestaCrear: "anidado" });
  const [r] = await aplicar(d, [{ ...base, id: "p1", tipo: "crear", producto: 0, datos: completo }]);
  assert.equal(r.ok, true, String(r.error));
  assert.equal(r.nuevo, 9001);
});

test("fotos: si Dropi rechaza la subida, el error dice qué respondió", async () => {
  const d = crearDropi({ fotos: "rechaza" });
  const [r] = await aplicar(d, [{ ...base, id: "p1", tipo: "crear", producto: 0, datos: completo }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /no se pudieron subir 3 foto\(s\): Dropi no aceptó la foto .+ \(respondió 422: Formato no permitido\)/);
  assert.equal(r.nuevo, 9001, "el producto ya creado se guarda para seguir desde ahí");
});

test("fotos: si la subida solo acepta X-Authorization (como la pantalla de Dropi), se reintenta así y sale bien", async () => {
  const d = crearDropi({ fotos: "soloXAuth" });
  const [r] = await aplicar(d, [{ ...base, id: "p1", tipo: "crear", producto: 0, datos: completo }]);
  assert.equal(r.ok, true, String(r.error));
  assert.equal(d.productos.get(9001)!.gallery.length, 3);
});

test("republicar: crea el nuevo con sus fotos, le copia las garantías del viejo y archiva el viejo sin stock", async () => {
  const d = crearDropi();
  d.productos.set(8751, productoBase(8751));
  // El viejo no tenía observaciones (Dropi antes lo aceptaba): el nuevo lleva «Ninguna», salvo «Orden diferente».
  d.garantias.set(8751, GARANTIAS_DROPI.map((g) => ({ name: g.name, time: "DIAS", quantity_time: 15, description: "NULL" })));
  const [r] = await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 8751 }]);
  assert.equal(r.ok, true, String(r.error));
  assert.equal(r.nuevo, 9001);
  const g = d.garantias.get(9001)!;
  assert.deepEqual(g.map((x) => [x.name, x.quantity_time]), GARANTIAS_DROPI.map((x) => [x.name, 15]), "las cuatro garantías, con los días del viejo");
  assert.deepEqual(g.map((x) => x.description), ["Ninguna", "Ninguna", "Ninguna", "NULL"]);
  assert.equal(d.productos.get(9001)!.gallery.length, 1);
  assert.equal(d.productos.get(8751)!.archived, true);
  assert.deepEqual(d.stockDe(d.productos.get(8751)!), { 81: 0 });

  // Un reintento no las vuelve a crear.
  const llamadasAntes = d.llamadas.filter((l) => l === "POST /productwarranty/create").length;
  await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 8751, nuevo: 9001 }]);
  assert.equal(d.llamadas.filter((l) => l === "POST /productwarranty/create").length, llamadasAntes);
});

test("republicar (B280): crea el nuevo con 100 temporales en la B81 y lo deja en 0; el viejo sigue igual, con su stock en la B280", async () => {
  const d = crearDropi();
  const B280 = { id: 280, name: "Bodega Dropi Panama", address: "Panamá", warehouse_white_brand: false };
  d.productos.set(8946, productoBase(8946, { warehouse_product: [{ warehouse_id: 280, stock: 237, warehouse: B280 }] }));
  d.garantias.set(8946, GARANTIAS_DROPI.map((g) => ({ name: g.name, time: "DIAS", quantity_time: 15, description: "NULL" })));
  const datos = { b280: true, temporal: 100 };
  const [r] = await aplicar(d, [{ ...base, id: "b1", tipo: "republicar", producto: 8946, precio: 6.99, datos }]);
  assert.equal(r.ok, true, String(r.error));
  assert.equal(r.nuevo, 9001);
  assert.equal(r.b280, 237, "las unidades del viejo en la B280, para el mensaje a Dropi");
  const nuevo = d.productos.get(9001)!;
  assert.deepEqual(d.stockDe(nuevo), { 81: 0 }, "las 100 temporales salieron");
  assert.equal(Number(nuevo.sale_price), 6.99);
  assert.equal(d.garantias.get(9001)!.length, GARANTIAS_DROPI.length);
  assert.equal(nuevo.gallery.length, 1);
  const viejo = d.productos.get(8946)!;
  assert.notEqual(viejo.archived, true, "el viejo no se archiva");
  assert.deepEqual(d.stockDe(viejo), { 280: 237 }, "el viejo conserva su stock de la B280");

  // Un reintento sigue desde el ID creado: no crea otro ni vuelve a mover nada.
  const posts = d.llamadas.filter((l) => l === "POST /products").length;
  const [r2] = await aplicar(d, [{ ...base, id: "b1", tipo: "republicar", producto: 8946, nuevo: 9001, datos }]);
  assert.equal(r2.ok, true, String(r2.error));
  assert.equal(d.llamadas.filter((l) => l === "POST /products").length, posts);
});

test("republicar (B280): si el viejo ya no tiene stock en la B280, no crea nada", async () => {
  const d = crearDropi();
  d.productos.set(8946, productoBase(8946));
  const [r] = await aplicar(d, [{ ...base, id: "b2", tipo: "republicar", producto: 8946, datos: { b280: true, temporal: 100 } }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /no tiene stock en la bodega de Dropi/);
  assert.equal(d.productos.has(9001), false);
});

test("republicar: si en un intento falló la foto principal, el reintento sube justo esa (no repite la otra)", async () => {
  const d = crearDropi({ fotos: "fallaLaPrincipal" });
  d.productos.set(8751, productoBase(8751, { gallery: [
    { id: 1, main: true, urlS3: "panama/products/8751/1779932274veganic.jpg", url: null, variation_id: null },
    { id: 2, main: false, urlS3: "panama/products/8751/1779932274veganic 4.png", url: null, variation_id: null },
  ] }));
  const [r1] = await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 8751 }]);
  // Desde el 8 nov 2026 una foto que no se copia no detiene la republicación: termina y dice cuál falta (el sistema crea la tarea de subirla).
  assert.equal(r1.ok, true, String(r1.error));
  assert.equal(r1.nuevo, 9001);
  assert.deepEqual(r1.fotosFaltan, ["1779932274veganic.jpg"]);
  assert.match(String(r1.aviso), /1 foto\(s\).*ID 9001/);
  assert.equal(d.productos.get(9001)!.gallery.length, 1, "subió la otra");
  assert.equal(d.productos.get(8751)!.archived, true, "y el viejo quedó archivado");
  // Si se vuelve a pedir (por ejemplo, desde un reintento), sube justo la que faltaba y no repite la otra.
  const [r2] = await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 8751, nuevo: 9001 }]);
  assert.equal(r2.ok, true, String(r2.error));
  assert.deepEqual(r2.fotosFaltan, []);
  const g = d.productos.get(9001)!.gallery as Obj[];
  assert.equal(g.length, 2, "las dos fotos, sin repetir");
  assert.ok(g.some((f) => f.main && String(f.urlS3).endsWith("veganic.jpg")), "la principal quedó como principal");
});

test("republicar: un error 5xx al subir una foto no se reintenta en el momento (Dropi pudo haberla guardado y quedaría repetida)", async () => {
  const d = crearDropi({ fotos: "fallaLaPrincipal" });
  d.productos.set(8751, productoBase(8751, { gallery: [{ id: 1, main: true, urlS3: "panama/products/8751/1779932274veganic.jpg", url: null, variation_id: null }] }));
  const [r1] = await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 8751 }]);
  assert.equal(r1.ok, true, "termina igual, con la foto en la lista de las que faltan");
  assert.equal((r1.fotosFaltan as string[]).length, 1);
  assert.equal(d.llamadas.filter((l) => String(l).includes("/products/photos/upload")).length, 1, "un solo intento de subida");
});

test("republicar: si el navegador no deja bajar la foto del CDN, la pide a la plataforma y la sube", async () => {
  const d = crearDropi({ cdnBloqueado: true });
  d.productos.set(10474, productoBase(10474));
  const [r] = await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 10474 }]);
  assert.equal(r.ok, true, String(r.error));
  assert.equal(d.productos.get(9001)!.gallery.length, 1);
});

test("republicar: si la plataforma tampoco puede bajar la foto, termina igual y el aviso dice por qué falta", async () => {
  const d = crearDropi({ cdnBloqueado: true });
  d.fotoPorPlataforma = false;
  d.productos.set(10474, productoBase(10474));
  const [r] = await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 10474 }]);
  assert.equal(r.ok, true, String(r.error));
  assert.equal((r.fotosFaltan as string[]).length, 1);
  assert.match(String(r.aviso), /no se pudo bajar la foto por la plataforma \(502: sin foto\)/);
});

test("republicar: con fotos copiadas en el sistema, sube esas (la primera como principal) y no toca el CDN de Dropi", async () => {
  const d = crearDropi({ cdnBloqueado: true });
  d.fotoPorPlataforma = false;
  d.productos.set(10474, productoBase(10474));
  const [r] = await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 10474, fotos: [foto("1779932274anti.jpg"), foto("1779932275anti-2.png")] }]);
  assert.equal(r.ok, true, String(r.error));
  const g = d.productos.get(9001)!.gallery as Obj[];
  assert.equal(g.length, 2);
  assert.ok(g[0].main && String(g[0].urlS3).endsWith("anti.jpg"));
});

test("republicar: la misma foto repetida en el sistema (con otros números de Dropi) se sube una sola vez, sin el número en el nombre", async () => {
  const d = crearDropi({ cdnBloqueado: true });
  d.fotoPorPlataforma = false;
  d.productos.set(10474, productoBase(10474));
  const fotos = [foto("1779932274anti.jpg"), foto("17800000001779932274anti.jpg"), foto("1781111111anti.jpg"), foto("1779932275anti-2.png")];
  const [r] = await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 10474, fotos }]);
  assert.equal(r.ok, true, String(r.error));
  const g = d.productos.get(9001)!.gallery as Obj[];
  assert.equal(g.length, 2, "la principal una vez y la otra una vez");
  assert.equal(g.filter((f) => f.main).length, 1);
  assert.ok(String(g[0].urlS3).endsWith("1779999999anti.jpg"), "se sube sin el número viejo");
  // Si el cambio se vuelve a aplicar (reintento), no se sube nada más.
  const [r2] = await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 10474, nuevo: 9001, fotos }]);
  assert.equal(r2.ok, true, String(r2.error));
  assert.equal((d.productos.get(9001)!.gallery as Obj[]).length, 2, "el reintento no repite ninguna");
});

// ─── Privatizar (26 oct 2026) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const maria = { id: 5521, email: "maria@correo.com", name: "María Álvarez", role_user: { name: "DROPSHIPPER" } };
const privatizacion = { correo: "maria@correo.com", dropshipper: "María Álvarez", dropshipperId: null, iniciales: "MA", unidades: 50, bodega: 81, precio: 5.5, nombre: "P-MA Aceite Veganic", origen: "4f0d6f56-1b68-4f4a-a5c0-7a1b0e3f9c11", salida: false };
const publicoVeganic = () => productoBase(8406, { warehouse_product: [{ warehouse_id: 81, stock: 300, warehouse: BODEGA }] });

test("privatizar: crea el producto privado, le pone fotos y stock, se lo asigna al dropshipper y le saca las unidades al público", async () => {
  const d = crearDropi({ usuarios: { "maria@correo.com": maria } });
  d.productos.set(8406, publicoVeganic());
  const [r] = await aplicar(d, [{ ...base, id: "v1", tipo: "privatizar", producto: 8406, datos: privatizacion }]);
  assert.equal(r.ok, true, String(r.error));
  assert.equal(r.nuevo, 9001);
  assert.equal(r.salida, true);
  const privado = d.productos.get(9001)!;
  assert.equal(privado.privated_product, true);
  assert.equal(privado.name, "P-MA Aceite Veganic");
  assert.equal(privado.sale_price, "5.5");
  assert.deepEqual(d.stockDe(privado), { 81: 50 });
  assert.equal(privado.gallery.length, 1, "la foto del público pasa al privado");
  const reservas = privado.private_product_inventories as Obj[];
  assert.deepEqual(reservas.map((x) => [x.user_id, x.email, x.stock, x.deleted_at]), [[5521, "maria@correo.com", 50, null]]);
  // El público pierde esas unidades y sigue igual en lo demás.
  assert.deepEqual(d.stockDe(d.productos.get(8406)!), { 81: 250 });
  assert.equal(d.productos.get(8406)!.privated_product, false);
  assert.ok(d.llamadas.includes("GET /users/existemail/maria%40correo.com/false"));
  assert.equal(d.llamadas.filter((l) => l === "POST /products").length, 1);
});

test("privatizar: un correo que no existe en Dropi, o que es de un proveedor, se dice antes de crear nada", async () => {
  const d = crearDropi({ usuarios: { "prov@correo.com": { ...maria, id: 7, role_user: { name: "SUPPLIER" } } } });
  d.productos.set(8406, publicoVeganic());
  let [r] = await aplicar(d, [{ ...base, id: "v1", tipo: "privatizar", producto: 8406, datos: privatizacion }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /no tiene una cuenta con el correo maria@correo.com/);
  [r] = await aplicar(d, [{ ...base, id: "v2", tipo: "privatizar", producto: 8406, datos: { ...privatizacion, correo: "prov@correo.com" } }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /es de un proveedor/);
  assert.equal(d.productos.size, 1);
  assert.ok(!d.llamadas.includes("POST /products"));
  assert.deepEqual(d.stockDe(d.productos.get(8406)!), { 81: 300 });
});

test("privatizar: si el público no tiene tantas unidades, no crea nada", async () => {
  const d = crearDropi({ usuarios: { "maria@correo.com": maria } });
  d.productos.set(8406, publicoVeganic());
  const [r] = await aplicar(d, [{ ...base, id: "v1", tipo: "privatizar", producto: 8406, datos: { ...privatizacion, unidades: 301 } }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /solo tiene 300 unidades/);
  assert.equal(d.productos.size, 1);
});

test("privatizar: no se privatiza un producto que ya es privado ni uno que no es de este proveedor", async () => {
  const d = crearDropi({ usuarios: { "maria@correo.com": maria } });
  d.productos.set(8406, { ...publicoVeganic(), privated_product: true });
  d.productos.set(5, productoBase(5, { user_id: 1 }));
  let [r] = await aplicar(d, [{ ...base, id: "v1", tipo: "privatizar", producto: 8406, datos: privatizacion }]);
  assert.match(String(r.error), /ya es privado/);
  [r] = await aplicar(d, [{ ...base, id: "v2", tipo: "privatizar", producto: 5, datos: privatizacion }]);
  assert.match(String(r.error), /no es de este proveedor/);
});

test("privatizar: si falla la asignación, el privado ya creado se guarda y el reintento sigue desde ahí sin sacar el stock dos veces", async () => {
  const d = crearDropi({ usuarios: { "maria@correo.com": maria }, fallaAsignar: true });
  d.productos.set(8406, publicoVeganic());
  const [r1] = await aplicar(d, [{ ...base, id: "v1", tipo: "privatizar", producto: 8406, datos: privatizacion }]);
  assert.equal(r1.ok, false);
  assert.equal(r1.nuevo, 9001, "el ID del privado ya creado vuelve aunque falle un paso");
  assert.equal(r1.salida, false, "al público todavía no se le sacó nada");
  assert.match(String(r1.error), /no se le pudo asignar a maria@correo.com/);
  assert.deepEqual(d.stockDe(d.productos.get(8406)!), { 81: 300 });
  // La asignación vuelve a funcionar: el reintento no crea otro producto.
  const siguiente = crearDropi({ usuarios: { "maria@correo.com": maria } });
  siguiente.productos.set(8406, d.productos.get(8406)!);
  siguiente.productos.set(9001, d.productos.get(9001)!);
  const [r2] = await aplicar(siguiente, [{ ...base, id: "v1", tipo: "privatizar", producto: 8406, nuevo: 9001, datos: privatizacion }]);
  assert.equal(r2.ok, true, String(r2.error));
  assert.equal(r2.nuevo, 9001);
  assert.ok(!siguiente.llamadas.includes("POST /products"));
  assert.deepEqual(siguiente.stockDe(siguiente.productos.get(8406)!), { 81: 250 });
  // Otro reintento con la salida ya hecha (el aviso `salida` que guarda el sistema): no vuelve a sacar stock del público ni a asignar.
  const llamadas = siguiente.llamadas.length;
  const [r3] = await aplicar(siguiente, [{ ...base, id: "v1", tipo: "privatizar", producto: 8406, nuevo: 9001, datos: { ...privatizacion, salida: true } }]);
  assert.equal(r3.ok, true, String(r3.error));
  assert.deepEqual(siguiente.stockDe(siguiente.productos.get(8406)!), { 81: 250 });
  assert.equal(siguiente.llamadas.slice(llamadas).filter((l) => l.startsWith("PUT ")).length, 0);
});

test("privatizar: dos dropshippers distintos del mismo público, cada uno con su producto privado", async () => {
  const d = crearDropi({ usuarios: { "maria@correo.com": maria, "sofia@correo.com": { ...maria, id: 6001, email: "sofia@correo.com" } } });
  d.productos.set(8406, publicoVeganic());
  const r = await aplicar(d, [
    { ...base, id: "v1", tipo: "privatizar", producto: 8406, datos: privatizacion },
    { ...base, id: "v2", tipo: "privatizar", producto: 8406, datos: { ...privatizacion, correo: "sofia@correo.com", iniciales: "SO", nombre: "P-SO Aceite Veganic", unidades: 100 } },
  ]);
  assert.deepEqual(r.map((x) => [x.ok, x.nuevo]), [[true, 9001], [true, 9002]]);
  assert.deepEqual(d.stockDe(d.productos.get(8406)!), { 81: 150 });
  assert.deepEqual((d.productos.get(9002)!.private_product_inventories as Obj[]).map((x) => x.user_id), [6001]);
});

test("privatizar con dos correos en un mismo ID: un solo producto privado con el stock de los dos, cada correo con sus unidades, y al público se le saca el total", async () => {
  const sinis2 = { id: 7002, email: "sinis2@correo.com", name: "Sinisterra 2", role_user: { name: "DROPSHIPPER" } };
  const d = crearDropi({ usuarios: { "maria@correo.com": maria, "sinis2@correo.com": sinis2 } });
  d.productos.set(8406, publicoVeganic());
  const datos = { ...privatizacion, extras: [{ correo: "sinis2@correo.com", dropshipper: "Sinisterra 2", unidades: 30 }] };
  const [r] = await aplicar(d, [{ ...base, id: "v1", tipo: "privatizar", producto: 8406, datos }]);
  assert.equal(r.ok, true, String(r.error));
  assert.equal(r.nuevo, 9001);
  assert.equal(d.llamadas.filter((l) => l === "POST /products").length, 1, "un solo producto privado");
  const privado = d.productos.get(9001)!;
  assert.deepEqual(d.stockDe(privado), { 81: 80 });
  const reservas = (privado.private_product_inventories as Obj[]).filter((x) => !x.deleted_at);
  assert.deepEqual(reservas.map((x) => [x.user_id, x.email, x.stock]), [[5521, "maria@correo.com", 50], [7002, "sinis2@correo.com", 30]]);
  assert.deepEqual(d.stockDe(d.productos.get(8406)!), { 81: 220 });
  assert.ok(d.llamadas.includes("GET /users/existemail/sinis2%40correo.com/false"));
});

test("privatizar con dos correos: un correo extra que no existe, o que es de un proveedor, se dice antes de crear nada", async () => {
  const d = crearDropi({ usuarios: { "maria@correo.com": maria, "prov@correo.com": { id: 3, email: "prov@correo.com", role_user: { name: "SUPPLIER" } } } });
  d.productos.set(8406, publicoVeganic());
  let [r] = await aplicar(d, [{ ...base, id: "v1", tipo: "privatizar", producto: 8406, datos: { ...privatizacion, extras: [{ correo: "noexiste@correo.com", dropshipper: "", unidades: 5 }] } }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /noexiste@correo\.com/);
  [r] = await aplicar(d, [{ ...base, id: "v2", tipo: "privatizar", producto: 8406, datos: { ...privatizacion, extras: [{ correo: "prov@correo.com", dropshipper: "", unidades: 5 }] } }]);
  assert.match(String(r.error), /es de un proveedor/);
  assert.equal(d.llamadas.filter((l) => l === "POST /products").length, 0);
  assert.deepEqual(d.stockDe(d.productos.get(8406)!), { 81: 300 });
});

test("privatizar con dos correos: si el público no alcanza para el total, no crea nada", async () => {
  const sinis2 = { id: 7002, email: "sinis2@correo.com", name: "Sinisterra 2", role_user: { name: "DROPSHIPPER" } };
  const d = crearDropi({ usuarios: { "maria@correo.com": maria, "sinis2@correo.com": sinis2 } });
  d.productos.set(8406, publicoVeganic());
  const [r] = await aplicar(d, [{ ...base, id: "v1", tipo: "privatizar", producto: 8406, datos: { ...privatizacion, unidades: 200, extras: [{ correo: "sinis2@correo.com", dropshipper: "", unidades: 150 }] } }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /350/);
  assert.equal(d.llamadas.filter((l) => l === "POST /products").length, 0);
});

test("apagar un privado: la reserva del correo se quita (va marcada como quitada) y queda sin stock y archivado", async () => {
  const d = crearDropi({ usuarios: { "maria@correo.com": maria } });
  d.productos.set(8406, publicoVeganic());
  await aplicar(d, [{ ...base, id: "v1", tipo: "privatizar", producto: 8406, datos: privatizacion }]);
  const [r] = await aplicar(d, [{ ...base, id: "a1", tipo: "apagar", producto: 9001, quitarPrivados: true }]);
  assert.equal(r.ok, true, String(r.error));
  assert.equal(r.archivado, true);
  const privado = d.productos.get(9001)!;
  assert.deepEqual(d.stockDe(privado), { 81: 0 });
  assert.ok((privado.private_product_inventories as Obj[]).every((x) => x.deleted_at));
  assert.equal(privado.archived, true);
});

test("quitar privatización: las unidades del privado vuelven al público, se quita el correo y el privado queda archivado", async () => {
  const d = crearDropi({ usuarios: { "maria@correo.com": maria } });
  d.productos.set(8406, publicoVeganic());
  await aplicar(d, [{ ...base, id: "v1", tipo: "privatizar", producto: 8406, datos: privatizacion }]);
  assert.deepEqual(d.stockDe(d.productos.get(8406)!), { 81: 250 });
  const [r] = await aplicar(d, [{ ...base, id: "q1", tipo: "apagar", producto: 9001, quitarPrivados: true, datos: { publico: 8406, publicacionId: null, unidades: null, devuelto: false } }]);
  assert.equal(r.ok, true, String(r.error));
  assert.equal(r.archivado, true);
  assert.equal(r.devuelto, true);
  assert.deepEqual(r.unidades, { 81: 50 });
  assert.deepEqual(d.stockDe(d.productos.get(8406)!), { 81: 300 }, "el público recupera las 50");
  const privado = d.productos.get(9001)!;
  assert.deepEqual(d.stockDe(privado), { 81: 0 });
  assert.ok((privado.private_product_inventories as Obj[]).every((x) => x.deleted_at));
  assert.equal(privado.archived, true);
});

test("quitar privatización: si no se pudo devolver, el reintento devuelve lo anotado una sola vez", async () => {
  const d = crearDropi({ usuarios: { "maria@correo.com": maria } });
  d.productos.set(8406, publicoVeganic());
  await aplicar(d, [{ ...base, id: "v1", tipo: "privatizar", producto: 8406, datos: privatizacion }]);
  const falla = crearDropi({ fallaPutDe: 8406 });
  falla.productos.set(8406, d.productos.get(8406)!);
  falla.productos.set(9001, d.productos.get(9001)!);
  const datos = { publico: 8406, publicacionId: null, unidades: null, devuelto: false };
  const [r1] = await aplicar(falla, [{ ...base, id: "q1", tipo: "apagar", producto: 9001, quitarPrivados: true, datos }]);
  assert.equal(r1.ok, false);
  assert.match(String(r1.error), /no se le pudieron devolver las unidades al 8406/);
  assert.deepEqual(r1.unidades, { 81: 50 }, "las unidades sacadas vuelven anotadas aunque falle");
  assert.equal(r1.devuelto, false);
  assert.deepEqual(falla.stockDe(falla.productos.get(9001)!), { 81: 0 });
  assert.deepEqual(falla.stockDe(falla.productos.get(8406)!), { 81: 250 });
  // El reintento (con lo que guardó el sistema): el privado ya está en cero, igual devuelve las 50.
  const bien = crearDropi();
  bien.productos.set(8406, falla.productos.get(8406)!);
  bien.productos.set(9001, falla.productos.get(9001)!);
  const [r2] = await aplicar(bien, [{ ...base, id: "q1", tipo: "apagar", producto: 9001, quitarPrivados: true, datos: { ...datos, unidades: r1.unidades } }]);
  assert.equal(r2.ok, true, String(r2.error));
  assert.equal(r2.devuelto, true);
  assert.deepEqual(bien.stockDe(bien.productos.get(8406)!), { 81: 300 });
  // Otro reintento con lo ya devuelto (por ejemplo, Dropi no dejó archivar): no suma de nuevo.
  const [r3] = await aplicar(bien, [{ ...base, id: "q1", tipo: "apagar", producto: 9001, quitarPrivados: true, datos: { ...datos, unidades: r1.unidades, devuelto: true } }]);
  assert.equal(r3.ok, true, String(r3.error));
  assert.deepEqual(bien.stockDe(bien.productos.get(8406)!), { 81: 300 });
});

test("quitar privatización con todo el stock reservado (el 8822): si Dropi saca las unidades al quitar la reserva, no se sacan otra vez", async () => {
  const d = crearDropi({ usuarios: { "maria@correo.com": maria }, quitarReservaSaca: true });
  d.productos.set(8406, publicoVeganic());
  await aplicar(d, [{ ...base, id: "v1", tipo: "privatizar", producto: 8406, datos: privatizacion }]);
  const [r] = await aplicar(d, [{ ...base, id: "q1", tipo: "apagar", producto: 9001, quitarPrivados: true, datos: { publico: 8406, publicacionId: null, unidades: null, devuelto: false } }]);
  assert.equal(r.ok, true, String(r.error));
  assert.deepEqual(d.stockDe(d.productos.get(9001)!), { 81: 0 }, "en cero, no en -50");
  assert.deepEqual(r.unidades, { 81: 50 });
  assert.deepEqual(d.stockDe(d.productos.get(8406)!), { 81: 300 }, "el público recupera las 50");
  assert.equal(d.productos.get(9001)!.archived, true);
});

test("quitar privatización: la reserva se quita en un guardado propio, antes de sacar el stock", async () => {
  const d = crearDropi({ usuarios: { "maria@correo.com": maria } });
  d.productos.set(8406, publicoVeganic());
  await aplicar(d, [{ ...base, id: "v1", tipo: "privatizar", producto: 8406, datos: privatizacion }]);
  const antes = d.llamadas.length;
  const [r] = await aplicar(d, [{ ...base, id: "a1", tipo: "apagar", producto: 9001, quitarPrivados: true }]);
  assert.equal(r.ok, true, String(r.error));
  assert.equal(d.llamadas.slice(antes).filter((l) => l.startsWith("PUT") && l.includes("/products/9001")).length, 2);
  assert.deepEqual(d.stockDe(d.productos.get(9001)!), { 81: 0 });
});

test("un producto con stock negativo no se apaga ni se archiva: pide dejarlo en 0", async () => {
  const d = crearDropi();
  d.productos.set(8822, productoBase(8822, { warehouse_product: [{ warehouse_id: 81, stock: -96, warehouse: BODEGA }] }));
  const [r] = await aplicar(d, [{ ...base, id: "a1", tipo: "apagar", producto: 8822 }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /-96 unidades \(stock negativo\)/);
  assert.equal(d.productos.get(8822)!.archived, null);
});

test("cambiar stock deja en 0 un producto que quedó en negativo (una entrada por la diferencia)", async () => {
  const d = crearDropi();
  d.productos.set(8822, productoBase(8822, { warehouse_product: [{ warehouse_id: 81, stock: -96, warehouse: BODEGA }] }));
  const [r] = await aplicar(d, [{ ...base, id: "s1", tipo: "stock", producto: 8822, datos: { producto: null, bodega: 81, nombreBodega: "Proveedor Ecomfive", unidades: 0, antes: -96, concepto: "Corrige stock negativo" } }]);
  assert.equal(r.ok, true, String(r.error));
  assert.equal(r.antes, -96);
  assert.deepEqual(d.stockDe(d.productos.get(8822)!), { 81: 0 });
});

// ---------- Productos con variaciones (1 nov 2026): el caso del Body Viral (ID 7263) ----------
/** Un producto con variaciones (una por talla) con su stock por variación en la bodega 81. */
function conVariaciones(id: number, nombre: string, privado: boolean, stocks: Record<string, number>, extra: Obj = {}): Obj {
  const talla = (n: number, v: string) => ({ id: 100 + n, value: v, attribute_id: 10, attribute_name: "Talla", deleted_at: null });
  const tallas = Object.keys(stocks);
  return productoBase(id, {
    name: nombre, type: "VARIABLE", privated_product: privado, warehouse_product: [],
    attributes: [{ id: 10, product_id: id, description: "Talla", isVariation: true, deleted_at: null, values: tallas.map((v, i) => talla(i, v)) }],
    variations: tallas.map((v, i) => ({
      id: id * 10 + i, sale_price: "9.90", suggested_price: "9.90", product_id: id, stock: 0, sku: `BODY/${v}`, deleted_at: null, attribute_values: [talla(i, v)],
      warehouse_product_variation: [{ variation_id: id * 10 + i, warehouse_id: 81, stock: stocks[v], warehouse: BODEGA }],
    })),
    ...extra,
  });
}
/** El stock de cada variación por talla. */
const stockVariable = (p: Obj): Record<string, number> =>
  Object.fromEntries((p.variations as Obj[]).map((v) => [(v.attribute_values as Obj[])[0].value as string, (v.warehouse_product_variation as Obj[]).reduce((t, w) => t + Number(w.stock), 0)]));
const reservaDe = (id: number, producto: number, variacion: number, usuario: number, stock: number): Obj => ({ id, product_id: producto, variation_id: variacion, user_id: usuario, email: `u${usuario}@correo.com`, stock, deleted_at: null });

const privatizacionV = (extra: Obj = {}): Obj => ({
  correo: "maria@correo.com", dropshipper: "María Álvarez", dropshipperId: null, iniciales: "MA", unidades: 25, bodega: 81, precio: 5.5, nombre: "P-MA Lentes TR90", origen: "01a15c00-2a2d-7f7e-9a68-b1e3d0a7c111", salida: false,
  variaciones: [{ firma: "talla=m", etiqueta: "M", unidades: 15 }, { firma: "talla=s", etiqueta: "S", unidades: 10 }],
  ...extra,
});
const reservasDe = (p: Obj) => (p.private_product_inventories as Obj[]).filter((x) => !x.deleted_at).map((x) => [x.variation_id, x.user_id, x.stock]);

test("privatizar con variaciones: crea el privado con las tallas pedidas, reserva cada una y se las saca al público", async () => {
  const d = crearDropi({ usuarios: { "maria@correo.com": maria } });
  d.productos.set(7000, conVariaciones(7000, "Lentes TR90", false, { S: 100, M: 80, L: 60 }));
  const [r] = await aplicar(d, [{ ...base, id: "v1", tipo: "privatizar", producto: 7000, datos: privatizacionV() }]);
  assert.equal(r.ok, true, String(r.error));
  assert.equal(r.nuevo, 9001);
  assert.equal(r.stock, 25);
  assert.equal(r.salida, true);
  const privado = d.productos.get(9001)!;
  assert.equal(privado.privated_product, true);
  assert.equal(privado.name, "P-MA Lentes TR90");
  assert.deepEqual(stockVariable(privado), { M: 15, S: 10 }, "solo las tallas pedidas");
  assert.deepEqual(reservasDe(privado).map((x) => [x[1], x[2]]), [[5521, 15], [5521, 10]], "una reserva por talla");
  assert.deepEqual(reservasDe(privado).map((x) => x[0]), (privado.variations as Obj[]).map((v) => v.id), "cada reserva con el ID de la variación del privado");
  assert.deepEqual(stockVariable(d.productos.get(7000)!), { S: 90, M: 65, L: 60 }, "al público se le sacó talla por talla");
});

test("privatizar con variaciones: si Dropi no toma el stock al crear, se lo pone por variación antes de reservar", async () => {
  const d = crearDropi({ stockAlCrear: false, usuarios: { "maria@correo.com": maria } });
  d.productos.set(7000, conVariaciones(7000, "Lentes TR90", false, { S: 100, M: 80 }));
  const [r] = await aplicar(d, [{ ...base, id: "v1", tipo: "privatizar", producto: 7000, datos: privatizacionV() }]);
  assert.equal(r.ok, true, String(r.error));
  assert.deepEqual(stockVariable(d.productos.get(9001)!), { M: 15, S: 10 });
  assert.deepEqual(stockVariable(d.productos.get(7000)!), { S: 90, M: 65 });
});

test("privatizar con variaciones: sin tantas unidades, con una talla que ya no está o con un correo malo no crea nada", async () => {
  const d = crearDropi();
  d.productos.set(7000, conVariaciones(7000, "Lentes TR90", false, { S: 5, M: 80 }));
  let [r] = await aplicar(d, [{ ...base, id: "v1", tipo: "privatizar", producto: 7000, datos: privatizacionV() }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /De S el público solo tiene 5/);
  [r] = await aplicar(d, [{ ...base, id: "v2", tipo: "privatizar", producto: 7000, datos: privatizacionV({ variaciones: [{ firma: "talla=xl", etiqueta: "XL", unidades: 1 }] }) }]);
  assert.match(String(r.error), /ya no tiene la variación XL/);
  [r] = await aplicar(d, [{ ...base, id: "v3", tipo: "privatizar", producto: 7000, datos: privatizacionV({ correo: "nadie@correo.com", variaciones: [{ firma: "talla=m", etiqueta: "M", unidades: 1 }] }) }]);
  assert.match(String(r.error), /no tiene una cuenta/);
  assert.equal(d.productos.has(9001), false);
  assert.deepEqual(stockVariable(d.productos.get(7000)!), { S: 5, M: 80 });
});

test("privatizar con variaciones: si falla la reserva no se toca el público y el reintento sigue con el mismo privado", async () => {
  const d = crearDropi({ fallaAsignar: true, usuarios: { "maria@correo.com": maria } });
  d.productos.set(7000, conVariaciones(7000, "Lentes TR90", false, { S: 100, M: 80 }));
  const [r1] = await aplicar(d, [{ ...base, id: "v1", tipo: "privatizar", producto: 7000, datos: privatizacionV() }]);
  assert.equal(r1.ok, false);
  assert.equal(r1.nuevo, 9001);
  assert.equal(r1.salida, false);
  assert.deepEqual(stockVariable(d.productos.get(7000)!), { S: 100, M: 80 }, "el público sigue igual");
  const siguiente = crearDropi({ usuarios: { "maria@correo.com": maria } });
  for (const [id, p] of d.productos) siguiente.productos.set(id, p);
  const [r2] = await aplicar(siguiente, [{ ...base, id: "v1", tipo: "privatizar", producto: 7000, nuevo: 9001, datos: privatizacionV() }]);
  assert.equal(r2.ok, true, String(r2.error));
  assert.equal(siguiente.productos.has(9002), false, "no crea otro privado");
  assert.deepEqual(stockVariable(siguiente.productos.get(9001)!), { M: 15, S: 10 }, "no duplica el stock");
  assert.equal(reservasDe(siguiente.productos.get(9001)!).length, 2);
  assert.deepEqual(stockVariable(siguiente.productos.get(7000)!), { S: 90, M: 65 });
  // Un tercer intento (ya se le sacó al público) no se lo saca otra vez.
  const [r3] = await aplicar(siguiente, [{ ...base, id: "v1", tipo: "privatizar", producto: 7000, nuevo: 9001, datos: privatizacionV({ salida: true }) }]);
  assert.equal(r3.ok, true, String(r3.error));
  assert.deepEqual(stockVariable(siguiente.productos.get(7000)!), { S: 90, M: 65 });
});

test("privatizar: un producto con variaciones sin las unidades de cada una no crea nada", async () => {
  const d = crearDropi();
  d.productos.set(7000, conVariaciones(7000, "Lentes TR90", false, { S: 100 }));
  const [r] = await aplicar(d, [{ ...base, id: "v1", tipo: "privatizar", producto: 7000, datos: { ...privatizacion, unidades: 5 } }]);
  assert.match(String(r.error), /hay que indicar las unidades de cada una/);
  assert.equal(d.productos.has(9001), false);
});

test("variaciones: quitar la privatización del Body Viral saca el stock de cada talla, quita los correos, devuelve las unidades al público talla por talla y archiva", async () => {
  const d = crearDropi();
  d.productos.set(7000, conVariaciones(7000, "Body Viral", false, { S: 100, M: 80 }));
  d.productos.set(7263, conVariaciones(7263, "P-MA Body Viral", true, { S: 5, M: 3 }, { private_product_inventories: [reservaDe(77, 7263, 72630, 5, 5), reservaDe(78, 7263, 72631, 6, 3)] }));
  const [r] = await aplicar(d, [{ ...base, id: "q1", tipo: "apagar", producto: 7263, quitarPrivados: true, datos: { publico: 7000, publicacionId: null, unidades: null, devuelto: false } }]);
  assert.equal(r.ok, true, String(r.error));
  assert.equal(r.archivado, true);
  assert.equal(r.devuelto, true);
  assert.deepEqual(r.unidades, { "81|talla=s": 5, "81|talla=m": 3 });
  const privado = d.productos.get(7263)!;
  assert.deepEqual(stockVariable(privado), { S: 0, M: 0 });
  assert.ok((privado.private_product_inventories as Obj[]).every((x) => x.deleted_at), "los correos quedaron quitados");
  assert.equal(privado.archived, true);
  assert.deepEqual(stockVariable(d.productos.get(7000)!), { S: 105, M: 83 }, "el público recupera cada talla");
});

test("variaciones: apagar un producto con variaciones (sin devolver nada) lo deja sin stock en todas las tallas y archivado", async () => {
  const d = crearDropi();
  d.productos.set(7000, conVariaciones(7000, "Body Viral", false, { S: 100, M: 80, L: 0 }));
  const [r] = await aplicar(d, [{ ...base, id: "a1", tipo: "apagar", producto: 7000 }]);
  assert.equal(r.ok, true, String(r.error));
  assert.equal(r.archivado, true);
  assert.deepEqual(stockVariable(d.productos.get(7000)!), { S: 0, M: 0, L: 0 });
  // Lo que Dropi recibió: los atributos y las variaciones con sus IDs, y solo las bodegas con unidades llevan movimiento.
  assert.ok(d.llamadas.includes("POST /products/get_warehouses_stock"));
  assert.equal(d.llamadas.filter((l) => l === "PUT /products/7000").length, 1);
});

test("variaciones: si el público no tiene una talla del privado, no se toca nada y el error dice cuál", async () => {
  const d = crearDropi();
  d.productos.set(7000, conVariaciones(7000, "Body Viral", false, { S: 100 }));
  d.productos.set(7263, conVariaciones(7263, "P-MA Body Viral", true, { S: 5, M: 3 }, { private_product_inventories: [reservaDe(77, 7263, 72630, 5, 5)] }));
  const [r] = await aplicar(d, [{ ...base, id: "q1", tipo: "apagar", producto: 7263, quitarPrivados: true, datos: { publico: 7000, publicacionId: null, unidades: null, devuelto: false } }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /no tiene la variación talla=m/);
  assert.deepEqual(stockVariable(d.productos.get(7263)!), { S: 5, M: 3 }, "el privado no se tocó");
  assert.equal(d.productos.get(7263)!.archived, null);
  assert.equal(d.llamadas.filter((l) => l.startsWith("PUT ")).length, 0, "no guardó nada en Dropi");
});

test("variaciones: si el público no tiene variaciones y el privado sí, no se toca nada", async () => {
  const d = crearDropi();
  d.productos.set(7000, productoBase(7000));
  d.productos.set(7263, conVariaciones(7263, "P-MA Body Viral", true, { S: 5 }, { private_product_inventories: [reservaDe(77, 7263, 72630, 5, 5)] }));
  const [r] = await aplicar(d, [{ ...base, id: "q1", tipo: "apagar", producto: 7263, quitarPrivados: true, datos: { publico: 7000, publicacionId: null, unidades: null, devuelto: false } }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /no tiene variaciones y este privado sí/);
  assert.equal(d.llamadas.filter((l) => l.startsWith("PUT ")).length, 0);
});

test("variaciones: con stock en la bodega de Dropi (B280) en una talla, no guarda y lo dice", async () => {
  const d = crearDropi();
  const o = conVariaciones(7000, "Body Viral", false, { S: 10 });
  ((o.variations as Obj[])[0].warehouse_product_variation as Obj[])[0].warehouse_id = 280;
  d.productos.set(7000, o);
  const [r] = await aplicar(d, [{ ...base, id: "a1", tipo: "apagar", producto: 7000 }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /B280/);
  assert.equal(d.llamadas.filter((l) => l.startsWith("PUT ")).length, 0);
});

test("variaciones: si Dropi no devuelve los atributos del producto, no guarda (para no borrárselos)", async () => {
  const d = crearDropi();
  d.productos.set(7000, conVariaciones(7000, "Body Viral", false, { S: 10 }, { attributes: [] }));
  const [r] = await aplicar(d, [{ ...base, id: "a1", tipo: "apagar", producto: 7000 }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /no devolvió los atributos/);
  assert.equal(d.llamadas.filter((l) => l.startsWith("PUT ")).length, 0);
});

test("variaciones: republicar crea el producto nuevo con sus tallas y su stock, le saca el stock al viejo talla por talla y lo archiva", async () => {
  const d = crearDropi();
  d.productos.set(7000, conVariaciones(7000, "Rodillera", false, { S: 100, M: 80, L: 0 }));
  const [r] = await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 7000, precio: 9.9, sugerido: 9.9 }]);
  assert.equal(r.ok, true, String(r.error));
  const nuevo = d.productos.get(Number(r.nuevo))!;
  assert.equal(nuevo.type, "VARIABLE");
  assert.deepEqual(stockVariable(nuevo), { S: 100, M: 80, L: 0 }, "el nuevo tiene el stock de cada talla");
  assert.equal((nuevo.attributes as Obj[]).length, 1);
  assert.equal(((nuevo.attributes as Obj[])[0].values as Obj[]).length, 3);
  assert.equal((nuevo.variations as Obj[]).length, 3);
  assert.deepEqual((nuevo.variations as Obj[]).map((v) => v.sku), ["BODY/S", "BODY/M", "BODY/L"], "cada variación conserva su SKU");
  assert.notEqual(nuevo.id, 7000);
  const viejo = d.productos.get(7000)!;
  assert.deepEqual(stockVariable(viejo), { S: 0, M: 0, L: 0 });
  assert.equal(viejo.archived, true);
  assert.equal(r.stock, 180);
});

test("variaciones: si Dropi no toma el stock al crear, se le da con una entrada por talla y recién entonces se le saca al viejo", async () => {
  const d = crearDropi({ stockAlCrear: false });
  d.productos.set(7000, conVariaciones(7000, "Rodillera", false, { S: 100, M: 80 }));
  const [r] = await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 7000 }]);
  assert.equal(r.ok, true, String(r.error));
  assert.deepEqual(stockVariable(d.productos.get(Number(r.nuevo))!), { S: 100, M: 80 });
  assert.deepEqual(stockVariable(d.productos.get(7000)!), { S: 0, M: 0 });
});

test("variaciones: si el nuevo no queda con el stock de cada talla, no se le saca nada al viejo y el reintento sigue con el mismo producto", async () => {
  const d = crearDropi({ stockAlCrear: false, noTomaEntradas: true });
  d.productos.set(7000, conVariaciones(7000, "Rodillera", false, { S: 100, M: 80 }));
  const [r1] = await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 7000 }]);
  assert.equal(r1.ok, false);
  assert.match(String(r1.error), /su stock no coincide con el del 7000/);
  assert.equal(typeof r1.nuevo, "number", "el ID creado vuelve para que un reintento no cree otro");
  assert.deepEqual(stockVariable(d.productos.get(7000)!), { S: 100, M: 80 }, "el viejo no se tocó");
  assert.equal(d.productos.get(7000)!.archived, null);
  // El reintento (ahora Dropi sí toma las entradas) sigue desde el producto ya creado.
  const bien = crearDropi({ stockAlCrear: false });
  bien.productos.set(7000, d.productos.get(7000)!);
  bien.productos.set(Number(r1.nuevo), d.productos.get(Number(r1.nuevo))!);
  const [r2] = await aplicar(bien, [{ ...base, id: "r1", tipo: "republicar", producto: 7000, nuevo: r1.nuevo }]);
  assert.equal(r2.ok, true, String(r2.error));
  assert.equal(r2.nuevo, r1.nuevo);
  assert.equal(bien.llamadas.filter((l) => l === "POST /products").length, 0, "no creó otro producto");
  assert.deepEqual(stockVariable(bien.productos.get(Number(r1.nuevo))!), { S: 100, M: 80 });
  assert.deepEqual(stockVariable(bien.productos.get(7000)!), { S: 0, M: 0 });
});

test("republicar (B280) con variaciones: cada talla nace con 100 temporales en la B81 y queda en 0; el viejo conserva sus tallas en la B280", async () => {
  const d = crearDropi();
  const o = conVariaciones(7000, "Rodillera", false, { S: 10, M: 8 });
  for (const v of o.variations as Obj[]) ((v.warehouse_product_variation as Obj[])[0].warehouse_id = 280);
  d.productos.set(7000, o);
  const datos = { b280: true, temporal: 100 };
  const [r] = await aplicar(d, [{ ...base, id: "v1", tipo: "republicar", producto: 7000, datos }]);
  assert.equal(r.ok, true, String(r.error));
  assert.equal(r.b280, 18, "las unidades del viejo en la bodega de Dropi, de todas las tallas");
  const nuevo = d.productos.get(Number(r.nuevo))!;
  assert.equal(nuevo.type, "VARIABLE");
  assert.deepEqual(stockVariable(nuevo), { S: 0, M: 0 }, "las temporales de cada talla salieron");
  assert.deepEqual(stockVariable(d.productos.get(7000)!), { S: 10, M: 8 }, "el viejo no se tocó");
  assert.notEqual(d.productos.get(7000)!.archived, true);
  // El reintento sigue desde el ID creado y no mueve nada más.
  const [r2] = await aplicar(d, [{ ...base, id: "v1", tipo: "republicar", producto: 7000, nuevo: r.nuevo, datos }]);
  assert.equal(r2.ok, true, String(r2.error));
  assert.equal(d.llamadas.filter((l) => l === "POST /products").length, 1);
});

test("variaciones: republicar con stock en la bodega de Dropi (B280), unidades privatizadas o sin atributos, se detiene antes de crear nada", async () => {
  const b280 = crearDropi();
  const o = conVariaciones(7000, "Rodillera", false, { S: 10 });
  ((o.variations as Obj[])[0].warehouse_product_variation as Obj[])[0].warehouse_id = 280;
  b280.productos.set(7000, o);
  const [r1] = await aplicar(b280, [{ ...base, id: "r1", tipo: "republicar", producto: 7000 }]);
  assert.equal(r1.ok, false);
  assert.match(String(r1.error), /B280/);
  assert.equal(b280.llamadas.filter((l) => l === "POST /products").length, 0);
  const priv = crearDropi();
  priv.productos.set(7000, conVariaciones(7000, "Rodillera", false, { S: 10 }, { private_product_inventories: [reservaDe(77, 7000, 70000, 5, 4)] }));
  const [r2] = await aplicar(priv, [{ ...base, id: "r2", tipo: "republicar", producto: 7000 }]);
  assert.equal(r2.ok, false);
  assert.match(String(r2.error), /unidades privatizadas/);
  const sinAtr = crearDropi();
  sinAtr.productos.set(7000, conVariaciones(7000, "Rodillera", false, { S: 10 }, { attributes: [] }));
  const [r3] = await aplicar(sinAtr, [{ ...base, id: "r3", tipo: "republicar", producto: 7000 }]);
  assert.equal(r3.ok, false);
  assert.match(String(r3.error), /no devolvió los atributos/);
  assert.equal(sinAtr.llamadas.filter((l) => l === "POST /products").length, 0);
});

test("variaciones: el precio nuevo va al producto y a cada variación y se comprueba en Dropi", async () => {
  // Caso real (9 nov 2026, «Bandas de resistencia», ID 8405): cambiar el precio daba «Tiene variaciones: cámbialo a mano en Dropi».
  const d = crearDropi();
  d.productos.set(7000, conVariaciones(7000, "Bandas", false, { S: 10, M: 5 }, { sale_price: "9.90", suggested_price: "9.90" }));
  const [r] = await aplicar(d, [{ ...base, id: "p1", producto: 7000, precio: 8.9, sugerido: 8.9 }]);
  assert.equal(r.ok, true, String(r.error));
  const p = d.productos.get(7000)!;
  assert.equal(p.sale_price, "8.9");
  assert.deepEqual((p.variations as Obj[]).map((v) => [v.sale_price, v.suggested_price]), [["8.9", "8.9"], ["8.9", "8.9"]]);
  assert.equal(d.llamadas.filter((l) => l === "PUT /products/7000").length, 1);
  assert.deepEqual(stockVariable(p), { S: 10, M: 5 }, "el stock no se mueve");
});

test("variaciones: con precios distintos, cada una cambia en la misma proporción y una borrada no se toca", async () => {
  const d = crearDropi();
  const o = conVariaciones(7000, "Bandas", false, { S: 10, M: 5, L: 2 }, { sale_price: "10.00", suggested_price: "10.00" });
  const vs = o.variations as Obj[];
  vs[0].sale_price = "10.00"; vs[0].suggested_price = "10.00";
  vs[1].sale_price = "20.00"; vs[1].suggested_price = "25.00";
  vs[2].sale_price = "7.00"; vs[2].suggested_price = "7.00"; vs[2].deleted_at = "2026-10-01";
  d.productos.set(7000, o);
  const [r] = await aplicar(d, [{ ...base, id: "p2", producto: 7000, precio: 5, sugerido: null }]);
  assert.equal(r.ok, true, String(r.error));
  assert.deepEqual((d.productos.get(7000)!.variations as Obj[]).map((v) => [Number(v.sale_price), Number(v.suggested_price)]), [[5, 5], [10, 12.5], [7, 7]]);
});

test("variaciones: el nombre se cambia sin tocar las variaciones ni su stock", async () => {
  const d = crearDropi();
  d.productos.set(7000, conVariaciones(7000, "Body Viral", false, { S: 10 }));
  const [r] = await aplicar(d, [{ ...base, id: "n1", producto: 7000, nombre: "Body Viral 2" }]);
  assert.equal(r.ok, true, String(r.error));
  const p = d.productos.get(7000)!;
  assert.equal(p.name, "Body Viral 2");
  assert.deepEqual((p.variations as Obj[]).map((v) => Number(v.sale_price)), [9.9]);
  assert.deepEqual(stockVariable(p), { S: 10 });
});

test("variaciones: si Dropi no devolvió los atributos no se guarda nada (el precio tampoco)", async () => {
  const d = crearDropi();
  d.productos.set(7000, conVariaciones(7000, "Body Viral", false, { S: 10 }, { attributes: [] }));
  const [r] = await aplicar(d, [{ ...base, id: "n2", producto: 7000, precio: 8 }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /no devolvió los atributos/);
  assert.equal(d.llamadas.filter((l) => l.startsWith("PUT ")).length, 0);
});

test("stock: deja la bodega con las unidades pedidas (entrada o salida), lo comprueba y devuelve las bodegas releídas", async () => {
  const d = crearDropi();
  d.productos.set(8406, productoBase(8406));
  const [sube] = await aplicar(d, [{ ...base, id: "s1", tipo: "stock", producto: 8406, datos: { bodega: 81, nombreBodega: "Proveedor Ecomfive", unidades: 300, antes: 224, concepto: "Llegó la OC-1234" } }]);
  assert.equal(sube.ok, true, String(sube.error));
  assert.equal(sube.antes, 224);
  assert.equal(sube.stock, 300);
  assert.equal(sube.aviso, null);
  assert.deepEqual(d.stockDe(d.productos.get(8406)!), { 81: 300 });
  assert.deepEqual(sube.bodegas, [{ id: 81, nombre: "Proveedor Ecomfive", stock: 300 }]);
  // El sistema mostraba otra cosa (vendió entre la lectura y el «Aplicar»): igual queda en lo pedido, y se avisa.
  const [baja] = await aplicar(d, [{ ...base, id: "s2", tipo: "stock", producto: 8406, datos: { bodega: 81, nombreBodega: "", unidades: 10, antes: 280, concepto: "Conteo" } }]);
  assert.equal(baja.ok, true, String(baja.error));
  assert.deepEqual(d.stockDe(d.productos.get(8406)!), { 81: 10 });
  assert.match(String(baja.aviso), /había 300/);
  // Un reintento con el mismo pedido no mueve nada (no hay otro PUT).
  const puts = d.llamadas.filter((l) => l === "PUT /products/8406").length;
  const [igual] = await aplicar(d, [{ ...base, id: "s3", tipo: "stock", producto: 8406, datos: { bodega: 81, nombreBodega: "", unidades: 10, antes: 10, concepto: "Conteo" } }]);
  assert.equal(igual.ok, true);
  assert.equal(d.llamadas.filter((l) => l === "PUT /products/8406").length, puts);
});

test("stock: no toca un producto de otro proveedor ni la bodega de Dropi", async () => {
  const d = crearDropi();
  d.productos.set(8406, productoBase(8406, { user_id: 77 }));
  d.productos.set(8407, productoBase(8407));
  const [ajeno, b280] = await aplicar(d, [
    { ...base, id: "s1", tipo: "stock", producto: 8406, datos: { bodega: 81, nombreBodega: "", unidades: 5, antes: 224, concepto: "x" } },
    { ...base, id: "s2", tipo: "stock", producto: 8407, datos: { bodega: 280, nombreBodega: "", unidades: 5, antes: 0, concepto: "x" } },
  ]);
  assert.equal(ajeno.ok, false);
  assert.match(String(ajeno.error), /no es de este proveedor/);
  assert.equal(b280.ok, false);
  assert.match(String(b280.error), /no es de ECOMFIVE/);
  assert.equal(d.llamadas.filter((l) => l.startsWith("PUT")).length, 0);
});

test("stock por variación: lo deja en el objetivo, lo comprueba y devuelve lo que quedó; un reintento no mueve nada", async () => {
  const d = crearDropi();
  d.productos.set(7000, conVariaciones(7000, "Body Viral", false, { S: 10, M: 3 }));
  const datos = { producto: 7000, bodega: 81, nombreBodega: "Proveedor Ecomfive", unidades: 8, antes: 3, concepto: "Llegó la OC-1", firma: "talla=m", etiqueta: "M" };
  const [r] = await aplicar(d, [{ ...base, id: "v1", tipo: "stock", producto: 7000, datos }]);
  assert.equal(r.ok, true, String(r.error));
  assert.deepEqual(stockVariable(d.productos.get(7000)!), { S: 10, M: 8 }, "solo cambió la M");
  assert.equal(r.antes, 3);
  assert.equal(r.stock, 8);
  assert.deepEqual(r.bodegas, [{ id: 81, nombre: "Proveedor Ecomfive", stock: 18 }], "el total de la bodega, para el sistema");
  assert.deepEqual(r.variacion, { firma: "talla=m", bodegas: [{ id: 81, stock: 8 }] });

  const antes = d.llamadas.length;
  const [otra] = await aplicar(d, [{ ...base, id: "v2", tipo: "stock", producto: 7000, datos }]);
  assert.equal(otra.ok, true);
  assert.equal(d.llamadas.slice(antes).filter((l) => l.startsWith("PUT")).length, 0, "ya estaba en el objetivo");

  const [baja] = await aplicar(d, [{ ...base, id: "v3", tipo: "stock", producto: 7000, datos: { ...datos, unidades: 2, firma: "talla=s", etiqueta: "S", antes: 10 } }]);
  assert.equal(baja.ok, true, String(baja.error));
  assert.deepEqual(stockVariable(d.productos.get(7000)!), { S: 2, M: 8 });
});

test("stock por variación: le da stock a una variación sin bodega, avisa si Dropi tenía otra cosa y si Dropi no lo toma lo dice", async () => {
  const d = crearDropi();
  const o = conVariaciones(7000, "Body Viral", false, { S: 0, M: 3 });
  (o.variations as Obj[])[0].warehouse_product_variation = [];
  d.productos.set(7000, o);
  const [r] = await aplicar(d, [{ ...base, id: "v1", tipo: "stock", producto: 7000, datos: { bodega: 81, nombreBodega: "", unidades: 5, antes: 2, concepto: "x", firma: "talla=s", etiqueta: "S" } }]);
  assert.equal(r.ok, true, String(r.error));
  assert.deepEqual(stockVariable(d.productos.get(7000)!), { S: 5, M: 3 });
  assert.match(String(r.aviso), /había 0 \(el sistema mostraba 2\)/);

  const n = crearDropi({ noTomaEntradas: true });
  n.productos.set(7000, conVariaciones(7000, "Body Viral", false, { S: 1 }));
  const [mal] = await aplicar(n, [{ ...base, id: "v2", tipo: "stock", producto: 7000, datos: { bodega: 81, nombreBodega: "", unidades: 5, antes: 1, concepto: "x", firma: "talla=s", etiqueta: "S" } }]);
  assert.equal(mal.ok, false);
  assert.match(String(mal.error), /muestra 1 unidades de S/);
});

test("stock: un cambio sin variación en un producto con variaciones (o al revés) se detiene sin guardar", async () => {
  const d = crearDropi();
  d.productos.set(7000, conVariaciones(7000, "Body Viral", false, { S: 1 }));
  d.productos.set(8406, productoBase(8406));
  const [a, b, c] = await aplicar(d, [
    { ...base, id: "a", tipo: "stock", producto: 7000, datos: { bodega: 81, nombreBodega: "", unidades: 5, antes: 1, concepto: "x" } },
    { ...base, id: "b", tipo: "stock", producto: 8406, datos: { bodega: 81, nombreBodega: "", unidades: 5, antes: 1, concepto: "x", firma: "talla=s", etiqueta: "S" } },
    { ...base, id: "c", tipo: "stock", producto: 7000, datos: { bodega: 81, nombreBodega: "", unidades: 5, antes: 1, concepto: "x", firma: "talla=xl", etiqueta: "XL" } },
  ]);
  assert.match(String(a.error), /cada variación en la ficha/);
  assert.match(String(b.error), /ya no tiene variaciones/);
  assert.match(String(c.error), /ya no tiene la variación XL/);
  assert.equal(d.llamadas.filter((l) => l.startsWith("PUT")).length, 0);
});

test("reserva por correo: agregar un correo, cambiar sus unidades y quitarla, sin tocar el stock (y avisar si Dropi lo cambia)", async () => {
  const d = crearDropi({ usuarios: { "ana@correo.com": { id: 901, name: "Ana", email: "ana@correo.com", role_user: { name: "DROPSHIPPER" } }, "prov@correo.com": { id: 902, role_user: { name: "SUPPLIER" } } } });
  d.productos.set(8744, productoBase(8744, { warehouse_product: [{ warehouse_id: 81, stock: 66, warehouse: BODEGA }] }));
  const [agrega] = await aplicar(d, [{ ...base, id: "r1", tipo: "reserva", producto: 8744, datos: { correo: "ana@correo.com", unidades: 40 } }]);
  assert.equal(agrega.ok, true, String(agrega.error));
  assert.deepEqual((agrega.reservas as Obj[]).map((x) => [x.email, x.stock]), [["ana@correo.com", 40]]);
  assert.equal(agrega.stock, 66);
  assert.equal(agrega.aviso, null);
  assert.deepEqual(d.stockDe(d.productos.get(8744)!), { 81: 66 }, "reservar no mueve el stock");
  const [cambia] = await aplicar(d, [{ ...base, id: "r2", tipo: "reserva", producto: 8744, datos: { correo: "ANA@correo.com", unidades: 50 } }]);
  assert.equal(cambia.ok, true, String(cambia.error));
  assert.deepEqual((cambia.reservas as Obj[]).map((x) => x.stock), [50]);
  const putsAntes = d.llamadas.filter((l) => l === "PUT /products/8744").length;
  const [igual] = await aplicar(d, [{ ...base, id: "r3", tipo: "reserva", producto: 8744, datos: { correo: "ana@correo.com", unidades: 50 } }]);
  assert.equal(igual.ok, true);
  assert.equal(d.llamadas.filter((l) => l === "PUT /products/8744").length, putsAntes, "si ya está así, no guarda nada");
  const [demasiado] = await aplicar(d, [{ ...base, id: "r4", tipo: "reserva", producto: 8744, datos: { correo: "ana@correo.com", unidades: 70 } }]);
  assert.equal(demasiado.ok, false);
  assert.match(String(demasiado.error), /66 unidades/);
  assert.match(String(demasiado.error), /quedó como estaba \(50\)/, "al no alcanzar, devuelve la reserva que tenía");
  const vivas = (d.productos.get(8744)!.private_product_inventories as Obj[]).filter((x) => !x.deleted_at);
  assert.deepEqual(vivas.map((x) => [x.email, Number(x.stock)]), [["ana@correo.com", 50]]);
  const [proveedor] = await aplicar(d, [{ ...base, id: "r5", tipo: "reserva", producto: 8744, datos: { correo: "prov@correo.com", unidades: 5 } }]);
  assert.equal(proveedor.ok, false);
  assert.match(String(proveedor.error), /proveedor/);
  const [quita] = await aplicar(d, [{ ...base, id: "r6", tipo: "reserva", producto: 8744, datos: { correo: "ana@correo.com", unidades: 0 } }]);
  assert.equal(quita.ok, true, String(quita.error));
  assert.deepEqual(quita.reservas, []);
});

test("reserva por correo con Dropi que cuenta lo libre (José Sinisterra): 14 reservadas + 85 libres → total 99, quitando la reserva y poniéndola de nuevo", async () => {
  const sinisterra = { id: 25212, name: "José", email: "naturex.co0@gmail.com", role_user: { name: "DROPSHIPPER" } };
  const crear = () => {
    const d = crearDropi({ reservaLibre: true, usuarios: { "naturex.co0@gmail.com": sinisterra } });
    d.productos.set(8796, productoBase(8796, { warehouse_product: [{ warehouse_id: 81, stock: 85, warehouse: BODEGA }], private_product_inventories: [{ id: 4828, product_id: 8796, user_id: 25212, email: null, stock: 14, deleted_at: null, user: sinisterra }] }));
    return d;
  };
  const d = crear();
  const [r] = await aplicar(d, [{ ...base, id: "r1", tipo: "reserva", producto: 8796, datos: { correo: "naturex.co0@gmail.com", unidades: 99 } }]);
  assert.equal(r.ok, true, String(r.error));
  assert.deepEqual((r.reservas as Obj[]).map((x) => [x.email ?? (x.user as Obj).email, Number(x.stock)]), [["naturex.co0@gmail.com", 99]]);
  assert.equal(d.llamadas.filter((l) => l === "PUT /products/8796").length, 3, "directo (rechazado), quitar y poner el total");
  assert.deepEqual(d.stockDe(d.productos.get(8796)!), { 81: 0 });

  // Un solo guardado alcanza si lo que se suma cabe en lo libre.
  const d2 = crear();
  const [r2] = await aplicar(d2, [{ ...base, id: "r2", tipo: "reserva", producto: 8796, datos: { correo: "naturex.co0@gmail.com", unidades: 60 } }]);
  assert.equal(r2.ok, true, String(r2.error));
  assert.equal(d2.llamadas.filter((l) => l === "PUT /products/8796").length, 1);

  // Pasarse de 99 se rechaza antes de tocar nada.
  const d3 = crear();
  const [r3] = await aplicar(d3, [{ ...base, id: "r3", tipo: "reserva", producto: 8796, datos: { correo: "naturex.co0@gmail.com", unidades: 100 } }]);
  assert.equal(r3.ok, false);
  assert.match(String(r3.error), /85 unidades disponibles más las 14/);
  assert.equal(d3.llamadas.filter((l) => l.startsWith("PUT")).length, 0, "no tocó la reserva");

  // Si se rechaza el cambio directo y quitarla le baja el stock a Dropi (como el 8822), se detiene y devuelve la reserva.
  const d4 = crearDropi({ quitarReservaSaca: true, usuarios: { "naturex.co0@gmail.com": sinisterra } });
  d4.productos.set(8796, productoBase(8796, { warehouse_product: [{ warehouse_id: 81, stock: 85, warehouse: BODEGA }], private_product_inventories: [{ id: 4828, product_id: 8796, user_id: 25212, email: "naturex.co0@gmail.com", stock: 14, deleted_at: null, user: sinisterra }] }));
  const [r4] = await aplicar(d4, [{ ...base, id: "r4", tipo: "reserva", producto: 8796, datos: { correo: "naturex.co0@gmail.com", unidades: 99 } }]);
  assert.equal(r4.ok, false);
  assert.match(String(r4.error), /el stock de Dropi bajó de 85 a 71 unidades/);
  assert.match(String(r4.error), /quedó como estaba \(14\)/);
  assert.deepEqual((d4.productos.get(8796)!.private_product_inventories as Obj[]).filter((x) => !x.deleted_at).map((x) => Number(x.stock)), [14]);
});

test("reserva por correo: si Dropi descuenta el stock al quitar la reserva, se avisa con los números", async () => {
  const d = crearDropi({ quitarReservaSaca: true });
  d.productos.set(8744, productoBase(8744, { warehouse_product: [{ warehouse_id: 81, stock: 66, warehouse: BODEGA }], private_product_inventories: [{ id: 7, product_id: 8744, user_id: 901, email: "ana@correo.com", stock: 66, deleted_at: null }] }));
  const [quita] = await aplicar(d, [{ ...base, id: "r1", tipo: "reserva", producto: 8744, datos: { correo: "ana@correo.com", unidades: 0 } }]);
  assert.equal(quita.ok, true, String(quita.error));
  assert.match(String(quita.aviso), /pasó de 66 a 0/);
});

test("republicar: si Dropi no deja archivar el viejo por órdenes en curso, termina igual y lo devuelve para dejar la tarea", async () => {
  const d = crearDropi({ noArchiva: true });
  d.productos.set(10488, productoBase(10488));
  const [r] = await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 10488 }]);
  assert.equal(r.ok, true, String(r.error));
  assert.match(String(r.archivoPendiente), /PENDIENTE|GUIA GENERADA|SIN MOVIMIENTOS/);
  assert.deepEqual(d.stockDe(d.productos.get(10488)!), { 81: 0 }, "el viejo quedó sin stock");
});
