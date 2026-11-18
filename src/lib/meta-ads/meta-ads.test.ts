import assert from "node:assert/strict";
import test from "node:test";
import { agrupar, copyLimpio, landingLimpia } from "./agrupar";
import { clicAVisita, conversion, cpa, hookRate, holdRate, llegaAlLlamado, resultado, retencion, sinResultados, type Resultados } from "./metricas";
import { claveDeProducto, embellecer, etiquetasDeNombre, numeroDeVideo } from "./nombre";
import { accion, actividadDe, anuncioDe, campanaDe, estructuraDe, mensajeDeErrorMeta, normalizarActId, presupuestoDe, pujaDe, resultadoDiaDe } from "./normalizar";
import { faltanEtiquetas, pendientes, sugerir } from "./sugerencias";
import type { CampanaVista, VideoVista } from "./vistas";

const r = (o: Partial<Resultados>): Resultados => ({ ...sinResultados(), ...o });

test("el nombre de la campaña dice producto, ángulo, estructura, puja y etapa (forma general)", () => {
  assert.deepEqual(etiquetasDeNombre("PA | Corrector | DOLOR-espalda | CBO | SINTOPE | T"), { pais: "PA", mercado: "PA", videos: null, persona: null, producto: "Corrector", angulo: "Dolor espalda", estructura: "CBO", puja: "sin_tope", etapa: "testing" });
  assert.deepEqual(etiquetasDeNombre("PA | Nida | OFERTA-2x1 | ABO | Bid cap | E"), { pais: "PA", mercado: "PA", videos: null, persona: null, producto: "Nida", angulo: "Oferta 2x1", estructura: "ABO", puja: "bid_cap", etapa: "escala" });
  const libre = etiquetasDeNombre("Corrector | Antes y después | retargeting | cost-cap");
  assert.equal(libre.pais, null);
  assert.equal(libre.producto, "Corrector");
  assert.equal(libre.angulo, "Antes y después");
  assert.deepEqual([libre.etapa, libre.puja], ["retargeting", "cost_cap"]);
  assert.deepEqual(etiquetasDeNombre("Campaña nueva sin barras"), { pais: null, mercado: null, videos: null, persona: null, producto: null, angulo: null, estructura: null, puja: null, etapa: null });
});

test("el nombre como lo escriben ustedes: producto | audiencia y país | estructura y etapa | videos | persona", () => {
  assert.deepEqual(etiquetasDeNombre("ACEITE COLAGENO | ALL PA | CBO TEST | RT V1 AL V5 | ARIANNY"), { pais: "PA", mercado: "ALL PA", videos: "RT V1 AL V5", persona: "Arianny", producto: "ACEITE COLAGENO", angulo: null, estructura: "CBO", puja: null, etapa: "testing" });
  assert.deepEqual(etiquetasDeNombre("SHAMPOO ANTICASPA HOEGOA | ALL PA | CBO TEST | V6 AL V10 | ARIANNY"), { pais: "PA", mercado: "ALL PA", videos: "V6 AL V10", persona: "Arianny", producto: "SHAMPOO ANTICASPA HOEGOA", angulo: null, estructura: "CBO", puja: null, etapa: "testing" });
  // «RT» es retest (un segundo intento de test): la campaña sigue siendo testing, con o sin RT en los videos.
  assert.equal(etiquetasDeNombre("COMPLEJO B | ALL PA | CBO TEST | RT V1 AL V5 | ARIANNY").etapa, "testing");
  assert.equal(etiquetasDeNombre("COMPLEJO B | ALL PA | CBO RT | V1 | ARIANNY").etapa, "testing");
  assert.equal(etiquetasDeNombre("COMPLEJO B | ALL PA | CBO RETARGETING | V1 | ARIANNY").etapa, "retargeting");
  // Sin persona ni videos también se lee.
  const corto = etiquetasDeNombre("NIDA | ALL PA | CBO ESCALA");
  assert.deepEqual([corto.producto, corto.persona, corto.videos, corto.estructura, corto.etapa], ["NIDA", null, null, "CBO", "escala"]);
});

test("el texto y la llave de un producto", () => {
  assert.equal(embellecer("DOLOR_de-espalda"), "Dolor de espalda");
  assert.equal(claveDeProducto(" Orégano "), claveDeProducto("OREGANO"));
});

