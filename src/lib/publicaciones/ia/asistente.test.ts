import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizarAnalisis, normalizarPlanFotos, normalizarPropuestaTexto, normalizarTitulos, pedidoAnalisis, pedidoFotos, pedidoTexto, pedidoTitulos, promptFoto, tipoIADeRecomendacion, type ContextoIA, type DatosPublicacionIA } from "./asistente";
import { cuerpoMensaje, extraerMensaje, mensajeErrorClaude } from "./anthropic";
import { chequearTitulo, reglasParaIA, textoCriterios, textoEjemplos, textoIndicaciones } from "./criterios";
import { cuerpoRespuesta, extraerJson, extraerRespuesta, mensajeErrorOpenAI } from "./openai";

const reglas = reglasParaIA({ max_titulo: 40, min_fotos: 7, min_descripcion: 200 });
const datos: DatosPublicacionIA = {
  nombre: "Hair Growth Capsulas",
  tituloDropi: null,
  categoria: "Salud",
  pais: "Panamá",
  precio: 9.99,
  producto: "HAIR/GROWTH",
  revisiones: [
    { etiqueta: "Título en español", estado: "falta", detalle: "Palabras en inglés: hair, growth" },
    { etiqueta: "Fotos", estado: "falta", detalle: "3 de 7 fotos como mínimo" },
    { etiqueta: "Video", estado: "ok", detalle: "1 video" },
  ],
  competidores: [{ nombre: "Biotina capsulas pelo fuerte", proveedor: "Vendedor X", precio: 8.5 }],
  margen: 0.45,
  ventas30: 120,
};
const contexto: ContextoIA = { reglas, indicaciones: { general: "Tutea al cliente.", titulo: "Empieza por el producto." }, ejemplos: { titulos: ["Biotina para el cabello 60 cápsulas"], rechazos: ["Sonaba a promesa médica"] } };

test("las reglas de la IA: el mínimo del título es 35 si las reglas todavía no lo traen, y lo guardado manda", () => {
  assert.equal(reglas.minTitulo, 35);
  assert.equal(reglasParaIA({ max_titulo: 40, min_fotos: 7, min_descripcion: 200, min_titulo: 30 }).minTitulo, 30);
  assert.match(textoCriterios(reglas), /de 35 a 40 caracteres/);
  assert.match(textoCriterios(reglas), /mínimo 7/);
});

test("un título se pasa por las reglas: largo, español y, en un suplemento, la cantidad", () => {
  const ok = chequearTitulo("Biotina para el cabello 60 cápsulas", "Salud", reglas);
  assert.equal(ok.cumple, true);
  assert.equal(ok.chequeos.find((c) => c.clave === "largo")?.texto, "35 caracteres");
  const corto = chequearTitulo("Biotina 60 cápsulas", "Salud", reglas);
  assert.equal(corto.cumple, false);
  assert.match(corto.chequeos[0].texto, /faltan 16/);
  const largo = chequearTitulo("Biotina y colágeno para cabello piel y uñas 60 cápsulas", "Salud", reglas);
  assert.match(largo.chequeos[0].texto, /pasa del máximo de 40/);
  const ingles = chequearTitulo("Hair growth cápsulas para el cabello x60", "Salud", reglas);
  assert.equal(ingles.chequeos.find((c) => c.clave === "espanol")?.ok, false);
  const sinCantidad = chequearTitulo("Biotina para el cabello fuerte y sano", "Salud", reglas);
  assert.equal(sinCantidad.chequeos.find((c) => c.clave === "cantidad")?.ok, false);
  assert.equal(sinCantidad.cumple, false);
  // «Para qué sirve» solo orienta: no impide usar el título.
  const sinAngulo = chequearTitulo("Cápsulas de biotina de 10000 mcg x60", "Salud", reglas);
  assert.equal(sinAngulo.chequeos.find((c) => c.clave === "angulo")?.ok, false);
  assert.equal(sinAngulo.cumple, true);
});

test("las indicaciones del equipo y los ejemplos entran a los pedidos", () => {
  assert.match(textoIndicaciones(contexto.indicaciones, "titulo"), /Tutea al cliente[\s\S]*Empieza por el producto/);
  assert.equal(textoIndicaciones({}, "fotos"), "");
  assert.match(textoEjemplos(contexto.ejemplos), /Biotina para el cabello 60 cápsulas/);
  assert.match(textoEjemplos(contexto.ejemplos), /promesa médica/);
  assert.equal(textoEjemplos({ titulos: [], rechazos: [] }), "");
  const t = pedidoTitulos(datos, contexto);
  assert.match(t.instrucciones, /entre 35 y 40 caracteres/);
  assert.match(t.instrucciones, /Empieza por el producto/);
  assert.match(t.texto, /Biotina capsulas pelo fuerte/); // la competencia como referencia
  assert.match(t.texto, /imita su estilo/);
  const a = pedidoAnalisis(datos, contexto);
  assert.match(a.texto, /Fotos \[falta\]: 3 de 7/);
  assert.match(a.instrucciones, /proceso/);
  assert.match(pedidoTexto(datos, contexto).texto, /al menos 200 caracteres/);
  assert.match(pedidoFotos(datos, contexto, 9).instrucciones, /Exactamente 6 fotos/); // el tope
  assert.match(pedidoFotos(datos, contexto, 3).instrucciones, /Un «testimonio» no existe/);
});

