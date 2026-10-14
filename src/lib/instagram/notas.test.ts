import assert from "node:assert/strict";
import { test } from "node:test";
import { extraerNotas } from "./extraer";

const aviso = (mensaje: Record<string, unknown>) => ({
  object: "instagram",
  entry: [{ id: "111", time: 1, messaging: [{ sender: { id: "222" }, recipient: { id: "111" }, timestamp: 1, message: mensaje }] }],
});

test("nota: el texto suelto que se escribe al compartir se lee aparte, con su página de destino", () => {
  const n = extraerNotas(aviso({ mid: "n1", text: "Mira esta tienda https://tienda.com/p/crema, buen precio" }));
  assert.equal(n.length, 1);
  assert.equal(n[0].remitenteId, "222");
  assert.equal(n[0].mensajeId, "n1");
  assert.equal(n[0].paginaDestino, "https://tienda.com/p/crema");
  // Sin enlace de tienda sigue siendo una nota, pero sin página de destino.
  assert.equal(extraerNotas(aviso({ mid: "n2", text: "este está bueno" }))[0].paginaDestino, null);
  assert.equal(extraerNotas(aviso({ mid: "n3", text: "mira https://www.instagram.com/tienda/" }))[0].paginaDestino, null);
});

test("nota: no cuentan los ecos, los adjuntos, los enlaces de reel (que son capturas) ni el texto vacío", () => {
  assert.equal(extraerNotas(aviso({ mid: "e1", is_echo: true, text: "https://tienda.com" })).length, 0);
  assert.equal(extraerNotas(aviso({ mid: "a1", text: "https://tienda.com", attachments: [{ type: "ig_reel", payload: { url: "https://www.instagram.com/reel/AB/" } }] })).length, 0);
  assert.equal(extraerNotas(aviso({ mid: "r1", text: "mira https://www.instagram.com/reel/Cxyz_123/" })).length, 0);
  assert.equal(extraerNotas(aviso({ mid: "v1", text: "   " })).length, 0);
  assert.equal(extraerNotas({ entry: [{ messaging: [{ message: { mid: "x", text: "hola" } }] }] }).length, 0);
  for (const x of [null, undefined, "x", 5, [], {}]) assert.deepEqual(extraerNotas(x), []);
});

test("nota: también entiende los avisos que llegan en changes[].value", () => {
  const cuerpo = { entry: [{ changes: [{ field: "messages", value: { sender: { id: "9" }, message: { mid: "c1", text: "https://tienda.com/x" } } }] }] };
  const n = extraerNotas(cuerpo);
  assert.equal(n.length, 1);
  assert.equal(n[0].paginaDestino, "https://tienda.com/x");
});
