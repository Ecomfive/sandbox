import assert from "node:assert/strict";
import test from "node:test";
import { acumular, estadoGeneral, evaluarMeta, filaMeta, metasDeFoto, realDeHistoria } from "./metas-plan";

// Datos inventados.

test("semáforo por indicador", () => {
  assert.equal(evaluarMeta("ventas", 1000, 980), "cumple");
  assert.equal(evaluarMeta("ventas", 1000, 920), "cerca");
  assert.equal(evaluarMeta("ventas", 1000, 800), "lejos");
  assert.equal(evaluarMeta("tasaEntrega", 80, 79.2), "cumple");
  assert.equal(evaluarMeta("tasaEntrega", 80, 77.5), "cerca");
  assert.equal(evaluarMeta("tasaEntrega", 80, 70), "lejos");
  assert.equal(evaluarMeta("pauta", 20, 20.4), "cumple");
  assert.equal(evaluarMeta("pauta", 20, 21.5), "cerca");
  assert.equal(evaluarMeta("pauta", 20, 25), "lejos");
  assert.equal(evaluarMeta("pauta", 20, 10), "cumple", "gastar menos pauta está bien");
  assert.equal(evaluarMeta("ebitda", -1000, -1020), "cumple");
  assert.equal(evaluarMeta("ebitda", -1000, -1080), "cerca");
  assert.equal(evaluarMeta("ebitda", -1000, -2000), "lejos");
  assert.equal(evaluarMeta("ventas", null, 10), "sin_datos");
});

test("metas desde la foto del plan y real desde la historia", () => {
  const metas = metasDeFoto({
    consolidado: [],
    tiendas: [{ id: "t1", nombre: "T1", meses: [{ periodo: "2027-01-01", pedidos: 1000.4, ventas: 40_000, ingresos: 32_000, pauta: 8_000, ebitda: 5_000 }] }],
  });
  const m = metas.get("t1")!.get("2027-01-01")!;
  assert.deepEqual(m, { ventas: 40_000, pedidos: 1000, tasaEntrega: 80, pauta: 20, ebitda: 5_000 });
  const real = realDeHistoria(
    { periodo: "2027-01-01", unidadId: "t1", pedidos: 900, ventas: 36_000, entregado: 27_000, mercancia: 0, envio: 0, devolucion: 0, comision: 0, marketing: 9_000, fijos: 0 },
    3_000,
  );
  assert.deepEqual(real, { ventas: 36_000, pedidos: 900, tasaEntrega: 75, pauta: 25, ebitda: 3_000 });
  const f = filaMeta("t1", m, real);
  assert.equal(f.estado.ventas, "cerca");
  assert.equal(f.estado.pauta, "lejos");
  assert.equal(estadoGeneral(f), "lejos");
  assert.equal(f.conDato, 5);
  assert.equal(realDeHistoria(undefined, null).ventas, null);
});

test("acumular: suma montos y pondera tasas por ventas", () => {
  const a = acumular([
    { ventas: 100, pedidos: 10, tasaEntrega: 80, pauta: 20, ebitda: 5 },
    { ventas: 300, pedidos: 30, tasaEntrega: 60, pauta: 10, ebitda: null },
  ]);
  assert.deepEqual(a, { ventas: 400, pedidos: 40, tasaEntrega: 65, pauta: 12.5, ebitda: 5 });
});
