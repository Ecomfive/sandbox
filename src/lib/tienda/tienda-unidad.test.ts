import assert from "node:assert/strict";
import test from "node:test";
import { mismaTiendaUnidad } from "./ordenes-finanzas";

test("la tienda del sistema se une a su unidad de Finanzas por nombre o por el alias de la Matriz", () => {
  assert.equal(mismaTiendaUnidad("Kenku", "KENKU"), true);
  assert.equal(mismaTiendaUnidad("Oferfy", "OFERFY PAN"), true);
  assert.equal(mismaTiendaUnidad("OFERFY", "OFERFY PAN"), true);
  assert.equal(mismaTiendaUnidad("Nuvo", "NUVO PAN"), true);
  assert.equal(mismaTiendaUnidad("Oferfy", "KENKU"), false);
  assert.equal(mismaTiendaUnidad("Kenku", "OFERFY PAN"), false);
});