test("estructura y puja salen de la API, no del nombre", () => {
  assert.equal(estructuraDe({ daily_budget: "2000" }), "CBO");
  assert.equal(estructuraDe({ lifetime_budget: "50000" }), "CBO");
  assert.equal(estructuraDe({}), "ABO");
  assert.equal(pujaDe("LOWEST_COST_WITH_BID_CAP"), "bid_cap");
  assert.equal(pujaDe("COST_CAP"), "cost_cap");
  assert.equal(pujaDe("LOWEST_COST_WITHOUT_CAP"), "sin_tope");
  assert.equal(pujaDe("OTRA"), null);
  assert.equal(presupuestoDe("2000"), 20);
  assert.equal(presupuestoDe(undefined), null);
  assert.equal(normalizarActId("act_1234567"), "act_1234567");
  assert.equal(normalizarActId(" 1234567 "), "act_1234567");
  assert.equal(normalizarActId("abc"), null);
});

test("una campaña, un anuncio con su video y una fila de resultados se leen de lo que manda Meta", () => {
  const c = campanaDe({ id: "1", name: "PA | X | Y | CBO | T", objective: "OUTCOME_SALES", effective_status: "ACTIVE", daily_budget: "3000", bid_strategy: "COST_CAP", created_time: "2026-11-10T12:00:00-0500" });
  assert.deepEqual([c?.estructura, c?.puja, c?.presupuestoDiario, c?.estado], ["CBO", "cost_cap", 30, "ACTIVE"]);
  assert.equal(campanaDe({ id: "1" }), null);
  const a = anuncioDe({ id: "9", campaign_id: "1", adset_id: "5", name: "Anuncio", effective_status: "PAUSED", creative: { thumbnail_url: "https://x/y.jpg", object_story_spec: { video_data: { video_id: "77", message: "El texto del anuncio", title: "Titular", call_to_action: { value: { link: "https://tienda.com/corrector?utm_source=fb" } } } } } });
  assert.deepEqual([a?.videoId, a?.copy, a?.titulo, a?.landing, a?.miniatura], ["77", "El texto del anuncio", "Titular", "https://tienda.com/corrector?utm_source=fb", "https://x/y.jpg"]);
  const f = resultadoDiaDe({
    ad_id: "9",
    date_start: "2026-11-17",
    spend: "12.50",
    impressions: "3000",
    inline_link_clicks: "90",
    actions: [{ action_type: "video_view", value: "1200" }, { action_type: "landing_page_view", value: "70" }, { action_type: "omni_purchase", value: "4" }, { action_type: "purchase", value: "4" }, { action_type: "omni_add_to_cart", value: "11" }],
    action_values: [{ action_type: "omni_purchase", value: "116" }],
    video_thruplay_watched_actions: [{ action_type: "video_view", value: "400" }],
  });
  assert.deepEqual([f?.gasto, f?.impresiones, f?.clics, f?.video3s, f?.video15s, f?.vioLanding, f?.carrito, f?.compras, f?.valor], [12.5, 3000, 90, 1200, 400, 70, 11, 4, 116], "una compra no se cuenta dos veces");
  assert.equal(resultadoDiaDe({ ad_id: "9", date_start: "ayer" }), null);
  assert.equal(accion([{ action_type: "purchase", value: "2" }], ["omni_purchase", "purchase"]), 2);
  assert.equal(accion(undefined, ["purchase"]), 0);
});

test("el registro de actividad: quién y qué, sin repetirse", () => {
  const a = actividadDe({ event_time: "2026-11-17T14:14:00+0000", event_type: "create_campaign_group", actor_id: "55", actor_name: "Jesús", object_id: "1", object_name: "PA | X", object_type: "CAMPAIGN" });
  assert.deepEqual([a?.actorNombre, a?.tipo, a?.objetoMetaId], ["Jesús", "create_campaign_group", "1"]);
  assert.equal(actividadDe({ event_type: "x" }), null);
});

test("los errores de Meta se dicen en español", () => {
  assert.match(mensajeDeErrorMeta(400, { error: { code: 190 } }), /venció/);
  assert.match(mensajeDeErrorMeta(403, { error: { code: 200 } }), /permiso/);
  assert.match(mensajeDeErrorMeta(400, { error: { code: 17 } }), /esperar/);
  assert.match(mensajeDeErrorMeta(500, { error: { message: "algo raro" } }), /algo raro/);
});

test("las métricas", () => {
  const x = r({ gasto: 100, impresiones: 10000, clics: 300, video3s: 4000, video15s: 1000, vioLanding: 250, compras: 40 });
  assert.equal(cpa(x), 2.5);
  assert.equal(hookRate(x), 40);
  assert.equal(holdRate(x), 25);
  assert.equal(conversion(x), 16);
  assert.equal(cpa(r({ gasto: 50 })), null);
  assert.equal(resultado(x, 3), 20);
});

