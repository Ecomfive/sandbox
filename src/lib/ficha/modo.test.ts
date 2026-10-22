import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { esFicha, leerModoFicha, modoEfectivo, modoPorDefecto } from "./modo";

describe("leerModoFicha", () => {
  it("acepta los tres modos", () => {
    assert.equal(leerModoFicha("lateral"), "lateral");
    assert.equal(leerModoFicha("centro"), "centro");
    assert.equal(leerModoFicha("completa"), "completa");
  });
  it("lo que no es un modo no cuenta como elección", () => {
    assert.equal(leerModoFicha(""), null);
    assert.equal(leerModoFicha(null), null);
    assert.equal(leerModoFicha(undefined), null);
    assert.equal(leerModoFicha("pantalla"), null);
    assert.equal(leerModoFicha("Lateral"), null);
  });
});

describe("modoEfectivo", () => {
  it("sin elección, cada ficha se abre como siempre", () => {
    assert.equal(modoPorDefecto("derecha"), "lateral");
    assert.equal(modoPorDefecto("centro"), "centro");
    assert.equal(modoEfectivo("", "derecha"), "lateral");
    assert.equal(modoEfectivo("", "centro"), "centro");
  });
  it("la elección de la persona manda en todas las fichas", () => {
    assert.equal(modoEfectivo("completa", "derecha"), "completa");
    assert.equal(modoEfectivo("lateral", "centro"), "lateral");
    assert.equal(modoEfectivo("centro", "derecha"), "centro");
  });
  it("un valor roto vuelve al modo por defecto", () => {
    assert.equal(modoEfectivo("xyz", "derecha"), "lateral");
  });
});

describe("esFicha", () => {
  it("el panel a la derecha y la ventana grande al centro son fichas; un diálogo pequeño no", () => {
    assert.equal(esFicha("derecha", "lg"), true);
    assert.equal(esFicha("derecha", "md"), true);
    assert.equal(esFicha("centro", "xl"), true);
    assert.equal(esFicha("centro", "md"), false);
    assert.equal(esFicha("centro", "sm"), false);
  });
});
