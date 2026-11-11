import assert from "node:assert/strict";
import { test } from "node:test";
import { agruparPorModulo, cuando, type TareaDeModulo } from "./por-modulo";

const t = (id: string, modulo: string, plazo: string | null, origen: TareaDeModulo["origen"] = "dropi"): TareaDeModulo => ({
  origen,
  id,
  titulo: `Tarea ${id}`,
  detalle: null,
  pais: null,
  plazo,
  estado: "Por hacer",
  modulo,
  href: "/",
});
const etiquetas = { "publicaciones-dropi": "Gestión de IDs Dropi", "crm-dropshippers": "CRM Dropshippers", inventario: "Inventario", tareas: "Tareas" };
const hoy = "2026-11-09";

test("cuándo vence una tarea", () => {
  assert.equal(cuando("2026-11-08", hoy), "atrasada");
  assert.equal(cuando("2026-11-09", hoy), "hoy");
  assert.equal(cuando("2026-11-10", hoy), "manana");
  assert.equal(cuando("2026-11-20", hoy), "despues");
  assert.equal(cuando(null, hoy), "sin_fecha");
});

test("cada tarea va a su módulo; primero los módulos con algo atrasado, y adentro primero lo atrasado", () => {
  const g = agruparPorModulo(
    [t("a", "publicaciones-dropi", "2026-11-12"), t("b", "crm-dropshippers", "2026-11-12", "crm"), t("c", "publicaciones-dropi", null), t("d", "publicaciones-dropi", "2026-11-01")],
    { modulosConAcceso: ["publicaciones-dropi", "crm-dropshippers"], etiquetas, hoy },
  );
  assert.deepEqual(
    g.map((x) => [x.etiqueta, x.tareas.map((y) => y.id), x.atrasadas]),
    [
      ["Gestión de IDs Dropi", ["d", "a", "c"], 1],
      ["CRM Dropshippers", ["b"], 0],
    ],
  );
});

test("solo los módulos a los que la persona tiene acceso; una del tablero del equipo de un módulo sin acceso queda en el del equipo", () => {
  const g = agruparPorModulo([t("a", "crm-dropshippers", null, "crm"), t("b", "inventario", hoy, "equipo"), t("c", "tareas", null, "equipo")], {
    modulosConAcceso: ["tareas"],
    etiquetas,
    hoy,
  });
  assert.deepEqual(
    g.map((x) => [x.modulo, x.tareas.map((y) => y.id), x.paraHoy]),
    [["tareas", ["b", "c"], 1]],
  );
  // Con acceso a Inventario, la del tablero que dice «Inventario» sale en Inventario.
  const conInventario = agruparPorModulo([t("b", "inventario", hoy, "equipo")], { modulosConAcceso: ["tareas", "inventario"], etiquetas, hoy });
  assert.deepEqual(conInventario.map((x) => x.etiqueta), ["Inventario"]);
});
