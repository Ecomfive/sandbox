// Notas de voz desde la bandeja (29 oct 2026). El navegador graba en WebM (Chrome) o MP4 (Safari), formatos que WhatsApp no acepta; por eso el audio grabado se decodifica a
// muestras y se codifica a MP3 aquí mismo, en el navegador, con un codificador de JavaScript. WhatsApp acepta el MP3 como audio. La parte que no depende del navegador (de
// muestras a MP3) vive aquí para poder probarla.

/** Frecuencias que el codificador de MP3 admite (MPEG-1: 32, 44,1 y 48 kHz). */
export const FRECUENCIA_VOZ = 44100;
/** Una nota de voz de una sola voz: 64 kbps mono suena claro y pesa unos 30 KB por cada 4 segundos. */
export const KBPS_VOZ = 64;
/** Lo más largo que se graba, en segundos (a 64 kbps son unos 2,4 MB: sobra para el límite de 16 MB). */
export const MAX_SEGUNDOS_VOZ = 300;

/** Pasa muestras de audio mono (de −1 a 1) a un archivo MP3. El codificador se carga al usarlo (pesa unos 150 KB y solo hace falta al grabar). */
export async function pcmAMp3(muestras: Float32Array, frecuencia: number = FRECUENCIA_VOZ, kbps: number = KBPS_VOZ): Promise<Uint8Array> {
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const pcm = new Int16Array(muestras.length);
  for (let i = 0; i < muestras.length; i++) {
    const m = Math.max(-1, Math.min(1, muestras[i]));
    pcm[i] = m < 0 ? Math.round(m * 0x8000) : Math.round(m * 0x7fff);
  }
  const codificador = new Mp3Encoder(1, frecuencia, kbps);
  const partes: Uint8Array[] = [];
  const BLOQUE = 1152;
  for (let i = 0; i < pcm.length; i += BLOQUE) {
    const parte = codificador.encodeBuffer(pcm.subarray(i, i + BLOQUE));
    if (parte.length) partes.push(parte);
  }
  const final = codificador.flush();
  if (final.length) partes.push(final);
  const total = partes.reduce((n, p) => n + p.length, 0);
  const salida = new Uint8Array(total);
  let desde = 0;
  for (const p of partes) {
    salida.set(p, desde);
    desde += p.length;
  }
  return salida;
}

/** Mezcla los canales de un audio decodificado en uno solo (el promedio). */
export function aMono(canales: Float32Array[]): Float32Array {
  if (canales.length === 1) return canales[0];
  const largo = canales[0]?.length ?? 0;
  const mono = new Float32Array(largo);
  for (const canal of canales) for (let i = 0; i < largo; i++) mono[i] += canal[i] / canales.length;
  return mono;
}
