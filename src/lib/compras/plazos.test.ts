import assert from "node:assert/strict";
import test from "node:test";
import { estadoPlazo, ordenPrioridad, plazoDeCompra, plazosTransitoDeRutas, plazoTransitoDe, PLAZO_ETAPA, textoPlazoEtapa } from "./plazos";

const H = 3_600_000;
const ahora = Date.parse("2026-11-11T15:00:00Z");
const hace = (horas: number) => new Date(ahora - horas * H).toISOString();

test("los plazos de la reunión: 48 h para enviar, 5 días para cotizar, 2 para decidir y 15 en producción", () => {
  assert.deepEqual(PLAZO_ETAPA, { cotizar: 2, enviado_cotizacion: 5, cotizado: 2, produccion: 15 });
});

test("48 h vencen a las 48 h, con el último día en ámbar", () => {
  assert.equal(estadoPlazo(hace(10), 2, ahora)?.tono, "ok");
  assert.equal(estadoPlazo(hace(30), 2, ahora)?.tono, "aviso");
  assert.equal(estadoPlazo(hace(47), 2, ahora)?.tono, "aviso");
  const vencido = estadoPlazo(hace(49), 2, ahora)!;
  assert.equal(vencido.tono, "vencido");
  assert.equal(vencido.vencidoHace, 0);
  assert.equal(textoPlazoEtapa(vencido), "Vencido hoy");
  assert.equal(textoPlazoEtapa(estadoPlazo(hace(24 * 4 + 1), 2, ahora)!), "Vencido hace 2 d");
  assert.equal(textoPlazoEtapa(estadoPlazo(hace(24 * 3 + 2), 5, ahora)!), "3 d de 5 d");
});

test("en un plazo largo el ámbar es el último 10 %", () => {
  assert.equal(estadoPlazo(hace(24 * 12), 15, ahora)?.tono, "ok");
  assert.equal(estadoPlazo(hace(24 * 14), 15, ahora)?.tono, "aviso");
  assert.equal(estadoPlazo(hace(24 * 73), 80, ahora)?.tono, "aviso");
  assert.equal(estadoPlazo(hace(24 * 60), 80, ahora)?.pct, 75);
  assert.equal(estadoPlazo("no es fecha", 5, ahora), null);
});

test("cada etapa mide lo suyo; Tracking cuenta desde la fecha de envío contra el plazo del país", () => {
  assert.equal(plazoDeCompra({ etapa: "enviado_cotizacion", etapaDesde: hace(24 * 6), fechaEnvio: null }, null, ahora)?.tono, "vencido");
  assert.equal(plazoDeCompra({ etapa: "cotizado", etapaDesde: hace(5), fechaEnvio: null }, null, ahora)?.plazo, 2);
  assert.equal(plazoDeCompra({ etapa: "backlog", etapaDesde: hace(5), fechaEnvio: null }, null, ahora), null);
  assert.equal(plazoDeCompra({ etapa: "produccion", etapaDesde: null, fechaEnvio: null }, null, ahora), null);
  const tracking = plazoDeCompra({ etapa: "tracking", etapaDesde: hace(1), fechaEnvio: "2026-08-18" }, 80, ahora)!;
  assert.equal(tracking.dias, 85);
  assert.equal(tracking.tono, "vencido");
  assert.equal(plazoDeCompra({ etapa: "tracking", etapaDesde: hace(1), fechaEnvio: "2026-08-18" }, null, ahora), null);
  assert.equal(plazoDeCompra({ etapa: "tracking", etapaDesde: hace(1), fechaEnvio: "2026-08-18", fechaLlegada: "2026-11-01" }, 80, ahora), null);
});

test("prioridad: urgente primero y sin prioridad al final", () => {
  const orden = ["baja", null, "urgente", "normal", "alta"].sort((a, b) => ordenPrioridad(a) - ordenPrioridad(b));
  assert.deepEqual(orden, ["urgente", "alta", "normal", "baja", null]);
});

test("plazo de tránsito: el del agente o, si no tiene, el de cualquier agente del país y la vía", () => {
  const plazos = plazosTransitoDeRutas([
    { agente: "Shen Zhen", pais: "CR", via: "mar", diasMin: 70, diasMax: 80 },
    { agente: "Avery", pais: "CR", via: "mar", diasMin: null, diasMax: 90 },
    { agente: "Shen Zhen", pais: "PA", via: "aire", diasMin: 15, diasMax: null },
  ]);
  assert.equal(plazoTransitoDe(plazos, { agenteEnvio: "shen zhen", paisCodigo: "CR", viaEnvio: ["mar"] }), 80);
  assert.equal(plazoTransitoDe(plazos, { agenteEnvio: null, paisCodigo: "CR", viaEnvio: [] }), 90);
  assert.equal(plazoTransitoDe(plazos, { agenteEnvio: "Shen Zhen", paisCodigo: "PA", viaEnvio: ["aire"] }), 15);
  assert.equal(plazoTransitoDe(plazos, { agenteEnvio: "Shen Zhen", paisCodigo: "MX", viaEnvio: ["mar"] }), null);
});
