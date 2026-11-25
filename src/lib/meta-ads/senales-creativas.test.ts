import assert from "node:assert/strict";
import test from "node:test";
import type { BaseDias } from "./analisis-pedido";
import { sinResultados } from "./metricas";
import { leerValorSenales, senalesDeProducto, senalesParaIA } from "./senales-creativas";

const HOY = "2026-11-24";
const dia = (fecha: string, videoId: string, gasto: number, compras: number, ctrPct: number, hookPct = 30) => ({
  fecha,
  campanaId: "c1",
  videoId,
  r: { ...sinResultados(), gasto, compras, impresiones: 10_000, clics: Math.round(10_000 * (ctrPct / 100)), video3s: Math.round(10_000 * (hookPct / 100)) },
});
const base = (dias: BaseDias["dias"]): BaseDias => ({
  campanas: new Map([["c1", { id: "c1", nombre: "Shilajit | ALL PA", producto: "Shilajit", familia: "suplemento", etapa: "venta", estructura: "CBO", puja: null, tope: 10 }]]),
  videos: new Map([
    ["vv", { id: "vv", nombre: "Video viejo", angulo: "Energía", gancho: null, formato: null, cta: null }],
    ["vn", { id: "vn", nombre: "Video nuevo", angulo: "Gimnasio", gancho: null, formato: null, cta: null }],
  ]),
  dias,
});

// El video viejo (nació el 1 de octubre) gastó siempre; en la semana anterior tenía 3 % de CTR y esta semana 2 %.
const viejoCansado = [
  dia("2026-10-01", "vv", 50, 10, 3),
  dia("2026-10-20", "vv", 50, 10, 3),
  ...[11, 12, 13, 14, 15, 16, 17].map((d) => dia(`2026-11-${d}`, "vv", 10, 2, 3)),
  ...[18, 19, 20, 21, 22, 23, 24].map((d) => dia(`2026-11-${d}`, "vv", 10, 1, 2)),
];

test("un video viejo que concentra el gasto y perdió CTR se marca como cansado, con su acción y el mejor ángulo", () => {
  const s = senalesDeProducto(base([...viejoCansado, dia("2026-10-25", "vn", 100, 30, 4)]), "Shilajit", HOY)!;
  assert.equal(s.gasto14, 140);
  const cansancio = s.causas.find((c) => c.tipo === "cansancio")!;
  assert.ok(cansancio, "el 100 % del gasto de los últimos 14 días está en un video cansado");
  assert.match(cansancio.titulo, /1 video con el 100 %/);
  assert.match(cansancio.detalle, /33 % de CTR/);
  assert.match(cansancio.accion, /Gimnasio/);
  assert.ok(s.causas.some((c) => c.tipo === "dependencia"), "y depende de un solo video");
  assert.ok(s.causas.some((c) => c.tipo === "sin_renovacion"), "y no se sube nada nuevo hace 14 días");
});

test("un video nuevo que rinde peor que los viejos se señala; sin gasto reciente no hay nada que analizar", () => {
  const dias = [...viejoCansado, dia("2026-11-20", "vn", 60, 1, 1), dia("2026-11-21", "vn", 60, 1, 1)];
  const s = senalesDeProducto(base(dias), "Shilajit", HOY)!;
  assert.equal(s.nuevos14.videos, 1);
  assert.ok(s.causas.some((c) => c.tipo === "nuevos_peores"), "CPA $60 frente a $14");
  assert.equal(s.causas.some((c) => c.tipo === "sin_renovacion"), false, "ya hay algo nuevo");
  assert.equal(senalesDeProducto(base(viejoCansado), "Otro producto", HOY), null);
  assert.equal(senalesDeProducto(base([dia("2026-09-01", "vv", 50, 5, 3)]), "Shilajit", HOY), null, "no gastó en los últimos 14 días");
});

test("lo que se le da a la IA y lo guardado se lee con validación", () => {
  const s = senalesDeProducto(base(viejoCansado), "Shilajit", HOY)!;
  const t = senalesParaIA(s) as Record<string, unknown>;
  assert.equal(t.producto, "Shilajit");
  assert.ok(Array.isArray(t.causas_encontradas));
  assert.equal(leerValorSenales({ generadoEn: "x", items: [s, { producto: 3 }] })!.items.length, 1);
  assert.equal(leerValorSenales(null), null);
});
