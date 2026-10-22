import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizarPlanFotos, pedidoFotos, promptFoto, type ContextoIA, type DatosPublicacionIA } from "./asistente";
import { reglasParaIA } from "./criterios";
import { FICHA_FOTO, familiaDeProducto, JUEGO_BASE, NO_SE_GENERA, textoFichaFoto, textoJuegoBase, TIPOS_FOTO, type FamiliaProducto } from "./fotos-base";

const contexto: ContextoIA = { reglas: reglasParaIA({ max_titulo: 40, min_fotos: 7, min_descripcion: 200 }), indicaciones: {}, ejemplos: { titulos: [], rechazos: [] } };
const datos = (extra: Partial<DatosPublicacionIA>): DatosPublicacionIA => ({ nombre: "Gomitas", tituloDropi: null, categoria: null, pais: "Panamá", precio: 20, producto: null, revisiones: [], competidores: [], margen: null, ventas30: null, ...extra });

test("cada tipo de foto tiene su ficha y la lista no repite tipos", () => {
  const valores = TIPOS_FOTO.map((t) => t.valor);
  assert.equal(new Set(valores).size, valores.length);
  for (const v of valores) {
    const f = FICHA_FOTO[v];
    assert.ok(f.para.length > 20 && f.como.length > 60 && f.cuida.length > 10, v);
  }
  for (const nuevo of ["ingredientes", "como_usar", "escala"]) assert.ok(valores.includes(nuevo as never), nuevo);
});

test("el juego de cada familia empieza por la principal, solo usa tipos que existen y los incluye todos una vez", () => {
  const validos = new Set<string>(TIPOS_FOTO.map((t) => t.valor));
  for (const [familia, juego] of Object.entries(JUEGO_BASE)) {
    assert.equal(juego[0], "principal", familia);
    assert.equal(new Set(juego).size, juego.length, familia);
    assert.equal(juego.length, validos.size, familia);
    for (const t of juego) assert.ok(validos.has(t), `${familia}: ${t}`);
  }
  // Un suplemento pide ingredientes enseguida; un producto general, no.
  assert.equal(JUEGO_BASE.suplemento[1], "ingredientes");
  assert.notEqual(JUEGO_BASE.general[1], "ingredientes");
});

test("se reconoce si es un suplemento, belleza o un producto general", () => {
  const casos: [string, string | null, FamiliaProducto][] = [
    ["Hair Growth Crecimiento Cabello (B280)", "Suplementos", "suplemento"],
    ["Cápsulas para el cabello 60 u", null, "suplemento"], // suplemento manda sobre belleza
    ["Crema facial hidratante", null, "belleza"],
    ["Sérum con vitamina C", null, "suplemento"], // «vitamina» cuenta como suplemento en la revisión de títulos
    ["Shampoo anticaída", "Cuidado capilar", "belleza"],
    ["Organizador de cables magnético", "Hogar", "general"],
  ];
  for (const [t, c, esperado] of casos) assert.equal(familiaDeProducto(t, c), esperado, t);
});

test("el plan de fotos recibe el juego prioritario, lo que no se genera y las reglas de ingredientes", () => {
  const p = pedidoFotos(datos({ nombre: "Gomitas de ashwagandha 60 u", categoria: "Suplementos" }), contexto, 6);
  assert.match(p.instrucciones, /suplemento o producto de salud/);
  assert.match(p.instrucciones, /principal \(Principal\) › ingredientes \(Ingredientes\) › beneficios/);
  assert.match(p.instrucciones, /Antes y después de una persona/);
  assert.match(p.instrucciones, /Panel de información o etiqueta/);
  assert.match(p.instrucciones, /no pidas esa foto/);
  const general = pedidoFotos(datos({ nombre: "Organizador de cables", categoria: "Hogar" }), contexto, 6);
  assert.match(general.instrucciones, /producto general/);
});

test("el pedido de cada foto lleva su guía profesional: cámara, luz y qué cuidar", () => {
  const p = promptFoto({ nombre: "Gomitas" }, { tipo: "ingredientes", instruccion: "Frasco con raíz de ashwagandha" }, 1);
  assert.match(p, /Guía profesional para esta foto/);
  assert.match(p, /ingredientes reales en su forma natural/);
  assert.match(p, /Solo ingredientes que aparecen en los datos/);
  assert.match(promptFoto({ nombre: "x" }, { tipo: "principal", instruccion: "y" }, 0), /85 %/);
  assert.match(promptFoto({ nombre: "x" }, { tipo: "escala", instruccion: "y" }, 0), /Lente de 50 mm/);
  assert.equal(textoFichaFoto("inexistente"), "");
});

test("el plan acepta los tipos nuevos y sigue descartando los que no existen", () => {
  const plan = normalizarPlanFotos(
    JSON.stringify({
      analisis: "Faltan fotos.",
      fotos: [
        { tipo: "ingredientes", titulo: "Ingredientes", instruccion: "El frasco con raíz de ashwagandha y hojas alrededor, fondo claro." },
        { tipo: "como_usar", titulo: "Cómo se toma", instruccion: "Una mano toma una gomita con un vaso de agua sobre la mesa." },
        { tipo: "escala", titulo: "Tamaño", instruccion: "El frasco junto a una mano que lo sostiene, mismo plano y luz." },
        { tipo: "antes_despues", titulo: "Antes y después", instruccion: "Una persona antes y después de tomarlo, lado a lado." },
      ],
    }),
    6,
  );
  assert.deepEqual(plan?.fotos.map((f) => f.tipo), ["ingredientes", "como_usar", "escala"]);
});

test("lo que no se genera con IA queda dicho en palabras", () => {
  assert.ok(NO_SE_GENERA.length >= 4);
  assert.match(textoJuegoBase("belleza"), /cuidado personal o belleza/);
});
