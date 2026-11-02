import { test } from "node:test";
import assert from "node:assert/strict";
import { cambioDeTipo, nivelDeTexto } from "./cambio-tipo";

const t = (texto: string) => ({ "Tipo de cliente": texto });

test("lee el nivel del texto de la Actividad", () => {
  assert.equal(nivelDeTexto(t("VIP (a mano)")), "vip");
  assert.equal(nivelDeTexto(t("Rookie (automático)")), "regular");
  assert.equal(nivelDeTexto(t("Black")), "black");
  assert.equal(nivelDeTexto(t("Otro")), null);
  assert.equal(nivelDeTexto(null), null);
});

test("subió de Rookie a VIP", () => {
  const c = cambioDeTipo([{ antes: t("Rookie"), despues: t("VIP"), creado_en: "2026-10-29T10:00:00Z" }], "vip");
  assert.deepEqual(c, { sube: true, desde: "regular", hasta: "vip", fecha: "2026-10-29T10:00:00Z" });
});

test("bajó de Black a VIP: manda el cambio más reciente", () => {
  const c = cambioDeTipo(
    [
      { antes: t("VIP"), despues: t("Black"), creado_en: "2026-10-01T10:00:00Z" },
      { antes: t("Black"), despues: t("VIP"), creado_en: "2026-10-20T10:00:00Z" },
    ],
    "vip",
  );
  assert.equal(c?.sube, false);
  assert.equal(c?.desde, "black");
});

test("pasar a automático sin cambiar de tipo no cuenta", () => {
  const c = cambioDeTipo(
    [
      { antes: t("Rookie"), despues: t("VIP"), creado_en: "2026-10-01T10:00:00Z" },
      { antes: t("VIP (a mano)"), despues: t("VIP (automático)"), creado_en: "2026-10-20T10:00:00Z" },
    ],
    "vip",
  );
  assert.equal(c?.sube, true);
});

test("si hoy está en otro nivel, no hay flecha", () => {
  assert.equal(cambioDeTipo([{ antes: t("Rookie"), despues: t("VIP"), creado_en: "2026-10-01T10:00:00Z" }], "black"), null);
  assert.equal(cambioDeTipo([], "vip"), null);
});
