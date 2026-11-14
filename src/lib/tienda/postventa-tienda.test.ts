import assert from "node:assert/strict";
import test from "node:test";
import { casoAbierto, casoDeFila, etiquetaPostventa, tipoPrincipal, type CasoPedido } from "./postventa-tienda";

const caso = (x: Partial<CasoPedido>): CasoPedido => ({ ...casoDeFila({ nombre: "KENKU: caso", tipos: [] }), ...x });

test("postventa en pedidos: el tipo principal y si el caso sigue abierto", () => {
  assert.equal(tipoPrincipal(["retiro", "reembolso"]), "Reembolso");
  assert.equal(tipoPrincipal(["cambio", "retiro"]), "Cambio");
  assert.equal(tipoPrincipal(["complemento"]), "Complemento");
  assert.equal(tipoPrincipal([]), "Caso");
  assert.equal(casoAbierto({ estado: "Hecho", grupo: "Realizados" }), false);
  assert.equal(casoAbierto({ estado: "En Proceso", grupo: "Cambios/Retiros/Reembolsos/Complementos" }), true);
  assert.equal(casoAbierto({ estado: "Estancado", grupo: "Realizados" }), true);
  assert.equal(casoAbierto({ estado: null, grupo: "Realizados" }), false);
  assert.equal(casoAbierto({ estado: null, grupo: "Asuntos de Finanzas" }), true);
});

test("postventa en pedidos: la etiqueta es la del caso más reciente", () => {
  assert.equal(etiquetaPostventa([]), null);
  assert.equal(etiquetaPostventa(undefined), null);
  const viejo = caso({ tipos: ["cambio"], estado: "Hecho", fecha: "2026-09-10" });
  const nuevo = caso({ tipos: ["reembolso", "retiro"], estado: "Esperando Comprobante de Reembolso", fecha: "2026-10-08" });
  assert.equal(etiquetaPostventa([viejo, nuevo]), "Reembolso · Esperando Comprobante de Reembolso");
  assert.equal(etiquetaPostventa([caso({ tipos: ["complemento"], estado: null, grupo: "Realizados", fecha: "2026-10-22" })]), "Complemento · Hecho");
});

test("postventa en pedidos: la fila de la base se lee sin sorpresas", () => {
  const c = casoDeFila({ orden_id: "x", nombre: "KENKU: Realizar cambio #24391", tipos: ["cambio", "retiro"], estado: "Hecho", grupo: "Realizados", reembolso: "26.40", creado_monday: "2026-09-10T15:00:00Z", motivo: " ", retirar: "1 x pulsera" });
  assert.equal(c.fecha, "2026-09-10");
  assert.equal(c.reembolso, 26.4);
  assert.equal(c.motivo, null);
  assert.equal(c.retirar, "1 x pulsera");
  assert.deepEqual(c.tipos, ["cambio", "retiro"]);
});
