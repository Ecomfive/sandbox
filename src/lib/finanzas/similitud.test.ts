import assert from "node:assert/strict";
import test from "node:test";
import { aprender } from "./clasificacion";
import { indexar, nivelConfianza, palabras, parecidoMonto, similitud, sugerirPorParecido } from "./similitud";
import { confianzaFirma, sugerirConConfianza, CONFIANZA_REGLA } from "./sugerencias-confianza";

test("palabras y similitud ignoran números, signos y palabras vacías", () => {
  assert.deepEqual(palabras("Compra en comercio FACEBK *X22 #12"), ["COMPRA", "COMERCIO", "FACEBK"]);
  assert.equal(similitud("PAGO HOSTING NUBE 123", "Pago hosting nube 999"), 1);
  assert.ok(similitud("FACEBK ADS", "FACEBOOK ADS") > 0.45);
  assert.ok(similitud("ALQUILER OFICINA", "COMISION YAPPY") < 0.2);
});

test("parecido de monto baja con la razón y tiene un piso", () => {
  assert.equal(parecidoMonto(100, 100), 1);
  assert.ok(parecidoMonto(100, 200) < 0.6);
  assert.equal(parecidoMonto(1, 1000), 0.35);
  assert.equal(parecidoMonto(0, 10), 0.35);
});

const historial = [
  ...Array.from({ length: 6 }, (_, i) => ({ descripcion: `SUSCRIPCION NUBEFICTICIA MENSUAL ${i}`, monto: 30, unidad_id: "corp", tipo_id: "software" })),
  { descripcion: "SUSCRIPCION NUBEFICTICIA ANUAL", monto: 300, unidad_id: "corp", tipo_id: "software" },
  ...Array.from({ length: 4 }, () => ({ descripcion: "ENVIO MENSAJERIA RAPIDA", monto: 4, unidad_id: "kenku", tipo_id: "envios" })),
];

test("sugiere por parecido con confianza alta si los vecinos coinciden", () => {
  const indice = indexar(historial, "sin");
  const s = sugerirPorParecido({ descripcion: "Suscripcion NubeFicticia mensual 77", monto: 31 }, indice);
  assert.equal(s.tipo?.id, "software");
  assert.equal(s.unidad?.id, "corp");
  assert.ok((s.tipo?.confianza ?? 0) >= 80, `confianza ${s.tipo?.confianza}`);
  assert.equal(nivelConfianza(s.tipo!.confianza), "Alta");
  // Sin nada parecido no inventa.
  assert.equal(sugerirPorParecido({ descripcion: "XYZ QWERTY", monto: 5 }, indice).tipo, null);
});

test("con vecinos divididos la confianza baja", () => {
  const dividido = indexar(
    [
      { descripcion: "PAGO PROVEEDOR VARIOS", monto: 50, unidad_id: "a", tipo_id: "t1" },
      { descripcion: "PAGO PROVEEDOR VARIOS", monto: 50, unidad_id: "b", tipo_id: "t2" },
    ],
    "sin",
  );
  const s = sugerirPorParecido({ descripcion: "PAGO PROVEEDOR VARIOS", monto: 50 }, dividido);
  assert.ok((s.tipo?.confianza ?? 100) < 50);
});

test("confianza: regla 99, firma por veces, parecido para lo que falta", () => {
  assert.equal(confianzaFirma(12, 12), 93);
  assert.ok(confianzaFirma(3, 3) < confianzaFirma(12, 12));
  const indice = indexar(historial, "sin");
  const vacio = aprender([], "sin");
  const r = sugerirConConfianza({ descripcion: "ENVIO MENSAJERIA RAPIDA 9", monto: 4, unidad_id: "sin", tipo_id: null }, "sin", [{ id: "r", patron: "MENSAJERIA", unidad_id: null, tipo_id: "envios", activo: true }], vacio, indice);
  assert.equal(r.origen, "regla");
  assert.equal(r.tipo_id, "envios");
  assert.equal(r.unidad_id, "kenku"); // la tienda sale del parecido
  assert.ok(r.confianza! < CONFIANZA_REGLA);
  const nada = sugerirConConfianza({ descripcion: "ZZZ", monto: 1, unidad_id: "sin", tipo_id: null }, "sin", [], vacio, indice);
  assert.equal(nada.confianza, null);
  assert.equal(nada.origen, null);
});
