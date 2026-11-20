import assert from "node:assert/strict";
import test from "node:test";
import { ganchoTipoValido, leerClasificacionGanchos, pedidoClasificarGanchos, TIPOS_GANCHO } from "./ganchos";

test("un tipo de gancho se reconoce sin importar mayúsculas ni acentos", () => {
  assert.equal(ganchoTipoValido("Resultado o transformacion"), "resultado o transformación");
  assert.equal(ganchoTipoValido("  PREGUNTA "), "pregunta");
  assert.equal(ganchoTipoValido("inventado"), null);
  assert.equal(ganchoTipoValido(3), null);
  assert.equal(ganchoTipoValido(null), null);
});

test("el pedido lista todos los tipos y un gancho por línea con su id", () => {
  const p = pedidoClasificarGanchos([{ id: "111", gancho: "¿Te duele la espalda?" }, { id: "222", gancho: "Una mujer muestra su piel", promesa: "Piel firme" }]);
  for (const t of TIPOS_GANCHO) assert.ok(p.includes(`- ${t}:`));
  assert.match(p, /111 :: ¿Te duele la espalda\?/);
  assert.match(p, /222 :: Una mujer muestra su piel \(promete: Piel firme\)/);
});

test("el pedido clasifica como mucho 30 ganchos", () => {
  const items = Array.from({ length: 45 }, (_, i) => ({ id: String(1000 + i), gancho: "x" }));
  assert.equal(pedidoClasificarGanchos(items).split("\n").filter((l) => / :: x/.test(l)).length, 30);
});

test("de lo que contesta la IA solo valen los ids pedidos y los tipos de la lista", () => {
  const r = leerClasificacionGanchos('```json\n{"111": "pregunta", "222": "Dato o cifra", "333": "inventado", "999": "testimonio"}\n```', ["111", "222", "333"]);
  assert.deepEqual([...r], [["111", "pregunta"], ["222", "dato o cifra"]]);
  assert.equal(leerClasificacionGanchos("no es json", ["1"]).size, 0);
  assert.equal(leerClasificacionGanchos(null, ["1"]).size, 0);
  assert.equal(leerClasificacionGanchos("[1,2]", ["1"]).size, 0);
});
