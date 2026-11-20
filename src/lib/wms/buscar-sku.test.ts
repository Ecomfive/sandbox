import assert from "node:assert/strict";
import test from "node:test";
import { buscarProductos, type OpcionBuscable } from "./buscar-sku";

const op = (id: string, nombre: string, extra: Partial<OpcionBuscable> = {}): OpcionBuscable => ({ id, codigo: nombre.toUpperCase().replace(/\s+/g, "/"), nombre, ...extra });
const tallas = ["Beige / S", "Beige / M", "Beige / L", "Beige / XL", "Beige / 2XL", "Negro / S", "Negro / M", "Negro / L", "Negro / XL", "Negro / 2XL"];

test("las 10 variantes de un producto cuentan como un solo producto, aunque su producto no esté entre las opciones", () => {
  // La remisión ofrece solo variantes (sin el producto que las agrupa): antes cada una contaba como un producto y el límite de 8 dejaba fuera Negro / S y Negro / XL.
  const opciones = tallas.map((t, i) => op(`v${i}`, `Faja Body Enterizo · ${t}`, { padreId: "padre" }));
  const r = buscarProductos(opciones, "faja");
  assert.equal(r.length, 10);
  assert.ok(r.some((f) => f.o.nombre.endsWith("Negro / S")));
  assert.ok(r.some((f) => f.o.nombre.endsWith("Negro / XL")));
  assert.ok(r.every((f) => !f.variante), "sin su producto no hay sangría");
});

test("con su producto entre las opciones, las variantes van debajo con sangría", () => {
  const opciones = [op("padre", "Faja Body Enterizo"), ...tallas.map((t, i) => op(`v${i}`, `Faja Body Enterizo · ${t}`, { padreId: "padre" }))];
  const r = buscarProductos(opciones, "faja");
  assert.equal(r[0].o.id, "padre");
  assert.equal(r[0].variante, false);
  assert.equal(r.length, 11);
  assert.ok(r.slice(1).every((f) => f.variante));
});

test("el límite cuenta productos distintos", () => {
  const otros = Array.from({ length: 12 }, (_, i) => op(`p${i}`, `Faja modelo ${i}`));
  const variantes = tallas.map((t, i) => op(`v${i}`, `Faja Body Enterizo · ${t}`, { padreId: "padre" }));
  const r = buscarProductos([...otros, ...variantes], "faja", 8);
  const grupos = new Set(r.map((f) => f.o.padreId ?? f.o.id));
  assert.equal(grupos.size, 8);
});

test("escribir una talla trae solo las variantes que coinciden", () => {
  const opciones = tallas.map((t, i) => op(`v${i}`, `Faja Body Enterizo · ${t}`, { padreId: "padre" }));
  const r = buscarProductos(opciones, "negro / xl").map((f) => f.o.nombre);
  // «xl» también está dentro de «2xl»; las demás tallas y el beige no entran.
  assert.deepEqual(r.sort(), ["Faja Body Enterizo · Negro / 2XL", "Faja Body Enterizo · Negro / XL"]);
});

test("sin texto salen los primeros productos en su orden", () => {
  const r = buscarProductos([op("a", "Aceite"), op("b", "Crema")], "");
  assert.deepEqual(r.map((f) => f.o.id), ["a", "b"]);
});
