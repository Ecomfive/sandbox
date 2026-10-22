import { test } from "node:test";
import assert from "node:assert/strict";
import { agenteDeLista, proveedorDeLista } from "../../app/(app)/compras/def-compras";
import { CAMPOS_EDITABLES, normalizarValor } from "../../app/(app)/compras/def-edicion-compras";

test("el proveedor se elige de la lista", () => {
  assert.equal(proveedorDeLista("CHIN"), "Chin");
  assert.equal(proveedorDeLista(" alibaba "), "Alibaba");
  assert.equal(proveedorDeLista("Local"), "Local");
  assert.equal(proveedorDeLista(""), null);
  const def = CAMPOS_EDITABLES.proveedor;
  assert.deepEqual(normalizarValor(def, "Zion"), { valor: "Zion" });
  assert.deepEqual(normalizarValor(def, ""), { valor: null });
  assert.ok("error" in normalizarValor(def, "Otro proveedor"));
});

test("el agente de envío se elige de la lista", () => {
  assert.equal(agenteDeLista("avery"), "Avery");
  assert.equal(agenteDeLista(null), null);
  const def = CAMPOS_EDITABLES.agenteEnvio;
  assert.deepEqual(normalizarValor(def, "Chin"), { valor: "Chin" });
  assert.deepEqual(normalizarValor(def, ""), { valor: null });
  assert.ok("error" in normalizarValor(def, "DHL"));
});
