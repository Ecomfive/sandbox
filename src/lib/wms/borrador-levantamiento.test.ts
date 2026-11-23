import assert from "node:assert/strict";
import test from "node:test";
import { claveBorrador, hayAlgo, leerBorrador, VIGENCIA_BORRADOR_MS } from "./borrador-levantamiento";

const base = { contados: {}, lotes: {}, cajas: {}, sumas: {}, restas: {}, traslados: {}, referencia: "" };
const ahora = Date.parse("2026-11-23T15:00:00Z");

test("la clave va por país y bodega", () => {
  assert.equal(claveBorrador("PA", "b1"), "levantamiento-borrador:PA:b1");
});

test("hayAlgo: los campos vacíos no cuentan", () => {
  assert.equal(hayAlgo(base), false);
  assert.equal(hayAlgo({ ...base, contados: { a: " " } }), false);
  assert.equal(hayAlgo({ ...base, contados: { a: "0" } }), true, "un cero contado sí cuenta");
  assert.equal(hayAlgo({ ...base, traslados: { a: { cantidad: "3", destino: "" } } }), true);
});

test("leerBorrador: vuelve lo escrito y descarta lo dañado, lo vacío o lo viejo", () => {
  const bueno = { version: 1, guardadoEn: new Date(ahora - 3_600_000).toISOString(), ...base, contados: { a: "12", b: 5 }, lotes: { c: [{ codigo: "L1" }] } };
  const b = leerBorrador(JSON.stringify(bueno), ahora);
  assert.deepEqual(b?.contados, { a: "12" }, "lo que no es texto se descarta");
  assert.equal(b?.lotes.c.length, 1);
  assert.equal(leerBorrador("{roto", ahora), null);
  assert.equal(leerBorrador(null, ahora), null);
  assert.equal(leerBorrador(JSON.stringify({ ...bueno, contados: {}, lotes: {} }), ahora), null, "vacío");
  assert.equal(leerBorrador(JSON.stringify({ ...bueno, guardadoEn: new Date(ahora - VIGENCIA_BORRADOR_MS - 1).toISOString() }), ahora), null, "más de una semana");
  assert.equal(leerBorrador(JSON.stringify({ ...bueno, version: 2 }), ahora), null);
});
