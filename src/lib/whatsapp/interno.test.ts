import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLANTILLAS_SUGERIDAS } from "./plantillas-sugeridas";
import { conPredeterminadaPrimero, esNumeroDeLaEmpresa, esPlantillaPredeterminada, PLANTILLA_INTERNA, sugeridoParaVariable } from "./interno";

describe("WhatsApp interno", () => {
  const numeros = [{ numero: "+507 6000-0001" }, { numero: "58 412 5551234" }, { numero: null }];

  it("reconoce el teléfono de otro número de la empresa, con o sin formato", () => {
    assert.equal(esNumeroDeLaEmpresa("+50760000001", numeros), true);
    assert.equal(esNumeroDeLaEmpresa("584125551234", numeros), true);
    assert.equal(esNumeroDeLaEmpresa("+50761112222", numeros), false);
  });

  it("no confunde un id corto de WhatsApp ni un valor vacío con un número", () => {
    assert.equal(esNumeroDeLaEmpresa("123", [{ numero: "123" }]), false);
    assert.equal(esNumeroDeLaEmpresa(null, numeros), false);
    assert.equal(esNumeroDeLaEmpresa("interno:ac:atencion", numeros), false);
  });

  it("la plantilla predeterminada es la interna y solo en un chat interno", () => {
    assert.equal(esPlantillaPredeterminada(PLANTILLA_INTERNA, true), true);
    assert.equal(esPlantillaPredeterminada(PLANTILLA_INTERNA, false), false);
    assert.equal(esPlantillaPredeterminada("retomar_compra", true), false);
  });

  it("es una de las plantillas sugeridas, con el nombre que se compara", () => {
    assert.ok(PLANTILLAS_SUGERIDAS.some((p) => p.nombre === PLANTILLA_INTERNA && p.grupo === "interno"));
  });

  it("pone la predeterminada primero y respeta el orden de las demás", () => {
    const orden = conPredeterminadaPrimero([
      { id: "a", predeterminada: false },
      { id: "b", predeterminada: false },
      { id: "c", predeterminada: true },
    ]).map((p) => p.id);
    assert.deepEqual(orden, ["c", "a", "b"]);
  });

  it("llena «Área que escribe» con el área del número que manda, y nada más", () => {
    assert.equal(sugeridoParaVariable("Área que escribe", true, "atencion"), "Atención");
    assert.equal(sugeridoParaVariable("  área que escribe ", true, "direccion"), "Dirección");
    assert.equal(sugeridoParaVariable("Mensaje", true, "atencion"), "");
    assert.equal(sugeridoParaVariable("Área que escribe", false, "atencion"), "");
    assert.equal(sugeridoParaVariable("Área que escribe", true, "otra"), "");
  });
});
