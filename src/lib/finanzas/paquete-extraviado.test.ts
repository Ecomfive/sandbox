import { test } from "node:test";
import assert from "node:assert/strict";
import { claveExtraviado, leerExtraviado, movimientosExtraviado, perdidaNeta } from "./paquete-extraviado";

const U = "11111111-1111-1111-1111-111111111111";
const C = "22222222-2222-2222-2222-222222222222";
const leer = (o: Record<string, string>) => leerExtraviado((k) => o[k]);

test("pide tienda, día, pedido y al menos un monto", () => {
  assert.deepEqual(leer({}), { error: "Elige la tienda." });
  assert.deepEqual(leer({ unidad_id: U, fecha: "2026-08-12" }), { error: "Falta el número de pedido o guía." });
  assert.ok("error" in leer({ unidad_id: U, fecha: "2026-08-12", pedido: "#1001" }));
  assert.ok("error" in leer({ unidad_id: U, fecha: "2026-08-12", pedido: "#1001", costo: "-5" }));
  assert.ok("error" in leer({ unidad_id: U, fecha: "2026-08-12", pedido: "#1001", costo: "10", cuenta_id: C }), "cuenta sin pago");
});

test("deja la merma fuera del flujo y el pago en el flujo solo con cuenta", () => {
  const d = leer({ unidad_id: U, fecha: "2026-08-12", pedido: "#1001", repartidor: "Juan", costo: "$12.50", indemnizacion: "20", cuenta_id: C });
  assert.ok(!("error" in d));
  if ("error" in d) return;
  assert.equal(d.fechaPago, "2026-08-12");
  const [merma, pago] = movimientosExtraviado(d);
  assert.equal(merma.tipo, "Mercadería extraviada");
  assert.equal(merma.periodo, "2026-08-01");
  assert.equal(merma.monto, 12.5);
  assert.equal(merma.en_flujo, false);
  assert.equal(pago.tipo, "Indemnización por paquete extraviado");
  assert.equal(pago.en_flujo, true);
  assert.equal(pago.cuenta_id, C);
  assert.equal(perdidaNeta(d), -7.5);
  const sinCuenta = leer({ unidad_id: U, fecha: "2026-08-12", pedido: "#1001", indemnizacion: "20" });
  if ("error" in sinCuenta) throw new Error(sinCuenta.error);
  const unico = movimientosExtraviado(sinCuenta);
  assert.equal(unico.length, 1);
  assert.equal(unico[0].en_flujo, false);
});

test("la llave no cambia por cómo se escribe el pedido", () => {
  assert.equal(claveExtraviado(U, "#1001", "merma"), claveExtraviado(U, " #1001 ", "merma"));
  assert.notEqual(claveExtraviado(U, "1001", "merma"), claveExtraviado(U, "1001", "pago"));
});
