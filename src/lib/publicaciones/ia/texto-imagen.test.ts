import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizarPlanFotos, pedidoFotos, promptFoto, type ContextoIA, type DatosPublicacionIA } from "./asistente";
import { reglasParaIA } from "./criterios";
import { avisoDeReintento, compararTexto, lineaRiesgosa, normalizarTextos, pedidoLeerTexto, textoDeFoto, textoLeido } from "./texto-imagen";

const contexto: ContextoIA = { reglas: reglasParaIA({ max_titulo: 40, min_fotos: 7, min_descripcion: 200 }), indicaciones: {}, ejemplos: { titulos: [], rechazos: [] } };
const datos: DatosPublicacionIA = { nombre: "Crema Perfect", tituloDropi: null, categoria: "Belleza", pais: "Panamá", precio: 20, producto: null, revisiones: [], competidores: [], margen: null, ventas30: null };

test("el texto de una imagen se limpia: sin viñetas ni números, sin comillas, cortado en una palabra, sin repetidos y con tope", () => {
  assert.deepEqual(normalizarTextos("beneficios", ["- Hidrata en profundidad", "• «Aclara las manchas»", "2) Hidrata en profundidad", "  ", "x"]), ["Hidrata en profundidad", "Aclara las manchas"]);
  assert.deepEqual(normalizarTextos("ingredientes", "Ácido hialurónico\nVitamina C\n\nNiacinamida"), ["Ácido hialurónico", "Vitamina C", "Niacinamida"]);
  const largo = normalizarTextos("beneficios", ["Hidrata la piel en profundidad durante todo el día y la noche"]);
  assert.ok(largo[0].length <= 40 && !largo[0].endsWith(" ") && "Hidrata la piel en profundidad durante todo el día y la noche".startsWith(largo[0]));
  assert.equal(normalizarTextos("beneficios", ["a1 uno", "b2 dos", "c3 tres", "d4 cuatro", "e5 cinco"]).length, 4); // máximo de beneficios
  assert.equal(normalizarTextos("ingredientes", Array.from({ length: 9 }, (_, i) => `Ingrediente ${i}`)).length, 6);
});

test("una foto que no es informativa nunca lleva texto", () => {
  for (const tipo of ["principal", "uso", "escala", "detalle", "contenido", "comparacion", "estilo_cliente"]) assert.deepEqual(normalizarTextos(tipo, ["Algo"]), [], tipo);
  assert.equal(textoDeFoto("uso", ["Algo"]), "");
});

test("se detecta lo que promete curar, tratar o garantizar y se deja lo que dice apoyo o bienestar", () => {
  for (const malo of ["Cura la diabetes", "Elimina el cáncer", "Resultados garantizados", "100% efectivo", "Adelgaza rápido", "Efecto milagro", "Sin efectos secundarios", "Trata la artritis", "Previene rigidez", "Previene lesiones", "Alivia el dolor", "Elimina el dolor de rodillas"]) assert.ok(lineaRiesgosa([malo]), malo);
  for (const bueno of ["Hidrata en profundidad", "Apoya el bienestar", "Tratamiento capilar diario", "Ayuda a unificar el tono", "Aplica 2 veces al día", "Apoyo en bienestar articular", "Favorece la movilidad", "Contribuye al bienestar de tus articulaciones"]) assert.equal(lineaRiesgosa([bueno]), undefined, bueno);
  assert.equal(lineaRiesgosa(["Hidrata", "Cura el acné", "Suaviza"]), "Cura el acné");
});

test("a Gemini se le da el texto exacto entre comillas, el título del tipo y cómo repartirlo", () => {
  const pasos = textoDeFoto("como_usar", ["Limpia tu rostro", "Aplica una capa fina", "Masajea suavemente"]);
  assert.match(pasos, /Título: «Cómo se usa»/);
  assert.match(pasos, /1\. «Limpia tu rostro»\n2\. «Aplica una capa fina»\n3\. «Masajea suavemente»/);
  assert.match(pasos, /escríbelo exactamente así, en español, con sus tildes/);
  assert.match(pasos, /No escribas ningún otro texto/);
  assert.match(pasos, /no genérica/);
  assert.match(pasos, /Montserrat/);
  assert.match(pasos, /Si el estilo del equipo define la tipografía, úsala/);
  assert.match(pasos, /Los pasos numerados/);
  const beneficios = textoDeFoto("beneficios", ["Hidrata", "Aclara"]);
  assert.match(beneficios, /Título: «Beneficios»\n- «Hidrata»\n- «Aclara»/);
  assert.match(textoDeFoto("ingredientes", ["Ácido hialurónico"]), /su nombre escrito debajo/);
  assert.equal(textoDeFoto("beneficios", []), ""); // sin líneas, sin bloque
});

