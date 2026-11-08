import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esOrdenDefecto,
  leerOrden,
  moverAntes,
  moverUnPaso,
  ORDEN_DEFECTO,
} from "./orden-botones";

test("orden de los botones de la ficha: se lee con cuidado y se mueve", () => {
  assert.deepEqual(leerOrden(null), ORDEN_DEFECTO);
  assert.deepEqual(leerOrden("no es json"), ORDEN_DEFECTO);
  assert.deepEqual(
    leerOrden('["archivar","raro","archivar","republicar"]').slice(0, 3),
    ["archivar", "republicar", "publicar"],
    "sin desconocidos ni repetidos; los que faltan al final",
  );
  assert.equal(leerOrden('["archivar"]').length, ORDEN_DEFECTO.length);
  assert.equal(esOrdenDefecto(ORDEN_DEFECTO), true);
  assert.deepEqual(
    moverAntes(ORDEN_DEFECTO, "archivar", "publicar")[0],
    "archivar",
  );
  assert.deepEqual(
    moverAntes(ORDEN_DEFECTO, "publicar", null).at(-1),
    "publicar",
  );
  assert.equal(
    esOrdenDefecto(moverAntes(ORDEN_DEFECTO, "archivar", "publicar")),
    false,
  );
  // Entre los que se ven: «publicar» y «eliminar» no se ven en una publicación con ID de Dropi.
  const visibles = [
    "republicar",
    "apagar",
    "privatizar",
    "pausar",
    "liquidacion",
    "archivar",
  ] as const;
  const izq = moverUnPaso(ORDEN_DEFECTO, "apagar", -1, visibles);
  assert.deepEqual(
    izq.filter((x) => (visibles as readonly string[]).includes(x)).slice(0, 2),
    ["apagar", "republicar"],
  );
  const der = moverUnPaso(ORDEN_DEFECTO, "republicar", 1, visibles);
  assert.deepEqual(
    der.filter((x) => (visibles as readonly string[]).includes(x)).slice(0, 2),
    ["apagar", "republicar"],
  );
  assert.deepEqual(
    moverUnPaso(ORDEN_DEFECTO, "republicar", -1, visibles),
    ORDEN_DEFECTO,
    "el primero no se va más a la izquierda",
  );
  assert.deepEqual(
    moverUnPaso(ORDEN_DEFECTO, "archivar", 1, visibles),
    ORDEN_DEFECTO,
    "el último no se va más a la derecha",
  );
});
