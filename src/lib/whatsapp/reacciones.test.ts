import assert from "node:assert/strict";
import test from "node:test";
import { agruparReacciones, type MensajeConReaccion } from "./reacciones";

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
