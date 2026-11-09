import assert from "node:assert/strict";
import test from "node:test";
import { MODELO_PREDETERMINADO, configAnthropic, cuerpoPedido, datosParaExplicar, textoDeRespuesta } from "./explicacion-ia";
import type { SnapshotInforme } from "./informe-envio";

const c = (i: number, e: number) => ({ ingresos: i, margenBruto: i / 2, ebitda: e, resultadoNeto: e, margenBrutoPct: 50, margenEbitdaPct: 10, costoVentasPct: 50, marketingPct: 20, administracionPct: 20 });
const snap: SnapshotInforme = {
  version: 1,
  mes: "2026-09-01",
  anterior: "2026-08-01",
  actual: c(1000, 100),
  previo: c(900, 80),
  causas: [{ seccion: "marketing", etiqueta: "Marketing", tipo: "Ads", actual: 200, anterior: 150, impacto: -50 }],
  tiendas: [{ nombre: "TIENDA SECRETA", ingresos: 1, ebitda: 1, ebitdaAnterior: 1, margenEbitdaPct: 1 }],
  implicancias: { ebitdaAnualMes: 1, valorEmpresaMes: 1, valorCreado: 1 },
  multiplo: 4,
  acciones: [{ clave: "a", texto: "Llamar a Fulano", prioridad: 1 }],
  explicacion: "texto previo",
  generadoEn: "x",
};

test("sin clave, apagado; el modelo por variable o el predeterminado", () => {
  assert.equal(configAnthropic({}), null);
  assert.deepEqual(configAnthropic({ ANTHROPIC_API_KEY: "k" }), { clave: "k", modelo: MODELO_PREDETERMINADO });
  assert.equal(configAnthropic({ ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "otro-modelo" })?.modelo, "otro-modelo");
});

test("solo cifras agregadas: ni tiendas, ni acciones, ni la explicación escrita", () => {
  const d = datosParaExplicar(snap);
  assert.match(d, /Ingresos netos/);
  assert.match(d, /Ads/);
  assert.ok(!d.includes("TIENDA SECRETA"));
  assert.ok(!d.includes("Fulano"));
  assert.ok(!d.includes("texto previo"));
  const cuerpo = cuerpoPedido(snap, "m");
  assert.equal(cuerpo.model, "m");
  assert.equal(cuerpo.messages.length, 1);
});

test("la respuesta se lee de los bloques de texto", () => {
  assert.equal(textoDeRespuesta({ content: [{ type: "text", text: " Hola " }, { type: "tool_use" }] }), "Hola");
  assert.equal(textoDeRespuesta({ content: [] }), null);
  assert.equal(textoDeRespuesta(null), null);
});
