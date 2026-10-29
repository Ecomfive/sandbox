import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { envioAutomaticoActivo, faltantesDeLlegada } from "./plantillas-llegada";

describe("plantillas de aviso de llegada", () => {
  it("faltan las tres cuando no hay ninguna", () => {
    assert.deepEqual(faltantesDeLlegada([]).map((p) => p.nombre), ["aviso_llegada_producto", "aviso_llegada_varios", "aviso_llegada_cambio_fecha"]);
  });

  it("no repite las que ya están, estén en borrador o en Meta, ni toca las de otras cosas", () => {
    assert.deepEqual(faltantesDeLlegada(["aviso_llegada_producto", "retomar_conversacion"]).map((p) => p.nombre), ["aviso_llegada_varios", "aviso_llegada_cambio_fecha"]);
    assert.deepEqual(faltantesDeLlegada(["aviso_llegada_producto", "aviso_llegada_varios", "aviso_llegada_cambio_fecha"]), []);
  });
});

describe("envío automático a Meta", () => {
  const antes = process.env.PLANTILLAS_LLEGADA_AUTO_META;
  afterEach(() => {
    if (antes === undefined) delete process.env.PLANTILLAS_LLEGADA_AUTO_META;
    else process.env.PLANTILLAS_LLEGADA_AUTO_META = antes;
  });

  it("está apagado salvo que se encienda a propósito con 1", () => {
    delete process.env.PLANTILLAS_LLEGADA_AUTO_META;
    assert.equal(envioAutomaticoActivo(), false);
    process.env.PLANTILLAS_LLEGADA_AUTO_META = "true";
    assert.equal(envioAutomaticoActivo(), false);
    process.env.PLANTILLAS_LLEGADA_AUTO_META = "1";
    assert.equal(envioAutomaticoActivo(), true);
  });
});
