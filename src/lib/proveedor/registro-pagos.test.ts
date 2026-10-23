import assert from "node:assert/strict";
import { test } from "node:test";
import { cuotasDe } from "./cuotas";
import { filasRegistro, sugerenciaPago, totalesRegistro } from "./registro-pagos";
import type { EnvioConCuotas } from "./resumen-pagos";

const HOY = "2026-10-23";

const envio = (e: Partial<EnvioConCuotas> & { pagosAnticipo?: { monto: number; fecha: string }[]; pagosSaldo?: { monto: number; fecha: string }[] }): EnvioConCuotas => {
  const base = { clave: "p1", pedidoId: "p1", producto: "DK-11247 Label Paper", referencia: null, paisCodigo: "PA", fotoReferencia: null, fechaEnvio: "2026-10-17", fechaLlegada: null, montoTotal: 1660, ...e };
  return { ...base, cuotas: cuotasDe({ montoTotal: base.montoTotal, fechaEnvio: base.fechaEnvio, fechaLlegada: base.fechaLlegada, pagosAnticipo: e.pagosAnticipo ?? [], pagosSaldo: e.pagosSaldo ?? [] }) };
};

const datos = { unidades: { p1: 500 }, llegadaProveedor: {}, anotados: {} };

test("anticipo pagado: sin pagar 0, sin vencimiento, el saldo completo", () => {
  const [f] = filasRegistro([envio({ pagosAnticipo: [{ monto: 830, fecha: "2026-10-21" }] })], datos, HOY);
  assert.deepEqual(
    { unidades: f.unidades, anticipo: f.anticipo, pagado: f.pagadoAnticipo, fecha: f.fechaPagoAnticipo, sinPagar: f.sinPagar, vence: f.vence, saldo: f.saldo },
    { unidades: 500, anticipo: 830, pagado: 830, fecha: "2026-10-21", sinPagar: 0, vence: null, saldo: 830 },
  );
});

test("anticipo sin pagar: vence a los 10 días del envío", () => {
  const [f] = filasRegistro([envio({ clave: "p2", pedidoId: "p2", montoTotal: 10600, fechaEnvio: "2026-10-19" })], datos, HOY);
  assert.equal(f.sinPagar, 5300);
  assert.equal(f.vence, "2026-10-29");
  assert.equal(f.saldo, 5300);
  assert.deepEqual(sugerenciaPago(f), { cuota: "anticipo", monto: 5300 });
});

test("llegada: la del proveedor manda; el saldo pagado deja la fecha", () => {
  const e = envio({ fechaLlegada: "2026-12-10", pagosAnticipo: [{ monto: 830, fecha: "2026-10-21" }], pagosSaldo: [{ monto: 830, fecha: "2026-12-12" }] });
  const [propia] = filasRegistro([e], { ...datos, llegadaProveedor: { p1: "2026-12-08" } }, HOY);
  assert.equal(propia.llegada, "2026-12-08");
  assert.equal(propia.llegadaPropia, true);
  assert.equal(propia.saldo, 0);
  assert.equal(propia.fechaPagoSaldo, "2026-12-12");
  assert.equal(sugerenciaPago(propia), null);
  const [deCompra] = filasRegistro([e], datos, HOY);
  assert.equal(deCompra.llegada, "2026-12-10");
  assert.equal(deCompra.llegadaPropia, false);
});

test("totales y las filas del historial sin compra no se anotan", () => {
  const filas = filasRegistro([envio({}), envio({ clave: "h:1", pedidoId: null, montoTotal: 606, pagosAnticipo: [{ monto: 303, fecha: "2026-10-21" }] })], datos, HOY);
  assert.deepEqual(totalesRegistro(filas), { sinPagar: 830, saldo: 1133 });
  assert.equal(sugerenciaPago(filas[1]), null);
});
