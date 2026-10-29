import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decidirGuardadoTelefono, esTelefonoCompleto } from "./vinculo";

describe("vinculo de chats con dropshippers", () => {
  it("solo un número con prefijo de país se puede guardar y emparejar", () => {
    assert.equal(esTelefonoCompleto("+50761112233"), true);
    assert.equal(esTelefonoCompleto("50761112233"), false);
    assert.equal(esTelefonoCompleto("PA.123abc"), false);
    assert.equal(esTelefonoCompleto("+123"), false);
  });

  it("qué se hace con el número del chat al vincular", () => {
    const base = { telefono: "+50761112233", principal: null as string | null, alternos: [] as string[], deOtro: false };
    assert.equal(decidirGuardadoTelefono({ ...base, telefono: "PA.123abc" }), "no_aplica");
    assert.equal(decidirGuardadoTelefono(base), "principal");
    assert.equal(decidirGuardadoTelefono({ ...base, principal: "+50760000000" }), "alterno");
    assert.equal(decidirGuardadoTelefono({ ...base, principal: "+50761112233" }), "ya_es");
    assert.equal(decidirGuardadoTelefono({ ...base, principal: "+50760000000", alternos: ["+50761112233"] }), "ya_es");
    assert.equal(decidirGuardadoTelefono({ ...base, deOtro: true }), "ocupado");
    assert.equal(decidirGuardadoTelefono({ ...base, principal: "+50760000000", deOtro: true }), "ocupado");
  });
});
