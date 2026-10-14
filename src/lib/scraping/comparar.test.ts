import assert from "node:assert/strict";
import { test } from "node:test";
import { comparar, mejorPareja, normalizarDropi, type ProductoGuardado, type ProductoVisto } from "./comparar";

const visto = (dropiId: number, nombre: string, precio: number, stock: number, privado = false): ProductoVisto => ({
  dropiId,
  sku: null,
  nombre,
  foto: null,
  privado,
  precio,
  precioSugerido: null,
  stock,
  categoria: null,
  creadoEnDropi: null,
});

const guardado = (id: string, dropiId: number, nombre: string, precio: number, stock: number, estado: "activo" | "desaparecido" = "activo"): ProductoGuardado => ({
  id,
  dropiId,
  nombre,
  privado: false,
  precio,
  stock,
  estado,
});

test("normaliza un producto simple y uno variable de Dropi", () => {
  const simple = normalizarDropi({
    id: 89994,
    name: " Serum Medicube ",
    type: "SIMPLE",
    sku: "SERUM-1",
    sale_price: "120.50",
    suggested_price: 299,
    gallery: [{ urlS3: "mexico/products/89994/a.jpg", main: true }],
    warehouse_product: [{ stock: 40 }, { stock: "10" }],
    categories: [{ name: "Belleza" }],
  });
  assert.deepEqual(simple && { ...simple }, {
    dropiId: 89994,
    sku: "SERUM-1",
    nombre: "Serum Medicube",
    foto: "https://d39ru7awumhhs2.cloudfront.net/mexico/products/89994/a.jpg",
    privado: false,
    precio: 120.5,
    precioSugerido: 299,
    stock: 50,
    categoria: "Belleza",
    creadoEnDropi: null,
  });
  const variable = normalizarDropi({
    id: 1,
    name: "Privado Faja",
    type: "VARIABLE",
    gallery: [{ urlS3: "mexico/products/1/1785294069LOGO.jpeg" }],
    variations: [{ warehouse_product_variation: [{ stock: 3 }] }, { warehouse_product_variation: [{ stock: 4 }] }],
  });
  assert.equal(variable?.stock, 7);
  assert.equal(variable?.privado, true);
  assert.equal(variable?.foto, null, "el logo del proveedor no es la foto del producto");
  assert.equal(normalizarDropi({ name: "Sin id" }), null);
});

test("un privado se vincula solo con 2 palabras en común; con una sola queda como sugerencia", () => {
  const con = [
    { id: "a", nombre: "Crema ChillFlex Alivia Músculos Viral" },
    { id: "b", nombre: "Truly Crema Coco Cloud Luxury" },
  ];
  assert.deepEqual(mejorPareja("Privado Crema Chillflex Alivia Musculos", con), { id: "a", parecido: 1, seguro: true });
  const dudosa = mejorPareja("Privado Crema", con);
  assert.equal(dudosa?.seguro, false);
  assert.equal(mejorPareja("Privado Jorge CCP", con), null);
  // El nombre del proveedor no cuenta como parecido.
  assert.equal(mejorPareja("PRIVADO HYPER MODA 37", [{ id: "c", nombre: "Gomas Creatina HYPER" }], "HYPER MODA IMPORTACIONES"), null);
});

test("compara con lo guardado: nuevos, cambios, desaparecidos y reaparecidos", () => {
  const antes = [
    guardado("g1", 1, "Faja colombiana", 14.5, 820),
    guardado("g2", 2, "Pantalón palazzo", 8.4, 6),
    guardado("g3", 3, "Gafas de sol polarizadas", 4.9, 600),
    guardado("g4", 4, "Bolso bandolera", 9.8, 300),
    guardado("g5", 5, "Medias de compresión", 6.2, 0, "desaparecido"),
  ];
  const hoy = [
    visto(1, "Faja colombiana", 13.9, 910),
    visto(4, "Bolso bandolera", 9.8, 300),
    visto(5, "Medias de compresión", 6.2, 50),
    visto(6, "Brasier deportivo", 7.9, 1500),
    visto(7, "Privado Gafas de sol polarizadas", 4.9, 20, true),
    visto(6, "Brasier deportivo", 7.9, 1500),
  ];
  const r = comparar(antes, hoy);
  assert.deepEqual(r.nuevos.map((n) => n.dropiId), [6, 7]);
  const faja = r.vistos.find((v) => v.id === "g1");
  assert.deepEqual(faja?.eventos.map((e) => [e.evento, e.precio_antes ?? e.stock_antes, e.precio ?? e.stock]), [
    ["precio", 14.5, 13.9],
    ["stock", 820, 910],
  ]);
  assert.deepEqual(r.vistos.find((v) => v.id === "g4")?.eventos, []);
  assert.equal(r.vistos.find((v) => v.id === "g5")?.eventos[0].evento, "reaparecio");
  assert.deepEqual(r.desaparecidos.map((d) => [d.id, d.motivo]).sort(), [
    ["g2", "agotado"],
    ["g3", "privatizado"],
  ]);
  assert.deepEqual(r.cuentas, { vistos: 5, nuevos: 2, desaparecidos: 2, cambiosPrecio: 1, cambiosStock: 2, privados: 1 });
});
