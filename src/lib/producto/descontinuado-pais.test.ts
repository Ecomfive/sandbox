import { test } from "node:test";
import assert from "node:assert/strict";
import { conCompuestos } from "./descontinuado-pais";

test("un pack o combo hereda el descontinuado de sus simples en cada país", () => {
  const directos = new Map([
    ["simpleA", new Set(["PA"])],
    ["simpleB", new Set(["CR", "MX"])],
  ]);
  const componentes = [
    { combo_id: "pack2A", componente_id: "simpleA" },
    { combo_id: "comboAB", componente_id: "simpleA" },
    { combo_id: "comboAB", componente_id: "simpleB" },
    { combo_id: "comboCD", componente_id: "simpleC" },
  ];
  const r = conCompuestos(directos, componentes);
  assert.deepEqual([...r.get("pack2A")!], ["PA"], "el pack de A, solo donde A lo está");
  assert.deepEqual([...r.get("comboAB")!].sort(), ["CR", "MX", "PA"], "un combo, donde lo esté cualquiera de sus simples");
  assert.equal(r.has("comboCD"), false, "sin simples descontinuados no hereda nada");
  assert.deepEqual([...r.get("simpleB")!].sort(), ["CR", "MX"], "lo marcado sigue igual");
  assert.deepEqual([...directos.get("simpleA")!], ["PA"], "no cambia lo que recibe");
});
