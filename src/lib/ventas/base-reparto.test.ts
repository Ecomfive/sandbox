import assert from "node:assert/strict";
import test from "node:test";
import { filasAEscribir, planBaseReparto, type BaseExistente, type VentaMes } from "./base-reparto";

const EXCEL = "GASTOS_PRUEBA.xlsx";
const ventas: VentaMes[] = [
  // Mes con base del Excel: Oferfy igual, Nuvo distinto, Kenku que el Excel dejó en 0 y Clicksi que no está.
  { periodo: "2026-04-01", unidad_id: "oferfy", ordenes: 100, entregadas: 50 },
  { periodo: "2026-04-01", unidad_id: "nuvo", ordenes: 80, entregadas: 40 },
  { periodo: "2026-04-01", unidad_id: "kenku", ordenes: 60, entregadas: 30 },
  { periodo: "2026-04-01", unidad_id: "clicksi", ordenes: 20, entregadas: 10 },
  // Mes sin base de ECOMFIVE (falta la de Dropi).
  { periodo: "2026-09-01", unidad_id: "oferfy", ordenes: 90, entregadas: 45 },
  // Mes completo sin base de tiendas, con la de ECOMFIVE cargada a mano y una de Nuvo a mano.
  { periodo: "2026-10-01", unidad_id: "oferfy", ordenes: 70, entregadas: 20 },
  { periodo: "2026-10-01", unidad_id: "nuvo", ordenes: 30, entregadas: 10 },
  // Sin órdenes: no se escribe.
  { periodo: "2026-10-01", unidad_id: "kenku", ordenes: 0, entregadas: 0 },
];
const existentes: BaseExistente[] = [
  { periodo: "2026-04-01", unidad_id: "oferfy", envios: 100, entregados: 50, origen: EXCEL },
  { periodo: "2026-04-01", unidad_id: "nuvo", envios: 81, entregados: 40, origen: EXCEL },
  { periodo: "2026-04-01", unidad_id: "kenku", envios: 0, entregados: 0, origen: EXCEL },
  { periodo: "2026-04-01", unidad_id: "ecomfive", envios: 500, entregados: 300, origen: EXCEL },
  { periodo: "2026-09-01", unidad_id: "oferfy", envios: 0, entregados: 0, origen: EXCEL },
  { periodo: "2026-09-01", unidad_id: "ecomfive", envios: 0, entregados: 0, origen: EXCEL },
  { periodo: "2026-10-01", unidad_id: "ecomfive", envios: 400, entregados: 200, origen: "manual" },
  { periodo: "2026-10-01", unidad_id: "nuvo", envios: 25, entregados: 9, origen: "manual" },
];
const decisiones = (plan: ReturnType<typeof planBaseReparto>) => Object.fromEntries(plan.map((p) => [`${p.periodo.slice(5, 7)}|${p.unidad_id}`, p.decision]));

test("por defecto no pisa lo cargado a mano ni los meses que trae el Excel, y no escribe un mes sin la base de Dropi", () => {
  const plan = planBaseReparto(ventas, existentes, ["ecomfive"]);
  assert.deepEqual(decisiones(plan), {
    "04|clicksi": "conserva_excel",
    "04|kenku": "conserva_excel",
    "04|nuvo": "conserva_excel",
    "04|oferfy": "igual",
    "09|oferfy": "mes_incompleto",
    "10|nuvo": "conserva_manual",
    "10|oferfy": "nueva",
  });
  assert.deepEqual(filasAEscribir(plan), [{ periodo: "2026-10-01", unidad_id: "oferfy", envios: 70, entregados: 20, origen: "ventas" }]);
});

test("con las opciones reemplaza el Excel e incluye los meses incompletos, pero lo manual sigue igual", () => {
  const plan = planBaseReparto(ventas, existentes, ["ecomfive"], { reemplazarExcel: true, incluirIncompletos: true });
  assert.deepEqual(decisiones(plan), {
    "04|clicksi": "nueva",
    "04|kenku": "actualiza",
    "04|nuvo": "actualiza",
    "04|oferfy": "igual",
    "09|oferfy": "actualiza",
    "10|nuvo": "conserva_manual",
    "10|oferfy": "nueva",
  });
  assert.equal(filasAEscribir(plan).length, 5);
  assert.ok(filasAEscribir(plan).every((f) => f.origen === "ventas"));
});

test("lo que ya vino de ventas se actualiza sin pedir nada", () => {
  const plan = planBaseReparto(
    [{ periodo: "2026-10-01", unidad_id: "oferfy", ordenes: 75, entregadas: 25 }],
    [
      { periodo: "2026-10-01", unidad_id: "oferfy", envios: 70, entregados: 20, origen: "ventas" },
      { periodo: "2026-10-01", unidad_id: "ecomfive", envios: 400, entregados: 200, origen: "manual" },
    ],
    ["ecomfive"],
  );
  assert.equal(plan[0].decision, "actualiza");
  assert.equal(plan[0].actual?.envios, 70);
});
