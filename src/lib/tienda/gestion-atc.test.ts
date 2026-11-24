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

import { cumplimientoMetas, leerGuia, lineaPaso, mensajeGuiaWhatsapp, plantillaGuia } from "./gestion-atc";

test("la guía: número sin espacios y el enlace de rastreo de Servientrega armado con él", () => {
  assert.deepEqual(leerGuia({ numero: " 7224 1470 76 " }), { numero: "7224147076", url: "https://servientrega.com.pa/Tracking/?guia=7224147076", empresa: "Servientrega" });
  assert.ok("error" in leerGuia({ numero: "12" }));
  assert.ok("error" in leerGuia({ numero: "7224147076&x=1" }), "solo letras, números y guiones");
});

test("el WhatsApp de la guía: primer nombre, pedido, guía y enlace; sin nombre, «Hola»", () => {
  const datos = { pedido: "#1937", tienda: "Kenku", guia: "7224147076", url: "https://servientrega.com.pa/Tracking/?guia=7224147076" };
  assert.equal(
    mensajeGuiaWhatsapp({ ...datos, cliente: "STEFANNY laing" }),
    "Hola Stefanny 👋 Tu pedido #1937 de Kenku ya va en camino con Servientrega.\nNúmero de guía: 7224147076\nPuedes seguirlo aquí: https://servientrega.com.pa/Tracking/?guia=7224147076",
  );
  assert.ok(mensajeGuiaWhatsapp({ ...datos, cliente: null }).startsWith("Hola 👋 Tu pedido #1937"));
  assert.ok(mensajeGuiaWhatsapp({ ...datos, cliente: "123" }).startsWith("Hola 👋"));
  assert.equal(
    lineaPaso("guia", { guia: "7224147076", aviso: "el cliente no tiene correo: se le mandó la guía por WhatsApp (iComfly)" }),
    "Guía cargada en Shopify: 7224147076 (Servientrega), el cliente no tiene correo: se le mandó la guía por WhatsApp (iComfly)",
  );
});

test("la plantilla de la guía: contra entrega con valor a pagar, pagado sin él; el enlace va con la transportadora", () => {
  const base = { cliente: "stefanny laing", guia: "7224147076", url: "https://servientrega.com.pa/Tracking/?guia=7224147076", total: 32.9 };
  const productos = [{ producto: "Fat‑Burn Shorts", cantidad: 2 }, { producto: "Envío", cantidad: null }];
  assert.deepEqual(plantillaGuia({ ...base, pagado: false, productos }), {
    nombre: "guia_transporte_utilidad_",
    valores: ["7224147076", "Stefanny", "2x Fat‑Burn Shorts, 1x Envío", "$32.90", "Servientrega. Síguelo aquí: https://servientrega.com.pa/Tracking/?guia=7224147076"],
  });
  assert.deepEqual(plantillaGuia({ ...base, pagado: true, productos: [], cliente: null }).valores, [
    "cliente",
    "7224147076",
    "pedido",
    "Servientrega. Síguelo aquí: https://servientrega.com.pa/Tracking/?guia=7224147076",
  ]);
  const muchos = [1, 2, 3, 4, 5].map((i) => ({ producto: `P${i}`, cantidad: 1 }));
  assert.equal(plantillaGuia({ ...base, pagado: true, productos: muchos }).valores[2], "1x P1, 1x P2, 1x P3, y 2 más");
});

test("metas del puesto: cumple si llega a la meta", () => {
  const m = cumplimientoMetas({ confirmacion: 86, entrega: 65, ticket: null, unidades: 2 });
  assert.deepEqual(m.map((x) => x.cumple), [true, false, null, true]);
});

import { INICIO_GUIAS_SOLAS, MOTIVOS_GUIA_SIN_CARGAR, VISTAS_ATC as VISTAS, desdeGuiasSolas, guiaSolaSinShopify } from "./gestion-atc";

test("guías solas: desde el 24 nov 2026 y nunca más de 10 días atrás", () => {
  assert.equal(desdeGuiasSolas("2026-11-25"), INICIO_GUIAS_SOLAS);
  assert.equal(desdeGuiasSolas("2026-12-20"), "2026-12-10");
});

test("guías solas: anulado va a «Guía sin cargar»; la misma guía ya cargada no se toca; si no, a Shopify", () => {
  const base = { etiquetas: ["INTERIOR/SERVIENTREGA"], estadoEntrega: "en_transito", guia: null };
  assert.equal(guiaSolaSinShopify(base, "7224161722"), null);
  assert.deepEqual(guiaSolaSinShopify({ ...base, guia: "7224161722" }, "7224161722"), { estado: "ya_tenia", motivo: null });
  assert.deepEqual(guiaSolaSinShopify({ ...base, etiquetas: ["INTERIOR/SERVIENTREGA", "MOT-CLIENTE-NO-CONTESTA"] }, "7224161722"), { estado: "pendiente", motivo: MOTIVOS_GUIA_SIN_CARGAR.anuladoSistema });
  assert.equal(guiaSolaSinShopify({ ...base, estadoEntrega: "cancelada" }, "7224161722")?.estado, "pendiente");
});

test("la vista «Guía sin cargar» trae los pedidos con motivo", () => {
  const v = VISTAS.find((x) => x.id === "guia-sin-cargar")!;
  assert.equal(v.incluye({ estado: "en_camino", creado: "", guiaSinCargar: "Guía 7224161722: no está preparado en Shopify" }, 0), true);
  assert.equal(v.incluye({ estado: "en_camino", creado: "" }, 0), false);
});

import { esperaDeIcomfly } from "./gestion-atc";

test("iComfly pide esperar: se espera lo que dice más un segundo; otro error no se reintenta", () => {
  assert.equal(esperaDeIcomfly("Error: Vas muy rápido (límite de seguridad del conector, no es una falla ni una caída de iComfly). Espera ~7s antes del siguiente mensaje."), 8000);
  assert.equal(esperaDeIcomfly("Vas muy rápido"), 9000);
  assert.equal(esperaDeIcomfly("fuera de la ventana de 24 horas"), null);
  assert.equal(esperaDeIcomfly(null), null);
});
