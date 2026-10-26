import assert from "node:assert/strict";
import { test } from "node:test";
import { indexar, motivoYaVisto, parecidos, repetidos, todasLasCoincidencias, yaVisto } from "./cruces";

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

test("lo comprado y lo publicado en Dropi también cuentan como nuestro, y se nombran antes que la ficha de Producto", () => {
  const idx = indexar([
    { tipo: "producto", id: "p9", nombre: "Aceite de batana para el cabello", huella: null, detalle: "SKU BATANA" },
    { tipo: "compra", id: "c9", nombre: "Aceite de batana para el cabello", huella: null, detalle: "OC-1207 · En camino · Panamá · SKU BATANA" },
    { tipo: "publicacion", id: "d9", nombre: "Shilajit Gold Gummies", huella: null, detalle: "PUB-0309 · ID 7588 · PA" },
  ]);
  const c = yaVisto("Aceite de Batana para el Cabello 60 ml", null, idx);
  assert.equal(c?.tipo, "compra");
  assert.match(motivoYaVisto(c!), /^Ya se compró: «Aceite de batana para el cabello» \(OC-1207/);
  assert.equal(yaVisto("Gomitas Shilajit Gold Gummies", null, idx)?.tipo, "publicacion");
});

test("parecidos: lo que se parece sin ser igual (lo igual no sale aquí)", () => {
  const idx = indexar([
    { tipo: "producto", id: "p1", nombre: "Magnesio Complex 12 en 1 Totaria 120 capsulas", huella: null, detalle: "SKU MAG-120" },
    { tipo: "compra", id: "c1", nombre: "Gomitas de colágeno sabor fresa", huella: null, detalle: "OC-1300" },
  ]);
  const p = parecidos("Magnesio Complex Totaria 90 cp", null, idx);
  assert.equal(p.length, 1);
  assert.equal(p[0].nombre, "Magnesio Complex 12 en 1 Totaria 120 capsulas");
  assert.deepEqual(parecidos("Magnesio Complex 12 en 1 Totaria 120 capsulas", null, idx), []); // es igual: lo da yaVisto
  assert.deepEqual(parecidos("Lámpara de luna 3D", null, idx), []);
});
