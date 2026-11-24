import assert from "node:assert/strict";
import test from "node:test";
import { analisisViejo, HORAS_ANALISIS_VIGENTE } from "./analisis-tipos";
import { compactarAnalisis, iasParaInterpretar } from "./analisis-guardado";
import { analizarHistorico } from "./historico";
import { leerValorInterpretacion } from "./interpretacion-guardada";

const ia = { resumen: "Todo bien.", patrones: [], riesgos: [], recomendaciones: [], limites: [] };

test("el análisis es viejo si no hay o si pasó más de un día", () => {
  const ahora = Date.parse("2026-11-24T12:00:00Z");
  assert.equal(analisisViejo(null, ahora), true);
  assert.equal(analisisViejo({ generadoEn: "2026-11-24T06:00:00Z" }, ahora), false);
  assert.equal(analisisViejo({ generadoEn: new Date(ahora - (HORAS_ANALISIS_VIGENTE + 1) * 3_600_000).toISOString() }, ahora), true);
});

test("la interpretación guardada se lee con la forma de ahora (varias opiniones) y con la de antes (una)", () => {
  const ahora = leerValorInterpretacion({ generadaEn: "2026-11-24T10:00:00Z", opiniones: [{ proveedor: "Claude", modelo: "m1", interpretacion: ia }, { proveedor: "OpenAI", modelo: "m2", interpretacion: ia }, { proveedor: "roto", interpretacion: "no" }] });
  assert.deepEqual(ahora?.opiniones.map((o) => o.proveedor), ["Claude", "OpenAI"]);
  const antes = leerValorInterpretacion({ generadaEn: "2026-11-24T10:00:00Z", interpretacion: ia, modelo: "m", proveedor: "Claude" });
  assert.equal(antes?.opiniones.length, 1);
  assert.equal(leerValorInterpretacion(null), null);
  assert.equal(leerValorInterpretacion({ generadaEn: "x" }), null);
  assert.equal(leerValorInterpretacion({ generadaEn: "2026-11-24T10:00:00Z", opiniones: [] }), null);
});

test("Claude va primero entre las IA que interpretan y OpenAI queda de segunda opinión", () => {
  assert.deepEqual(iasParaInterpretar(["openai", "anthropic"]), ["anthropic", "openai"]);
  assert.deepEqual(iasParaInterpretar(["openai"]), ["openai"]);
  assert.deepEqual(iasParaInterpretar([]), []);
});

test("un análisis chico se guarda tal cual", () => {
  const a = analizarHistorico({ campanas: [], videos: [], productos: [], desde: null, hasta: null });
  assert.equal(compactarAnalisis(a), a);
});
