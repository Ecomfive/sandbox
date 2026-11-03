import assert from "node:assert/strict";
import { test } from "node:test";
import { perfilProveedor, type ProductoDeProveedor } from "./perfil-proveedor";

const p = (id: string, extra: Partial<ProductoDeProveedor> = {}): ProductoDeProveedor => ({
  id,
  nombre: `Producto ${id}`,
  foto: null,
  categoria: "Belleza",
  precio: 100,
  precioUsd: 5,
  stock: 50,
  ventas30: 0,
  ventas7: 0,
  estado: "activo",
  nuevo: false,
  recomendacion: "sin_senales",
  yaVisto: null,
  parecidos: [],
  marcado: null,
  ...extra,
});

test("el perfil de un proveedor: categorías fuertes, lo que no tenemos, lo que más vende y lo nuevo", () => {
  const r = perfilProveedor([
    p("a", { categoria: "Salud, Belleza", ventas30: 120, recomendacion: "testear", precio: 300, precioUsd: 15 }),
    p("b", { categoria: "Hogar", ventas30: 40, recomendacion: "mirar", nuevo: true, parecidos: [{ nombre: "Lámpara nuestra" }] }),
    p("c", { categoria: "Salud", ventas30: 500, yaVisto: { nombre: "NAD+ 1000 mg" }, recomendacion: "tenemos", precio: 50, precioUsd: 2.5 }),
    p("d", { categoria: null, marcado: { en: "2026-11-01" } }),
    p("e", { estado: "desaparecido", ventas30: 999 }),
  ]);
  assert.equal(r.activos, 4);
  assert.equal(r.desaparecidos, 1);
  assert.equal(r.ventas30, 660, "lo desaparecido no suma");
  assert.deepEqual(r.categorias.map((c) => [c.nombre, c.productos, c.ventas30]), [
    ["Salud", 2, 620],
    ["Belleza", 1, 120],
    ["Hogar", 1, 40],
    ["Sin categoría", 1, 0],
  ]);
  // Lo que no tenemos: Testear primero, luego Mirar; lo igual o marcado «Ya lo tenemos» no entra.
  assert.deepEqual(r.noTenemos.map((x) => x.id), ["a", "b"]);
  assert.equal(r.noTenemos[1].nuestro, "Lámpara nuestra");
  assert.deepEqual(r.masVendidos.map((x) => x.id), ["c", "a", "b"]);
  assert.deepEqual(r.tenemos.map((x) => [x.id, x.nuestro]), [["c", "NAD+ 1000 mg"], ["d", null]]);
  assert.deepEqual(r.nuevos.map((x) => x.id), ["b"]);
  assert.deepEqual(r.precios, { minimo: 50, mediana: 100, maximo: 300, minimoUsd: 2.5, medianaUsd: 5, maximoUsd: 15 });
  assert.equal(perfilProveedor([]).precios, null);
});
