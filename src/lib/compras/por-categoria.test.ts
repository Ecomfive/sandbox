import assert from "node:assert/strict";
import { test } from "node:test";
import { comprasPorCategoria, SIN_CATEGORIA, SIN_PRODUCTOS } from "./por-categoria";

const PIEL = "Salud y belleza > Cuidado personal > Cosméticos > Cuidado de la piel > Lociones y humectantes";
const COCINA = "Casa y jardín > Cocina y comedor > Herramientas y utensilios de cocina";

test("reparte el valor por unidades y agrupa la categoría", () => {
  const r = comprasPorCategoria(
    [
      { id: "a", creadoEn: "2026-03-01", etapa: "tracking", qtyTotal: 300, montoTotal: 300, lineas: [{ cantidad: 200, categoria: PIEL }, { cantidad: 100, categoria: COCINA }] },
      { id: "b", creadoEn: "2026-04-01", etapa: "produccion", qtyTotal: 50, montoTotal: 100, lineas: [] },
      { id: "c", creadoEn: "2026-04-02", etapa: "cotizar", qtyTotal: 10, montoTotal: 10, lineas: [{ cantidad: 10, categoria: null }] },
      { id: "d", creadoEn: "2026-04-03", etapa: "descartado", qtyTotal: 999, montoTotal: 999, lineas: [{ cantidad: 999, categoria: PIEL }] },
      { id: "e", creadoEn: "2025-04-03", etapa: "completado", qtyTotal: 5, montoTotal: 5, lineas: [{ cantidad: 5, categoria: PIEL }] },
    ],
    "este_anio",
    "2026-10-19",
  );
  assert.deepEqual(r, [
    { categoria: "Salud y belleza > Cuidado personal > Cosméticos > Cuidado de la piel", unidades: 200, valor: 200, compras: 1 },
    { categoria: "Casa y jardín > Cocina y comedor", unidades: 100, valor: 100, compras: 1 },
    { categoria: SIN_PRODUCTOS, unidades: 50, valor: 100, compras: 1 },
    { categoria: SIN_CATEGORIA, unidades: 10, valor: 10, compras: 1 },
  ]);
  assert.equal(comprasPorCategoria([{ id: "e", creadoEn: "2025-04-03", etapa: "completado", qtyTotal: 5, montoTotal: 5, lineas: [{ cantidad: 5, categoria: PIEL }] }], "todo", "2026-10-19")[0].unidades, 5);
});
