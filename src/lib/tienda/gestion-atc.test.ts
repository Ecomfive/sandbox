import { test } from "node:test";
import assert from "node:assert/strict";
import { MOTIVOS_ANULACION, VISTAS_ATC, confirmadoAtc, lineaCronologia, planAtc, sugerenciaPermitida } from "./gestion-atc";

const PA = { codigoPais: "PA" };

test("los 12 motivos del manual más el de supervisión, todos MOT- y de menos de 40 letras", () => {
  assert.equal(MOTIVOS_ANULACION.filter((m) => !m.supervision).length, 12);
  assert.equal(MOTIVOS_ANULACION.filter((m) => m.supervision).map((m) => m.etiqueta).join(), "MOT-TIENDA-NO-GESTIONA");
  for (const m of MOTIVOS_ANULACION) assert.ok(/^MOT-[A-Z-]+$/.test(m.etiqueta) && m.etiqueta.length <= 40, m.etiqueta);
});

test("confirmar: quita por confirmar datos, la confirmada del bot y otra zona; pone la zona", () => {
  const p = planAtc("confirmar", ["por confirmar datos", "confirmada", "chatbot", "CIUDAD"], { ...PA, zona: "INTERIOR/SERVIENTREGA" });
  assert.deepEqual(p, { agregar: ["INTERIOR/SERVIENTREGA"], quitar: ["por confirmar datos", "confirmada", "CIUDAD"] });
  assert.deepEqual(planAtc("confirmar", ["novedad"], { ...PA, zona: "ciudad" }), { agregar: ["CIUDAD"], quitar: ["novedad"] });
  assert.ok("error" in planAtc("confirmar", [], { ...PA, zona: null }));
  assert.ok("error" in planAtc("confirmar", [], { ...PA, zona: "CIUDAD-GAM" }), "la zona de Costa Rica no vale en Panamá");
});

test("novedad: quita la zona y pone novedad", () => {
  assert.deepEqual(planAtc("novedad", ["CIUDAD", "chatbot"], PA), { agregar: ["novedad"], quitar: ["CIUDAD"] });
});

test("anular: deja la zona y pone un solo motivo; sin zona la pide; nunca dos motivos", () => {
  assert.deepEqual(planAtc("anular", ["CIUDAD", "novedad"], { ...PA, motivo: "MOT-CLIENTE-NO-CONTESTA" }), { agregar: ["MOT-CLIENTE-NO-CONTESTA"], quitar: ["novedad"] });
  assert.ok("error" in planAtc("anular", ["por confirmar datos"], { ...PA, motivo: "MOT-CLIENTE-NO-CONTESTA" }), "sin zona no se anula");
  assert.deepEqual(planAtc("anular", ["por confirmar datos"], { ...PA, motivo: "MOT-CLIENTE-NO-CONTESTA", zona: "CIUDAD" }), {
    agregar: ["CIUDAD", "MOT-CLIENTE-NO-CONTESTA"],
    quitar: ["por confirmar datos"],
  });
  assert.deepEqual(planAtc("anular", ["CIUDAD", "MOT-CLIENTE-SIN-DINERO"], { ...PA, motivo: "MOT-CLIENTE-RECHAZA-PRECIO" }), {
    agregar: ["MOT-CLIENTE-RECHAZA-PRECIO"],
    quitar: ["MOT-CLIENTE-SIN-DINERO"],
  });
  assert.ok("error" in planAtc("anular", ["CIUDAD"], { ...PA, motivo: "INVENTADA" }));
  assert.ok("error" in planAtc("anular", ["CIUDAD"], { ...PA, motivo: "MOT-TIENDA-NO-GESTIONA" }), "solo supervisión");
  assert.ok(!("error" in planAtc("anular", ["CIUDAD"], { ...PA, motivo: "MOT-TIENDA-NO-GESTIONA", supervision: true })));
});

