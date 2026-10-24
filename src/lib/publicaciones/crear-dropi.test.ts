import assert from "node:assert/strict";
import test from "node:test";
import { ARMAR_JS } from "./marcador-aplicar-dropi";
import {
  armarProductoCrear,
  CREAR_JS,
  datosCrearVacios,
  faltantesCrearDropi,
  GARANTIAS_DROPI,
  normalizarDatosCrear,
  resolverCategorias,
  textoPlanoDropi,
  type DatosCrearDropi,
} from "./crear-dropi";

type Obj = Record<string, unknown>;
const delFavorito = new Function(`${ARMAR_JS};${CREAR_JS}; return { nuevoProducto, resolverCats, GARANTIAS };`)() as {
  nuevoProducto: (d: DatosCrearDropi, uid: number, bp: Obj[], cs: Obj[]) => Obj;
  resolverCats: (ns: string[], ls: Obj[]) => Obj;
  GARANTIAS: Obj[];
};
const igual = (a: unknown, b: unknown) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));

const bp = [{ id: 81, name: "Proveedor Ecomfive", address: "Ave Centenario, Costa del Este", city: "Panamá", warehouse_white_brand: false }];
const categorias: Obj[] = [
  { id: 4, name: "Belleza", parent_category: 0 },
  { id: 7, name: "Salud y Bienestar", parent_category: 0 },
];
const descripcion = `<p>${"Crema hidratante de uso diario para la piel del rostro y del cuerpo. ".repeat(4)}</p>`;
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
  descripcion,
  descripcionApp: "",
  sku: "CREMA/HIDRATANTE/50",
  codigoBarras: null,
  bodegas: [{ id: 81, unidades: 120 }],
  fotos: [1, 2, 3].map((n) => ({ url: `https://x.supabase.co/storage/v1/object/public/wms-productos/publicaciones/p/${n}.jpg`, nombre: `${n}.jpg` })),
};

test("lo que Dropi exige: nada falta cuando todo está", () => {
  assert.deepEqual(faltantesCrearDropi(completo), []);
});

test("lo que Dropi exige: cada dato obligatorio avisa cuando falta", () => {
  const f = faltantesCrearDropi(datosCrearVacios());
  for (const parte of [/nombre/, /peso/, /largo/, /ancho/, /alto/, /categor/, /descripci/, /precio de venta/, /precio sugerido/, /bodega/, /im[aá]genes/]) {
    assert.ok(f.some((m) => parte.test(m)), `debería avisar ${parte}: ${f.join(" | ")}`);
  }
});

test("lo que Dropi exige: límites del peso, de la descripción, del stock, de las fotos y de los precios", () => {
  const con = (cambio: Partial<DatosCrearDropi>) => faltantesCrearDropi({ ...completo, ...cambio });
  assert.match(con({ peso: 25001 }).join(), /peso máximo/);
  assert.deepEqual(con({ peso: 25000 }), []);
  assert.deepEqual(con({ peso: 0.001, largo: 0.001, ancho: 0.001, alto: 0.001 }), []);
  assert.match(con({ descripcion: "<p>corta</p>" }).join(), /al menos 200/);
  assert.match(con({ bodegas: [{ id: 81, unidades: 99 }] }).join(), /100 unidades/);
  assert.deepEqual(con({ bodegas: [{ id: 81, unidades: 100 }] }), []);
  assert.match(con({ fotos: completo.fotos.slice(0, 2) }).join(), /3 im/);
  assert.match(con({ precio: 0.05, precioSugerido: 0.05 }).join(), /precio de venta/);
  assert.match(con({ precio: 10, precioSugerido: 9 }).join(), /sugerido no puede ser menor/);
  assert.match(con({ nombre: "x".repeat(41) }).join(), /40 caracteres/);
});

test("el texto de la descripción se cuenta sin etiquetas", () => {
  assert.equal(textoPlanoDropi("<p>Hola&nbsp;<b>mundo</b></p>"), "Hola mundo");
});

