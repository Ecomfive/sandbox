import assert from "node:assert/strict";
import { test } from "node:test";
import { cuotasDe } from "./cuotas";
import { filasRegistro, leerCelda, totalesRegistro, type Registro } from "./registro-pagos";
import { conRegistro, type EnvioConCuotas } from "./resumen-pagos";

const HOY = "2026-10-23";

const envio = (e: Partial<EnvioConCuotas> & { pagosAnticipo?: { monto: number; fecha: string }[]; pagosSaldo?: { monto: number; fecha: string }[] }): EnvioConCuotas => {
  const base = { clave: "p1", fila: "p1", unidades: 500, pedidoId: "p1", producto: "DK-11247 Label Paper", referencia: "ECOM01-0513", paisCodigo: "PA", fotoReferencia: null, fechaEnvio: "2026-10-17", fechaLlegada: null, montoTotal: 1660, ...e };
  return { ...base, cuotas: cuotasDe({ montoTotal: base.montoTotal, fechaEnvio: base.fechaEnvio, fechaLlegada: base.fechaLlegada, pagosAnticipo: e.pagosAnticipo ?? [], pagosSaldo: e.pagosSaldo ?? [] }) };
};
const sinNada = { registro: {}, llegadaProveedor: {} };

test("las columnas de la hoja: anticipo pagado, sin pagar 0, sin vencimiento, el saldo completo", () => {
  const [f] = filasRegistro([envio({ pagosAnticipo: [{ monto: 830, fecha: "2026-10-21" }] })], sinNada, HOY);
  assert.deepEqual(
    { ...f.valores },
    { producto: "DK-11247 Label Paper", unidades: 500, monto: 1660, fecha_envio: "2026-10-17", anticipo: 830, pagado: 830, fecha_pago: "2026-10-21", sin_pagar: 0, vence: null, saldo: 830, llegada: null, fecha_pago_saldo: null },
  );
  assert.deepEqual(f.editadas, []);
});

test("anticipo sin pagar: vence a los 10 días del envío; los totales suman lo que falta", () => {
  const filas = filasRegistro([envio({ fila: "p2", pedidoId: "p2", montoTotal: 10600, fechaEnvio: "2026-10-19" }), envio({})], sinNada, HOY);
  assert.equal(filas[0].valores.vence, "2026-10-29");
  assert.deepEqual(totalesRegistro(filas), { sinPagar: 6130, saldo: 6130 });
});

test("lo escrito a mano: nombre, unidades, sin pagar, vence y saldo se ven tal cual y quedan marcados", () => {
  const registro: Record<string, Registro> = { p1: { producto: "Label Paper", unidades: "504", sin_pagar: "0.00", vence: "2026-11-05", saldo: "800", llegada: "2026-12-01" } };
  const [f] = filasRegistro([envio({})], { registro, llegadaProveedor: { p1: "2026-11-30" } }, HOY);
  assert.equal(f.valores.producto, "Label Paper");
  assert.equal(f.valores.unidades, 504);
  assert.equal(f.valores.sin_pagar, 0);
  assert.equal(f.valores.vence, "2026-11-05");
  assert.equal(f.valores.saldo, 800);
  assert.equal(f.valores.llegada, "2026-12-01");
  assert.deepEqual(f.editadas, ["producto", "unidades", "sin_pagar", "vence", "saldo", "llegada"]);
});

test("lo editado que cuenta para las cuotas: monto, envío, anticipo, pagado con su fecha y el pago del saldo", () => {
  const base = { montoTotal: 1000, fechaEnvio: "2026-10-01", anticipoMonto: null, pagos: { anticipo: [{ monto: 100, fecha: "2026-10-05" }], saldo: [] } };
  assert.equal(conRegistro(base, undefined, 50), base);
  const r = conRegistro(base, { monto: "1200", fecha_envio: "2026-10-03", pagado: "600", fecha_pago: "2026-10-10", fecha_pago_saldo: "2026-12-01" }, 50);
  assert.deepEqual(r, { montoTotal: 1200, fechaEnvio: "2026-10-03", anticipoMonto: null, pagos: { anticipo: [{ monto: 600, fecha: "2026-10-10" }], saldo: [{ monto: 600, fecha: "2026-12-01" }] } });
  // Pagado 0 borra lo pagado; solo la fecha cambia la fecha de lo que ya había.
  assert.deepEqual(conRegistro(base, { pagado: 0 }, 50).pagos.anticipo, []);
  assert.deepEqual(conRegistro(base, { fecha_pago: "2026-10-09" }, 50).pagos.anticipo, [{ monto: 100, fecha: "2026-10-09" }]);
  // Un anticipo escrito a mano (UPS: todo por adelantado) deja el saldo en cero.
  assert.deepEqual(conRegistro(base, { anticipo: "1000", fecha_pago_saldo: "2026-12-01" }, 50).pagos.saldo, [{ monto: 0, fecha: "2026-12-01" }]);
});

test("leer una celda: vacío vuelve al valor de siempre; números, fechas y texto", () => {
  assert.deepEqual(leerCelda("pagado", ""), { valor: null });
  assert.deepEqual(leerCelda("pagado", "$1,252.50"), { valor: 1252.5 });
  assert.deepEqual(leerCelda("unidades", "960"), { valor: 960 });
  assert.deepEqual(leerCelda("fecha_pago", "2026-10-21"), { valor: "2026-10-21" });
  assert.ok("error" in leerCelda("fecha_pago", "21/10/2026"));
  assert.ok("error" in leerCelda("monto", "-5"));
  assert.deepEqual(leerCelda("producto", "  Label Paper  "), { valor: "Label Paper" });
});
