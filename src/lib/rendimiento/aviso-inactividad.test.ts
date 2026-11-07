import assert from "node:assert/strict";
import { test } from "node:test";
import { AVISO_INACTIVIDAD, minutosEntre, sinActividad, textoSinActividad, textoVolvio } from "./aviso-inactividad";

// 10:12 de Panamá = 15:12 UTC.
const t = (hhmm: string) => Date.parse(`2026-11-07T${hhmm}:00Z`);

test("avisa desde los 5 minutos sin usar el sistema", () => {
  assert.equal(sinActividad(t("15:12"), t("15:16")), false);
  assert.equal(sinActividad(t("15:12"), t("15:17")), true);
  assert.equal(minutosEntre(t("15:12"), t("15:10")), 0);
});

test("los textos dicen desde qué hora y cuánto tiempo, en hora de Panamá", () => {
  const sin = textoSinActividad(t("15:12"), t("15:18"));
  assert.match(sin, /^Sin actividad en el sistema desde las 10:12/);
  assert.match(sin, /\(6 min\)$/);
  const volvio = textoVolvio(t("15:12"), t("16:20"));
  assert.match(volvio, /^Estuviste 1 h 8 min sin actividad en el sistema, de 10:12.* a 11:20/);
});

test("hoy solo le sale a Nicol", () => {
  assert.equal(AVISO_INACTIVIDAD.size, 1);
});
