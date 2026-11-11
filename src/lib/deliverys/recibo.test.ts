import assert from "node:assert/strict";
import test from "node:test";
import { enteroEnLetras, fechaRecibo, montoEnLetras, numeroRecibo, parrafosRecibo, type DatosRecibo } from "./recibo";

test("números en letras", () => {
  assert.equal(enteroEnLetras(0), "cero");
  assert.equal(enteroEnLetras(1), "uno");
  assert.equal(enteroEnLetras(16), "dieciséis");
  assert.equal(enteroEnLetras(21), "veintiuno");
  assert.equal(enteroEnLetras(45), "cuarenta y cinco");
  assert.equal(enteroEnLetras(100), "cien");
  assert.equal(enteroEnLetras(101), "ciento uno");
  assert.equal(enteroEnLetras(164), "ciento sesenta y cuatro");
  assert.equal(enteroEnLetras(1000), "mil");
  assert.equal(enteroEnLetras(1001), "mil uno");
  assert.equal(enteroEnLetras(21000), "veintiún mil");
  assert.equal(enteroEnLetras(31500), "treinta y un mil quinientos");
  assert.equal(enteroEnLetras(1_000_000), "un millón");
  assert.equal(enteroEnLetras(2_500_000), "dos millones quinientos mil");
  assert.throws(() => enteroEnLetras(-1));
});

test("monto del recibo en letras", () => {
  assert.equal(montoEnLetras(164.25), "ciento sesenta y cuatro dólares con 25/100");
  assert.equal(montoEnLetras(1), "un dólar con 00/100");
  assert.equal(montoEnLetras(21.5), "veintiún dólares con 50/100");
  assert.equal(montoEnLetras(0.07), "cero dólares con 07/100");
});

const base: DatosRecibo = {
  numero: 7,
  tipo: "pago",
  nombre: "REPARTIDOR DE PRUEBA",
  documento: "X-000-000",
  empresa: "EMPRESA DE PRUEBA S.A.",
  empresaRuc: "000-0-000",
  monto: 10,
  fechaPago: "2026-10-15",
  metodo: "transferencia",
  referencia: null,
  periodoTexto: "8 al 14 de octubre de 2026",
};

test("texto del recibo de pago y de rendición", () => {
  const p = parrafosRecibo(base);
  assert.ok(p.declaracion.startsWith("Yo, REPARTIDOR DE PRUEBA, portador(a) de cédula/pasaporte N.º X-000-000, declaro haber recibido de la empresa EMPRESA DE PRUEBA S.A., RUC 000-0-000"));
  assert.ok(p.concepto.includes("8 al 14 de octubre de 2026"));
  assert.ok(p.aclaracion?.includes("no constituye salario"));
  const sinDoc = parrafosRecibo({ ...base, documento: null, empresaRuc: null });
  assert.ok(sinDoc.declaracion.startsWith("Yo, REPARTIDOR DE PRUEBA, declaro haber recibido de la empresa EMPRESA DE PRUEBA S.A. la suma"));
  const r = parrafosRecibo({ ...base, tipo: "rendicion" });
  assert.ok(r.declaracion.includes("declaro haber entregado a la empresa"));
  assert.equal(r.aclaracion, null);
  assert.equal(numeroRecibo(7), "0007");
  assert.equal(fechaRecibo("2026-10-15"), "15/10/2026");
});
