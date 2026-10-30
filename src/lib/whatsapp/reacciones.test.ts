import assert from "node:assert/strict";
import test from "node:test";
import { agruparReacciones, emojiDeReaccion, miReaccion, REACCIONES_RAPIDAS, type MensajeConReaccion, agruparReaccionesInternas } from "./reacciones";

let n = 0;
const msj = (direccion: MensajeConReaccion["direccion"], texto: string, waId: string | null = `w${++n}`): MensajeConReaccion => ({ id: `m${++n}`, direccion, tipo: "texto", texto, waId, reaccionA: null });
const reaccion = (direccion: "entrante" | "saliente", emoji: string | null, reaccionA: string | null): MensajeConReaccion => ({ id: `r${++n}`, direccion, tipo: "reaccion", texto: emoji, waId: `wr${n}`, reaccionA });

test("la reacción va sobre el mensaje reaccionado y deja de verse como mensaje", () => {
  const a = msj("saliente", "Sí, claro. Ya te comparto el ID", "wa-1");
  const b = msj("entrante", "Muy bien y tú?", "wa-2");
  const c = msj("entrante", "Perfecto, muchas gracias", "wa-3");
  const r = reaccion("entrante", "❤️", "wa-1");
  const { visibles, reacciones } = agruparReacciones([a, b, c, r]);
  assert.deepEqual(visibles.map((m) => m.id), [a.id, b.id, c.id]);
  assert.deepEqual(reacciones.get(a.id), [{ emoji: "❤️", direccion: "entrante" }]);
  assert.equal(reacciones.has(c.id), false);
});

test("cada lado tiene una sola reacción por mensaje: la última manda y sin emoji se quita", () => {
  const a = msj("saliente", "Hola", "wa-10");
  const cambia = agruparReacciones([a, reaccion("entrante", "👍", "wa-10"), reaccion("entrante", "😂", "wa-10")]);
  assert.deepEqual(cambia.reacciones.get(a.id), [{ emoji: "😂", direccion: "entrante" }]);
  const quita = agruparReacciones([a, reaccion("entrante", "👍", "wa-10"), reaccion("entrante", null, "wa-10")]);
  assert.equal(quita.reacciones.has(a.id), false);
  // Los dos lados pueden reaccionar al mismo mensaje.
  const dos = agruparReacciones([a, reaccion("entrante", "❤️", "wa-10"), reaccion("saliente", "🙏", "wa-10")]);
  assert.deepEqual(dos.reacciones.get(a.id), [{ emoji: "❤️", direccion: "entrante" }, { emoji: "🙏", direccion: "saliente" }]);
});

test("las reacciones de antes (sin mensaje reaccionado) van sobre el último mensaje del otro lado", () => {
  const a = msj("saliente", "Ya te comparto el ID");
  const b = msj("entrante", "Perfecto, muchas gracias");
  const { visibles, reacciones } = agruparReacciones([a, b, reaccion("entrante", "❤️", null)]);
  assert.equal(visibles.length, 2);
  assert.deepEqual(reacciones.get(a.id), [{ emoji: "❤️", direccion: "entrante" }]);
});

test("si el mensaje reaccionado no está cargado, la reacción no se ve suelta", () => {
  const a = msj("entrante", "Hola", "wa-20");
  const { visibles, reacciones } = agruparReacciones([a, reaccion("saliente", "👍", "wa-que-no-esta")]);
  assert.deepEqual(visibles.map((m) => m.id), [a.id]);
  assert.equal(reacciones.size, 0);
});

test("ofrece seis reacciones rápidas y todas son un solo emoji válido", () => {
  assert.equal(REACCIONES_RAPIDAS.length, 6);
  for (const e of REACCIONES_RAPIDAS) assert.equal(emojiDeReaccion(e), e);
});

test("acepta un emoji (con variante o tono de piel) y una cadena vacía para quitar la reacción", () => {
  assert.equal(emojiDeReaccion("  👍🏽 "), "👍🏽");
  assert.equal(emojiDeReaccion("❤️"), "❤️");
  assert.equal(emojiDeReaccion(""), "");
  assert.equal(emojiDeReaccion("   "), "");
});

