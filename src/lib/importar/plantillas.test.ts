import assert from "node:assert/strict";
import test from "node:test";
import { plantillas, plantillasDe } from "./plantillas";
import { ORDEN_CARGA, reconocerArchivo } from "./reconocer";

test("cada plantilla se reconoce como su módulo (y solo como ese)", () => {
  for (const p of plantillas()) {
    const r = reconocerArchivo(p.hojas.map((h) => ({ nombre: h.nombre, filas: h.filas })));
    assert.deepEqual(
      r.map((x) => x.modulo),
      [p.modulo],
      `${p.clave}: ${JSON.stringify(r)}`,
    );
  }
});

test("todo módulo con importador tiene su plantilla", () => {
  for (const m of ORDEN_CARGA) assert.ok(plantillasDe(m).length > 0, m);
  assert.equal(plantillasDe("nomina").length, 2);
});
