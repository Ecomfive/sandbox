import assert from "node:assert/strict";
import { test } from "node:test";
import { REGLAS_DEFECTO } from "./reglas";
import { errorOpenAI, leerSugerencias, promptTitulos, revisarTitulo } from "./titulos-ia";

const datos = { titulo: "DHT Blocker Hair Growth", nombre: "Biotina 60 cápsulas" };
const respuesta = (contenido: unknown) => ({ choices: [{ message: { content: typeof contenido === "string" ? contenido : JSON.stringify(contenido) } }] });

test("el pedido lleva el largo de Dropi y los dos nombres", () => {
  const { usuario } = promptTitulos(datos, REGLAS_DEFECTO);
  assert.match(usuario, /Entre 35 y 40 caracteres/);
  assert.match(usuario, /«DHT Blocker Hair Growth»/);
  assert.match(usuario, /«Biotina 60 cápsulas»/);
  assert.doesNotMatch(promptTitulos({ titulo: "Faja", nombre: "Faja" }, REGLAS_DEFECTO).usuario, /Nombre interno/);
});

test("se descartan los largos, los cortos, los repetidos y el título actual; se limpian comillas y punto final", () => {
  const largo = "Biotina 60 cápsulas para el crecimiento del cabello y uñas fuertes";
  const s = leerSugerencias(
    respuesta({
      sugerencias: [
        { titulo: largo, porque: "x" },
        { titulo: "Biotina", porque: "x" },
        { titulo: "«Biotina 60 cápsulas para el cabello».", porque: "Dice qué es y para qué." },
        { titulo: "biotina 60 cápsulas para el cabello", porque: "repetida" },
        { titulo: "DHT Blocker Hair Growth", porque: "la actual" },
      ],
    }),
    datos,
    REGLAS_DEFECTO,
  )!;
  assert.deepEqual(
    s.map((x) => x.titulo),
    ["Biotina 60 cápsulas para el cabello"],
  );
  assert.equal(s[0].porque, "Dice qué es y para qué");
  assert.equal(s[0].cumple, s[0].total);
});

test("primero las que cumplen más puntos", () => {
  const s = leerSugerencias(respuesta({ sugerencias: [{ titulo: "Biotina hair growth gomitas" }, { titulo: "Biotina 60 cápsulas para el cabello" }] }), datos, REGLAS_DEFECTO)!;
  assert.equal(s[0].titulo, "Biotina 60 cápsulas para el cabello");
  assert.ok(s[1].revisiones.some((r) => r.clave === "titulo_espanol" && r.estado === "falta"));
});

test("respuesta que no se entiende", () => {
  assert.equal(leerSugerencias(respuesta("no es json"), datos, REGLAS_DEFECTO), null);
  assert.equal(leerSugerencias({}, datos, REGLAS_DEFECTO), null);
  assert.deepEqual(leerSugerencias(respuesta({ sugerencias: [] }), datos, REGLAS_DEFECTO), []);
});

test("solo los puntos de título y los avisos de error", () => {
  assert.deepEqual(
    revisarTitulo("Faja lumbar para la ciática", REGLAS_DEFECTO).map((r) => r.clave),
    ["titulo_espanol", "titulo_largo", "titulo_cantidad", "titulo_angulo", "titulo_formato"],
  );
  assert.match(errorOpenAI(401), /clave/);
  assert.match(errorOpenAI(500), /error 500/);
});
