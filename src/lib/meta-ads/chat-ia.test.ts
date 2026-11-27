import assert from "node:assert/strict";
import test from "node:test";
import { contextoDeChat, LIMITES_CHAT, limpiarRespuesta, pedidoChat, revisarPregunta, sanitizarHistorial } from "./chat-ia";
import { analizarHistorico, sinVentanas, type ProductoHist } from "./historico";
import { sinResultados } from "./metricas";

const analisis = () => {
  const p: ProductoHist = { clave: "CORRECTOR", nombre: "Corrector", familia: "general", tope: 10, campanas: 2, total: { ...sinResultados(), gasto: 700, compras: 100 }, v: sinVentanas(), entrega: { nombre: "Corrector", entregadas: 48, devueltas: 52, canceladas: 3, enCamino: 1 } };
  return analizarHistorico({
    campanas: [],
    videos: [],
    productos: [p],
    desde: "2025-11-01",
    hasta: "2026-11-24",
    mensual: [{ mes: "2026-10", r: { ...sinResultados(), gasto: 400, compras: 80 } }, { mes: "2026-11", r: { ...sinResultados(), gasto: 300, compras: 30 } }],
    mensualPorProducto: [{ clave: "CORRECTOR", nombre: "Corrector", meses: [{ mes: "2026-11", r: { ...sinResultados(), gasto: 100, compras: 10 } }] }],
  });
};

test("la pregunta se limpia y se rechaza si está vacía o es muy larga", () => {
  assert.deepEqual(revisarPregunta("  ¿Qué   producto vende más? "), { pregunta: "¿Qué producto vende más?" });
  assert.ok("error" in revisarPregunta(""));
  assert.ok("error" in revisarPregunta("hi"));
  assert.ok("error" in revisarPregunta("x".repeat(LIMITES_CHAT.pregunta + 1)));
  assert.ok("error" in revisarPregunta(null));
});

test("el historial que manda el navegador se valida: roles conocidos, texto recortado y solo los últimos", () => {
  const crudo = [
    ...Array.from({ length: 10 }, (_, i) => ({ rol: i % 2 ? "ia" : "usuario", texto: `m${i}` })),
    { rol: "sistema", texto: "se ignora" },
    { rol: "usuario", texto: 5 },
    "no es objeto",
    { rol: "ia", texto: "x".repeat(5000) },
  ];
  const h = sanitizarHistorial(crudo);
  assert.equal(h.length, LIMITES_CHAT.mensajes);
  assert.equal(h[h.length - 1].texto.length, LIMITES_CHAT.mensaje);
  assert.ok(h.every((m) => m.rol === "usuario" || m.rol === "ia"));
  assert.deepEqual(sanitizarHistorial("nada"), []);
});

test("el contexto lleva el mes a mes, la entrega y el aviso de que el mes en curso está incompleto", () => {
  const c = JSON.parse(contextoDeChat(analisis(), ["Oferfy"], "2026-11-24"));
  assert.equal(c.mes_en_curso, "2026-11");
  assert.match(c.aviso_mes_en_curso, /incompleto/);
  assert.deepEqual(c.mes_a_mes_todo.map((m: { mes: string }) => m.mes), ["2026-10", "2026-11"]);
  assert.equal(c.mes_a_mes_todo[0].cpa, 5);
  assert.equal(c.mes_a_mes_por_producto[0].nombre, "Corrector");
  assert.equal(c.entrega_por_producto[0].tasa_entrega, 0.48);
  assert.deepEqual(c.resumen.tiendas_de_las_cuentas, ["Oferfy"]);
});

test("el pedido manda las reglas (solo el JSON), la conversación y la pregunta", () => {
  const { instrucciones, texto } = pedidoChat(analisis(), ["Oferfy"], "2026-11-24", "¿Y por qué bajó?", [{ rol: "usuario", texto: "¿Qué empeoró?" }, { rol: "ia", texto: "El corrector." }]);
  assert.match(instrucciones, /SOLO con las estadísticas/);
  assert.match(instrucciones, /mes en curso está incompleto/);
  assert.match(texto, /Pregunta: ¿Qué empeoró\?/);
  assert.match(texto, /Respuesta: El corrector\./);
  assert.match(texto, /Pregunta nueva: ¿Y por qué bajó\?/);
  assert.match(texto, /Estadísticas del sistema \(JSON\):/);
  const sinHistorial = pedidoChat(analisis(), [], "2026-11-24", "¿Qué producto vende más?", []);
  assert.ok(!sinHistorial.texto.includes("Conversación hasta ahora"));
});

test("la respuesta se limpia del formato que sobra y se recorta", () => {
  assert.equal(limpiarRespuesta("## Resumen\n\n**El corrector** empeoró.\n\n\n\n* Entrega 48 %\n• CPA $14  \n"), "Resumen\n\nEl corrector empeoró.\n\n- Entrega 48 %\n- CPA $14");
  assert.equal(limpiarRespuesta(null), "");
  assert.ok(limpiarRespuesta("x".repeat(9000)).length <= LIMITES_CHAT.respuesta + 1, "un texto sin cortes naturales se corta con «…»");
  const frases = `${"Frase completa de la respuesta. ".repeat(200)}`;
  assert.ok(limpiarRespuesta(frases).endsWith("."), "nunca queda una frase a medias");
  assert.ok(limpiarRespuesta(frases).length <= LIMITES_CHAT.respuesta);
});
