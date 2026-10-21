import assert from "node:assert/strict";
import { test } from "node:test";
import { armarAlertas, decisionesDeHoy, medidaEnNombre, normalizarCompetencia, posicionPrecio, precioEquivalente, precioPorUnidad, unidadesBajadas, unirCoincidencias, unidadesEnNombre, type ProductoAlerta } from "./analisis";

test("normaliza un producto con su proveedor y reconoce los nuestros", () => {
  const p = normalizarCompetencia({ id: 7, name: "King Maker 120", sale_price: 6.99, user: { id: 2094, name: "ECOMFIVE" }, warehouse_product: [{ stock: 5 }] });
  assert.equal(p?.proveedorId, 2094);
  assert.equal(p?.esNuestro, true);
  assert.equal(normalizarCompetencia({ id: 8, name: "Algo", user: { id: 1, name: "ADMA" } })?.esNuestro, false);
  assert.equal(normalizarCompetencia({ id: 9, name: "Sin proveedor" }), null);
});

test("arma las alertas de una búsqueda", () => {
  const productos = new Map<string, ProductoAlerta>([
    ["n1", { id: "n1", nombre: "King Maker", proveedorNombre: "ECOMFIVE", esNuestro: true, precio: 6.99, stock: 100, igualA: null }],
    ["c1", { id: "c1", nombre: "KINGMAKER 120", proveedorNombre: "ADMA", esNuestro: false, precio: 6.5, stock: 40, igualA: "n1" }],
    ["c2", { id: "c2", nombre: "Mini lavadora", proveedorNombre: "ADMA", esNuestro: false, precio: 18.9, stock: 300, igualA: null }],
    ["c3", { id: "c3", nombre: "Faja", proveedorNombre: "ADMA", esNuestro: false, precio: 10, stock: 3, igualA: null }],
  ]);
  const ev = (evento: "precio" | "stock", antes: number, ahora: number) => ({
    evento,
    precio: evento === "precio" ? ahora : null,
    precio_antes: evento === "precio" ? antes : null,
    stock: evento === "stock" ? ahora : null,
    stock_antes: evento === "stock" ? antes : null,
    detalle: null,
  });
  const a = armarAlertas({
    productos,
    cambios: [{ id: "c1", eventos: [ev("precio", 8.99, 6.5), ev("stock", 90, 40)] }],
    desaparecidos: [],
    proveedoresNuevos: [{ nombre: "PANAMA GADGETS", productos: 54 }],
  });
  assert.deepEqual(a.map((x) => x.tipo), ["mas_barato", "bajo_stock", "competidor_nuevo"]);
  assert.match(a[0].detalle!, /\$8\.99 → \$6\.50 · el nuestro \(«King Maker»\) está en \$6\.99/);
  assert.match(a[1].detalle!, /90 → 40 \(−50\)/);
});

test("unidades que bajó el stock por periodo, sin restar las reposiciones", () => {
  const ahora = new Date("2026-10-14T12:00:00Z");
  const cambios = [
    { fecha: "2026-09-20T05:00:00Z", stock: 400, stockAntes: 500 },
    { fecha: "2026-10-10T05:00:00Z", stock: 300, stockAntes: 380 },
    { fecha: "2026-10-11T05:00:00Z", stock: 600, stockAntes: 300 },
    { fecha: "2026-10-14T05:00:00Z", stock: 570, stockAntes: 600 },
  ];
  assert.equal(unidadesBajadas(cambios, 1, ahora), 30);
  assert.equal(unidadesBajadas(cambios, 7, ahora), 110);
  assert.equal(unidadesBajadas(cambios, 30, ahora), 210);
});

test("posición en precio frente a la competencia", () => {
  assert.deepEqual(posicionPrecio(7.49, [6, 9.99]), { pos: 2, de: 3, estado: "perdiendo", minimo: 6 });
  assert.deepEqual(posicionPrecio(2.99, [3]), { pos: 1, de: 2, estado: "ganando", minimo: 3 });
  assert.equal(posicionPrecio(9.9, [9.9])?.estado, "empatado");
  assert.equal(posicionPrecio(null, [3]), null);
  assert.equal(posicionPrecio(5, [null]), null);
});