test("el pedido de OpenAI lleva las fotos, la búsqueda y el razonamiento solo en modelos que lo aceptan", () => {
  const e = { instrucciones: "i", texto: "t", imagenes: ["https://x/a.jpg"] };
  const c = cuerpoRespuesta("gpt-5", e, true) as Record<string, unknown>;
  assert.deepEqual(c.tools, [{ type: "web_search" }]);
  assert.deepEqual(c.reasoning, { effort: "low" });
  assert.deepEqual((c.input as { content: unknown[] }[])[0].content[1], { type: "input_image", image_url: "https://x/a.jpg" });
  const d = cuerpoRespuesta("gpt-4.1", e, false) as Record<string, unknown>;
  assert.equal("tools" in d, false);
  assert.equal("reasoning" in d, false);
});

test("la respuesta de OpenAI: texto del mensaje y fuentes citadas (solo http, sin repetir)", () => {
  const r = extraerRespuesta({
    output: [
      { type: "web_search_call", id: "x" },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: '{"a":1}',
            annotations: [
              { type: "url_citation", url: "https://alibaba.com/p#x", title: "Alibaba" },
              { type: "url_citation", url: "https://alibaba.com/p", title: "otra" },
              { type: "url_citation", url: "javascript:alert(1)" },
            ],
          },
        ],
      },
    ],
  });
  assert.deepEqual(r, { texto: '{"a":1}', fuentes: [{ url: "https://alibaba.com/p", titulo: "otra" }] });
  assert.ok("error" in extraerRespuesta({ output: [] }));
  assert.ok("error" in extraerRespuesta({ error: { message: "Incorrect API key provided" } }));
});

test("Claude: el pedido lleva la búsqueda y las fotos; la respuesta junta los bloques de texto y las citas", () => {
  const c = cuerpoMensaje("claude-sonnet-5-5", { instrucciones: "i", texto: "t", imagenes: ["https://x/a.jpg"] }, true) as Record<string, unknown>;
  assert.equal(c.system, "i");
  assert.deepEqual((c.messages as { content: unknown[] }[])[0].content[1], { type: "image", source: { type: "url", url: "https://x/a.jpg" } });
  assert.equal((c.tools as { name: string }[])[0].name, "web_search");
  assert.equal("tools" in (cuerpoMensaje("m", { instrucciones: "i", texto: "t", imagenes: [] }, false) as Record<string, unknown>), false);
  const r = extraerMensaje({
    content: [
      { type: "server_tool_use", name: "web_search" },
      { type: "text", text: '{"a":', citations: [{ type: "web_search_result_location", url: "https://amazon.com/x", title: "Amazon" }, { url: "ftp://no" }] },
      { type: "text", text: "1}" },
    ],
  });
  assert.deepEqual(r, { texto: '{"a":\n1}', fuentes: [{ url: "https://amazon.com/x", titulo: "Amazon" }] });
  assert.ok("error" in extraerMensaje({ content: [], stop_reason: "max_tokens" }));
  assert.ok("error" in extraerMensaje({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }));
  assert.match(mensajeErrorClaude(401, ""), /clave/);
  assert.match(mensajeErrorClaude(429, "Your credit balance is too low"), /saldo/);
});

test("el JSON se saca aunque venga con cercas o texto alrededor", () => {
  assert.deepEqual(extraerJson('Aquí va:\n```json\n{"a":[1,2]}\n```\nlisto'), { a: [1, 2] });
  assert.equal(extraerJson("sin json"), null);
  assert.equal(extraerJson("{roto"), null);
});

test("los errores de OpenAI salen en palabras claras", () => {
  assert.match(mensajeErrorOpenAI(401, ""), /clave/);
  assert.match(mensajeErrorOpenAI(429, "You exceeded your current quota, billing"), /saldo/);
  assert.match(mensajeErrorOpenAI(404, "The model `x` does not exist"), /OPENAI_MODEL/);
});

