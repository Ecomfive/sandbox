import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { etiquetaDeChatBorrado, textoDeMensajeBorrado, vistaPreviaTexto } from "./borrado";

describe("vistaPreviaTexto", () => {
  it("deja el mensaje en una línea y lo corta si es largo", () => {
    assert.equal(vistaPreviaTexto("  hola \n  mundo "), "hola mundo");
    assert.equal(vistaPreviaTexto("a".repeat(200), 10), "aaaaaaaaa…");
    assert.equal(vistaPreviaTexto(null), "");
  });
});

describe("textoDeMensajeBorrado", () => {
  it("dice quién lo borró cuando fue desde el sistema", () => {
    assert.match(textoDeMensajeBorrado("Nicole Muñoz", true), /Nicole Muñoz/);
    assert.match(textoDeMensajeBorrado("Nicole Muñoz", false), /desde el sistema/);
  });
  it("sin nombre, distingue el mensaje nuestro del del cliente", () => {
    assert.match(textoDeMensajeBorrado(null, true), /app de WhatsApp Business/);
    assert.match(textoDeMensajeBorrado(null, false), /quien lo mandó/);
  });
});

describe("etiquetaDeChatBorrado", () => {
  it("un chat borrado desde el sistema dice quién; el marcado a mano sigue diciendo «en la app»", () => {
    assert.equal(etiquetaDeChatBorrado(true, "Nicole"), "Borrado por Nicole");
    assert.equal(etiquetaDeChatBorrado(true, null), "Borrado");
    assert.equal(etiquetaDeChatBorrado(false, "Nicole"), "Borrado en la app");
  });
});
