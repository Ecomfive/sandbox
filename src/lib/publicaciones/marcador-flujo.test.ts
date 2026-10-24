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
function crearDropi(opciones: { stockAlCrear?: boolean; noArchiva?: boolean; categorias?: Obj[]; fallaCrear?: boolean } = {}) {
  const productos = new Map<number, Obj>();
  const llamadas: string[] = [];
  let siguiente = 9001;
  const stockDe = (p: Obj) => Object.fromEntries((p.warehouse_product as Obj[]).map((w) => [w.warehouse_id, Number(w.stock)]));
  const responder = (objeto: unknown, status = 200) => new Response(JSON.stringify(typeof objeto === "object" && objeto !== null && "isSuccess" in objeto ? objeto : { isSuccess: status < 400, objects: objeto }), { status });

  const fetchFalso = async (entrada: string | URL, init: RequestInit = {}): Promise<Response> => {
    const url = String(entrada);
    const metodo = (init.method ?? "GET").toUpperCase();
    // Una foto que el favorito baja de Storage para subirla a Dropi.
    if (url.startsWith("https://x.supabase.co/")) return new Response(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], { type: "image/jpeg" }));
    const ruta = url.replace("https://api.dropi.pa/api", "");
    llamadas.push(`${metodo} ${ruta}`);
    const cuerpo: Obj | null = typeof init.body === "string" ? JSON.parse(init.body) : null;
    if (metodo === "GET" && ruta === "/users/2094") return responder({ id: 2094, warehouses: [BODEGA] });
    if (metodo === "GET" && ruta === "/categories") return responder(opciones.categorias ?? [{ id: 4, name: "Belleza", parent_category: 0 }, { id: 7, name: "Salud", parent_category: 0 }]);
    const m = ruta.match(/^\/products\/(\d+)(\/[A-Za-z]+)?$/);
    if (metodo === "GET" && m && !m[2]) {
      const p = productos.get(Number(m[1]));
      return p ? responder(structuredClone(p)) : responder({ isSuccess: false }, 404);
    }
    if (metodo === "POST" && ruta === "/products") {
      if (opciones.fallaCrear) return responder({ isSuccess: false, message: "Rechazado por Dropi" }, 400);
      const id = siguiente++;
      productos.set(id, productoBase(id, {
        name: cuerpo!.name, description: cuerpo!.description, sale_price: String(cuerpo!.sale_price), suggested_price: String(cuerpo!.suggested_price), categories: cuerpo!.categories, sku: cuerpo!.sku,
        weight: String(cuerpo!.weight), length: String(cuerpo!.length), width: String(cuerpo!.width), height: String(cuerpo!.height), gallery: [],
        warehouse_product: opciones.stockAlCrear === false ? [] : (cuerpo!.warehouselected as Obj[]).map((w) => ({ warehouse_id: w.warehouse_id, stock: w.stock, warehouse: BODEGA })),
      }));
      return responder({ id });
    }
    if (metodo === "PUT" && m && !m[2]) {
      const p = productos.get(Number(m[1]))!;
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
      const f = init.body as FormData;
      const p = productos.get(Number(f.get("id")))!;
      const archivo = f.get("files") as File;
      p.gallery.push({ id: p.gallery.length + 100, main: f.get("main") === "true", urlS3: `panama/products/${p.id}/1779999999${archivo.name}`, url: null, variation_id: null });
      return responder(true);
    }
    if (metodo === "POST" && ruta === "/productwarranty/create") return responder(true);
    if (metodo === "POST" && m && m[2] === "/archiveProduct") {
      if (opciones.noArchiva) return responder({ isSuccess: false, message: "Tiene órdenes pendientes" }, 409);
      productos.get(Number(m[1]))!.archived = true;
      return responder(true);
    }
    if (metodo === "POST" && m && m[2] === "/unarchive") {
      productos.get(Number(m[1]))!.archived = null;
      return responder(true);
    }
    return responder({ isSuccess: false, message: `Ruta no simulada: ${metodo} ${ruta}` }, 404);
  };
  return { productos, llamadas, fetchFalso, stockDe };
}

/** Pulsa el favorito con esos cambios y devuelve lo que la ventana recibió. */
async function aplicar(dropi: ReturnType<typeof crearDropi>, cambios: Obj[]): Promise<Obj[]> {
  const codigo = decodeURIComponent(marcadorAplicarDropi(ORIGEN).slice("javascript:".length));
  const mensajes: Obj[] = [];
  const ventana = { postMessage: (m: Obj) => mensajes.push(m) };
  let oyente: ((e: Obj) => Promise<void>) | null = null;
  const ventanaGlobal = { open: () => ventana, addEventListener: (_t: string, f: (e: Obj) => Promise<void>) => (oyente = f), removeEventListener: () => {} };
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
  assert.ok(d.llamadas.includes("POST /products/8751/unarchive"));
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
