import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nombreSinNumero, puedeVerTelefonos } from "./telefono-oculto";

describe("telefono-oculto", () => {
  it("solo quien modifica Usuarios y roles puede mostrar el número", () => {
    assert.equal(puedeVerTelefonos({ modulos: ["usuarios", "crm-dropshippers"], modulosSoloLectura: [] }), true);
    assert.equal(puedeVerTelefonos({ modulos: ["usuarios"], modulosSoloLectura: ["usuarios"] }), false);
    assert.equal(puedeVerTelefonos({ modulos: ["crm-dropshippers", "crm-comercial", "crm-direccion"], modulosSoloLectura: [] }), false);
  });
  it("un chat sin nombre se distingue sin enseñar el número", () => {
    const n = nombreSinNumero("01a1364c-cf47-73fe-b25e-7940ac4cfb19");
    assert.equal(n, "Contacto FB19");
    assert.ok(!/\d{6,}/.test(n));
    assert.equal(nombreSinNumero(""), "Contacto");
  });
});