test("los títulos de la IA se revisan: se quedan los que cumplen, se cuentan los descartados", () => {
  const p = normalizarTitulos(
    JSON.stringify({
      enfoque: "Cantidad y beneficio",
      titulos: ["Biotina para el cabello 60 cápsulas", "Biotina 60 cápsulas", "Hair growth cápsulas para el cabello x60", "biotina para el cabello 60 cápsulas", "Biotina fuerte para tu pelo 90 cápsulas"],
    }),
    "Salud",
    reglas,
  );
  assert.deepEqual(p?.titulos.map((t) => t.titulo), ["Biotina para el cabello 60 cápsulas", "Biotina fuerte para tu pelo 90 cápsulas"]);
  assert.ok(p?.titulos.every((t) => t.cumple));
  assert.equal(p?.descartados, 2); // el corto y el que tiene palabras en inglés (el repetido ya no cuenta)
  assert.equal(p?.enfoque, "Cantidad y beneficio");
});

test("si ningún título cumple, salen los más cercanos marcados para ajustarlos a mano", () => {
  const p = normalizarTitulos(JSON.stringify({ titulos: ["Biotina 60 cápsulas", "Biotina capsulas", "Biotina capsulas x60"] }), "Salud", reglas);
  assert.equal(p?.titulos.length, 3);
  assert.ok(p?.titulos.every((t) => !t.cumple));
  assert.equal(normalizarTitulos("nada", "Salud", reglas), null);
});

test("el análisis de la IA se valida: impacto y acción permitidos, máximo de prioridades", () => {
  const a = normalizarAnalisis(
    JSON.stringify({
      resumen: "Le faltan fotos y el título está en inglés.",
      prioridades: [
        { titulo: "Agregar fotos", detalle: "Tiene 3 de 7.", impacto: "alto", accion: "fotos" },
        { titulo: "Raro", detalle: "x", impacto: "enorme", accion: "inventada" },
        { titulo: "", detalle: "sin título no vale" },
      ],
      proceso: [{ sugerencia: "Pedir fotos al proveedor", por_que: "Evita generarlas" }, { sugerencia: "" }],
    }),
  );
  assert.equal(a?.prioridades.length, 2);
  assert.deepEqual(a?.prioridades[1], { titulo: "Raro", detalle: "x", impacto: "medio", accion: "otro" });
  assert.deepEqual(a?.proceso, [{ sugerencia: "Pedir fotos al proveedor", porQue: "Evita generarlas" }]);
  assert.equal(normalizarAnalisis("nada"), null);
});

test("la propuesta de descripción y ángulos se valida: largos y ángulos completos", () => {
  const ok = normalizarPropuestaTexto(
    JSON.stringify({
      descripcion: "Texto\n\n\n\nmás texto de la descripción",
      angulos: [{ nombre: "Caída", gancho: "Dile adiós", para_quien: "Adultos", objecion: "¿Funciona?" }, { nombre: "", gancho: "x" }],
      notas: "n",
    }),
    [{ url: "https://a.com", titulo: "A" }, { url: "javascript:x", titulo: "mala" }],
  );
  assert.equal(ok?.descripcion, "Texto\n\nmás texto de la descripción");
  assert.equal(ok?.angulos.length, 1);
  assert.deepEqual(ok?.fuentes, [{ url: "https://a.com", titulo: "A" }]);
  assert.equal(normalizarPropuestaTexto("nada", []), null);
});

test("el plan de fotos: tipos permitidos, sin repetir y con el tope pedido", () => {
  const p = normalizarPlanFotos(
    JSON.stringify({
      analisis: "Faltan fotos de uso",
      fotos: [
        { tipo: "uso", titulo: "En casa", instruccion: "Una mujer usando el producto en su cocina, luz natural" },
        { tipo: "uso", titulo: "otra", instruccion: "repetida en tipo, no vale nada" },
        { tipo: "testimonio", titulo: "x", instruccion: "un tipo que no existe en la lista" },
        { tipo: "comparacion", titulo: "", instruccion: "El producto junto a una moneda para ver su tamaño real" },
      ],
    }),
    2,
  );
  assert.deepEqual(p?.fotos.map((f) => f.tipo), ["uso", "comparacion"]);
  assert.equal(p?.fotos[1].titulo, "Comparación"); // sin título, el del tipo
  assert.equal(normalizarPlanFotos(JSON.stringify({ fotos: [] }), 3), null);
});

test("el pedido a Gemini pide respetar el producto de la foto y no poner textos", () => {
  const s = promptFoto({ nombre: "Gomitas" }, { tipo: "uso", instruccion: "Una persona tomando una gomita en su cocina" }, 1);
  assert.match(s, /Gomitas/);
  assert.match(s, /respeta exactamente/);
  assert.match(s, /Sin textos/);
});

test("cada recomendación de optimización tiene su asistente; las de precio no", () => {
  assert.equal(tipoIADeRecomendacion("optimizar_titulo"), "titulos");
  assert.equal(tipoIADeRecomendacion("mejorar_descripcion"), "texto");
  assert.equal(tipoIADeRecomendacion("mas_fotos"), "fotos");
  assert.equal(tipoIADeRecomendacion("subir_precio"), null);
  assert.equal(tipoIADeRecomendacion("agregar_video"), null);
});
