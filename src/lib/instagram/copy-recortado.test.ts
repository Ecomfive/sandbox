import assert from "node:assert/strict";
import test from "node:test";
import { copyRecortadoCompletado } from "./guardar";

const COMPLETO = '⭐️ "Dejé de pagarle al técnico cada vez que necesitaba colgar algo."\nFranklin V.\n\nPagar a alguien cada vez que necesitas colgar un cuadro o armar un mueble te sale carísimo a la larga.';

test("un texto guardado cortado con «...» se reemplaza por el mismo texto completo", () => {
  assert.equal(copyRecortadoCompletado('⭐️ "Dejé de pagarle al técnico cada vez que necesitaba colgar algo."\nFranklin V.\n\nPagar a alguien cada vez que necesitas colgar un cuadro o armar...', COMPLETO), true);
  assert.equal(copyRecortadoCompletado("Todo lo que tu casa necesita, en un solo lugar…", "Todo lo que tu casa necesita, en un solo lugar. En Ingenio encuentras productos."), true);
});

test("no se pisa un texto que no estaba cortado, uno corregido a mano ni uno distinto", () => {
  assert.equal(copyRecortadoCompletado(COMPLETO, COMPLETO + " y más"), false);
  assert.equal(copyRecortadoCompletado("Texto que escribió una persona y termina en puntos...", "Otro texto completamente distinto que no empieza igual, mucho más largo"), false);
  assert.equal(copyRecortadoCompletado("Corto...", "Corto y largo y mucho más largo todavía por aquí"), false);
  assert.equal(copyRecortadoCompletado("Todo lo que tu casa necesita, en un solo lugar...", "Todo lo que tu casa necesita, en un solo lugar"), false);
});
