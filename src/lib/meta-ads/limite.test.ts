import assert from "node:assert/strict";
import { test } from "node:test";
import { COSTOS_DE_LA_HOJA, costoPorVenta, tasasDe } from "./costos-operacion";
import { decisionDeAnuncio, umbralesDeAnuncio } from "./decision-anuncio";
import { analizarHistorico, type CampanaHist } from "./historico";
import { topeAjustado, topeDeProducto, textoDeTope, zonaDe, zonaDeCpa } from "./limite";
import { calculadorDeTopes } from "./limite-datos";
import { nivelesDeMetricas, sinResultados, type Resultados } from "./metricas";
import { claveDeDecision, limiteDeApagado, sugerir } from "./sugerencias";
import type { CampanaVista } from "./vistas";

const r = (o: Partial<Resultados>): Resultados => ({ ...sinResultados(), ...o });
// Los números de Oferfy Panamá el 25 nov 2026: se envía el 64 % y de eso se entrega el 85 %.
const PEDIDOS_TIENDA = { entregadas: 14822, devueltas: 2692, canceladas: 10056, enCamino: 875, sinEnviar: 346 };
const TIENDA = tasasDe(PEDIDOS_TIENDA);
const peor = { entregadas: 60, devueltas: 20, canceladas: 60, enCamino: 0, sinEnviar: 0 };

test("el tope baja solo en el que envía o entrega peor, y cada venta que llega le cuesta lo mismo que a uno promedio", () => {
  const t = topeAjustado(10, tasasDe(peor), TIENDA, COSTOS_DE_LA_HOJA)!;
  assert.ok(t > 5 && t < 9, String(t));
  const suyo = costoPorVenta(t, tasasDe(peor).envio, tasasDe(peor).entrega, COSTOS_DE_LA_HOJA)!.total;
  const promedio = costoPorVenta(10, TIENDA.envio, TIENDA.entrega, COSTOS_DE_LA_HOJA)!.total;
  assert.ok(Math.abs(suyo - promedio) < 0.2, `${suyo} frente a ${promedio}`);
  // Mejor que la tienda: no sube. Igual: no cambia. Sin pedidos suficientes: no se toca.
  assert.equal(topeAjustado(10, { envio: 0.9, entrega: 0.95 }, TIENDA, COSTOS_DE_LA_HOJA), null);
  assert.equal(topeAjustado(10, TIENDA, TIENDA, COSTOS_DE_LA_HOJA), null);
  assert.equal(topeAjustado(10, { envio: null, entrega: null }, TIENDA, COSTOS_DE_LA_HOJA), null);
  assert.equal(topeAjustado(10, tasasDe(peor), { envio: null, entrega: 0.8 }, COSTOS_DE_LA_HOJA), null);
});

test("un tope escrito a mano se respeta; el ajustado dice por qué", () => {
  const mano = topeDeProducto(12, peor, TIENDA, COSTOS_DE_LA_HOJA);
  assert.deepEqual([mano.tope, mano.definido, mano.ajustado, textoDeTope(mano)], [12, true, false, null]);
  const solo = topeDeProducto(undefined, peor, TIENDA, COSTOS_DE_LA_HOJA);
  assert.deepEqual([solo.base, solo.definido, solo.ajustado], [10, false, true]);
  assert.match(textoDeTope(solo)!, /^Tope ajustado a \$\d\.\d\d \(el general es \$10\.00\): este producto envía 57 % y entrega 75 %, y la tienda envía 64 % y entrega 85 %\.$/);
  const de = calculadorDeTopes(new Map([["MANO", 8]]), { entrega: [{ clave: "PEOR", ...peor }], pedidosDeLaTienda: PEDIDOS_TIENDA }, COSTOS_DE_LA_HOJA);
  assert.equal(de("MANO").tope, 8);
  assert.equal(de("PEOR").tope, solo.tope);
  assert.equal(de("OTRO").tope, 10);
  assert.equal(calculadorDeTopes(new Map(), null, COSTOS_DE_LA_HOJA)("PEOR").tope, 10);
});

