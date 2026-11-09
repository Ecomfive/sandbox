import { strict as assert } from "node:assert";
import { test } from "node:test";
import { leerBaseReparto, participacionDe, pesosReparto, repartirEerr, type ParteEerr, type UnidadReparto } from "./reparto";

const M = "2026-03-01";
const parte = (p: Partial<ParteEerr>): ParteEerr => ({
  periodo: M,
  unidad_id: "a",
  clase: "tienda",
  entidad_id: "pa",
  tipo: "Ingresos",
  orden: 10,
  seccion: "ingresos",
  signo: 1,
  monto: 0,
  monto_local: 0,
  monto_ic: 0,
  monto_ic_local: 0,
  ...p,
});

const unidades: UnidadReparto[] = [
  { id: "a", entidad_id: "pa", recibe_reparto: true },
  { id: "b", entidad_id: "pa", recibe_reparto: true },
  { id: "corp", entidad_id: "pa", recibe_reparto: false },
  { id: "dist", entidad_id: "pa", recibe_reparto: false },
];

const partes: ParteEerr[] = [
  parte({ unidad_id: "a", monto: 300, monto_local: 300 }),
  parte({ unidad_id: "b", monto: 100, monto_local: 100 }),
  parte({ unidad_id: "a", tipo: "Costo", seccion: "costo_ventas", signo: -1, monto: 250, monto_local: 250 }),
  parte({ unidad_id: "b", tipo: "Costo", seccion: "costo_ventas", signo: -1, monto: 50, monto_local: 50 }),
  parte({ unidad_id: "dist", clase: "reparto", tipo: "Sistemas", seccion: "administracion", signo: -1, monto: 100, monto_local: 100 }),
  parte({ unidad_id: "corp", clase: "gestion", tipo: "Préstamo", seccion: "finanzas", signo: -1, monto: 40, monto_local: 40, monto_ic: 40, monto_ic_local: 40 }),
];

test("la base guardada se lee del jsonb y cae a envíos", () => {
  assert.equal(leerBaseReparto("ventas"), "ventas");
  assert.equal(leerBaseReparto('"margen"'), "margen");
  assert.equal(leerBaseReparto(null), "envios");
  assert.equal(leerBaseReparto("otra"), "envios");
});

test("los pesos salen de la base elegida y suman uno", () => {
  const envios = pesosReparto("envios", partes, [{ periodo: M, unidad_id: "a", envios: 1 }, { periodo: M, unidad_id: "b", envios: 3 }], unidades);
  assert.equal(envios.get(`${M}|pa`)!.get("a"), 0.25);
  const ventas = pesosReparto("ventas", partes, [], unidades);
  assert.equal(ventas.get(`${M}|pa`)!.get("a"), 0.75);
  // Margen: a 50, b 50.
  const margen = pesosReparto("margen", partes, [], unidades);
  assert.equal(margen.get(`${M}|pa`)!.get("b"), 0.5);
  assert.equal(participacionDe(margen, M, "pa", null), 1);
  assert.equal(participacionDe(margen, M, "cr", null), 0);
});

test("reparte A DISTRIBUIR y el consolidado deja fuera lo intercompañía", () => {
  const pesos = pesosReparto("ventas", partes, [], unidades);
  const r = repartirEerr(partes, pesos);
  const sistemasA = r.repartidas.find((f) => f.unidad_id === "a" && f.tipo === "Sistemas")!;
  assert.equal(sistemasA.monto, 75);
  assert.equal(r.filas.reduce((s, f) => s + f.monto * f.signo, 0), 400 - 300 - 100 - 40);
  const c = repartirEerr(partes, pesos, { sinIntercompania: true });
  assert.equal(c.filas.find((f) => f.tipo === "Préstamo"), undefined);
  assert.equal(c.eliminado[M], -40);
});

test("sin base el reparto queda pendiente", () => {
  const r = repartirEerr(partes, new Map());
  assert.deepEqual(r.pendiente, [{ periodo: M, entidad_id: "pa", monto: 100 }]);
  assert.equal(r.repartidas.length, 0);
});
