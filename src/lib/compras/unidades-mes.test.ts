import assert from "node:assert/strict";
import { test } from "node:test";
import { mesesDelPeriodo, unidadesPorMes } from "./unidades-mes";

test("los meses de cada periodo", () => {
  assert.deepEqual(mesesDelPeriodo("este_anio", "2026-03-15"), ["2026-01", "2026-02", "2026-03"]);
  const u = mesesDelPeriodo("ultimos_12", "2026-03-15");
  assert.equal(u.length, 12);
  assert.equal(u[0], "2025-04");
  assert.equal(u[11], "2026-03");
  assert.deepEqual(mesesDelPeriodo("anio_pasado", "2026-03-15").slice(0, 2), ["2025-01", "2025-02"]);
});

test("suma por mes de creación, sin descartadas ni anuladas", () => {
  const c = (creadoEn: string, qty: number, monto: number, extra = {}) => ({ creadoEn, etapa: "tracking", qtyTotal: qty, montoTotal: monto, ...extra });
  const r = unidadesPorMes(
    [c("2026-01-10T00:00:00Z", 100, 50), c("2026-01-20", 50, 25), c("2026-02-01", 10, 5, { etapa: "descartado" }), c("2026-02-02", 10, 5, { anulada: { en: "x" } }), c("2025-12-31", 999, 999)],
    "este_anio",
    "2026-02-15",
  );
  assert.deepEqual(r.serie.map((p) => [p.mes, p.unidades, p.valor, p.compras]), [["2026-01", 150, 75, 2], ["2026-02", 0, 0, 0]]);
  assert.equal(r.unidades, 150);
  assert.equal(r.valor, 75);
});
