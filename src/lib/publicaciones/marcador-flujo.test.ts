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
function crearDropi(opciones: { usuarios?: Record<string, Obj>; fallaAsignar?: boolean; stockAlCrear?: boolean; noArchiva?: boolean; categorias?: Obj[]; fallaCrear?: boolean; respuestaCrear?: "sinId" | "anidado"; fotos?: "rechaza" | "soloXAuth" | "fallaLaPrincipal"; cdnSinCache?: boolean; cdnBloqueado?: boolean } = {}) {
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
      const id = siguiente++;
      productos.set(id, productoBase(id, {
        privated_product: cuerpo!.privated_product === true, name: cuerpo!.name, description: cuerpo!.description, sale_price: String(cuerpo!.sale_price), suggested_price: String(cuerpo!.suggested_price), categories: cuerpo!.categories, sku: cuerpo!.sku,
        weight: String(cuerpo!.weight), length: String(cuerpo!.length), width: String(cuerpo!.width), height: String(cuerpo!.height), gallery: [],
        warehouse_product: opciones.stockAlCrear === false ? [] : (cuerpo!.warehouselected as Obj[]).map((w) => ({ warehouse_id: w.warehouse_id, stock: w.stock, warehouse: BODEGA })),
      }));
      return responder(opciones.respuestaCrear === "anidado" ? { product: { id } } : { id });
    }
    if (metodo === "PUT" && m && !m[2]) {
      const p = productos.get(Number(m[1]))!;
      // «Productos privados»: la reserva nueva (`change`) se agrega; una con `deleted_at` y `change` se quita; no se puede reservar más que el stock.
      const reservas = (cuerpo!.private_product_inventories as Obj[] | undefined) ?? [];
      if (reservas.some((x) => x.change === true)) {
        if (opciones.fallaAsignar) return responder({ isSuccess: false, message: "Error al asignar" }, 500);
        for (const x of reservas.filter((y) => y.change === true)) {
          const viva = (p.private_product_inventories as Obj[]).find((y) => y.user_id === x.user_id && !y.deleted_at);
          if (x.deleted_at) {
            if (viva) viva.deleted_at = "2026-10-26";
          } else if (!viva) {
            const stock = (p.warehouse_product as Obj[]).reduce((t, w) => t + Number(w.stock), 0);
            const ya = (p.private_product_inventories as Obj[]).filter((y) => !y.deleted_at).reduce((t, y) => t + Number(y.stock), 0);
            if (ya + Number(x.stock) > stock) return responder({ isSuccess: false, message: "La cantidad en stock es menor" }, 422);
            p.private_product_inventories.push({ id: 500 + p.private_product_inventories.length, product_id: p.id, user_id: x.user_id, email: x.email, stock: x.stock, deleted_at: null });
          }
        }
      }
      Object.assign(p, { name: cuerpo!.name, description: cuerpo!.description, sale_price: String(cuerpo!.sale_price), suggested_price: String(cuerpo!.suggested_price), name_in_guide: cuerpo!.name_in_guide });
      for (const w of cuerpo!.warehouselected as Obj[]) {
        if (!w.type_movement) continue;
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
        if (fallo.veces >= 2) fallo.hecho = true;
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
      if (opciones.noArchiva) return responder({ isSuccess: false, message: "Tiene órdenes pendientes" }, 409);
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
  assert.match(String(r.error), /órdenes pendientes/);
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

test("republicar: si en un intento falló la foto principal, el reintento sube justo esa (no repite la otra)", async () => {
  const d = crearDropi({ fotos: "fallaLaPrincipal" });
  d.productos.set(8751, productoBase(8751, { gallery: [
    { id: 1, main: true, urlS3: "panama/products/8751/1779932274veganic.jpg", url: null, variation_id: null },
    { id: 2, main: false, urlS3: "panama/products/8751/1779932274veganic 4.png", url: null, variation_id: null },
  ] }));
  const [r1] = await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 8751 }]);
  assert.equal(r1.ok, false);
  assert.equal(r1.nuevo, 9001);
  assert.equal(d.productos.get(9001)!.gallery.length, 1, "en el primer intento solo subió la otra");
  const [r2] = await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 8751, nuevo: 9001 }]);
  assert.equal(r2.ok, true, String(r2.error));
  const g = d.productos.get(9001)!.gallery as Obj[];
  assert.equal(g.length, 2, "las dos fotos, sin repetir");
  assert.ok(g.some((f) => f.main && String(f.urlS3).endsWith("1779932274veganic.jpg")), "la principal quedó como principal");
});

test("republicar: si el navegador no deja bajar la foto del CDN, la pide a la plataforma y la sube", async () => {
  const d = crearDropi({ cdnBloqueado: true });
  d.productos.set(10474, productoBase(10474));
  const [r] = await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 10474 }]);
  assert.equal(r.ok, true, String(r.error));
  assert.equal(d.productos.get(9001)!.gallery.length, 1);
});

test("republicar: si la plataforma tampoco puede bajar la foto, el error lo dice", async () => {
  const d = crearDropi({ cdnBloqueado: true });
  d.fotoPorPlataforma = false;
  d.productos.set(10474, productoBase(10474));
  const [r] = await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 10474 }]);
  assert.equal(r.ok, false);
  assert.match(String(r.error), /no se pudo bajar la foto por la plataforma \(502: sin foto\)/);
});

test("republicar: con fotos copiadas en el sistema, sube esas (la primera como principal) y no toca el CDN de Dropi", async () => {
  const d = crearDropi({ cdnBloqueado: true });
  d.fotoPorPlataforma = false;
  d.productos.set(10474, productoBase(10474));
  const [r] = await aplicar(d, [{ ...base, id: "r1", tipo: "republicar", producto: 10474, fotos: [foto("1779932274anti.jpg"), foto("1779932275anti-2.png")] }]);
  assert.equal(r.ok, true, String(r.error));
  const g = d.productos.get(9001)!.gallery as Obj[];
  assert.equal(g.length, 2);
  assert.ok(g[0].main && String(g[0].urlS3).endsWith("1779932274anti.jpg"));
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
