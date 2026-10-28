// Abrir en el navegador el .zip de un chat exportado «con archivos» (iPhone lo entrega así): sin librerías, con el índice del final del
// zip y `DecompressionStream("deflate-raw")`, que ya traen los navegadores y Node. Solo lo que usa una exportación de WhatsApp: archivos
// guardados sin comprimir (0) o con deflate (8); nada de zip64 ni cifrado.

export interface ArchivoDeZip {
  nombre: string;
  datos: Uint8Array;
}

const leer16 = (v: DataView, i: number) => v.getUint16(i, true);
const leer32 = (v: DataView, i: number) => v.getUint32(i, true);

async function inflar(datos: Uint8Array): Promise<Uint8Array> {
  const flujo = new Blob([datos as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

/**
 * Los archivos de un zip, con su nombre sin carpetas (WhatsApp los pone todos juntos). Con `limiteBytes` no se descomprime un archivo
 * que pasaría de ese tamaño. Lanza un error en palabras si no es un zip que se pueda leer.
 */
export async function abrirZip(bytes: Uint8Array, limiteBytes = 50 * 1024 * 1024): Promise<ArchivoDeZip[]> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // El final del índice (firma 0x06054b50) está en los últimos 64 KB (22 bytes más el comentario del zip).
  let fin = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (leer32(v, i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error("El archivo no es un .zip que se pueda leer.");
  const cantidad = leer16(v, fin + 10);
  let p = leer32(v, fin + 16);
  const salida: ArchivoDeZip[] = [];
  for (let n = 0; n < cantidad; n++) {
    if (p + 46 > bytes.length || leer32(v, p) !== 0x02014b50) throw new Error("El .zip está dañado.");
    const metodo = leer16(v, p + 10);
    const comprimido = leer32(v, p + 20);
    const tamano = leer32(v, p + 24);
    const largoNombre = leer16(v, p + 28);
    const largoExtra = leer16(v, p + 30);
    const largoComentario = leer16(v, p + 32);
    const local = leer32(v, p + 42);
    const nombreCompleto = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + largoNombre));
    p += 46 + largoNombre + largoExtra + largoComentario;
    if (nombreCompleto.endsWith("/") || nombreCompleto.startsWith("__MACOSX/")) continue;
    if (tamano > limiteBytes || comprimido === 0xffffffff) continue;
    if (leer32(v, local) !== 0x04034b50) throw new Error("El .zip está dañado.");
    const inicio = local + 30 + leer16(v, local + 26) + leer16(v, local + 28);
    const crudo = bytes.subarray(inicio, inicio + comprimido);
    const nombre = nombreCompleto.split("/").pop() ?? nombreCompleto;
    if (metodo === 0) salida.push({ nombre, datos: crudo.slice() });
    else if (metodo === 8) salida.push({ nombre, datos: await inflar(crudo) });
  }
  return salida;
}