test("agrupar: con muestra suficiente primero por menor CPA; la poca data, al final", () => {
  const g = agrupar([
    { clave: "Dolor", r: r({ gasto: 200, compras: 80 }), tope: 3, campana: "a" },
    { clave: "Dolor", r: r({ gasto: 100, compras: 30 }), tope: 3, campana: "b" },
    { clave: "Humor", r: r({ gasto: 120, compras: 20 }), tope: 3, campana: "c" },
    { clave: "Nuevo", r: r({ gasto: 20, compras: 10 }), tope: 3, campana: "d" },
    { clave: null, r: r({ gasto: 999, compras: 1 }), tope: 3 },
  ]);
  assert.deepEqual(g.map((x) => x.nombre), ["Dolor", "Humor", "Nuevo"]);
  assert.equal(g[0].campanas, 2);
  assert.equal(g[0].resultado, 110 * 3 - 300);
  assert.equal(g[2].confiable, false);
});

test("landings y copys se juntan sin rastreo ni espacios", () => {
  assert.equal(landingLimpia("https://www.tienda.com/corrector/?utm_source=fb&fbclid=1"), "tienda.com/corrector");
  assert.equal(landingLimpia("no es un enlace"), null);
  assert.equal(copyLimpio("  Hola   mundo,  esto es un copy  "), "Hola mundo, esto es un copy");
  assert.equal(copyLimpio("corto"), null);
});

const campana = (o: Partial<CampanaVista>): CampanaVista => ({
  id: "c1", cuentaId: "a", cuentaNombre: "Oferfy", metaId: "1", nombre: "PA | X", estado: "ACTIVE", activa: true, etapa: "testing", estructura: "CBO", puja: "sin_tope", producto: "Corrector", angulo: "Dolor",
  presupuestoDiario: 20, creadaEn: "2026-11-01T00:00:00Z", persona: null, personaMeta: null, mercado: null, anguloOrigen: null, videos: null, r: sinResultados(), tope: 3, topeDefinido: true, manual: [], ...o,
});

test("sugerencias de campañas: gasta sin comprar, CPA alto, lista para escalar", () => {
  const s = sugerir({
    hoy: "2026-11-18",
    serie: new Map(),
    videos: [],
    campanas: [
      campana({ id: "a", r: r({ gasto: 41, compras: 0 }) }),
      campana({ id: "b", r: r({ gasto: 94, compras: 22 }) }),
      campana({ id: "c", r: r({ gasto: 100, compras: 40 }) }),
      campana({ id: "d", r: r({ gasto: 3, compras: 0 }) }),
      campana({ id: "e", activa: false, r: r({ gasto: 500, compras: 0 }) }),
    ],
  });
  assert.deepEqual(s.map((x) => x.clave), ["sin_compras:a", "escalar:c", "cpa_alto:b"]);
  assert.equal(s[0].severidad, "alta");
  assert.equal(s[1].positiva, true);
});

test("sugerencias: el CPA de una campaña en escala está subiendo", () => {
  const dia = (fecha: string, gasto: number, compras: number) => ({ fecha, r: r({ gasto, compras }) });
  const s = sugerir({
    hoy: "2026-11-18",
    videos: [],
    campanas: [campana({ id: "z", etapa: "escala", r: r({ gasto: 300, compras: 120 }) })],
    serie: new Map([["z", [dia("2026-11-18", 40, 10), dia("2026-11-17", 40, 10), dia("2026-11-16", 40, 10), dia("2026-11-14", 40, 20), dia("2026-11-13", 40, 20), dia("2026-11-12", 40, 20)]]]),
  });
  assert.equal(s[0]?.tipo, "cpa_subiendo");
  assert.match(s[0].detalle, /\$2\.00.*\$4\.00/);
});

test("sugerencias de videos y de landing", () => {
  const video = (o: Partial<VideoVista>): VideoVista => ({ id: "v", nombre: "V-014", miniatura: null, producto: "Corrector", angulo: "Dolor", campanas: 1, anuncios: 1, numero: null, analisis: null, anunciosDetalle: [], r: sinResultados(), tope: 3, ...o });
  const s = sugerir({
    hoy: "2026-11-18",
    serie: new Map(),
    campanas: [campana({ id: "l", r: r({ gasto: 30, compras: 12, impresiones: 10000, clics: 300, vioLanding: 400 }) })],
    videos: [
      video({ id: "g", r: r({ gasto: 200, compras: 80, impresiones: 20000, video3s: 9000 }) }),
      video({ id: "m", r: r({ gasto: 150, compras: 5, impresiones: 20000, video3s: 3000 }) }),
      video({ id: "usado", campanas: 3, r: r({ gasto: 200, compras: 80, impresiones: 20000, video3s: 9000 }) }),
    ],
  });
  assert.deepEqual(s.map((x) => x.tipo).sort(), ["landing_floja", "video_ganador", "video_hook_bajo"]);
});

