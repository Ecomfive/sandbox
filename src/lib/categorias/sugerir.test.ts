import assert from "node:assert/strict";
import { test } from "node:test";
import { sugerirPorParecidos, type EjemploCategoria } from "./sugerir";

const LINTERNAS = { categoriaId: "ha-15-16-1", ruta: "Bricolaje > Herramientas > Linternas y linternas frontales > Linternas" };
const PIEL = { categoriaId: "hb-3-2-9-10", ruta: "Salud y belleza > Cuidado personal > Cosméticos > Cuidado de la piel > Lociones y humectantes" };
const ejemplos: EjemploCategoria[] = [
  { nombre: "Linterna Táctica Titanium", huella: null, ...LINTERNAS },
  { nombre: "Linterna Táctica Recargable 6 en 1", huella: "ffff000000000000", ...LINTERNAS },
  { nombre: "Crema Anticelulitis Adeus", huella: "0000ffff00000000", ...PIEL },
  { nombre: "Crema Reafirmante Corporal", huella: null, ...PIEL },
];

test("por nombre: la categoría de los productos parecidos, con ejemplos", () => {
  const r = sugerirPorParecidos("Linterna táctica de alta potencia", null, ejemplos);
  assert.equal(r[0].id, "ha-15-16-1");
  assert.deepEqual(r[0].ejemplos, ["Linterna Táctica Titanium", "Linterna Táctica Recargable 6 en 1"]);
  assert.equal(r.length, 1);
});

test("por foto: una huella casi igual sugiere aunque el nombre no se parezca", () => {
  const r = sugerirPorParecidos("Producto nuevo", "0000fffe00000000", ejemplos);
  assert.equal(r[0].id, "hb-3-2-9-10");
});

test("sin parecidos no sugiere nada", () => {
  assert.deepEqual(sugerirPorParecidos("Taladro inalámbrico", null, ejemplos), []);
  assert.deepEqual(sugerirPorParecidos("", null, ejemplos), []);
});
