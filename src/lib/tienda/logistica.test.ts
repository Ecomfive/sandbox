import assert from "node:assert/strict";
import test from "node:test";
import { diasDesde, etapaConEntrega, etapaLogistica, listoParaPreparar, transportistaDe } from "./logistica";

test("etapa de logística", () => {
  assert.equal(etapaLogistica("confirmado"), "por_preparar");
  assert.equal(etapaLogistica("en_camino"), "en_ruta");
  assert.equal(etapaLogistica("entregado"), "entregado");
  assert.equal(etapaLogistica("nuevo"), null);
  assert.equal(etapaLogistica("cancelado"), null);
});

test("transportista: la guardada o la de la etiqueta de zona", () => {
  assert.equal(transportistaDe(null, ["easysell_cod_form", "INTERIOR/SERVIENTREGA", "Confirmada"]), "Servientrega");
  assert.equal(transportistaDe(null, "CIUDAD, Confirmada"), null);
  assert.equal(transportistaDe("Uno Express", ["INTERIOR/SERVIENTREGA"]), "Uno Express");
  assert.equal(transportistaDe(null, ["INTERIOR / fletes chiriqui"]), "Fletes Chiriqui");
});

test("listo para preparar según la fecha que pidió el cliente y la zona", () => {
  const hoy = "2026-11-12";
  const p = (fecha: string) => ({ fecha, tipo: "para" as const, cita: "" });
  assert.equal(listoParaPreparar(null, "Ciudad", hoy), true);
  assert.equal(listoParaPreparar(p("2026-11-13"), "Ciudad", hoy), true);
  assert.equal(listoParaPreparar(p("2026-11-14"), "Ciudad", hoy), false);
  assert.equal(listoParaPreparar(p("2026-11-14"), "Interior", hoy), true);
  assert.equal(listoParaPreparar(p("2026-11-19"), "Interior", hoy), false);
  assert.equal(diasDesde("2026-11-05", hoy), 7);
  assert.equal(diasDesde("2026-11-13", hoy), 0);
});

test("etapa con la entrega de Monday", () => {
  assert.equal(etapaConEntrega("en_camino", { grupo: "entregado" }), "entregado");
  assert.equal(etapaConEntrega("en_camino", { grupo: "rechazado" }), "devuelto");
  assert.equal(etapaConEntrega("en_camino", { grupo: "en_ruta" }), "en_ruta");
  assert.equal(etapaConEntrega("en_camino", null), "en_ruta");
  // Monday no cambia lo que todavía no sale.
  assert.equal(etapaConEntrega("confirmado", { grupo: "entregado" }), "por_preparar");
});
