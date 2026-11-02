import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { abrirZip } from "./zip";

/** Un zip mínimo armado a mano: un archivo guardado tal cual y otro con deflate, como los de una exportación de WhatsApp. */
function armarZip(archivos: { nombre: string; datos: Buffer; comprimir: boolean }[]): Uint8Array {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const a of archivos) {
    const nombre = Buffer.from(a.nombre);
    const cuerpo = a.comprimir ? deflateRawSync(a.datos) : a.datos;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(a.comprimir ? 8 : 0, 8);
    local.writeUInt32LE(cuerpo.length, 18);
    local.writeUInt32LE(a.datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(a.comprimir ? 8 : 0, 10);
    central.writeUInt32LE(cuerpo.length, 20);
    central.writeUInt32LE(a.datos.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    locales.push(local, nombre, cuerpo);
    centrales.push(central, nombre);
    desplazamiento += 30 + nombre.length + cuerpo.length;
  }
  const indice = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(indice.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return new Uint8Array(Buffer.concat([...locales, indice, fin]));
}

test("abre un zip de WhatsApp: texto con deflate y una foto sin comprimir, sin carpetas", async () => {
  const chat = Buffer.from("[28/10/26, 4:13:05 p. m.] María: Hola\n".repeat(20));
  const foto = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const zip = armarZip([
    { nombre: "_chat.txt", datos: chat, comprimir: true },
    { nombre: "WhatsApp Chat - María/00000012-PHOTO.jpg", datos: foto, comprimir: false },
  ]);
  const archivos = await abrirZip(zip);
  assert.equal(archivos.length, 2);
  assert.equal(new TextDecoder().decode(archivos[0].datos), chat.toString());
  assert.equal(archivos[1].nombre, "00000012-PHOTO.jpg");
  assert.deepEqual([...archivos[1].datos], [...foto]);
});

test("lo que no es un zip da un error en palabras", async () => {
  await assert.rejects(() => abrirZip(new Uint8Array([1, 2, 3, 4, 5])), /no es un \.zip/);
});