test("qué hacer hoy", () => {
  const ahora = new Date("2026-10-14T12:00:00Z");
  const base = { foto: null, estado: "activo" as const, primeraVez: "2026-10-01T00:00:00Z", ultimaVez: "2026-10-14T05:00:00Z" };
  const d = decisionesDeHoy(
    [
      { id: "t", nombre: "Turmeric", precio: 7.49, foto: null },
      { id: "k", nombre: "Kinoki", precio: 2.99, foto: null },
      { id: "c", nombre: "Collagen", precio: 12.99, foto: null },
    ],
    [
      { ...base, id: "a", proveedorId: 1, proveedor: "ISTMO", nombre: "Turmeric 60", precio: 6, stock: 400, bajo7: 58, igualA: "t" },
      { ...base, id: "b", proveedorId: 2, proveedor: "TODO", nombre: "Kinoki", precio: 3, stock: 220, bajo7: 15, igualA: "k" },
      { ...base, id: "c1", proveedorId: 1, proveedor: "ISTMO", nombre: "Collagen 300", precio: 13.5, stock: 60, bajo7: 22, igualA: "c" },
      { ...base, id: "n", proveedorId: 3, proveedor: "NUEVO", nombre: "Kinoki nuevo", precio: 3.2, stock: 50, bajo7: 0, igualA: "k", primeraVez: "2026-10-13T05:00:00Z" },
    ],
    [{ proveedorId: 4, nombre: "BELLEZA", productos: 54 }],
    "2026-10-05T00:00:00Z",
    ahora,
  );
  assert.deepEqual(
    d.map((x) => [x.tipo, x.titulo]),
    [
      ["bajar", "Turmeric"],
      ["oportunidad", "Collagen"],
      ["vigilar", "Kinoki"],
      ["vigilar", "BELLEZA (competidor nuevo)"],
      ["mantener", "Kinoki"],
      ["mantener", "Collagen"],
    ],
  );
  assert.match(d[0].motivo, /ISTMO lo vende a \$6\.00, nosotros \$7\.49, y vendió 58 en 7 días\. Somos #2 de 2\./);
  assert.match(d[1].motivo, /se queda sin stock en ~3 semanas/);
});

test("unidades que trae una publicación, leídas del nombre", () => {
  assert.equal(unidadesEnNombre("King Maker Capsulas PACK-2"), 2);
  assert.equal(unidadesEnNombre("Yerba Magic PACK-2"), 2);
  assert.equal(unidadesEnNombre("Crema Reafirmante 2x1"), 2);
  assert.equal(unidadesEnNombre("Filtro De Lavadora X2"), 2);
  assert.equal(unidadesEnNombre("2 Pares Calcetines De Compresión"), 2);
  assert.equal(unidadesEnNombre("COMBO Lemme burn y lemme purn"), 2);
  // El contenido no es cantidad de productos.
  assert.equal(unidadesEnNombre("YERBA MAGIC  x 60"), 1);
  assert.equal(unidadesEnNombre("Turmeric Pure Curcumin 120 capsulas"), 1);
  assert.equal(unidadesEnNombre("TURMERIC X 60 CAPSULAS"), 1);
  assert.equal(unidadesEnNombre("Limpiador De Oídos Kit 6 Piezas"), 1);
  assert.equal(unidadesEnNombre("Lemme Burn"), 1);
  assert.equal(precioPorUnidad(15.49, "COMBO Lemme burn y lemme purn"), 7.75);
});

test("las decisiones comparan con el precio equivalente", () => {
  const base = { foto: null, estado: "activo" as const, primeraVez: "2026-10-01T00:00:00Z", ultimaVez: "2026-10-14T05:00:00Z", stock: 500 };
  const d = decisionesDeHoy(
    [{ id: "l", nombre: "COMBO Lemme burn y lemme purn", precio: 15.49, foto: null }],
    [{ ...base, id: "x", proveedorId: 1, proveedor: "Natural", nombre: "Lemme Burn", precio: 8.5, bajo7: 3, igualA: "l" }],
    [],
    null,
    new Date("2026-10-14T12:00:00Z"),
  );
  // Su unidad a $8.50 equivale a $17.00 por nuestro COMBO de 2 a $15.49: vamos ganando, no hay que bajar.
  assert.deepEqual(d.map((x) => x.tipo), ["mantener"]);
  assert.match(d[0].motivo, /\$15\.49 frente a \$8\.50 por 1 unidad \(= \$17\.00 por el nuestro\)/);
});

test("contenido y precio equivalente a nuestro producto", () => {
  assert.deepEqual(medidaEnNombre("Turmeric Pure Curcumin 120 capsulas"), { tipo: "cápsulas", cantidad: 120 });
  assert.deepEqual(medidaEnNombre("MAGNESIUM COMPLEX TOPLUX 90 CAP"), { tipo: "cápsulas", cantidad: 90 });
  assert.deepEqual(medidaEnNombre("JJLBRO SPRAY 30ML"), { tipo: "ml", cantidad: 30 });
  assert.deepEqual(medidaEnNombre("Neocell Collagen Bio-Peptides 20G"), { tipo: "g", cantidad: 20 });
  assert.equal(medidaEnNombre("YERBA MAGIC  x 60"), null);
  // 60 cápsulas a $6.00 equivalen a $12.00 por nuestras 120.
  assert.deepEqual(precioEquivalente("Turmeric Pure Curcumin 120 capsulas", { precio: 6, nombre: "TURMERIC X 60 CAPSULAS" }), { precio: 12, nota: "$6.00 por 60 cápsulas" });
  assert.deepEqual(precioEquivalente("Aceite de Oregano 300 capsulas", { precio: 10, nombre: "CAPSULAS OREGANO 150 CAPS" }), { precio: 20, nota: "$10.00 por 150 cápsulas" });
  // Sin contenido en los dos, por unidades: un PACK-2 nuestro frente a la unidad.
  assert.deepEqual(precioEquivalente("King Maker Capsulas PACK-2", { precio: 8.99, nombre: "KINGMAKER 120 CAPSULAS" }), { precio: 17.98, nota: "$8.99 por 1 unidad" });
  // Igual tamaño: sin conversión.
  assert.deepEqual(precioEquivalente("Parches Kinoki", { precio: 3, nombre: "PARCHES KINOKI" }), { precio: 3, nota: null });
});

test("unirCoincidencias: un competidor encontrado por dos nombres cuenta una vez, con lo mejor de cada búsqueda", () => {
  const c = (id: string, parecido: number, porFoto = false) => ({ tipo: "producto" as const, id, nombre: id, detalle: "", porFoto, parecido });
  const r = unirCoincidencias([[c("a", 0.9), c("b", 0.86)], [c("a", 0.95, true), c("c", 0.88)], []]);
  assert.deepEqual(r.map((x) => x.id), ["a", "c", "b"]);
  assert.equal(r[0].parecido, 0.95);
  assert.equal(r[0].porFoto, true);
  assert.deepEqual(unirCoincidencias([]), []);
});
