import assert from "node:assert/strict";
import test from "node:test";
import { analizarHistorico, sinVentanas, type ProductoHist } from "./historico";
import { cortarEnPunto, leerInterpretacion, LIMITES_IA, pedidoInterpretacion, recortarTexto, REGLA_ALCANCE_DE_CAMPANAS } from "./interpretar-ia";
import { sinResultados } from "./metricas";

test("el pedido a la IA lleva las reglas (solo las cifras recibidas) y las estadísticas en JSON", () => {
  const p: ProductoHist = { clave: "CORRECTOR", nombre: "Corrector", familia: "general", tope: 10, campanas: 2, total: { ...sinResultados(), gasto: 700, compras: 100 }, v: sinVentanas(), entrega: { nombre: "Corrector", entregadas: 48, devueltas: 52, canceladas: 3, enCamino: 1 } };
  const a = analizarHistorico({ campanas: [], videos: [], productos: [p], desde: "2025-11-01", hasta: "2026-11-24" });
  const { instrucciones, texto } = pedidoInterpretacion(a);
  assert.match(instrucciones, /SOLO las cifras que recibes/);
  assert.match(instrucciones, /tasa de entrega/);
  assert.match(instrucciones, /JSON válido/);
  const json = JSON.parse(texto.slice(texto.indexOf("{")));
  assert.equal(json.resumen.desde, "2025-11-01");
  assert.equal(json.entrega_por_producto[0].producto, "Corrector");
  assert.equal(json.entrega_por_producto[0].tasa_entrega, 0.48);
  assert.ok(json.hallazgos.some((h: { titulo: string }) => /vende bien pero solo se entrega 48 %/.test(h.titulo)));
});

test("lo que contesta la IA se valida: JSON con resumen, textos recortados y límites de cantidad", () => {
  const bueno = JSON.stringify({
    resumen: "  El producto X vende pero entrega mal.  ",
    patrones: [{ titulo: "Antes y después funciona", detalle: "8 de 10 videos." }, { titulo: "", detalle: "sin título: se ignora" }, "no es un objeto"],
    riesgos: Array.from({ length: 10 }, (_, i) => ({ titulo: `Riesgo ${i}`, detalle: "x".repeat(1200) })),
    recomendaciones: [{ titulo: "Bajar el tope", detalle: "A $7." }],
    limites: ["Poca data en belleza", "", 5],
  });
  const r = leerInterpretacion("```json\n" + bueno + "\n```");
  assert.ok(r);
  assert.equal(r!.resumen, "El producto X vende pero entrega mal.");
  assert.equal(r!.patrones.length, 1);
  assert.equal(r!.riesgos.length, LIMITES_IA.puntos);
  assert.ok(r!.riesgos[0].detalle.length <= LIMITES_IA.detalle + 1, "un texto sin cortes naturales se corta en el largo con «…»");
  assert.deepEqual(r!.limites, ["Poca data en belleza"]);
});

test("un texto largo nunca queda cortado a la mitad: se corta al final de una frase o de una palabra", () => {
  const frases = "Colón devuelve 56 % de los pedidos. DEIMIBEL ZONA 5 devuelve 67 %, pero son solo 9 pedidos cada uno: señal débil. Mover presupuesto a las zonas que sí entregan y probar otro ángulo.";
  const corto = recortarTexto(frases, 120);
  assert.equal(corto, "Colón devuelve 56 % de los pedidos. DEIMIBEL ZONA 5 devuelve 67 %, pero son solo 9 pedidos cada uno: señal débil.");
  assert.equal(recortarTexto("Uno dos tres cuatro cinco seis", 20), "Uno dos tres cuatro…", "sin fin de frase cerca, corta en una palabra");
  assert.equal(recortarTexto("  Cabe   completo. ", 50), "Cabe completo.");
  assert.equal(recortarTexto(5, 10), "");
  assert.equal(cortarEnPunto("- uno\n- dos\n- tres cuatro", 16), "- uno\n- dos");
  const largo = leerInterpretacion(JSON.stringify({ resumen: "ok", recomendaciones: [{ titulo: "t", detalle: `${"Frase completa número uno. ".repeat(40)}` }] }))!;
  assert.ok(largo.recomendaciones[0].detalle.endsWith("."), "termina en una frase completa");
});

test("las IA reciben la regla de qué recomendar: solo lo que controla quien monta las campañas", () => {
  const a = analizarHistorico({ campanas: [], videos: [], productos: [], desde: "2025-11-01", hasta: "2026-11-24" });
  const { instrucciones } = pedidoInterpretacion(a);
  assert.ok(instrucciones.includes(REGLA_ALCANCE_DE_CAMPANAS));
  assert.match(REGLA_ALCANCE_DE_CAMPANAS, /NO recomiendes nada que dependa de otras áreas/);
  assert.match(REGLA_ALCANCE_DE_CAMPANAS, /cobro previo/);
  assert.match(REGLA_ALCANCE_DE_CAMPANAS, /precio que se muestra/, "el precio de la landing sí lo controlan: se puede sugerir probarlo cuando sea necesario");
});

test("una respuesta que no es JSON, sin resumen o vacía no se acepta", () => {
  assert.equal(leerInterpretacion(null), null);
  assert.equal(leerInterpretacion("Claro, aquí está mi análisis…"), null);
  assert.equal(leerInterpretacion("{ roto"), null);
  assert.equal(leerInterpretacion(JSON.stringify({ patrones: [] })), null);
  assert.equal(leerInterpretacion("[1,2]"), null);
});
