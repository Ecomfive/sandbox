import assert from "node:assert/strict";
import { test } from "node:test";
import { leerMonto } from "./monto";
import { desglosar, estadoSaldo, gastoPorDia, resumirProveedor, saldoEstimado, type Credito, type FilaConsumo } from "./saldo";

const uso = (extra: Partial<FilaConsumo>): FilaConsumo => ({ proveedor: "gemini", operacion: "foto", modelo: "m", tokensEntrada: 0, tokensSalida: 0, busquedas: 0, imagenes: 1, costoUsd: 0.034, usuarioNombre: "Ana", ok: true, creadoEn: "2026-10-20T15:00:00Z", ...extra });
const cred = (extra: Partial<Credito>): Credito => ({ proveedor: "gemini", tipo: "recarga", montoUsd: 10, creadoEn: "2026-10-10T12:00:00Z", ...extra });

test("sin saldo ni recargas no hay estimación", () => {
  const s = saldoEstimado("gemini", [], [uso({})]);
  assert.deepEqual(s, { registrado: false, saldoUsd: null, gastadoUsd: 0, desde: null });
  assert.equal(estadoSaldo(s, 5), "sin_registro");
  assert.equal(estadoSaldo(saldoEstimado("gemini", [cred({ proveedor: "openai" })], []), 5), "sin_registro"); // de otro proveedor
});

test("las recargas suman desde la primera y el consumo anterior no cuenta", () => {
  const consumo = [uso({ costoUsd: 1, creadoEn: "2026-10-05T12:00:00Z" }), uso({ costoUsd: 2, creadoEn: "2026-10-12T12:00:00Z" }), uso({ costoUsd: 0.5, creadoEn: "2026-10-15T12:00:00Z" })];
  const s = saldoEstimado("gemini", [cred({}), cred({ montoUsd: 5, creadoEn: "2026-10-14T12:00:00Z" })], consumo);
  assert.equal(s.gastadoUsd, 2.5);
  assert.equal(s.saldoUsd, 12.5);
});

test("un saldo registrado reemplaza lo anterior: cuenta desde ese día", () => {
  const consumo = [uso({ costoUsd: 3, creadoEn: "2026-10-12T12:00:00Z" }), uso({ costoUsd: 1, creadoEn: "2026-10-18T12:00:00Z" })];
  const s = saldoEstimado("gemini", [cred({}), cred({ tipo: "saldo", montoUsd: 4, creadoEn: "2026-10-15T12:00:00Z" })], consumo);
  assert.equal(s.saldoUsd, 3); // 4 − 1 (el gasto del 12 es anterior al saldo)
  assert.equal(estadoSaldo(s, 5), "por_acabarse");
  assert.equal(estadoSaldo(s, 2), "ok");
  assert.equal(estadoSaldo({ ...s, saldoUsd: 0 }, 2), "agotado");
});

test("el resumen, el gasto por día y el desglose", () => {
  const consumo = [
    uso({ costoUsd: 0.034, creadoEn: "2026-10-20T15:00:00Z" }),
    uso({ proveedor: "openai", operacion: "titulos", costoUsd: 0.01, imagenes: 0, tokensEntrada: 1000, tokensSalida: 200, usuarioNombre: "Luis", creadoEn: "2026-10-21T15:00:00Z" }),
    uso({ proveedor: "openai", operacion: "analisis", costoUsd: 0.05, imagenes: 0, ok: false, usuarioNombre: "Luis", creadoEn: "2026-09-30T15:00:00Z" }),
  ];
  const r = resumirProveedor("openai", consumo, "2026-10-01");
  assert.deepEqual(r, { proveedor: "openai", costoUsd: 0.01, llamadas: 1, errores: 0, tokens: 1200, imagenes: 0 });
  const dias = gastoPorDia(consumo, "2026-10-22", 3);
  assert.deepEqual(dias.map((d) => d.dia), ["2026-10-20", "2026-10-21", "2026-10-22"]);
  assert.equal(dias[0].porProveedor.gemini, 0.03);
  assert.equal(dias[1].total, 0.01);
  assert.equal(dias[2].total, 0);
  const porPersona = desglosar(consumo, (c) => c.usuarioNombre ?? "—");
  assert.deepEqual(porPersona.map((d) => d.clave), ["Luis", "Ana"]);
});

test("un monto en dólares: con coma o punto, con o sin símbolo, hasta dos decimales", () => {
  assert.equal(leerMonto("20"), 20);
  assert.equal(leerMonto("12,50"), 12.5);
  assert.equal(leerMonto("$ 7.5"), 7.5);
  assert.equal(leerMonto("0"), 0);
  for (const malo of ["", "abc", "-5", "1,234", "12.345", "1000000"]) assert.equal(leerMonto(malo), null);
});
