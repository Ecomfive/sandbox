import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectarArchivoWhatsapp } from "./archivos";
import { aMono, pcmAMp3 } from "./voz";

describe("notas de voz a MP3", () => {
  it("un tono de 2 segundos sale como un MP3 que WhatsApp acepta", async () => {
    const frecuencia = 44100;
    const muestras = new Float32Array(frecuencia * 2);
    for (let i = 0; i < muestras.length; i++) muestras[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / frecuencia);
    const mp3 = await pcmAMp3(muestras, frecuencia, 64);
    // 64 kbps durante 2 s son unos 16 000 bytes.
    assert.ok(mp3.length > 12000 && mp3.length < 22000, `tamaño inesperado: ${mp3.length}`);
    assert.equal(mp3[0], 0xff);
    assert.equal(mp3[1] & 0xe0, 0xe0);
    assert.deepEqual(detectarArchivoWhatsapp(mp3, "nota-de-voz.mp3"), { tipo: "audio", mime: "audio/mpeg" });
  });

  it("el silencio y un audio muy corto también dan un MP3 válido", async () => {
    const corto = await pcmAMp3(new Float32Array(2000), 44100);
    assert.ok(corto.length > 0);
    assert.deepEqual(detectarArchivoWhatsapp(corto, "a.mp3"), { tipo: "audio", mime: "audio/mpeg" });
  });

  it("los valores fuera de rango no rompen la codificación", async () => {
    const fuerte = new Float32Array(44100).fill(3);
    assert.ok((await pcmAMp3(fuerte, 44100)).length > 0);
  });

  it("mezcla los canales en uno", () => {
    const mono = aMono([Float32Array.from([1, 0, -1]), Float32Array.from([0, 1, -1])]);
    assert.deepEqual([...mono], [0.5, 0.5, -1]);
    const uno = Float32Array.from([0.1, 0.2]);
    assert.equal(aMono([uno]), uno);
  });
});