test("normalizar: números, listas y fotos con forma válida; nunca lanza", () => {
  const d = normalizarDatosCrear({
    nombre: "  Crema  ",
    precio: "9,90",
    peso: "120",
    categorias: ["Belleza", "Belleza", "", 4],
    bodegas: [{ id: "81", unidades: "150" }, { id: 81, unidades: 5 }, { id: -1, unidades: 5 }, null],
    fotos: [{ url: "https://x.co/a.jpg", nombre: "a.jpg" }, { url: "http://x.co/b.jpg" }, { url: "https://x.co/a.jpg" }, { url: "javascript:alert(1)" }],
  });
  assert.equal(d.nombre, "Crema");
  assert.equal(d.precio, 9.9);
  assert.equal(d.peso, 120);
  assert.deepEqual(d.categorias, ["Belleza"]);
  assert.deepEqual(d.bodegas, [{ id: 81, unidades: 150 }]);
  assert.deepEqual(d.fotos, [{ url: "https://x.co/a.jpg", nombre: "a.jpg" }]);
  assert.deepEqual(normalizarDatosCrear(null), datosCrearVacios());
  assert.deepEqual(normalizarDatosCrear("raro"), datosCrearVacios());
});

test("las categorías se buscan por nombre, sin importar mayúsculas ni acentos, y se mandan como las manda Dropi", () => {
  const r = resolverCategorias(["BELLEZA", "salud y bienestar"], categorias);
  assert.deepEqual("categorias" in r && r.categorias, [
    { id: 4, name: "Belleza", parent_category: 0 },
    { id: 7, name: "Salud y Bienestar", parent_category: 0 },
  ]);
  assert.match(String((resolverCategorias(["Mascotas"], categorias) as { error: string }).error), /Mascotas/);
});

test("el producto que se crea: los mismos campos y orden que el guardado de Dropi", () => {
  const r = armarProductoCrear(completo, 2094, bp, categorias);
  assert.ok("cuerpo" in r);
  assert.deepEqual(Object.keys(r.cuerpo), [
    "user_id", "id", "name", "description", "type", "sale_price", "suggested_price", "privated_product", "active", "sku", "weight", "length", "width", "height",
    "attribute", "variations", "categories", "dropi_app_description", "add_stock_in_return", "private_product_inventories", "user_profit_percentage_product",
    "is_warehouse_white_brand", "warehouselected", "name_in_guide", "shipping_method", "bar_code",
  ]);
  assert.equal(r.cuerpo.id, null);
  assert.equal(r.cuerpo.type, "SIMPLE");
  assert.equal(r.cuerpo.privated_product, false);
  assert.equal(r.cuerpo.user_id, 2094);
  assert.equal(r.cuerpo.name_in_guide, "CREMA/HIDRATANTE/50");
  igual(r.cuerpo.warehouselected, [{ warehouse_id: 81, fullName: "Proveedor Ecomfive(Ave Centenario, Costa del Este)", stock: 120, city: "Panamá", warehouse_white_brand: false }]);
  igual(r.cuerpo.categories, [{ id: 4, name: "Belleza", parent_category: 0 }]);
});

test("no se crea: con datos que faltan, con una categoría que Dropi no tiene o con una bodega que no es del proveedor", () => {
  assert.ok("error" in armarProductoCrear({ ...completo, peso: null }, 2094, bp, categorias));
  assert.match(String((armarProductoCrear({ ...completo, categorias: ["Mascotas"] }, 2094, bp, categorias) as { error: string }).error), /Mascotas/);
  assert.match(String((armarProductoCrear({ ...completo, bodegas: [{ id: 280, unidades: 200 }] }, 2094, bp, categorias) as { error: string }).error), /280/);
});

test("el favorito arma exactamente lo mismo que el sistema", () => {
  const casos: DatosCrearDropi[] = [completo, { ...completo, nombreGuia: null, sku: null, codigoBarras: "7501031311309" }, { ...completo, categorias: ["Belleza", "Salud y Bienestar"] }, { ...completo, categorias: ["Mascotas"] }, { ...completo, bodegas: [{ id: 280, unidades: 120 }] }];
  for (const d of casos) {
    const sistema = armarProductoCrear(d, 2094, bp, categorias);
    igual(delFavorito.nuevoProducto(d, 2094, bp, categorias), sistema);
  }
  igual(delFavorito.GARANTIAS, GARANTIAS_DROPI);
});
