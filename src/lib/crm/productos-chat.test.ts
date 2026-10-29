import assert from "node:assert/strict";
import { test } from "node:test";
import { cuantoFalta, diasHasta, productosMencionados } from "./productos-chat";

// Se corre con: npm run test:seguridad (incluye estas pruebas del CRM)

const CATALOGO = [
  { id: "1", nombre: "Aceite de Semilla de Calabaza", codigo: "ACEITE/SEMILLA/CALABAZA" },
  { id: "2", nombre: "Vivonu Aceite de Semilla de Calabaza", codigo: "VIVONU/ACEITE/SEMILLA" },
  { id: "3", nombre: "Cutting Mix", codigo: "CUTTING/MIX" },
  { id: "4", nombre: "Aceite de Oregano 300 capsulas Blanco", codigo: "ACEITE/OREGANO" },
  { id: "5", nombre: "Shilajit", codigo: "SHILAJIT" },
  { id: "6", nombre: "Mix", codigo: "MIX" },
];

test("encuentra los productos que pregunta el dropshipper (el chat de Gisav Panamá)", () => {
  const r = productosMencionados("Buen día cuando podrá tener el cutting mix y semilla de calabaza", CATALOGO).map((p) => p.id);
  // El producto base antes que su versión de otra marca; una palabra corta suelta («mix») no basta, ni «aceite» solo.
  assert.deepEqual(r, ["3", "1", "2"]);
});

test("sin tildes ni mayúsculas, y una sola palabra larga cuenta", () => {
  assert.deepEqual(productosMencionados("¿Tienen SHILAJIT? y el aceite de orégano", CATALOGO).map((p) => p.id), ["5", "4"]);
  assert.deepEqual(productosMencionados("hola, buenas tardes", CATALOGO), []);
});

test("cuánto falta para la llegada", () => {
  assert.equal(diasHasta("2026-11-12", "2026-10-29T15:00:00Z"), 14);
  assert.equal(cuantoFalta("2026-11-12", "2026-10-29"), "en 14 días");
  assert.equal(cuantoFalta("2026-10-30", "2026-10-29"), "mañana");
  assert.equal(cuantoFalta("2026-10-29", "2026-10-29"), "hoy");
  assert.equal(cuantoFalta("2026-10-26", "2026-10-29"), "atrasada 3 días");
});
