import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alertasRiesgo,
  cambiosDeNivel,
  claveDeNombre,
  evaluarRiesgo,
  evaluarRiesgos,
  mapaCalor,
  nivelDe,
  probabilidadPorIndicador,
  umbralesValidos,
  validarRiesgo,
  type Riesgo,
  type ValorIndicador,
} from "./riesgos";

const base: Riesgo = {
  id: "r1", clave: "liquidez", nombre: "Liquidez", categoria: "liquidez", descripcion: null, probabilidadManual: 2, impacto: 5,
  dueno: "Finanzas", mitigacion: null, indicador: "liquidez_semanas", umbrales: null, activo: true, nivelGuardado: null, evaluadoEn: null,
};

test("nivel por puntaje", () => {
  assert.equal(nivelDe(4), "bajo");
  assert.equal(nivelDe(5), "medio");
  assert.equal(nivelDe(10), "alto");
  assert.equal(nivelDe(15), "critico");
  assert.equal(nivelDe(25), "critico");
});

test("probabilidad por indicador en los dos sentidos", () => {
  assert.equal(probabilidadPorIndicador(25, [30, 45, 60, 75], "mayor_peor"), 1);
  assert.equal(probabilidadPorIndicador(45, [30, 45, 60, 75], "mayor_peor"), 3);
  assert.equal(probabilidadPorIndicador(99, [30, 45, 60, 75], "mayor_peor"), 5);
  assert.equal(probabilidadPorIndicador(20, [12, 8, 5, 3], "menor_peor"), 1);
  assert.equal(probabilidadPorIndicador(4, [12, 8, 5, 3], "menor_peor"), 4);
  assert.ok(umbralesValidos([1, 2, 2, 3], "mayor_peor"));
  assert.ok(!umbralesValidos([1, 3, 2, 4], "mayor_peor"));
  assert.ok(umbralesValidos([12, 8, 5, 3], "menor_peor"));
});

test("el indicador mueve el nivel; sin dato manda la probabilidad manual", () => {
  const valores = new Map<"liquidez_semanas", ValorIndicador>([["liquidez_semanas", { valor: 4, nota: null }]]);
  const e = evaluarRiesgo(base, valores);
  assert.equal(e.fuente, "indicador");
  assert.equal(e.probabilidad, 4);
  assert.equal(e.nivel, "critico");
  const sin = evaluarRiesgo(base, new Map([["liquidez_semanas", { valor: null, nota: "Sin proyección" }]]));
  assert.equal(sin.fuente, "manual");
  assert.equal(sin.probabilidad, 2);
  assert.equal(sin.nivel, "alto");
  // Umbrales propios.
  const propio = evaluarRiesgo({ ...base, umbrales: [3, 2, 1, 0.5] }, valores);
  assert.equal(propio.probabilidad, 1);
});

test("cambios de nivel y alerta solo si el último cambio fue una subida", () => {
  const valores = new Map<"liquidez_semanas", ValorIndicador>([["liquidez_semanas", { valor: 4, nota: null }]]);
  const [e] = evaluarRiesgos([{ ...base, nivelGuardado: "medio" }], valores);
  assert.equal(e.cambio, "sube");
  const c = cambiosDeNivel([e]);
  assert.deepEqual(c[0], { riesgoId: "r1", antes: "medio", despues: "critico", probabilidad: 4, impacto: 5, valor: 4, origen: "auto" });
  const ult = new Map([["r1", { riesgoId: "r1", antes: "medio" as const, despues: "critico" as const, fecha: "2026-10-01" }]]);
  const a = alertasRiesgo([e], ult);
  assert.equal(a.length, 1);
  assert.equal(a[0].clave, "riesgo:liquidez:critico");
  assert.equal(a[0].severidad, "critica");
  assert.match(a[0].mensaje, /subió de medio a crítico/);
  // Si después bajó, no hay alerta.
  assert.equal(alertasRiesgo([e], new Map([["r1", { riesgoId: "r1", antes: "critico" as const, despues: "medio" as const, fecha: "x" }]])).length, 0);
  // El primer registro (sin nivel anterior) no alerta.
  assert.equal(alertasRiesgo([e], new Map([["r1", { riesgoId: "r1", antes: null, despues: "critico" as const, fecha: "x" }]])).length, 0);
});

test("mapa de calor 5 × 5 con el riesgo en su celda", () => {
  const e = evaluarRiesgo(base, new Map());
  const m = mapaCalor([e]);
  assert.equal(m.length, 5);
  assert.equal(m[0].impacto, 5);
  assert.equal(m[0].celdas[1].riesgos.length, 1);
  assert.equal(m[0].celdas[4].nivel, "critico");
  assert.equal(m[4].celdas[0].nivel, "bajo");
});

test("validar un riesgo", () => {
  const d: Record<string, unknown> = { nombre: "Proveedor único", categoria: "concentracion", probabilidad: "3", impacto: "4", indicador: "concentracion_proveedor", umbral1: "30", umbral2: "40", umbral3: "50", umbral4: "60" };
  const ok = validarRiesgo((c) => d[c]);
  assert.ok(!("error" in ok) && ok.umbrales?.[3] === 60);
  assert.ok("error" in validarRiesgo((c) => ({ ...d, umbral2: "20" })[c]));
  assert.ok("error" in validarRiesgo((c) => ({ ...d, impacto: "6" })[c]));
  assert.ok("error" in validarRiesgo((c) => ({ ...d, indicador: "otro" })[c]));
  assert.equal(claveDeNombre("Concentración en un courier"), "concentracion_en_un_courier");
});
