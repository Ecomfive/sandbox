import assert from "node:assert/strict";
import test from "node:test";
import { faseInicial, porMensajero, puedePasar, repartirRemesa, resumenCod, validarDespacho, TRANSICIONES, ESTADO_DE_FASE, FASES, type SaldoCod } from "./ciclo";

const s = (id: string, pendiente: number, dias: number, rep: string | null = "r1"): SaldoCod => ({ ordenId: id, esperado: pendiente, cobrado: pendiente, remitido: 0, pendiente, dias, repartidorId: rep, transportista: null });

test("solo se avanza por el camino permitido", () => {
  assert.ok(puedePasar("por_confirmar", "confirmada"));
  assert.ok(!puedePasar("por_confirmar", "despachada"));
  assert.ok(!puedePasar("entregada", "cancelada"));
  assert.ok(puedePasar("fallida", "despachada"));
  for (const f of FASES) assert.ok(ESTADO_DE_FASE[f] && TRANSICIONES[f]);
});

test("una orden nueva de Shopify entra por confirmar y la contra entrega queda esperada", () => {
  assert.deepEqual(faseInicial("pendiente", "efectivo", 25.5), { fase: "por_confirmar", codEsperado: 25.5 });
  assert.deepEqual(faseInicial("pendiente", "tarjeta", 25.5), { fase: "por_confirmar", codEsperado: null });
  assert.deepEqual(faseInicial("cancelada", "efectivo", 25.5), { fase: "cancelada", codEsperado: null });
  assert.equal(faseInicial("en_transito", null, 10).fase, "despachada");
});

test("despachar exige mensajero o transportadora", () => {
  assert.ok(validarDespacho({ repartidorId: null, transportista: " ", guia: null }));
  assert.equal(validarDespacho({ repartidorId: "x", transportista: null, guia: null }), null);
  assert.equal(validarDespacho({ repartidorId: null, transportista: "Servientrega", guia: "123" }), null);
});

test("resumen y reparto de la plata contra entrega", () => {
  const saldos = [s("a", 20, 10), s("b", 30, 2), s("c", 15, 5, "r2")];
  const r = resumenCod(saldos);
  assert.equal(r.porDevolver, 65);
  assert.equal(r.vencido, 20);
  const m = porMensajero(saldos, (id) => id ?? "—");
  assert.equal(m[0].nombre, "r1");
  assert.equal(m[0].monto, 50);
  const rep = repartirRemesa(saldos.slice(0, 2), 35);
  assert.deepEqual(rep.items, [{ orden_id: "a", monto: 20 }, { orden_id: "b", monto: 15 }]);
  assert.equal(rep.sobra, 0);
  assert.equal(repartirRemesa(saldos.slice(0, 1), 25).sobra, 5);
});
