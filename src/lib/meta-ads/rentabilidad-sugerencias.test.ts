import { test } from "node:test";
import assert from "node:assert/strict";
import { sinResultados, type Resultados } from "./metricas";
import { claveDeProducto } from "./nombre";
import type { LimiteProducto } from "./rentabilidad";
import { sugerir } from "./sugerencias";
import type { CampanaVista } from "./vistas";

const r = (o: Partial<Resultados>): Resultados => ({ ...sinResultados(), ...o });
const campana = (o: Partial<CampanaVista>): CampanaVista => ({
  id: "c1", cuentaId: "a", cuentaNombre: "Oferfy", metaId: "1", nombre: "PA | Gel", estado: "ACTIVE", activa: true, etapa: "venta", etapaMotivo: null, frecuencia: null, estructura: "CBO", puja: "sin_tope", producto: "Gel AntiHPV", angulo: "Dolor", angulos: [], videosTotal: 0, videosConAngulo: 0,
  presupuestoDiario: 20, creadaEn: "2026-11-01T00:00:00Z", persona: null, personaMeta: null, mercado: null, anguloOrigen: null, videos: null, r: sinResultados(), tope: 10, topeDefinido: false, manual: [], ...o,
});
// Venta $32.89, producto $1.93, envía 59 %, entrega 78 %: no pierde hasta $9.64.
const limite: LimiteProducto = { venta: 32.89, producto: 1.93, paraAnuncios: 20.95, envio: 0.59, entrega: 0.78, cpaParaNoPerder: 9.64, fuente: "compras_pais", unidades: 1 };
const rentabilidad = new Map([[claveDeProducto("Gel AntiHPV"), limite]]);

test("una campaña dentro del tope que pierde plata tiene su aviso", () => {
  const s = sugerir({ hoy: "2026-11-27", serie: new Map(), videos: [], campanas: [campana({ id: "g", r: r({ gasto: 98, compras: 10 }) })], rentabilidad });
  const p = s.find((x) => x.tipo === "pierde_plata")!;
  assert.ok(p, "falta el aviso de que pierde");
  assert.equal(p.prioridad, "actuar");
  assert.equal(p.rentabilidad?.estado, "pierde");
  assert.ok(p.cifras?.some((c) => c.etiqueta === "Para no perder" && c.valor === "$9.64" && c.tono === "malo"));
});

test("margen fino: va dentro del límite pero cerca", () => {
  const s = sugerir({ hoy: "2026-11-27", serie: new Map(), videos: [], campanas: [campana({ id: "g", r: r({ gasto: 90, compras: 10 }) })], rentabilidad });
  assert.equal(s.find((x) => x.tipo === "margen_fino")?.rentabilidad?.estado, "margen_fino");
});

test("sin rentabilidad o con un CPA cómodo no se avisa nada nuevo", () => {
  const sin = sugerir({ hoy: "2026-11-27", serie: new Map(), videos: [], campanas: [campana({ id: "g", r: r({ gasto: 98, compras: 10 }) })] });
  assert.ok(!sin.some((x) => x.tipo === "pierde_plata" || x.tipo === "margen_fino"));
  const comodo = sugerir({ hoy: "2026-11-27", serie: new Map(), videos: [], campanas: [campana({ id: "g", r: r({ gasto: 50, compras: 10 }) })], rentabilidad });
  assert.ok(!comodo.some((x) => x.tipo === "pierde_plata" || x.tipo === "margen_fino"));
});

test("una sugerencia de siempre lleva su aviso de rentabilidad", () => {
  // CPA $15 sobre el tope de $10: la de siempre (CPA alto o apagar) dice además que pierde.
  const s = sugerir({ hoy: "2026-11-27", serie: new Map(), videos: [], campanas: [campana({ id: "g", r: r({ gasto: 150, compras: 10 }) })], rentabilidad });
  const deCampana = s.filter((x) => x.objeto.id === "g");
  assert.ok(deCampana.length > 0);
  assert.ok(deCampana.every((x) => x.rentabilidad?.estado === "pierde"));
  assert.ok(!s.some((x) => x.tipo === "pierde_plata"), "no se repite si ya hay una que pide actuar o apagar");
});