test("las fotos informativas llevan el texto y las demás siguen sin letras", () => {
  const con = promptFoto({ nombre: "Crema Perfect" }, { tipo: "beneficios", instruccion: "La crema al centro", textos: ["Hidrata en profundidad"] }, 1);
  assert.match(con, /«Hidrata en profundidad»/);
  assert.match(con, /más texto que el indicado/);
  assert.doesNotMatch(con, /Sin textos, letras/);
  const sinLineas = promptFoto({ nombre: "Crema Perfect" }, { tipo: "beneficios", instruccion: "La crema al centro" }, 1);
  assert.match(sinLineas, /Sin textos, letras, logos/); // sin textos escritos queda solo visual
  const uso = promptFoto({ nombre: "Crema Perfect" }, { tipo: "uso", instruccion: "Una mujer se aplica la crema", textos: ["No debería salir"] }, 1);
  assert.match(uso, /Sin textos, letras, logos/);
  assert.doesNotMatch(uso, /No debería salir/);
});

test("el plan trae los textos de las fotos informativas, limpios y sin promesas médicas", () => {
  const plan = normalizarPlanFotos(
    JSON.stringify({
      analisis: "Faltan fotos informativas.",
      fotos: [
        { tipo: "beneficios", titulo: "Beneficios", instruccion: "La crema al centro con sus beneficios en etiquetas.", textos: ["1. Hidrata en profundidad", "Cura el acné", "Aclara las manchas"] },
        { tipo: "como_usar", titulo: "Cómo se usa", instruccion: "Tres pasos con la mano aplicando la crema.", textos: ["Limpia tu rostro", "Aplica una capa fina"] },
        { tipo: "uso", titulo: "En uso", instruccion: "Una mujer se aplica la crema frente al espejo.", textos: ["No va"] },
      ],
    }),
    6,
  );
  assert.deepEqual(plan?.fotos[0].textos, ["Hidrata en profundidad", "Aclara las manchas"]);
  assert.deepEqual(plan?.fotos[1].textos, ["Limpia tu rostro", "Aplica una capa fina"]);
  assert.deepEqual(plan?.fotos[2].textos, []);
  assert.equal(plan?.fotos[0].textoOk, null);
});

test("el pedido del plan explica qué fotos llevan texto y de dónde sale", () => {
  const p = pedidoFotos(datos, contexto, 6).instrucciones;
  assert.match(p, /Solo las fotos de beneficios, ingredientes y cómo se usa llevan texto/);
  assert.match(p, /«textos»/);
  assert.match(p, /nunca curar, tratar ni garantizar/);
  assert.match(p, /si no los puedes confirmar, no pidas esa foto/);
  assert.match(p, /\"textos\":\[\"…\"\]/);
});

test("lo escrito en la imagen se compara con lo pedido: sin importar mayúsculas ni signos, pero con tildes", () => {
  assert.deepEqual(compararTexto(["Hidrata en profundidad", "Ácido hialurónico"], "HIDRATA EN PROFUNDIDAD\nÁcido hialurónico"), { ok: true, faltantes: [] });
  assert.deepEqual(compararTexto(["Aplica una capa fina"], "1. Aplica una\ncapa fina."), { ok: true, faltantes: [] }); // renglón partido y numeración
  const mal = compararTexto(["Ácido hialurónico", "Vitamina C"], "Acido hialuronico\nVitamina C");
  assert.equal(mal.ok, false);
  assert.deepEqual(mal.faltantes, ["Ácido hialurónico"]);
  assert.deepEqual(compararTexto(["Niacinamida"], "Niacinamda").faltantes, ["Niacinamida"]);
  assert.equal(compararTexto(["Hidrata"], "").ok, false);
  assert.equal(compararTexto([], "lo que sea").ok, true);
});

test("lo que lee la IA de la imagen sale del JSON o, si no vino JSON, de la respuesta", () => {
  assert.equal(textoLeido('```json\n{"texto":"Hidrata\\nAclara"}\n```'), "Hidrata\nAclara");
  assert.equal(textoLeido("Hidrata y aclara"), "Hidrata y aclara");
  assert.match(pedidoLeerTexto().instrucciones, /NO corrijas la ortografía/);
  assert.match(avisoDeReintento(["Ácido hialurónico", "Vitamina C"]), /«Ácido hialurónico», «Vitamina C»/);
});
