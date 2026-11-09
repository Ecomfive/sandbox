// Ajustes de Finanzas (migración 0917). Datos inventados.
import assert from "node:assert/strict";
import test from "node:test";
import { AJUSTES, efectosDepreciacion, efectosNomina, encendido, esClaveAjuste } from "./config";

test("los interruptores arrancan apagados y solo true los enciende", () => {
  assert.deepEqual([...AJUSTES], ["depreciacion_en_eerr", "nomina_al_libro"]);
  assert.equal(encendido(true), true);
  assert.equal(encendido("true"), true);
  for (const v of [false, null, undefined, 1, "si", {}, "false"]) assert.equal(encendido(v), false);
  assert.equal(esClaveAjuste("nomina_al_libro"), true);
  assert.equal(esClaveAjuste("otra"), false);
  assert.equal(esClaveAjuste(1), false);
});

test("la confirmación de la depreciación dice cuánto cambia el resultado y el EBITDA", () => {
  const sinAltas = efectosDepreciacion({ anio: 2026, meses: 10, depreciacion: 1234, altas: 0, altasEbitda: 0, altasMovimientos: 0 });
  assert.match(sinAltas.alEncender, /baja \$1[.,]234/);
  assert.match(sinAltas.alEncender, /el EBITDA no cambia/);
  assert.match(sinAltas.alApagar, /sube \$1[.,]234/);

  const conAltas = efectosDepreciacion({ anio: 2026, meses: 10, depreciacion: 1000, altas: 5000, altasEbitda: 5000, altasMovimientos: 3 });
  assert.match(conAltas.alEncender, /3 altas/);
  assert.match(conAltas.alEncender, /el EBITDA sube \$5[.,]000/);
  assert.match(conAltas.alEncender, /resultado neto sube \$4[.,]000/);
  assert.match(conAltas.alApagar, /el EBITDA baja \$5[.,]000 y el resultado neto baja \$4[.,]000/);
});

test("la confirmación de la nómina avisa los meses ya pasados", () => {
  assert.match(efectosNomina(0).alApagar, /^Deja de ofrecerse/);
  assert.match(efectosNomina(2).alApagar, /2 meses ya pasados siguen/);
  assert.match(efectosNomina(1).alApagar, /1 mes ya pasado sigue/);
});
