import assert from "node:assert/strict";
import { test } from "node:test";
import { revisarCorreccionStock, textoDiferencia } from "./correccion-stock";

test("calcula la diferencia y deja la nota en el motivo", () => {
  assert.deepEqual(revisarCorreccionStock({ actual: 438, correcto: "430", nota: "  Conté mal la caja 3 " }), { diferencia: -8, motivo: "Corrección 438 → 430: Conté mal la caja 3" });
  assert.deepEqual(revisarCorreccionStock({ actual: 0, correcto: 12, nota: "Faltaba cargar" }), { diferencia: 12, motivo: "Corrección 0 → 12: Faltaba cargar" });
  assert.equal((revisarCorreccionStock({ actual: 5, correcto: "0", nota: "Se dañaron" }) as { diferencia: number }).diferencia, -5);
});

test("pide un número válido y la nota, y no guarda lo mismo", () => {
  for (const correcto of ["", "abc", "-1", "1.5", null, undefined, "2000000"]) assert.match((revisarCorreccionStock({ actual: 1, correcto, nota: "nota" }) as { error: string }).error, /número entero/);
  assert.match((revisarCorreccionStock({ actual: 1, correcto: "2", nota: " " }) as { error: string }).error, /por qué/);
  assert.match((revisarCorreccionStock({ actual: 1, correcto: "2", nota: 7 }) as { error: string }).error, /por qué/);
  assert.match((revisarCorreccionStock({ actual: 9, correcto: "9", nota: "nada" }) as { error: string }).error, /mismo valor/);
});

test("dice cuánto se suma o se resta", () => {
  assert.equal(textoDiferencia(-8), "Se restan 8 unidades");
  assert.equal(textoDiferencia(1), "Se suman 1 unidad");
  assert.equal(textoDiferencia(1200), "Se suman 1,200 unidades");
});
