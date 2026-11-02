import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { accesoPlantillas, conexionPlantillas, errorDePlantilla } from "./api-plantillas";

const VARIABLES = ["D360_API_KEY", "D360_SANDBOX", "WHATSAPP_TOKEN", "WHATSAPP_WABA_ID", "WHATSAPP_API_VERSION"] as const;
const antes = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]));
const limpiar = () => VARIABLES.forEach((v) => delete process.env[v]);
afterEach(() => VARIABLES.forEach((v) => (antes[v] === undefined ? delete process.env[v] : (process.env[v] = antes[v]))));

describe("errorDePlantilla", () => {
  it("dice con palabras del equipo lo más común", () => {
    assert.match(errorDePlantilla(400, { error: { code: 100, error_subcode: 2388024 } }), /Ya existe una plantilla con ese nombre/);
    assert.match(errorDePlantilla(400, { error: { code: 100, error_subcode: 2388023 } }), /30 días/);
    assert.match(errorDePlantilla(401, {}), /rechazó la clave/);
    assert.match(errorDePlantilla(400, { error: { code: 190 } }), /rechazó la clave/);
    assert.match(errorDePlantilla(429, {}), /máximo 100 por hora/);
    assert.match(errorDePlantilla(400, { error: { code: 80008 } }), /máximo 100 por hora/);
  });
  it("prefiere el motivo que Meta le da a la persona", () => {
    assert.equal(errorDePlantilla(400, { error: { code: 100, error_user_msg: "El texto tiene demasiadas variables." } }), "Meta no la aceptó: El texto tiene demasiadas variables.");
  });
  it("sin motivo claro, cualquier otro texto que traiga la respuesta", () => {
    assert.match(errorDePlantilla(400, { error: { message: "Invalid parameter" } }), /Meta no la aceptó: Invalid parameter/);
    assert.match(errorDePlantilla(500, "boom"), /Meta no la aceptó: boom/);
  });
});

describe("accesoPlantillas", () => {
  it("sin ninguna clave dice que WhatsApp no está conectado", () => {
    limpiar();
    const a = accesoPlantillas();
    assert.ok("error" in a && /todavía no está conectado/.test(a.error));
    assert.deepEqual(conexionPlantillas().conectado, false);
  });
  it("con la clave de 360dialog usa su API de plantillas", () => {
    limpiar();
    process.env.D360_API_KEY = "clave";
    const a = accesoPlantillas();
    assert.ok("acceso" in a);
    if ("acceso" in a) {
      assert.equal(a.acceso.origen, "360dialog");
      assert.equal(a.acceso.base, "https://waba-v2.360dialog.io");
      assert.equal(a.acceso.cabeceras["D360-API-KEY"], "clave");
    }
    assert.deepEqual(conexionPlantillas(), { conectado: true, via: "360dialog", motivo: null, numeros: 1 });
  });
  it("el sandbox de 360dialog no maneja plantillas", () => {
    limpiar();
    process.env.D360_API_KEY = "clave";
    process.env.D360_SANDBOX = "1";
    const a = accesoPlantillas();
    assert.ok("error" in a && /sandbox/.test(a.error));
  });
  it("con Meta directo hace falta además el identificador de la cuenta", () => {
    limpiar();
    process.env.WHATSAPP_TOKEN = "token";
    const sin = accesoPlantillas();
    assert.ok("error" in sin && /WHATSAPP_WABA_ID/.test(sin.error));
    process.env.WHATSAPP_WABA_ID = "123456";
    const con = accesoPlantillas();
    assert.ok("acceso" in con && con.acceso.origen === "meta" && con.acceso.base === "https://graph.facebook.com/v23.0" && con.acceso.waba === "123456");
    process.env.WHATSAPP_WABA_ID = "no-es-un-numero";
    assert.ok("error" in accesoPlantillas());
  });
});
