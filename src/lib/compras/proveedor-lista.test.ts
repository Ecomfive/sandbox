import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENTES_ENVIO, agenteDeLista, colorAgente, colorEstado, colorEtapa, colorProveedor, ESTADOS_COMPRA, ETAPAS_COMPRA, PROVEEDORES_COMPRA, proveedorDeLista } from "../../app/(app)/compras/def-compras";
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

test("proveedores y agentes tienen color propio, sin repetirse ni chocar con Etapa y Estado", () => {
  const colores = [...PROVEEDORES_COMPRA.map((p) => colorProveedor(p.valor)), ...AGENTES_ENVIO.map((a) => colorAgente(a.valor))];
  assert.ok(colores.every(Boolean));
  assert.equal(new Set(colores).size, colores.length);
  const otros = new Set([...ETAPAS_COMPRA.map((e) => colorEtapa(e.valor)), ...ESTADOS_COMPRA.map((e) => colorEstado(e.valor))].map((c) => c.toLowerCase()));
  assert.ok(colores.every((c) => !otros.has(c!.toLowerCase())));
  assert.equal(colorProveedor("Local"), undefined);
});
