import { test } from "node:test";
import assert from "node:assert/strict";
import { esReemplazable, periodoDeMes, planMesCompleto, type MovimientoDelMes } from "./mes-completo";

const mov = (id: string, origen: string, clave: string | null = null, fecha_pago: string | null = null): MovimientoDelMes => ({
  id,
  origen,
  origen_clave: clave,
  periodo: "2026-08-01",
  fecha_pago,
});

test("mes completo: solo lo importado de un archivo o pegado se puede reemplazar", () => {
  assert.equal(esReemplazable("GASTOS_PANAMA.xlsx"), true);
  assert.equal(esReemplazable("agosto 2026.XLSX"), true);
  assert.equal(esReemplazable("pegado"), true);
  for (const o of ["manual", "recurrente", "nomina", "remesa_cod", "ordenes_shopify", "ajuste_cierre", "conciliacion"]) assert.equal(esReemplazable(o), false, o);
});

test("mes completo: el mes se lee de «2026-08» o de una fecha", () => {
  assert.equal(periodoDeMes("2026-08"), "2026-08-01");
  assert.equal(periodoDeMes("2026-08-17"), "2026-08-01");
  assert.equal(periodoDeMes("2026-13"), null);
  assert.equal(periodoDeMes(202608), null);
});

test("mes completo: borra lo importado que no vino y conserva lo demás", () => {
  const plan = planMesCompleto(
    [
      mov("a", "GASTOS_PANAMA.xlsx", "h1"), // vino en el archivo: se actualiza, no se borra
      mov("b", "GASTOS_PANAMA.xlsx", "h2"), // de otro archivo y no vino: se borra
      mov("c", "pegado", "h3"), // pegado y no vino: se borra
      mov("d", "manual"), // a mano: se queda
      mov("e", "ordenes_shopify"), // del sistema: se queda
      mov("f", "AGOSTO.xlsx", "h4"), // conciliado con el banco: se queda
      mov("g", "AGOSTO.xlsx", "h5", "2026-09-03"), // pagado en un mes cerrado: se queda
      mov("h", "AGOSTO.xlsx", "h6"), // del mismo archivo y ya no viene: se borra
    ],
    { huellas: new Set(["h1"]), conciliados: new Set(["f"]), cerrados: new Set(["2026-09-01"]) },
  );
  assert.deepEqual(plan.borrar.sort(), ["b", "c", "h"]);
  assert.deepEqual(plan.conservados, { delSistema: 2, conciliados: 1, enMesCerrado: 1 });
  assert.deepEqual(
    plan.porOrigen.map((o) => [o.origen, o.cantidad]),
    [["AGOSTO.xlsx", 1], ["GASTOS_PANAMA.xlsx", 1], ["pegado", 1]],
  );
});
