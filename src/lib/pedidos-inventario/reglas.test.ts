import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoPedido, contarPorEstado, fechaCorta, leerCantidad, numeroPedido, puedeArchivar, puedeDeshacerEntrega, puedeDeshacerEnvio, estadoAntesDeEnviar, puedeReabrir, puedeVolverASolicitud, puedeEnviar, puedeRecibir, revisarEntregas, revisarLineas, revisarStockPedido, faltantesEn, mejorOrigen } from "./reglas";

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
  assert.equal(avisoPedido({ numero: 3, items: 1 }, "Dinora", "entregado").titulo, "PED-0003 fue entregado");
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

// Editar un pedido (20 nov 2026).
import { avisoEdicion, cambiosDeEdicion, puedeEditar, revisarEdicion } from "./reglas";

const L1 = "aaaaaaaa-1111-4111-8111-111111111111";
const L2 = "bbbbbbbb-2222-4222-8222-222222222222";
const existentes = [
  { id: "linea-1", skuId: A },
  { id: "linea-2", skuId: B },
];

test("despacho edita mientras inventario no haya enviado", () => {
  assert.equal(puedeEditar("solicitud"), true);
  assert.equal(puedeEditar("en_proceso"), true);
  assert.equal(puedeEditar("enviado"), false);
  assert.equal(puedeEditar("recibido"), false);
  assert.equal(puedeEditar("cancelado"), false);
});

test("una edición conserva la línea que ya existía y trata como nueva la que no corresponde", () => {
  const r = revisarEdicion(
    [
      { id: "linea-1", skuId: A, cantidad: "3", nota: " se acabó " },
      { id: "linea-1", skuId: B, cantidad: 2 }, // dice ser de otra línea y de otro producto: es nueva
      { skuId: L1, cantidad: 1 },
    ],
    existentes,
  );
  assert.ok("lineas" in r);
  if ("lineas" in r) assert.deepEqual(r.lineas, [
    { id: "linea-1", skuId: A, cantidad: 3, nota: "se acabó" },
    { id: null, skuId: B, cantidad: 2, nota: null },
    { id: null, skuId: L1, cantidad: 1, nota: null },
  ]);
});

test("un pedido editado no puede quedar vacío ni con un producto repetido o una cantidad inválida", () => {
  const vacio = revisarEdicion([], existentes);
  assert.ok("error" in vacio && /cancela/i.test(vacio.error));
  assert.ok("error" in revisarEdicion([{ id: "linea-1", skuId: A, cantidad: 1 }, { skuId: A, cantidad: 2 }], existentes));
  assert.ok("error" in revisarEdicion([{ id: "linea-1", skuId: A, cantidad: 0 }], existentes));
});

test("qué cambió: lo que se quita, lo que cambia de cantidad o nota y lo que se agrega", () => {
  const antes = [
    { id: "linea-1", skuId: A, producto: "Faja Negro / S", cantidad: 40, nota: null },
    { id: "linea-2", skuId: B, producto: "Faja Negro / XL", cantidad: 10, nota: "urgente" },
    { id: "linea-3", skuId: L2, producto: "Crema", cantidad: 5, nota: null },
  ];
  const despues = [
    { id: "linea-1", skuId: A, cantidad: 38, nota: null },
    { id: "linea-2", skuId: B, cantidad: 10, nota: "urgente" },
    { id: null, skuId: L1, cantidad: 7, nota: null },
  ];
  const c = cambiosDeEdicion(antes, despues, { [L1]: "Aceite" });
  assert.deepEqual(c.quitar, ["linea-3"]);
  assert.deepEqual(c.cambiar.map((l) => l.id), ["linea-1"]);
  assert.deepEqual(c.agregar.map((l) => l.skuId), [L1]);
  assert.deepEqual(c.resumen, ["quitó Crema", "Faja Negro / S: 40 → 38", "agregó Aceite (7)"]);
  // Sin tocar nada no hay cambios.
  assert.deepEqual(cambiosDeEdicion(antes, antes.map((a) => ({ id: a.id, skuId: a.skuId, cantidad: a.cantidad, nota: a.nota })), {}).resumen, []);
  // Solo la nota.
  assert.deepEqual(cambiosDeEdicion(antes.slice(0, 1), [{ id: "linea-1", skuId: A, cantidad: 40, nota: "ojo" }], {}).resumen, ["Faja Negro / S: cambió la nota"]);
});

test("el aviso de una edición dice quién y qué", () => {
  const a = avisoEdicion(12, "Yiletsi", ["quitó Crema", "Faja: 40 → 38"]);
  assert.equal(a.titulo, "PED-0012 fue editado");
  assert.match(a.texto, /Yiletsi editó el pedido: quitó Crema; Faja: 40 → 38\./);
});

test("un pedido entregado se puede devolver a enviado, y solo ese", () => {
  assert.equal(puedeDeshacerEntrega("recibido"), true);
  for (const e of ["solicitud", "en_proceso", "enviado", "cancelado"] as const) assert.equal(puedeDeshacerEntrega(e), false);
  assert.match(avisoPedido({ numero: 3, items: 1 }, "Dinora", "entrega_deshecha").titulo, /PED-0003 volvió a «Enviado»/);
});

test("solo un pedido realizado o cancelado se puede archivar", () => {
  assert.equal(puedeArchivar("recibido"), true);
  assert.equal(puedeArchivar("cancelado"), true);
  for (const e of ["solicitud", "en_proceso", "enviado"] as const) assert.equal(puedeArchivar(e), false);
});

test("solo un pedido enviado se puede devolver a en proceso", () => {
  assert.equal(puedeDeshacerEnvio("enviado"), true);
  for (const e of ["solicitud", "en_proceso", "recibido", "cancelado"] as const) assert.equal(puedeDeshacerEnvio(e), false);
  assert.match(avisoPedido({ numero: 3, items: 1 }, "Dinora", "envio_deshecho").titulo, /PED-0003 volvió a «En proceso»/);
});

test("un envío deshecho vuelve al estado de antes: Solicitud si se envió directo, En proceso si ya estaba en proceso", () => {
  assert.equal(estadoAntesDeEnviar("2026-11-23T15:54:33.172+00:00", "2026-11-23T15:54:33.172+00:00"), "solicitud");
  assert.equal(estadoAntesDeEnviar("2026-11-20T22:14:01.837+00:00", "2026-11-23T16:02:08.775+00:00"), "en_proceso");
  assert.equal(estadoAntesDeEnviar(null, "2026-11-23T16:02:08.775+00:00"), "solicitud");
  assert.match(avisoPedido({ numero: 3, items: 1 }, "Dinora", "envio_deshecho", "Solicitud").titulo, /PED-0003 volvió a «Solicitud»/);
});

test("volver atrás: en proceso vuelve a solicitud y un cancelado se reabre", () => {
  assert.equal(puedeVolverASolicitud("en_proceso"), true);
  for (const e of ["solicitud", "enviado", "recibido", "cancelado"] as const) assert.equal(puedeVolverASolicitud(e), false);
  assert.equal(puedeReabrir("cancelado"), true);
  for (const e of ["solicitud", "en_proceso", "enviado", "recibido"] as const) assert.equal(puedeReabrir(e), false);
});
