import assert from "node:assert/strict";
import { test } from "node:test";
import { bloqueoDeLinea, diferenciaRecepcion, pideMotivo, puedeMoverAMano, revisarRecepcion, reglaDeRecepcion } from "./recepcion";

const ID = "01a1364c-f839-7da8-b333-121b076154e5";
const ID2 = "01a1364c-f839-7da8-b333-121b076154e6";

test("en Costa Rica la salida y el ajuste a mano son de un administrador; en los demás países no cambia", () => {
  assert.equal(puedeMoverAMano("salida", "CR", false), false);
  assert.equal(puedeMoverAMano("ajuste", "CR", false), true);
  assert.equal(puedeMoverAMano("entrada", "CR", false), true);
  assert.equal(puedeMoverAMano("salida", "CR", true), true);
  assert.equal(puedeMoverAMano("salida", "PA", false), true);
  assert.equal(puedeMoverAMano("salida", null, false), true);
});

test("el motivo: un ajuste siempre; una salida, solo donde va con remisión", () => {
  assert.equal(pideMotivo("ajuste", "PA"), true);
  assert.equal(pideMotivo("salida", "CR"), true);
  assert.equal(pideMotivo("salida", "PA"), false);
  assert.equal(pideMotivo("entrada", "CR"), false);
});

test("una línea que no guarda stock no se recibe", () => {
  assert.match(String(bloqueoDeLinea({ tipo: "combo", clase: "fisico", conVariantes: false })), /compuesto/);
  assert.match(String(bloqueoDeLinea({ tipo: "simple", clase: "test", conVariantes: false })), /Test/);
  assert.match(String(bloqueoDeLinea({ tipo: "simple", clase: "fisico", conVariantes: true })), /variantes/);
  assert.equal(bloqueoDeLinea({ tipo: "simple", clase: "fisico", conVariantes: false }), null);
  assert.equal(bloqueoDeLinea({ tipo: "simple", clase: "inactivo", conVariantes: false }), null);
});

test("el faltante del ejemplo: se pidieron 1000 y llegaron 994", () => {
  assert.equal(diferenciaRecepcion(1000, 994), -6);
  assert.equal(diferenciaRecepcion(1000, 1000), 0);
});

test("revisa lo que manda la pantalla", () => {
  assert.deepEqual(revisarRecepcion([{ item: ID, cantidad: 994, nota: "  faltaron   6 ", lote_codigo: " L1 ", vencimiento: "2027-05-01" }]), {
    items: [{ item: ID, cantidad: 994, nota: "faltaron 6", ubicacion: null, lote_codigo: "L1", vencimiento: "2027-05-01" }],
  });
  assert.ok("items" in revisarRecepcion([{ item: ID, cantidad: 0, nota: "no llegó" }]));
  assert.ok("error" in revisarRecepcion([]));
  assert.ok("error" in revisarRecepcion([{ item: "x", cantidad: 1 }]));
  assert.ok("error" in revisarRecepcion([{ item: ID, cantidad: -1 }]));
  assert.ok("error" in revisarRecepcion([{ item: ID, cantidad: 1.5 }]));
  assert.ok("error" in revisarRecepcion([{ item: ID, cantidad: 1 }, { item: ID, cantidad: 1 }]));
  assert.ok("error" in revisarRecepcion([{ item: ID2, cantidad: 1, vencimiento: "mañana" }]));
});

test("cómo se recibe en cada país", () => {
  const pa = reglaDeRecepcion("PA")!;
  assert.ok(pa.etapas.includes("en_bodega") && pa.etapas.includes("arribo_mercancia") && pa.etapas.includes("llegada_puerto_lote_2"));
  assert.ok(!pa.etapas.includes("tracking"));
  assert.equal(pa.vieneEscrita, true);
  assert.equal(pa.admiteYaContadas, true);
  assert.equal(pa.completadasDesde, "2026-11-24");
  const cr = reglaDeRecepcion("CR")!;
  assert.ok(cr.etapas.includes("tracking"));
  assert.equal(cr.vieneEscrita, false);
  assert.equal(cr.admiteYaContadas, false);
  assert.equal(cr.completadasDesde, null);
  assert.equal(reglaDeRecepcion("MX"), null);
  assert.equal(reglaDeRecepcion(null), null);
});

