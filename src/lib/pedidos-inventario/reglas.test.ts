import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoPedido, contarPorEstado, fechaCorta, leerCantidad, numeroPedido, puedeArchivar, puedeDeshacerEntrega, puedeDeshacerEnvio, estadoAntesDeEnviar, puedeReabrir, puedeVolverASolicitud, puedeEnviar, puedeRecibir, revisarLineas, revisarStockPedido, repartirSugerido, revisarEnvio, agruparPorBodega, revisarConfirmacion, diferenciasDeEnvio, restarComprometido, partirPorBodega, revisarQuedan, estadoItem } from "./reglas";

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
  assert.equal(avisoPedido({ numero: 3, items: 1 }, "Yiletsi", "recibido").titulo, "PED-0003 fue recibido");
  assert.match(avisoPedido({ numero: 3, items: 1 }, "Yiletsi", "recibido", "Diferencias: Faja: 40 → 38").titulo, /con diferencias/);
});

test("no se pide lo que inventario no tiene, ni más de lo que hay", () => {
  const stock = { [A]: { total: 5, bodegas: [{ nombre: "Bodega Central", disponible: 5 }] } };
  const nombres = { [A]: "Ventilador", [B]: "Abanico" };
  assert.equal(revisarStockPedido([{ skuId: A, cantidad: 5 }], stock, nombres), null);
  assert.match(revisarStockPedido([{ skuId: A, cantidad: 6 }], stock, nombres) ?? "", /solo hay 5/);
  assert.match(revisarStockPedido([{ skuId: A, cantidad: 1 }, { skuId: B, cantidad: 1 }], stock, nombres) ?? "", /«Abanico» no tiene stock/);
});

const STOCK = { dep: { [A]: 100, [B]: 0 }, ist: { [A]: 10, [B]: 25 }, ofi: { [A]: 0, [B]: 30 } };
const BODEGAS = [{ id: "dep", nombre: "Deposito Externo" }, { id: "ist", nombre: "iStorage" }, { id: "ofi", nombre: "Oficina Ancón" }];

test("cada producto sale de donde alcanza, prefiriendo la bodega que cubre más", () => {
  const items = [{ id: "i1", skuId: A, cantidad: 8 }, { id: "i2", skuId: B, cantidad: 20 }];
  // iStorage alcanza para los dos: un solo viaje.
  assert.deepEqual(repartirSugerido(items, ["dep", "ist", "ofi"], STOCK), { i1: [{ bodegaId: "ist", cantidad: 8 }], i2: [{ bodegaId: "ist", cantidad: 20 }] });
});

test("si ninguna alcanza, se reparte empezando por la que más tiene; sin stock queda una parte en 0", () => {
  assert.deepEqual(repartirSugerido([{ id: "i1", skuId: B, cantidad: 50 }], ["dep", "ist", "ofi"], STOCK).i1, [{ bodegaId: "ofi", cantidad: 30 }, { bodegaId: "ist", cantidad: 20 }]);
  assert.deepEqual(repartirSugerido([{ id: "i1", skuId: B, cantidad: 90 }], ["dep", "ist", "ofi"], STOCK).i1, [{ bodegaId: "ofi", cantidad: 30 }, { bodegaId: "ist", cantidad: 25 }]);
  assert.deepEqual(repartirSugerido([{ id: "i1", skuId: "otro", cantidad: 1 }], ["dep", "ist"], STOCK).i1, [{ bodegaId: "dep", cantidad: 0 }]);
  assert.deepEqual(repartirSugerido([{ id: "i1", skuId: A, cantidad: 1 }], [], STOCK).i1, []);
});

test("una lista sale en un pedido por bodega; lo que no cabe en una queda en dos", () => {
  const stock = { dep: { [A]: 100 }, ofi: { [B]: 30 }, ist: { [B]: 25 } };
  const lineas = [{ skuId: A, cantidad: 10, nota: "x" }, { skuId: B, cantidad: 40, nota: null }];
  assert.deepEqual(partirPorBodega(lineas, ["dep", "ist", "ofi"], stock), [
    { bodegaId: "dep", lineas: [{ skuId: A, cantidad: 10, nota: "x" }] },
    { bodegaId: "ist", lineas: [{ skuId: B, cantidad: 10, nota: null }] },
    { bodegaId: "ofi", lineas: [{ skuId: B, cantidad: 30, nota: null }] },
  ]);
  // Todo en una bodega: un solo pedido.
  assert.equal(partirPorBodega([{ skuId: A, cantidad: 1 }], ["dep", "ofi"], stock).length, 1);
  assert.deepEqual(partirPorBodega([{ skuId: "nada", cantidad: 1 }], ["dep"], stock), []);
});

test("la bodega del pedido va primero al sugerir de dónde sale", () => {
  assert.deepEqual(repartirSugerido([{ id: "i1", skuId: A, cantidad: 5 }], ["dep", "ist"], STOCK, "ist").i1, [{ bodegaId: "ist", cantidad: 5 }]);
});

const ITEMS = [{ id: "i1", skuId: A, producto: "Faja", codigo: "FAJA" }, { id: "i2", skuId: B, producto: "Bolsas", codigo: null }];

test("lo que envía inventario: partes por bodega, sin pasar de lo disponible", () => {
  const r = revisarEnvio(ITEMS, [{ id: "i1", partes: [{ bodegaId: "dep", cantidad: "60" }, { bodegaId: "ist", cantidad: 10 }] , observacion: " dos viajes " }, { id: "i2", partes: [{ bodegaId: "ofi", cantidad: 0 }] }], BODEGAS, STOCK);
  assert.deepEqual(r, { envios: [{ itemId: "i1", bodegaId: "dep", cantidad: 60 }, { itemId: "i1", bodegaId: "ist", cantidad: 10 }], observaciones: { i1: "dos viajes", i2: null } });
});