test("las campañas activas sin etiquetas se avisan juntas; lo decidido no vuelve a salir hasta que venza", () => {
  const sin = sugerir({ hoy: "2026-11-18", serie: new Map(), videos: [], campanas: [campana({ id: "q", etapa: null, angulo: null })] });
  assert.equal(sin[0].tipo, "etiquetas_faltan");
  assert.match(sin[0].titulo, /producto o etapa/);
  // Sin ángulo en el nombre no es una falta (sale de los videos); sin producto sí.
  const soloAngulo = sugerir({ hoy: "2026-11-18", serie: new Map(), videos: [], campanas: [campana({ id: "q", angulo: null })] });
  assert.equal(soloAngulo.length, 0);
  assert.deepEqual(faltanEtiquetas({ producto: null, etapa: "testing" }), ["producto"]);
  assert.deepEqual(faltanEtiquetas({ producto: "Corrector", etapa: null }), ["etapa"]);
  assert.deepEqual(faltanEtiquetas({ producto: "Corrector", etapa: "escala" }), []);
  assert.deepEqual(pendientes(sin, [{ clave: "etiquetas_faltan:cuenta", estado: "pospuesta", vigenteHasta: "2026-11-25" }], "2026-11-18"), []);
  assert.equal(pendientes(sin, [{ clave: "etiquetas_faltan:cuenta", estado: "pospuesta", vigenteHasta: "2026-11-17" }], "2026-11-18").length, 1);
});

test("detalleLegible: el presupuesto y el estado en palabras, y nunca JSON suelto", async () => {
  const { detalleLegible } = await import("./normalizar");
  assert.equal(detalleLegible('{"new_value":{"type":"payment_amount","currency":"USD","new_value":5000,"additional_type":"status_string","additional_value":"Diario"},"type":"composite_data"}'), "Presupuesto $50.00 (diario)");
  assert.equal(detalleLegible('{"new_value":"PAUSED","old_value":"ACTIVE"}'), "Estado: Pausada, antes Activa");
  assert.equal(detalleLegible('{"new_value":{"type":"payment_amount","currency":"USD","new_val'), null);
  assert.equal(detalleLegible('{"cosa":1}'), null);
  assert.equal(detalleLegible(null), null);
});

test("numeroDeVideo: el V# del nombre del anuncio", () => {
  assert.equal(numeroDeVideo("Anuncio V3 - oferta"), "V3");
  assert.equal(numeroDeVideo("v12"), "V12");
  assert.equal(numeroDeVideo("VIDEO nuevo"), null);
  assert.equal(numeroDeVideo("ACEITE V10 | copia"), "V10");
});

test("la retención del video y cuántos llegan al llamado a la acción", () => {
  const x = r({ video3s: 1000, video25: 600, video50: 400, video75: 250, video95: 100, clics: 50, vioLanding: 40 });
  assert.deepEqual(retencion(x), { p25: 60, p50: 40, p75: 25, p95: 10 });
  assert.equal(retencion(r({ video3s: 1000 })), null, "sin retención de Meta no hay dato");
  assert.equal(llegaAlLlamado(x, 15, 30), 40, "a la mitad del video, el 50 %");
  assert.equal(llegaAlLlamado(x, 7.5, 30), 60, "en el 25 %, el punto del 25");
  assert.equal(llegaAlLlamado(x, 0, 30), 100, "al inicio, todos");
  assert.equal(llegaAlLlamado(x, 29, 30), 10, "al final, el punto del 95 %");
  assert.equal(llegaAlLlamado(x, null, 30), null);
  assert.equal(llegaAlLlamado(x, 10, null), null);
  assert.equal(Math.round(llegaAlLlamado(x, 11.25, 30) ?? 0), 50, "entre el 25 y el 50 %, en línea recta");
  assert.equal(clicAVisita(x), 80);
  assert.equal(clicAVisita(r({ clics: 10, vioLanding: 30 })), 100, "no pasa de 100");
  assert.equal(clicAVisita(r({})), null);
});
