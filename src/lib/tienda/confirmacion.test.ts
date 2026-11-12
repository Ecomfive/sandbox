import assert from "node:assert/strict";
import test from "node:test";
import { enGestion, etapaConfirmacion, resumirConfirmacion, tiempoEsperando } from "./confirmacion";

test("etapa de confirmación por estado y etiquetas", () => {
  assert.equal(etapaConfirmacion({ estado: "nuevo", etiquetas: ["easysell_cod_form", "CIUDAD"] }), "por_confirmar");
  assert.equal(etapaConfirmacion({ estado: "nuevo", etiquetas: ["chatbot", "Pendiente"] }), "esperando");
  assert.equal(etapaConfirmacion({ estado: "nuevo", etiquetas: ["Modificar Dirección"] }), "esperando");
  assert.equal(etapaConfirmacion({ estado: "nuevo", etiquetas: ["POR CONFIRMAR DATOS"] }), "esperando");
  assert.equal(etapaConfirmacion({ estado: "confirmado", etiquetas: ["Confirmada"] }), "confirmado");
  assert.equal(etapaConfirmacion({ estado: "en_camino" }), "confirmado");
  assert.equal(etapaConfirmacion({ estado: "devuelto" }), "confirmado");
  assert.equal(etapaConfirmacion({ estado: "cancelado", etiquetas: ["Pendiente"] }), "cancelado");
  // «Pedido Pagado» o «Carrito recuperado» no son de gestión.
  assert.equal(enGestion(["Pedido Pagado", "Carrito recuperado"]), false);
});

test("resumen de confirmación y tiempo esperando", () => {
  const r = resumirConfirmacion([
    { estado: "confirmado" },
    { estado: "entregado" },
    { estado: "cancelado" },
    { estado: "nuevo", etiquetas: ["Pendiente"] },
    { estado: "nuevo" },
  ]);
  assert.deepEqual(r.porEtapa, { por_confirmar: 1, esperando: 1, confirmado: 2, cancelado: 1 });
  assert.equal(r.tasa, 40);
  assert.equal(r.cancelacion, 20);
  assert.equal(r.pendiente, 40);
  assert.equal(resumirConfirmacion([]).tasa, null);
  const ahora = Date.parse("2026-11-12T15:00:00Z");
  assert.equal(tiempoEsperando("2026-11-12T14:35:00Z", ahora), "25 min");
  assert.equal(tiempoEsperando("2026-11-12T11:00:00Z", ahora), "4 h");
  assert.equal(tiempoEsperando("2026-11-10T15:00:00Z", ahora), "2 d");
});