test("rechaza texto, varios emojis y lo que no es una cadena", () => {
  assert.equal(emojiDeReaccion("hola"), null);
  assert.equal(emojiDeReaccion("👍👍"), null);
  assert.equal(emojiDeReaccion("👍 ok"), null);
  assert.equal(emojiDeReaccion(5), null);
  assert.equal(emojiDeReaccion(undefined), null);
  assert.equal(emojiDeReaccion("a".repeat(40)), null);
});

test("dice con qué emoji reaccionó el equipo", () => {
  assert.equal(miReaccion([{ emoji: "👍", direccion: "entrante" }, { emoji: "❤️", direccion: "saliente" }]), "❤️");
  assert.equal(miReaccion([{ emoji: "👍", direccion: "entrante" }]), null);
  assert.equal(miReaccion(undefined), null);
});

test("chat interno: cada persona reacciona por su cuenta y los emojis se juntan con quiénes los pusieron", () => {
  const m = (id: string, extra: object = {}) => ({ id, direccion: "nota" as const, tipo: "texto", texto: "hola", ...extra });
  const mensajes = [
    m("1", { waId: "int:g1:c1", autorId: "u-nicole", autor: "Nicole" }),
    m("2", { tipo: "reaccion", texto: "👍", reaccionA: "int:g1:c1", autorId: "u-francis", autor: "Francis" }),
    m("3", { tipo: "reaccion", texto: "👍", reaccionA: "int:g1:c1", autorId: "u-ceo", autor: "Alcides" }),
    m("4", { tipo: "reaccion", texto: "❤️", reaccionA: "int:g1:c1", autorId: "u-nicole", autor: "Nicole" }),
  ];
  const { visibles, reacciones } = agruparReaccionesInternas(mensajes, "u-ceo");
  assert.deepEqual(visibles.map((x) => x.id), ["1"]);
  const r = reacciones.get("1")!;
  assert.deepEqual(r.map((x) => [x.emoji, x.autores]), [["👍", ["Francis", "Alcides"]], ["❤️", ["Nicole"]]]);
  assert.equal(r[0].mia, true);
  assert.equal(r[1].mia, false);
  assert.equal(miReaccion(r), "👍");
});

test("chat interno: la última reacción de una persona es la que vale y una vacía la quita", () => {
  const m = (id: string, extra: object = {}) => ({ id, direccion: "nota" as const, tipo: "texto", texto: "hola", ...extra });
  const mensajes = [
    m("1", { waId: "int:g1:c1" }),
    m("2", { tipo: "reaccion", texto: "👍", reaccionA: "int:g1:c1", autorId: "u1", autor: "Ana" }),
    m("3", { tipo: "reaccion", texto: "😂", reaccionA: "int:g1:c1", autorId: "u1", autor: "Ana" }),
    m("4", { tipo: "reaccion", texto: "🙏", reaccionA: "int:g1:c1", autorId: "u2", autor: "Luis" }),
    m("5", { tipo: "reaccion", texto: null, reaccionA: "int:g1:c1", autorId: "u2", autor: "Luis" }),
  ];
  const { reacciones } = agruparReaccionesInternas(mensajes, "u9");
  assert.deepEqual(reacciones.get("1")!.map((x) => [x.emoji, x.autores]), [["😂", ["Ana"]]]);
  assert.equal(miReaccion(reacciones.get("1")), null);
});

test("chat interno: una reacción a un mensaje que no está cargado no se dibuja suelta", () => {
  const { visibles, reacciones } = agruparReaccionesInternas([{ id: "9", direccion: "nota" as const, tipo: "reaccion", texto: "👍", reaccionA: "int:otro:c", autorId: "u1", autor: "Ana" }], "u1");
  assert.equal(visibles.length, 0);
  assert.equal(reacciones.size, 0);
});
