import { test } from "node:test";
import assert from "node:assert/strict";
import { cubiertoPor, emparejar, estadoDeLinea, redondeoPendiente } from "./emparejar";

test("redondeo: el banco pagó 3 centavos de más", () => {
  const r = redondeoPendiente(-100.03, [{ monto: -100 }], 5);
  assert.deepEqual(r, { monto: -0.03, importe: 0.03, tipo: "en_contra" });
  assert.equal(estadoDeLinea("sugerida", -100.03, [{ estado: "confirmado", monto: -100 }, { estado: "confirmado", monto: r!.monto }]), "conciliada");
});

test("redondeo: el libro cubrió de más", () => {
  const ingreso = redondeoPendiente(50, [{ monto: 50.02 }], 5);
  assert.deepEqual(ingreso, { monto: -0.02, importe: 0.02, tipo: "en_contra" });
  assert.equal(cubiertoPor([{ monto: 50.02 }, { monto: ingreso!.monto }]), 50);
  const pago = redondeoPendiente(-100, [{ monto: -100.04 }], 5);
  assert.deepEqual(pago, { monto: 0.04, importe: 0.04, tipo: "a_favor" });
});

test("redondeo: sin diferencia o pasado el tope, nada", () => {
  assert.equal(redondeoPendiente(-100.01, [{ monto: -100 }], 5), null);
  assert.equal(redondeoPendiente(-100.1, [{ monto: -100 }], 5), null);
  assert.equal(redondeoPendiente(-100.03, [{ monto: -100 }], 1), null);
});

test("emparejar propone con diferencia dentro del tope", () => {
  const lineas = [{ id: "l1", fecha: "2026-08-10", descripcion: "PAGO PROVEEDOR", monto: -100.03, clase: "pago" as const }];
  const movimientos = [{ id: "m1", fecha: "2026-08-10", efecto: -100, descripcion: "Pago proveedor" }];
  const sin = emparejar(lineas as never, { movimientos, cobros: [], ordenes: [], semanas: [] } as never);
  assert.equal(sin.elegidas.length, 0);
  const con = emparejar(lineas as never, { movimientos, cobros: [], ordenes: [], semanas: [] } as never, { toleranciaCent: 5 });
  assert.equal(con.elegidas.length, 1);
  assert.match(con.elegidas[0].detalle, /diferencia de 0\.03/);
});
