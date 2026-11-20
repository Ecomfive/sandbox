import { test } from "node:test";
import assert from "node:assert/strict";
import { montosDelReparto, partesIguales, validarReparto } from "./reparto-elegido";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const todas = new Set([A, B, C]);

test("reparto: partes iguales suman 100", () => {
  const p = partesIguales([A, B, C]);
  assert.deepEqual(p.map((x) => x.porcentaje), [33.3333, 33.3333, 33.3334]);
  assert.equal(p.reduce((s, x) => s + x.porcentaje, 0).toFixed(4), "100.0000");
});

test("reparto: los montos suman exacto el total (como la vista)", () => {
  const m = montosDelReparto(100, partesIguales([A, B, C]));
  assert.equal(m.reduce((s, x) => s + x.monto, 0).toFixed(2), "100.00");
  assert.deepEqual(m.map((x) => x.monto), [33.33, 33.34, 33.33]);
  assert.deepEqual(montosDelReparto(250, [{ unidadId: A, porcentaje: 70 }, { unidadId: B, porcentaje: 30 }]).map((x) => x.monto), [175, 75]);
});

test("reparto: se valida lo que manda el navegador", () => {
  assert.deepEqual(validarReparto([], todas), { partes: [] });
  assert.ok("error" in validarReparto([{ unidadId: A, porcentaje: 100 }], todas));
  assert.ok("error" in validarReparto([{ unidadId: A, porcentaje: 60 }, { unidadId: B, porcentaje: 30 }], todas));
  assert.ok("error" in validarReparto([{ unidadId: A, porcentaje: 50 }, { unidadId: A, porcentaje: 50 }], todas));
  assert.ok("error" in validarReparto([{ unidadId: A, porcentaje: 50 }, { unidadId: "x", porcentaje: 50 }], todas));
  assert.ok("error" in validarReparto([{ unidadId: A, porcentaje: 50 }, { unidadId: B, porcentaje: 50 }], new Set([A])));
  const r = validarReparto(partesIguales([A, B, C]), todas);
  assert.ok("partes" in r && r.partes.length === 3);
});