test("confirmado: zona sin control, o la Confirmada de antes", () => {
  assert.equal(confirmadoAtc(["CIUDAD"]), true);
  assert.equal(confirmadoAtc(["CIUDAD", "por confirmar datos"]), false, "la IA pudo poner la zona, pero falta la asesora");
  assert.equal(confirmadoAtc(["Confirmada"]), true);
  assert.equal(confirmadoAtc(["chatbot"]), false);
});

test("vistas: por confirmar, 48 h, novedades, anulados sin motivo y sin etiqueta", () => {
  const ahora = Date.parse("2026-11-24T15:00:00Z");
  const v = (id: string) => VISTAS_ATC.find((x) => x.id === id)!;
  assert.equal(v("48h").incluye({ estado: "nuevo", etiquetas: ["por confirmar datos"], creado: "2026-11-21T10:00:00Z" }, ahora), true);
  assert.equal(v("48h").incluye({ estado: "nuevo", etiquetas: ["por confirmar datos"], creado: "2026-11-24T10:00:00Z" }, ahora), false);
  assert.equal(v("por-confirmar").incluye({ estado: "nuevo", etiquetas: ["novedad"], creado: "" }, ahora), false);
  assert.equal(v("novedades").incluye({ estado: "nuevo", etiquetas: ["novedad"], creado: "" }, ahora), true);
  assert.equal(v("anulados-sin-motivo").incluye({ estado: "cancelado", etiquetas: ["CIUDAD"], creado: "2026-11-24T15:00:00Z" }, ahora), true);
  assert.equal(v("anulados-sin-motivo").incluye({ estado: "cancelado", etiquetas: ["CIUDAD", "MOT-CLIENTE-NO-CONTESTA"], creado: "2026-11-24T15:00:00Z" }, ahora), false);
  assert.equal(v("anulados-sin-motivo").incluye({ estado: "cancelado", etiquetas: ["ANULADO/VERIFICADO"], creado: "2026-11-10T15:00:00Z" }, ahora), false, "lo de antes del manual no cuenta");
  assert.equal(v("sin-pagar").incluye({ estado: "entregado", etiquetas: ["CIUDAD"], creado: "2026-11-10T15:00:00Z" }, ahora), false, "lo de antes del manual no cuenta");
  assert.equal(v("sin-pagar").incluye({ estado: "entregado", etiquetas: ["CIUDAD"], creado: "2026-11-25T15:00:00Z" }, ahora), true);
  assert.equal(v("sin-etiqueta").incluye({ estado: "nuevo", etiquetas: ["easysell_cod_form"], creado: "" }, ahora), true);
  assert.equal(v("sin-pagar").incluye({ estado: "entregado", etiquetas: ["CIUDAD", "acreditado"], creado: "" }, ahora), false);
});

test("la línea de la cronología dice qué y por qué", () => {
  assert.equal(lineaCronologia("anular", { motivo: "MOT-CLIENTE-SIN-DINERO", nota: "paga el viernes" }), "Anulado · MOT-CLIENTE-SIN-DINERO — paga el viernes");
});

test("las etiquetas de antes del manual se quitan al gestionar y no se sugieren", () => {
  assert.deepEqual(planAtc("confirmar", ["easysell_cod_form", "Pendiente", "Modificar Dirección"], { ...PA, zona: "CIUDAD" }), { agregar: ["CIUDAD"], quitar: ["Pendiente", "Modificar Dirección"] });
  assert.deepEqual(planAtc("anular", ["CIUDAD", "ANULADO/VERIFICADO"], { ...PA, motivo: "MOT-CLIENTE-NO-CONTESTA" }), { agregar: ["MOT-CLIENTE-NO-CONTESTA"], quitar: ["ANULADO/VERIFICADO"] });
  assert.deepEqual(["Confirmada", "ANULADO/VERIFICADO", "Cancelado", "Pendiente", "CIUDAD", "MOT-CLIENTE-DUPLICA", "novedad", "Carrito recuperado", "Pedido Pagado"].filter(sugerenciaPermitida), ["Carrito recuperado", "Pedido Pagado"]);
});
