import assert from "node:assert/strict";
import { test } from "node:test";
import { armarAlertas, decisionesDeHoy, normalizarCompetencia, posicionPrecio, unidadesBajadas, type ProductoAlerta } from "./analisis";

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
  assert.match(d[0].motivo, /ISTMO lo vende a \$6\.00 \(nosotros \$7\.49\) y vendió 58 en 7 días\. Somos #2 de 2\./);
  assert.match(d[1].motivo, /se queda sin stock en ~3 semanas/);
});
