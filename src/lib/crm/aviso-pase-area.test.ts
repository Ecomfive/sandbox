import { test } from "node:test";
import assert from "node:assert/strict";
import { destinatariosPase } from "./aviso-pase-area";

const p = (id: string, soloLectura = false) => ({ id, soloLectura });
// Nicol: Atención. Líder: Comercial (también tiene Atención). CEO: las tres. Mirón: Comercial de solo lectura.
const conModulo = {
  atencion: [p("nicol"), p("lider"), p("ceo")],
  comercial: [p("lider"), p("ceo"), p("miron", true)],
  direccion: [p("ceo")],
};

test("un chat que Atención pasa a Comercial le avisa a Comercial, no al CEO ni a quien solo mira", () => {
  assert.deepEqual(destinatariosPase("comercial", conModulo, "nicol"), ["lider"]);
});

test("quien pasa el chat no se avisa a sí mismo", () => {
  assert.deepEqual(destinatariosPase("comercial", conModulo, "lider"), []);
});

test("a Atención le avisa solo a quien tiene Atención como su área", () => {
  assert.deepEqual(destinatariosPase("atencion", conModulo, "lider"), ["nicol"]);
});

test("a Dirección, a quien tiene Dirección", () => {
  assert.deepEqual(destinatariosPase("direccion", conModulo, "lider"), ["ceo"]);
});
