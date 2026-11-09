import assert from "node:assert/strict";
import { test } from "node:test";
import {
  asignarCapital,
  leerSupuestosAsignacion,
  pautaMaxima,
  pedidosCon,
  retornoMarginal,
  SUPUESTOS_ASIGNACION_PREDETERMINADOS as S,
  type TiendaCapital,
} from "./asignacion-capital";

// Tiendas inventadas.
const buena: TiendaCapital = { unidadId: "a", nombre: "Tienda A", pauta: 1000, pedidos: 200, ventas: 10_000, contribucion: 3000, mercancia: 2000, tasaEntrega: 0.8, techo: 22 };
const floja: TiendaCapital = { unidadId: "b", nombre: "Tienda B", pauta: 1000, pedidos: 100, ventas: 5000, contribucion: 800, mercancia: 1000, tasaEntrega: 0.6, techo: 22 };

test("curva con rendimientos decrecientes anclada en hoy", () => {
  assert.equal(pedidosCon(buena, 1000, 0.5), 200);
  assert.ok(Math.abs(pedidosCon(buena, 4000, 0.5) - 400) < 1e-9);
  // 15 por pedido × 0,5 × 200/1000 − 1 = 0,5
  assert.ok(Math.abs(retornoMarginal(buena, 1000, 0.5)! - 0.5) < 1e-9);
  assert.ok(retornoMarginal(floja, 1000, 0.5)! < 0);
  assert.equal(retornoMarginal({ ...buena, pauta: 0 }, 100, 0.5), null);
});

test("la pauta máxima cumple el techo exacto", () => {
  const max = pautaMaxima(buena, 0.5)!;
  const ventas = (buena.ventas / buena.pedidos) * pedidosCon(buena, max, 0.5);
  assert.ok(Math.abs(max / ventas - 0.22) < 1e-9);
});

test("el reparto va a la tienda de mayor retorno marginal y respeta el techo", () => {
  const r = asignarCapital([buena, floja], 2000, S);
  const a = r.tiendas.find((t) => t.unidadId === "a")!;
  const b = r.tiendas.find((t) => t.unidadId === "b")!;
  assert.ok(a.pautaPropuesta > 1000);
  assert.equal(b.pautaPropuesta, 500); // queda en su piso
  assert.equal(b.limite, "piso");
  assert.ok(a.pctPropuesto! <= 22 + 1e-6);
  assert.ok(r.ebitdaIncremental > 0);
  assert.ok(Math.abs(r.asignado + r.sinAsignar - 2000) < 0.5);
});

test("un dólar que no se paga queda sin asignar: la tienda floja baja a donde su retorno es cero", () => {
  const r = asignarCapital([floja], 5000, { ...S, pisoPct: 0 }, null, 2000);
  const t = r.tiendas[0];
  assert.ok(t.pautaPropuesta < floja.pauta);
  assert.ok(Math.abs(t.retornoFinal!) < 0.05);
  assert.equal(t.limite, "retorno");
  assert.ok(r.sinAsignar > 4000);
  assert.ok(t.ebitdaIncremental > 0); // gastar menos en una tienda que pierde suma EBITDA
});

test("con poco monto los pisos se achican en proporción y sin pauta queda fuera", () => {
  const r = asignarCapital([buena, floja, { ...floja, unidadId: "c", nombre: "Sin pauta", pauta: 0 }], 500, S, 6);
  const suma = r.tiendas.filter((t) => t.limite !== "sin_datos").reduce((x, t) => x + t.pautaPropuesta, 0);
  assert.ok(suma <= 500 + 1e-6);
  assert.equal(r.tiendas.find((t) => t.unidadId === "c")!.limite, "sin_datos");
  assert.equal(r.valorCreado, Math.round(r.ebitdaIncremental * 12 * 6 * 100) / 100);
});

test("supuestos fuera de rango caen al predeterminado", () => {
  assert.deepEqual(leerSupuestosAsignacion({ elasticidad: 2, pisoPct: "30" }), { elasticidad: 0.5, pisoPct: 30, diasInventario: 45 });
});