test("las zonas frente al tope, y los montos de apagar y de cada anuncio bajan con un tope ajustado", () => {
  assert.deepEqual([zonaDeCpa(7, 10), zonaDeCpa(9, 10), zonaDeCpa(10.1, 10)], ["dentro", "cerca", "sobre"]);
  assert.deepEqual([zonaDe({ gasto: 12, compras: 0 }, 10), zonaDe({ gasto: 15, compras: 0 }, 10)], ["dentro", "sobre"]);
  assert.equal(limiteDeApagado({ tope: 10 }), 12);
  assert.equal(limiteDeApagado({ tope: 7, topeAjustado: true }), 8.4);
  assert.equal(limiteDeApagado({ tope: 15, topeDefinido: true }), 15);
  assert.equal(umbralesDeAnuncio(0.7).ventanaCorte, 8.4);
  assert.equal(umbralesDeAnuncio(0.7).ctrBueno, 2, "los porcentajes no cambian");
  const sinVentas = { acumulado: r({ gasto: 9, compras: 0, impresiones: 1000, clics: 30 }), ultimos2: sinResultados(), ultimoDia: sinResultados(), presupuestoCampana: null, esCbo: false, hayOtroConCpaBajo: false };
  assert.equal(decisionDeAnuncio(sinVentas), null);
  assert.equal(decisionDeAnuncio({ ...sinVentas, factor: 0.7 })!.decision, "cortar");
  const venta = r({ gasto: 80, compras: 10 });
  assert.equal(nivelesDeMetricas(venta, "venta", 10).cpa, "bueno");
  assert.equal(nivelesDeMetricas(venta, "venta", 7).cpa, "malo");
});

test("que el CPA suba de $5 a $7 no pide tocar la campaña: queda en observación, y la semana y el mes van en una sola tarjeta", () => {
  const v = (a: number[], b: number[]) => ({ semana: { prev: r({ gasto: a[0], compras: a[1] }), rec: r({ gasto: a[2], compras: a[3] }) }, mes: { prev: r({ gasto: b[0], compras: b[1] }), rec: r({ gasto: b[2], compras: b[3] }) } });
  const campana = (id: string, tope: number, ventanas: ReturnType<typeof v>): CampanaHist => ({ id, nombre: `Campaña ${id}`, producto: "P", clave: "P", familia: "general", activa: true, etapa: "venta", estructura: "CBO", puja: null, angulo: null, tope, total: r({ gasto: 1000, compras: 150 }), v: ventanas });
  const subio = v([300, 60, 350, 50], [900, 180, 1050, 150]);
  const dentro = analizarHistorico({ campanas: [campana("a", 10, subio)], videos: [], productos: [], desde: null, hasta: null }).hallazgos.filter((h) => h.id.startsWith("tendencia:Campaña:"));
  assert.equal(dentro.length, 1, "una sola tarjeta por la semana y el mes");
  assert.equal(dentro[0].tono, "info");
  assert.match(dentro[0].titulo, /el CPA subió en la última semana, dentro del tope \(\$5\.00 → \$7\.00, tope \$10\.00\)/);
  assert.match(dentro[0].detalle, /también empeoró \(\$5\.00 → \$7\.00\)/);
  assert.match(dentro[0].accion!, /^No la toques/);
  // El mismo cambio con un tope ajustado de $6 sí pide atención.
  const sobre = analizarHistorico({ campanas: [campana("a", 6, subio)], videos: [], productos: [], desde: null, hasta: null }).hallazgos.find((h) => h.id === "tendencia:Campaña:Campaña a:semana")!;
  assert.deepEqual([sobre.tono, sobre.zona, sobre.impacto], ["alerta", "sobre", 50]);
  assert.match(sobre.titulo, /empeoró en la última semana y pasa del tope/);
  // Lo decidido «en observación» no tapa el aviso cuando después pasa del tope.
  assert.notEqual(claveDeDecision({ id: sobre.id, tono: "info" }), claveDeDecision(sobre));
});

test("cerca del tope solo se piden videos si ya no baja sola", () => {
  const c = { id: "n", cuentaId: "x", nombre: "N", activa: true, estado: "ACTIVE", etapa: "venta", tope: 10, topeDefinido: false, r: r({ gasto: 190, compras: 20 }), creadaEn: null, producto: "P" } as unknown as CampanaVista;
  const anuncio = { id: "n-V2", campanaId: "n", nombre: "V2", numero: "V2", activo: true, angulo: null, r: r({ gasto: 70, compras: 10 }), r7: r({ gasto: 70, compras: 10 }), ultimos2: sinResultados(), ultimoDia: sinResultados() };
  const con = (compras: number) => sugerir({ hoy: "2026-11-25", videos: [], campanas: [c], anuncios: [anuncio], serie: new Map([["n", [{ fecha: "2026-11-24", r: r({ gasto: 60, compras }) }]]]) }).map((x) => x.tipo);
  assert.deepEqual(con(8), ["en_recuperacion"]);
  assert.deepEqual(con(6), ["sumar_videos"]);
});
