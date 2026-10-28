import assert from "node:assert/strict";
import { test } from "node:test";
import { aUtc, autoresDe, leerChatExportado, nombreDelArchivo, numerarRepetidos, proponerNosotros, tipoDeArchivo, zonaPorNumero } from "./importar";

test("Android en español: fecha, hora con p. m., autor, varias líneas y avisos sin autor", () => {
  const texto = [
    "28/10/26, 4:10 p. m. - Los mensajes y las llamadas están cifrados de extremo a extremo.",
    "28/10/26, 4:13 p. m. - María G.: Hola",
    "28/10/26, 4:14 p. m. - María G.: ¿Ya salió mi pedido?",
    "Lo necesito mañana",
    "28/10/26, 4:20 p. m. - Ecomfive Atención: Sí, sale hoy <Se editó este mensaje.>",
  ].join("\n");
  const m = leerChatExportado(texto);
  assert.equal(m.length, 3);
  assert.deepEqual(m[0], { local: "2026-10-28T16:13:00", autor: "María G.", texto: "Hola", archivo: null, tipo: "texto", omitido: false });
  assert.equal(m[1].texto, "¿Ya salió mi pedido?\nLo necesito mañana");
  assert.equal(m[2].texto, "Sí, sale hoy");
});

test("iPhone: corchetes, segundos, marcas invisibles y archivos adjuntos u omitidos", () => {
  const texto = [
    "[28/10/26, 4:13:05 p. m.] María G.: Hola",
    "‎[28/10/26, 4:13:40 p. m.] María G.: ‎<adjunto: 00000012-PHOTO-2026-10-28-16-13-40.jpg>",
    "[28/10/26, 4:15:00 p. m.] Ecomfive: ‎audio omitido",
  ].join("\n");
  const m = leerChatExportado(texto);
  assert.equal(m.length, 3);
  assert.equal(m[0].local, "2026-10-28T16:13:05");
  assert.equal(m[1].archivo, "00000012-PHOTO-2026-10-28-16-13-40.jpg");
  assert.equal(m[1].tipo, "imagen");
  assert.equal(m[2].omitido, true);
  assert.match(m[2].texto ?? "", /Audio/);
});

test("Android: archivo adjunto con su pie, multimedia omitido y 24 horas", () => {
  const texto = ["28/10/2026 16:13 - María: IMG-20261028-WA0003.jpg (archivo adjunto)", "Esta es la caja", "28/10/2026 16:14 - María: <Multimedia omitido>", "28/10/2026 0:05 - Pedro: tarde"].join("\n");
  const m = leerChatExportado(texto);
  assert.equal(m[0].archivo, "IMG-20261028-WA0003.jpg");
  assert.equal(m[0].texto, "Esta es la caja");
  assert.equal(m[1].omitido, true);
  assert.equal(m[2].local, "2026-10-28T00:05:00");
});

test("inglés de EE. UU.: mes primero cuando el segundo número pasa de 12", () => {
  const m = leerChatExportado(["10/28/26, 4:13 PM - Maria: Hi", "11/2/26, 9:00 AM - Maria: <Media omitted>"].join("\n"));
  assert.equal(m[0].local, "2026-10-28T16:13:00");
  assert.equal(m[1].local, "2026-11-02T09:00:00");
});

test("hora del celular a UTC y zona por el número de la empresa", () => {
  assert.equal(aUtc("2026-10-28T16:13:05", -240), "2026-10-28T20:13:05.000Z");
  assert.equal(aUtc("2026-10-28T23:30:00", -300), "2026-10-29T04:30:00.000Z");
  assert.equal(zonaPorNumero("+58 422 0350576"), -240);
  assert.equal(zonaPorNumero("+50766604929"), -300);
  assert.equal(zonaPorNumero("+50688901122"), -360);
});

test("autores y quién es la empresa", () => {
  const m = leerChatExportado(["1/10/26, 9:00 - María G.: a", "1/10/26, 9:01 - Ecomfive: b", "1/10/26, 9:02 - María G.: c"].join("\n"));
  assert.deepEqual(autoresDe(m), [{ nombre: "María G.", mensajes: 2 }, { nombre: "Ecomfive", mensajes: 1 }]);
  assert.deepEqual(proponerNosotros(["María G.", "Ecomfive"], ["Maria G."]), ["Ecomfive"]);
  assert.deepEqual(proponerNosotros(["A", "B"], ["Otro"]), []);
});

test("tipo de archivo por su extensión", () => {
  assert.equal(tipoDeArchivo("PTT-20261028-WA0001.opus").tipo, "audio");
  assert.equal(tipoDeArchivo("VID-20261028-WA0001.mp4").mime, "video/mp4");
  assert.equal(tipoDeArchivo("STK-20261028-WA0001.webp").tipo, "sticker");
  assert.equal(tipoDeArchivo("factura.pdf").tipo, "documento");
});

test("contacto por el nombre del archivo y repetidos numerados", () => {
  assert.equal(nombreDelArchivo("Chat de WhatsApp con María G..txt"), "María G.");
  assert.equal(nombreDelArchivo("WhatsApp Chat - +58 412 5550000.zip"), "+58 412 5550000");
  assert.equal(nombreDelArchivo("_chat.txt"), null);
  const m = leerChatExportado(["1/10/26, 9:00 - Ana: ok", "1/10/26, 9:00 - Ana: ok", "1/10/26, 9:01 - Ana: ok"].join("\n"));
  assert.deepEqual(numerarRepetidos(m), [0, 1, 0]);
});

test("nunca lanza con basura", () => {
  assert.deepEqual(leerChatExportado(""), []);
  assert.deepEqual(leerChatExportado("hola\nmundo"), []);
});
