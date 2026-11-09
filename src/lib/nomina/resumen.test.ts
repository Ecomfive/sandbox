import assert from "node:assert/strict";
import test from "node:test";
import { resumirMes, variacionPct, type LineaResumen } from "./resumen";

const l = (o: Partial<LineaResumen>): LineaResumen => ({
  tipo: "formal", persona_id: "a", unidad: "A DISTRIBUIR", total_bruto: 0, neto: 0, seguro_social: 0, seguro_educativo: 0, diferencia_calculo: 0, ...o,
});

test("costo del mes: planilla (bruto) + externa + comisión, por tienda y personas", () => {
  const r = resumirMes(
    [
      l({ persona_id: "a", total_bruto: 400, neto: 356, seguro_social: 39, seguro_educativo: 5 }),
      l({ persona_id: "a", total_bruto: 400, neto: 356, seguro_social: 39, seguro_educativo: 5, diferencia_calculo: 1.5 }),
      l({ persona_id: "b", unidad: "ECOMFIVE", total_bruto: 300, neto: 300 }),
      l({ tipo: "externa", persona_id: "c", unidad: "OFERFY PAN", total_bruto: 250, neto: 250 }),
      l({ tipo: "externa", persona_id: "c", unidad: "OFERFY PAN", total_bruto: 50, neto: 50 }),
    ],
    10,
  );
  assert.equal(r.formalBruto, 1100);
  assert.equal(r.formalNeto, 1012);
  assert.equal(r.retenciones, 88);
  assert.equal(r.externa, 300);
  assert.equal(r.costoTotal, 1410);
  assert.equal(r.personas, 3);
  assert.equal(r.personasFormal, 2);
  assert.equal(r.personasExterna, 1);
  assert.equal(r.noCuadran, 1);
  assert.deepEqual(r.porTienda.map((t) => [t.unidad, t.monto]), [["A DISTRIBUIR", 800], ["ECOMFIVE", 300], ["OFERFY PAN", 300]]);
});

test("variación contra el mes anterior", () => {
  assert.equal(variacionPct(110, 100), 10);
  assert.equal(variacionPct(90, 100), -10);
  assert.equal(variacionPct(90, null), null);
  assert.equal(variacionPct(90, 0), null);
});
