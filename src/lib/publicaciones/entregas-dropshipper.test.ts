import { test } from "node:test";
import assert from "node:assert/strict";
import { leerEntrega, nombreDeFila, repartoEntregas, type EntregaDropshipper } from "./entregas-dropshipper";

const fila = (x: Partial<EntregaDropshipper>): EntregaDropshipper => ({
  dropshipperId: null,
  nombre: null,
  usuario: null,
  tienda: null,
  entregados30: 0,
  entregados90: 0,
  entregadosTotal: 0,
  ultimo: null,
  ...x,
});

test("reparte por periodo, quita los que no entregaron y ordena de más a menos", () => {
  const filas = [
    fila({ nombre: "Ana", entregados30: 1, entregados90: 4, entregadosTotal: 10 }),
    fila({ nombre: "Beto", entregados30: 3, entregados90: 4, entregadosTotal: 5 }),
    fila({ tienda: "Tienda X", entregados30: 0, entregados90: 0, entregadosTotal: 5 }),
  ];
  const r30 = repartoEntregas(filas, "30");
  assert.equal(r30.total, 4);
  assert.deepEqual(r30.filas.map((f) => [f.nombre, f.entregados, f.parte]), [["Beto", 3, 0.75], ["Ana", 1, 0.25]]);
  const rt = repartoEntregas(filas, "total");
  assert.equal(rt.total, 20);
  assert.equal(rt.filas.length, 3);
  assert.equal(rt.filas[0].parte, 0.5);
});

test("a igual cantidad va primero el que entregó más reciente", () => {
  const r = repartoEntregas([fila({ nombre: "A", entregadosTotal: 2, ultimo: "2026-10-01" }), fila({ nombre: "B", entregadosTotal: 2, ultimo: "2026-11-01" })], "total");
  assert.deepEqual(r.filas.map((f) => f.nombre), ["B", "A"]);
});

test("sin entregas no divide entre cero", () => {
  assert.deepEqual(repartoEntregas([fila({})], "30"), { filas: [], total: 0 });
});

test("el nombre: dropshipper, si no la tienda, si no el usuario", () => {
  assert.equal(nombreDeFila(fila({ nombre: "Ana", tienda: "T" })), "Ana");
  assert.equal(nombreDeFila(fila({ tienda: "T", usuario: "9" })), "T");
  assert.equal(nombreDeFila(fila({ usuario: "9" })), "Usuario 9");
});

test("lee la fila de la base", () => {
  const e = leerEntrega({ dropshipper_id: null, dropshipper_nombre: null, usuario_externo: 12, tienda_nombre: "", entregados_30: "2", entregados_90: 3, entregados_total: 9, ultimo_entregado: "2026-11-10" });
  assert.deepEqual(e, { dropshipperId: null, nombre: null, usuario: "12", tienda: null, entregados30: 2, entregados90: 3, entregadosTotal: 9, ultimo: "2026-11-10" });
});
