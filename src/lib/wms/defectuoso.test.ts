import { test } from "node:test";
import assert from "node:assert/strict";
import { revisarDefectuoso } from "./defectuoso";

const base = { disponible: 20, danado: 3 };

test("marcar: pasa de disponible a defectuoso, con motivo y sin pasarse de lo disponible", () => {
  assert.deepEqual(revisarDefectuoso({ ...base, accion: "marcar", cantidad: "5", motivo: " Llegó con la tapa rota " }), { accion: "marcar", cantidad: 5, motivo: "Llegó con la tapa rota" });
  assert.match((revisarDefectuoso({ ...base, accion: "marcar", cantidad: 21, motivo: "roto" }) as { error: string }).error, /Solo hay 20 unidades disponibles/);
  assert.match((revisarDefectuoso({ disponible: 0, danado: 0, accion: "marcar", cantidad: 1, motivo: "roto" }) as { error: string }).error, /No hay unidades disponibles/);
});

test("devolver y dar de baja: solo hasta lo que ya está marcado como defectuoso", () => {
  assert.deepEqual(revisarDefectuoso({ ...base, accion: "devolver", cantidad: 3, motivo: "Estaba bien" }), { accion: "devolver", cantidad: 3, motivo: "Estaba bien" });
  assert.match((revisarDefectuoso({ ...base, accion: "baja", cantidad: 4, motivo: "se botó" }) as { error: string }).error, /Solo hay 3 unidades defectuosas/);
  assert.match((revisarDefectuoso({ disponible: 5, danado: 1, accion: "baja", cantidad: 2, motivo: "se botó" }) as { error: string }).error, /Solo hay 1 unidad defectuosa/);
  assert.match((revisarDefectuoso({ disponible: 5, danado: 0, accion: "devolver", cantidad: 1, motivo: "Estaba bien" }) as { error: string }).error, /No hay unidades defectuosas/);
});

test("pide acción, cantidad entera mayor que cero y motivo", () => {
  assert.match((revisarDefectuoso({ ...base, accion: "otra", cantidad: 1, motivo: "roto" }) as { error: string }).error, /Elige qué/);
  for (const c of ["", "0", "-2", "1.5", "abc", null]) assert.match((revisarDefectuoso({ ...base, accion: "marcar", cantidad: c, motivo: "roto" }) as { error: string }).error, /cuántas unidades/);
  assert.match((revisarDefectuoso({ ...base, accion: "marcar", cantidad: 1, motivo: "  " }) as { error: string }).error, /qué tiene de defectuoso/);
  assert.match((revisarDefectuoso({ ...base, accion: "baja", cantidad: 1, motivo: "" }) as { error: string }).error, /el motivo/);
});
