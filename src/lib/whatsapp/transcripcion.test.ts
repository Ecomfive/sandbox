import assert from "node:assert/strict";
import { test } from "node:test";
import { formatoDeAudio, limpiarTranscripcion, MAX_LARGO_TRANSCRIPCION } from "./transcripcion";

test("una nota de voz de WhatsApp (ogg con opus) se acepta", () => {
  assert.deepEqual(formatoDeAudio("audio/ogg; codecs=opus"), { extension: "ogg", mime: "audio/ogg" });
  assert.deepEqual(formatoDeAudio("AUDIO/MPEG"), { extension: "mp3", mime: "audio/mpeg" });
  assert.equal(formatoDeAudio("audio/mp4")?.extension, "m4a");
});

test("el AMR y lo que no es audio no se transcriben", () => {
  assert.equal(formatoDeAudio("audio/amr"), null);
  assert.equal(formatoDeAudio("video/mp4"), null);
  assert.equal(formatoDeAudio(null), null);
});

test("sin tipo claro, se usa la extensión del nombre", () => {
  assert.equal(formatoDeAudio("", "PTT-20261030-WA0001.opus")?.mime, "audio/ogg");
  assert.equal(formatoDeAudio(null, "nota.m4a")?.extension, "m4a");
  assert.equal(formatoDeAudio(null, "nota.amr"), null);
});

test("la transcripción se limpia y se acota", () => {
  assert.equal(limpiarTranscripcion("  Hola,   buenas.  \n\n\n\nMe llegó mal.  \r\n"), "Hola,   buenas.\n\nMe llegó mal.");
  assert.equal(limpiarTranscripcion(null), "");
  const larga = limpiarTranscripcion("a".repeat(MAX_LARGO_TRANSCRIPCION + 50));
  assert.equal(larga.length, MAX_LARGO_TRANSCRIPCION + 1);
  assert.ok(larga.endsWith("…"));
});
