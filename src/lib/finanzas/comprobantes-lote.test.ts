import { test } from "node:test";
import assert from "node:assert/strict";
import { candidatosDe, leerNombre } from "./comprobantes-lote";

test("lee monto y fecha del nombre", () => {
  assert.deepEqual(leerNombre("factura 150.25 2026-08-14.pdf"), { monto: 150.25, fecha: "2026-08-14" });
  assert.deepEqual(leerNombre("Recibo_1.500,25_14-08-2026.jpg"), { monto: 1500.25, fecha: "2026-08-14" });
  assert.deepEqual(leerNombre("alquiler $1,200.00.pdf"), { monto: 1200, fecha: null });
  assert.deepEqual(leerNombre("pago $35.png"), { monto: 35, fecha: null });
  assert.deepEqual(leerNombre("scan0001.pdf"), { monto: null, fecha: null });
});

test("sugiere el único con ese monto, o el de fecha cercana", () => {
  const movs = [
    { id: "a", monto: 150.25, fecha: "2026-08-02", descripcion: "x" },
    { id: "b", monto: 150.25, fecha: "2026-08-15", descripcion: "y" },
    { id: "c", monto: 99, fecha: "2026-08-15", descripcion: "z" },
  ];
  assert.equal(candidatosDe({ monto: 99, fecha: null }, movs).sugerido, "c");
  const r = candidatosDe({ monto: 150.25, fecha: "2026-08-14" }, movs);
  assert.equal(r.sugerido, "b");
  assert.deepEqual(r.candidatos.map((m) => m.id), ["b", "a"]);
  assert.equal(candidatosDe({ monto: 150.25, fecha: null }, movs).sugerido, null);
  assert.equal(candidatosDe({ monto: null, fecha: null }, movs).candidatos.length, 0);
});
