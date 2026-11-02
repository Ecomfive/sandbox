import assert from "node:assert/strict";
import test from "node:test";
import { alertasDe, bandaDe, calcularSalud, compararAlertas, segmentoDe, type PedidosDropshipper } from "./salud";

const HOY = "2026-10-30";
const base: PedidosDropshipper = { pedidos14: 40, pedidos14Antes: 38, pedidos30: 80, pedidos30Antes: 75, primerPedido: "2026-08-30", ultimoPedido: "2026-10-30", entregados60: 85, devueltos60: 10 };

test("un cliente que pide todos los días y estable está sano", () => {
  const s = calcularSalud(base, HOY, 500);
  assert.equal(s.banda, "sano");
  assert.ok((s.puntaje ?? 0) >= 70, String(s.puntaje));
  assert.equal(s.factores.find((f) => f.clave === "recencia")?.valor, 100);
});

test("sin pedidos no tiene puntaje", () => {
  const s = calcularSalud({ ...base, ultimoPedido: null, primerPedido: null, pedidos30: 0, pedidos14: 0 }, HOY, 500);
  assert.equal(s.puntaje, null);
  assert.equal(s.banda, "sin_pedidos");
});

test("la recencia baja a 0 a los 30 días y la tendencia no cuenta sin historia", () => {
  const viejo = calcularSalud({ ...base, ultimoPedido: "2026-09-30", pedidos14: 0, pedidos30: 0 }, HOY, 500);
  assert.equal(viejo.factores.find((f) => f.clave === "recencia")?.valor, 0);
  assert.equal(viejo.banda, "critico");
  const nuevo = calcularSalud({ ...base, primerPedido: "2026-10-10", pedidos14Antes: 3 }, HOY, 500);
  assert.equal(nuevo.factores.find((f) => f.clave === "tendencia")?.valor, null);
});

test("pocas entregas cerradas no cuentan; 55 % o menos da 0", () => {
  assert.equal(calcularSalud({ ...base, entregados60: 2, devueltos60: 1 }, HOY, 500).factores.find((f) => f.clave === "entrega")?.valor, null);
  assert.equal(calcularSalud({ ...base, entregados60: 50, devueltos60: 50 }, HOY, 500).factores.find((f) => f.clave === "entrega")?.valor, 0);
});

test("bandas", () => {
  assert.equal(bandaDe(70), "sano");
  assert.equal(bandaDe(69), "atencion");
  assert.equal(bandaDe(40), "atencion");
  assert.equal(bandaDe(39), "critico");
});

test("caída de pedidos en 14 días y silencio de 10 a 20 días", () => {
  const cae = alertasDe({ ...base, pedidos14: 18, pedidos14Antes: 31 }, HOY, null);
  assert.equal(cae[0]?.tipo, "caida");
  assert.equal(cae[0]?.prioridad, "alta");
  assert.match(cae[0]?.texto ?? "", /42 %/);
  assert.equal(segmentoDe({ ...base, pedidos14: 18, pedidos14Antes: 31 }, HOY), "riesgo");
  const callado = alertasDe({ ...base, ultimoPedido: "2026-10-18", pedidos14: 0, pedidos14Antes: 4 }, HOY, null);
  assert.equal(callado[0]?.tipo, "caida");
  assert.equal(alertasDe({ ...base, pedidos14: 4, pedidos14Antes: 4 }, HOY, null).length, 0);
});

test("dormido de 21 a 59 días, perdido desde 60", () => {
  const d = { ...base, ultimoPedido: "2026-10-05", pedidos14: 0, pedidos14Antes: 0, pedidos30: 3, pedidos30Antes: 9 };
  assert.equal(segmentoDe(d, HOY), "dormido");
  assert.deepEqual(alertasDe(d, HOY, null).map((a) => a.tipo), ["dormido"]);
  assert.equal(segmentoDe({ ...d, ultimoPedido: "2026-08-30" }, HOY), "perdido");
  assert.equal(alertasDe({ ...d, ultimoPedido: "2026-08-30" }, HOY, null).length, 0);
});

test("devoluciones altas desde 25 % con 10 cerrados", () => {
  const a = alertasDe({ ...base, entregados60: 30, devueltos60: 20 }, HOY, null);
  assert.equal(a[0]?.tipo, "devoluciones");
  assert.equal(a[0]?.prioridad, "alta");
  assert.equal(alertasDe({ ...base, entregados60: 6, devueltos60: 3 }, HOY, null).length, 0);
});

test("sin primer pedido solo de 7 a 45 días desde que entró", () => {
  const nunca = { ...base, ultimoPedido: null, primerPedido: null, pedidos14: 0, pedidos30: 0 };
  assert.equal(alertasDe(nunca, HOY, "2026-10-20")[0]?.tipo, "sin_primer_pedido");
  assert.equal(alertasDe(nunca, HOY, "2026-10-27").length, 0);
  assert.equal(alertasDe(nunca, HOY, "2026-08-01").length, 0);
  assert.equal(alertasDe(nunca, HOY, null).length, 0);
});

test("la cola pone primero las urgentes y, entre iguales, la de más pedidos", () => {
  const l = [
    { prioridad: "media" as const, peso: 50 },
    { prioridad: "alta" as const, peso: 5 },
    { prioridad: "media" as const, peso: 90 },
  ].sort(compararAlertas);
  assert.deepEqual(l.map((x) => x.peso), [5, 90, 50]);
});

test("una caída reciente baja la tendencia y no deja salir «Sano» (el caso de Jose Sinisterra)", () => {
  const jose = { pedidos14: 238, pedidos14Antes: 480, pedidos30: 822, pedidos30Antes: 504, primerPedido: "2026-08-30", ultimoPedido: HOY, entregados60: 959, devueltos60: 178 };
  const s = calcularSalud(jose, HOY, 500);
  const t = s.factores.find((f) => f.clave === "tendencia");
  assert.ok((t?.valor ?? 100) < 20, String(t?.valor));
  assert.match(t?.detalle ?? "", /14 días/);
  assert.equal(s.puntaje, 69);
  assert.equal(s.banda, "atencion");
  assert.match(s.tope ?? "", /caída/);
  // Sin caída no hay tope.
  assert.equal(calcularSalud(base, HOY, 500).tope, null);
});

