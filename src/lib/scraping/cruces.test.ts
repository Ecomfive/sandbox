import assert from "node:assert/strict";
import { test } from "node:test";
import { indexar, motivoYaVisto, repetidos, todasLasCoincidencias, yaVisto } from "./cruces";

const indice = indexar([
  { tipo: "test", id: "t1", nombre: "Crema ChillFlex Alivia Músculos", huella: null, detalle: "Test #3 · 12 mar 2026 · winner" },
  { tipo: "producto", id: "p1", nombre: "Lona impermeable transparente", huella: "ffff0000ffff0000", detalle: "SKU LONA-01" },
  { tipo: "producto", id: "p2", nombre: "Crema facial", huella: null, detalle: "SKU CREMA-01" },
]);

test("reconoce un producto ya testeado o ya en Producto por el nombre o la foto", () => {
  const t = yaVisto("Crema Chillflex Alivia Musculos Viral", null, indice);
  assert.equal(t?.tipo, "test");
  assert.equal(t?.id, "t1");
  assert.match(motivoYaVisto(t!), /^Ya testeado: «Crema ChillFlex Alivia Músculos» en Test productos \(Test #3/);
  const f = yaVisto("Cobertor de lona para patio", "ffff0000ffff0001", indice);
  assert.equal(f?.id, "p1");
  assert.equal(f?.porFoto, true);
  assert.match(motivoYaVisto(f!), /^Ya está en Producto: .*misma foto/);
  // La misma foto sin ninguna palabra en común no cuenta (muchas fotos de Dropi se parecen).
  assert.equal(yaVisto("Cobertor para patio", "ffff0000ffff0001", indice), null);
  // Una sola palabra en común no basta.
  assert.equal(yaVisto("Crema", null, indice), null);
  assert.equal(yaVisto("Lámpara solar", null, indice), null);
});

test("marca como repetido lo que aparece en otro proveedor o fuente, no en el mismo", () => {
  const r = repetidos([
    { id: "a", grupo: "HYPER", nombre: "Desbrazadora Podadora Recargable", huella: null },
    { id: "b", grupo: "TECNO", nombre: "Podadora Desbrazadora Recargable 21V", huella: null },
    { id: "c", grupo: "HYPER", nombre: "Desbrazadora Podadora Recargable Pro", huella: null },
    { id: "d", grupo: "TECNO", nombre: "Lámpara solar", huella: null },
  ]);
  assert.deepEqual([...(r.get("a") ?? [])], ["TECNO"]);
  assert.deepEqual([...(r.get("b") ?? [])], ["HYPER"]);
  assert.equal(r.has("d"), false);
});

test("todas las coincidencias de un nombre", () => {
  const i = indexar([
    { tipo: "producto", id: "a", nombre: "Turmeric Pure Curcumin 120 capsulas", huella: null, detalle: "" },
    { tipo: "producto", id: "b", nombre: "TURMERIC CURCUMIN 60 CAPSULAS", huella: null, detalle: "" },
    { tipo: "producto", id: "c", nombre: "Magnesium Complex", huella: null, detalle: "" },
  ]);
  assert.deepEqual(todasLasCoincidencias("Turmeric Curcumin", null, i).map((c) => c.id).sort(), ["a", "b"]);
});
