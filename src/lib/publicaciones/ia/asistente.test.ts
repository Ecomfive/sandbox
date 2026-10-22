import assert from "node:assert/strict";
import { test } from "node:test";
import { tipoIADeRecomendacion, normalizarPlanFotos, normalizarPropuestaTexto, pedidoFotos, pedidoTexto, promptFoto, type DatosPublicacionIA } from "./asistente";
import { cuerpoRespuesta, extraerJson, extraerRespuesta, mensajeErrorOpenAI } from "./openai";

const datos: DatosPublicacionIA = { nombre: "Hair Growth Capsulas", tituloDropi: null, categoria: "Salud", pais: "Panamá", precio: 9.99, producto: "HAIR/GROWTH", faltas: ["Palabras en inglés: hair, growth"], minDescripcion: 200 };

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

test("los pedidos incluyen los datos de la publicación y las reglas", () => {
  const t = pedidoTexto(datos);
  assert.match(t.texto, /Hair Growth Capsulas/);
  assert.match(t.texto, /200 caracteres/);
  assert.match(t.texto, /Palabras en inglés/);
  assert.match(t.instrucciones, /No prometas curar/);
  const f = pedidoFotos(datos, 9);
  assert.match(f.instrucciones, /Exactamente 6 fotos/); // el tope
  assert.match(f.instrucciones, /Un «testimonio» no existe/);
});

test("la propuesta de texto se valida: largos, máximo de títulos y ángulos completos", () => {
  const ok = normalizarPropuestaTexto(
    JSON.stringify({
      titulos: ["Cápsulas para el crecimiento del cabello x60", "corto", "Otro título largo y claro para el cabello", "tres", "cuatro título largo"],
      descripcion: "Texto\n\n\n\nmás texto de la descripción",
      angulos: [{ nombre: "Caída", gancho: "Dile adiós", para_quien: "Adultos", objecion: "¿Funciona?" }, { nombre: "", gancho: "x" }],
      notas: "n",
    }),
    [{ url: "https://a.com", titulo: "A" }],
  );
  assert.equal(ok?.titulos.length, 3); // «corto» y «tres» no valen; máximo 3
  assert.equal(ok?.descripcion, "Texto\n\nmás texto de la descripción");
  assert.equal(ok?.angulos.length, 1);
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
  assert.equal(tipoIADeRecomendacion("optimizar_titulo"), "texto");
  assert.equal(tipoIADeRecomendacion("mejorar_descripcion"), "texto");
  assert.equal(tipoIADeRecomendacion("mas_fotos"), "fotos");
  assert.equal(tipoIADeRecomendacion("subir_precio"), null);
  assert.equal(tipoIADeRecomendacion("agregar_video"), null);
});