test("un envío no pasa de lo que hay, no repite bodega, no usa una bodega ajena y no va vacío", () => {
  const otro = { id: "i2", partes: [] };
  const con = (partes: unknown) => revisarEnvio(ITEMS, [{ id: "i1", partes }, otro], BODEGAS, STOCK);
  assert.match((con([{ bodegaId: "ist", cantidad: 11 }]) as { error: string }).error, /En iStorage solo hay 10 de «Faja»/);
  assert.match((con([{ bodegaId: "dep", cantidad: 1 }, { bodegaId: "dep", cantidad: 1 }]) as { error: string }).error, /dos veces/);
  assert.ok("error" in con([{ bodegaId: "ajena", cantidad: 1 }]));
  assert.ok("error" in con([{ bodegaId: "dep", cantidad: -1 }]));
  assert.ok("error" in con([]));
  assert.ok("error" in revisarEnvio(ITEMS, [{ id: "i1", partes: [{ bodegaId: "dep", cantidad: 1 }] }], BODEGAS, STOCK), "falta un producto");
});

test("qué buscar en cada bodega", () => {
  const g = agruparPorBodega(ITEMS, [{ itemId: "i2", bodegaId: "ofi", cantidad: 1 }, { itemId: "i1", bodegaId: "dep", cantidad: 40 }, { itemId: "i1", bodegaId: "ofi", cantidad: 5 }, { itemId: "i2", bodegaId: "ist", cantidad: 0 }], BODEGAS);
  assert.deepEqual(g.map((x) => [x.bodega, x.unidades, x.lineas.map((l) => l.producto)]), [["Deposito Externo", 40, ["Faja"]], ["Oficina Ancón", 6, ["Faja", "Bolsas"]]]);
});

test("enviar una parte: lo que queda sin marcar pasa a otro pedido", () => {
  const items = [{ id: "i1" }, { id: "i2" }, { id: "i3" }];
  assert.deepEqual(revisarQuedan(items, undefined), { quedan: [] });
  assert.deepEqual(revisarQuedan(items, []), { quedan: [] });
  assert.deepEqual(revisarQuedan(items, ["i2", "i3", "i2"]), { quedan: ["i2", "i3"] });
  assert.ok("error" in revisarQuedan(items, ["i1", "i2", "i3"]));
  assert.ok("error" in revisarQuedan(items, ["otro"]));
  assert.ok("error" in revisarQuedan(items, [3]));
  assert.ok("error" in revisarQuedan(items, "i1"));
});

test("confirmar: si llega otra cantidad hay que decir por qué", () => {
  assert.deepEqual(revisarConfirmacion(40, "40", ""), { recibida: 40, nota: null });
  assert.deepEqual(revisarConfirmacion(40, 38, " faltaron dos "), { recibida: 38, nota: "faltaron dos" });
  assert.deepEqual(revisarConfirmacion(40, 0, "no llegó"), { recibida: 0, nota: "no llegó" });
  assert.match((revisarConfirmacion(40, 38, "  ") as { error: string }).error, /envió 40/);
  assert.ok("error" in revisarConfirmacion(40, "", "x"));
  assert.ok("error" in revisarConfirmacion(40, -1, "x"));
});

test("las diferencias se dicen en palabras", () => {
  const base = { itemId: "i1", bodega: "iStorage", cantidadEnviada: 40, nota: null };
  assert.deepEqual(diferenciasDeEnvio(ITEMS, [{ ...base, cantidadRecibida: 40 }, { ...base, cantidadRecibida: 38, nota: "rotas" }, { ...base, cantidadRecibida: null }]), ["Faja (iStorage): enviaron 40, llegaron 38 — rotas"]);
});

test("lo que va en camino se descuenta de lo disponible, sin bajar de cero", () => {
  assert.deepEqual(restarComprometido({ dep: { [A]: 100, [B]: 3 } }, { dep: { [A]: 40, [B]: 10 }, ist: { [A]: 1 } }), { dep: { [A]: 60, [B]: 0 } });
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

test("estadoItem: pendiente, en proceso, entregado y recibido (27 nov 2026)", () => {
  const it = (cantidadEntregada: number | null, enProcesoEn: string | null = null) => ({ id: "a", cantidadEntregada, enProcesoEn });
  assert.equal(estadoItem(it(null), "solicitud"), "pendiente");
  assert.equal(estadoItem(it(null, "2026-11-27T10:00:00Z"), "en_proceso"), "en_proceso");
  // Inventario lo entregó: falta que despacho confirme.
  assert.equal(estadoItem(it(40, "2026-11-27T10:00:00Z"), "en_proceso", [{ itemId: "a", traslado: null }]), "entregado");
  // Despacho lo recibió: hay traslado en todas sus partes.
  assert.equal(estadoItem(it(40, "2026-11-27T10:00:00Z"), "en_proceso", [{ itemId: "a", traslado: "TRA-0001" }, { itemId: "b", traslado: null }]), "recibido");
  assert.equal(estadoItem(it(40), "en_proceso", [{ itemId: "a", traslado: "TRA-0001" }, { itemId: "a", traslado: null }]), "entregado");
  assert.equal(estadoItem(it(null), "recibido"), "recibido");
});
