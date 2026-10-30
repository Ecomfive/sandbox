import assert from "node:assert/strict";
import { test } from "node:test";
import { BOTONES_FICHA, leerUsos, ordenDeBotones } from "./botones-ficha";

test("sin usos, cada botón queda en su sitio de siempre", () => {
  const orden = ordenDeBotones({});
  BOTONES_FICHA.forEach((id, i) => assert.equal(orden.get(id), i));
});

test("el más usado queda primero (a la derecha) y los demás por uso", () => {
  const orden = ordenDeBotones({ caso: 9, tarea: 3, recomendar: 3 });
  assert.equal(orden.get("caso"), 0);
  // A igual uso, el de siempre: «tarea» va antes que «recomendar».
  assert.equal(orden.get("tarea"), 1);
  assert.equal(orden.get("recomendar"), 2);
  // Los sin usar siguen en su orden de siempre detrás.
  assert.ok((orden.get("whatsapp") ?? 0) < (orden.get("tomar") ?? 0));
  assert.ok((orden.get("tomar") ?? 0) > 2);
});

test("las posiciones son todas distintas y completas", () => {
  const orden = ordenDeBotones({ vincular: 5, importar: 2 });
  assert.equal(new Set(orden.values()).size, BOTONES_FICHA.length);
});

test("lo guardado raro no rompe nada", () => {
  assert.deepEqual(leerUsos(null), {});
  assert.deepEqual(leerUsos("no es json"), {});
  assert.deepEqual(leerUsos("[1,2]"), {});
  assert.deepEqual(leerUsos('{"caso":4,"tarea":-1,"x":"a"}'), { caso: 4 });
});
