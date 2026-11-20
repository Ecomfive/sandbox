import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoPedido, contarPorEstado, fechaCorta, leerCantidad, numeroPedido, puedeEnviar, puedeRecibir, revisarEntregas, revisarLineas, revisarStockPedido, faltantesEn, mejorOrigen } from "./reglas";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("el número del pedido", () => {
  assert.equal(numeroPedido(7), "PED-0007");
  assert.equal(numeroPedido(12345), "PED-12345");
});

test("las cantidades son enteras y dentro del rango", () => {
  assert.equal(leerCantidad("5"), 5);
  assert.equal(leerCantidad("0", 1), null);
  assert.equal(leerCantidad("2.5"), null);
  assert.equal(leerCantidad(""), null);
  assert.equal(leerCantidad(-1), null);
});

test("las líneas de un pedido nuevo", () => {
  assert.deepEqual(revisarLineas([{ skuId: A, cantidad: "10", nota: "  se  agotó " }]), { lineas: [{ skuId: A, cantidad: 10, nota: "se agotó" }] });
  assert.ok("error" in revisarLineas([]));
  assert.ok("error" in revisarLineas([{ skuId: "x", cantidad: 1 }]));
  assert.ok("error" in revisarLineas([{ skuId: A, cantidad: 0 }]));
  assert.ok("error" in revisarLineas([{ skuId: A, cantidad: 1 }, { skuId: A, cantidad: 2 }]));
});

test("lo que envía inventario: una cantidad por línea y algo más que cero", () => {
  const items = [{ id: A }, { id: B }];
  assert.deepEqual(revisarEntregas(items, [{ id: A, cantidad: "12", observacion: "solo quedaban 12" }, { id: B, cantidad: 0 }]), {
    entregas: [
      { id: A, cantidad: 12, observacion: "solo quedaban 12" },
      { id: B, cantidad: 0, observacion: null },
    ],
  });
  assert.ok("error" in revisarEntregas(items, [{ id: A, cantidad: 3 }]));
  assert.ok("error" in revisarEntregas(items, [{ id: A, cantidad: 0 }, { id: B, cantidad: 0 }]));
});

test("qué se puede hacer en cada estado", () => {
  assert.equal(puedeEnviar("solicitud"), true);
  assert.equal(puedeEnviar("en_proceso"), true);
  assert.equal(puedeEnviar("enviado"), false);
  assert.equal(puedeRecibir("enviado"), true);
  assert.equal(puedeRecibir("en_proceso"), false);
});

test("contadores, fecha y avisos", () => {
  assert.deepEqual(contarPorEstado([{ estado: "solicitud" }, { estado: "enviado" }, { estado: "enviado" }]), { solicitud: 1, en_proceso: 0, enviado: 2, recibido: 0, cancelado: 0 });
  assert.equal(fechaCorta("2026-11-16T03:00:00Z"), "15/11/2026");
  assert.equal(avisoPedido({ numero: 3, items: 2 }, "Yiletsi", "nuevo").titulo, "Despacho pide a inventario: PED-0003");
  assert.match(avisoPedido({ numero: 3, items: 1 }, "Dinora", "enviado", "TRA-0065").texto, /TRA-0065/);
});

test("no se pide lo que inventario no tiene, ni más de lo que hay", () => {
  const stock = { [A]: { total: 5, bodegas: [{ nombre: "Bodega Central", disponible: 5 }] } };
  const nombres = { [A]: "Ventilador", [B]: "Abanico" };
  assert.equal(revisarStockPedido([{ skuId: A, cantidad: 5 }], stock, nombres), null);
  assert.match(revisarStockPedido([{ skuId: A, cantidad: 6 }], stock, nombres) ?? "", /solo hay 5/);
  assert.match(revisarStockPedido([{ skuId: A, cantidad: 1 }, { skuId: B, cantidad: 1 }], stock, nombres) ?? "", /«Abanico» no tiene stock/);
});

test("de qué bodega sale el pedido: la primera que alcanza; si ninguna, la que deja menos sin cubrir", () => {
  const stock = { dep: { [A]: 100, [B]: 0 }, ist: { [A]: 10, [B]: 50 }, ofi: { [A]: 100, [B]: 50 } };
  const lineas = [{ skuId: A, cantidad: 20 }, { skuId: B, cantidad: 5 }];
  assert.deepEqual(faltantesEn(lineas, "dep", stock), [{ skuId: B, falta: 5 }]);
  assert.equal(mejorOrigen(lineas, ["dep", "ist", "ofi"], stock), "ofi");
  assert.equal(mejorOrigen(lineas, ["dep", "ist"], stock), "dep", "empatadas en faltantes, la que más cubre");
  assert.equal(mejorOrigen([{ skuId: A, cantidad: 0 }], ["ist"], stock), "ist");
  assert.equal(mejorOrigen(lineas, [], stock), null);
});
