import assert from "node:assert/strict";
import test from "node:test";
import { conPendientesVivos } from "./pendientes-vivos";
import type { PendientesMenu } from "./contadores-menu";

const sin = { pedidos: 0, solicitudes: 0, llegadas: 0 };
const base: PendientesMenu = { contadores: { "/alertas": 2 }, total: 10, paraTi: 3, novedades: 2, tareasMias: 1, urgentes: sin };

test("sin lectura nueva queda lo que trajo la página", () => {
  assert.equal(conPendientesVivos(base, null), base);
});

test("el total de Avisos cambia por la diferencia de avisos «Para ti» y lo demás no se toca", () => {
  const r = conPendientesVivos(base, { paraTi: 5, tareasMias: 4, urgentes: { ...sin, llegadas: 2 } });
  assert.equal(r.urgentes.llegadas, 2);
  assert.equal(r.total, 12, "10 − 3 + 5");
  assert.equal(r.paraTi, 5);
  assert.equal(r.tareasMias, 4);
  assert.equal(r.novedades, 2);
  assert.deepEqual(r.contadores, base.contadores);
});

test("al leer avisos el número baja, sin pasar de cero", () => {
  assert.equal(conPendientesVivos(base, { paraTi: 0, tareasMias: 1, urgentes: sin }).total, 7);
  assert.equal(conPendientesVivos({ ...base, total: 1, paraTi: 3 }, { paraTi: 0, tareasMias: 0, urgentes: sin }).total, 0);
});
