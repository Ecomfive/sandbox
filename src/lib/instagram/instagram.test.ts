import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { extraerCapturas, formatoDeVideo, paginaDestinoDeTexto } from "./extraer";
import { firmaValida, tokenDeVerificacionValido } from "./firma";

const aviso = (mensaje: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  object: "instagram",
  entry: [{ id: "111", time: 1, messaging: [{ sender: { id: "222" }, recipient: { id: "111" }, timestamp: 1, message: mensaje, ...extra }] }],
});

test("firma: acepta la firma correcta del cuerpo tal como llegó", () => {
  const cuerpo = '{"object":"instagram"}';
  const firma = "sha256=" + createHmac("sha256", "secreto").update(cuerpo).digest("hex");
  assert.equal(firmaValida(cuerpo, firma, "secreto"), true);
});

test("firma: rechaza una firma de otro secreto, un cuerpo cambiado, sin cabecera y sin secreto configurado", () => {
  const cuerpo = '{"object":"instagram"}';
  const firma = "sha256=" + createHmac("sha256", "secreto").update(cuerpo).digest("hex");
  assert.equal(firmaValida(cuerpo, firma, "otro"), false);
  assert.equal(firmaValida(cuerpo + " ", firma, "secreto"), false);
  assert.equal(firmaValida(cuerpo, null, "secreto"), false);
  assert.equal(firmaValida(cuerpo, "sha256=abc", "secreto"), false);
  assert.equal(firmaValida(cuerpo, firma, undefined), false);
  assert.equal(firmaValida(cuerpo, firma, ""), false);
});

test("token de verificación: solo el idéntico y nunca sin configurar", () => {
  assert.equal(tokenDeVerificacionValido("abc", "abc"), true);
  assert.equal(tokenDeVerificacionValido("abd", "abc"), false);
  assert.equal(tokenDeVerificacionValido("abcd", "abc"), false);
  assert.equal(tokenDeVerificacionValido(null, "abc"), false);
  assert.equal(tokenDeVerificacionValido("abc", undefined), false);
  assert.equal(tokenDeVerificacionValido("", ""), false);
});

test("un reel compartido: enlace, copy e id; el archivo de video se separa del enlace", () => {
  const r = extraerCapturas(
    aviso({
      mid: "m1",
      text: "Mira este https://www.tiendaejemplo.com/producto.",
      attachments: [{ type: "ig_reel", payload: { url: "https://scontent.cdninstagram.com/v/video.mp4?x=1", title: "Masajeador 2x1", reel_video_id: 123456 } }],
    }),
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].mensajeId, "m1:0");
  assert.equal(r[0].remitenteId, "222");
  assert.equal(r[0].tipo, "reel");
  assert.equal(r[0].titulo, "Masajeador 2x1");
  assert.equal(r[0].mediaId, "123456");
  assert.equal(r[0].enlace, null);
  assert.equal(r[0].urlVideo, "https://scontent.cdninstagram.com/v/video.mp4?x=1");
  assert.equal(r[0].paginaDestino, "https://www.tiendaejemplo.com/producto");
});

test("si la dirección del adjunto es la de Instagram, es el enlace y no un video para descargar", () => {
  const r = extraerCapturas(aviso({ mid: "m2", attachments: [{ type: "ig_post", payload: { url: "https://www.instagram.com/p/ABC123/", id: 99 } }] }));
  assert.equal(r[0].tipo, "post");
  assert.equal(r[0].enlace, "https://www.instagram.com/p/ABC123/");
  assert.equal(r[0].urlVideo, null);
});

test("varios adjuntos en un mensaje dan varias capturas con llaves distintas", () => {
  const r = extraerCapturas(
    aviso({ mid: "m3", attachments: [{ type: "ig_reel", payload: { url: "https://x.cdninstagram.com/a.mp4" } }, { type: "ig_reel", payload: { url: "https://x.cdninstagram.com/b.mp4" } }] }),
  );
  assert.deepEqual(r.map((c) => c.mensajeId), ["m3:0", "m3:1"]);
});

test("se ignoran los ecos, las imágenes, los audios, las menciones y los mensajes sin remitente", () => {
  assert.equal(extraerCapturas(aviso({ mid: "e", is_echo: true, attachments: [{ type: "ig_reel", payload: { url: "https://x.cdninstagram.com/a.mp4" } }] })).length, 0);
  assert.equal(extraerCapturas(aviso({ mid: "i", attachments: [{ type: "image", payload: { url: "https://x.cdninstagram.com/a.jpg" } }] })).length, 0);
  assert.equal(extraerCapturas(aviso({ mid: "a", attachments: [{ type: "audio", payload: { url: "https://x.cdninstagram.com/a.m4a" } }] })).length, 0);
  assert.equal(extraerCapturas(aviso({ mid: "s", attachments: [{ type: "story_mention", payload: { url: "https://x.cdninstagram.com/s.jpg" } }] })).length, 0);
  assert.equal(extraerCapturas({ entry: [{ messaging: [{ message: { mid: "z", attachments: [{ type: "ig_reel", payload: {} }] } }] }] }).length, 0);
});

test("sin adjunto, pegar el enlace de un reel o una publicación también cuenta; un texto cualquiera no", () => {
  const r = extraerCapturas(aviso({ mid: "t1", text: "Este está bueno https://www.instagram.com/reel/Cxyz_123/?igsh=abc" }));
  assert.equal(r.length, 1);
  assert.equal(r[0].tipo, "reel");
  assert.equal(r[0].mensajeId, "t1:texto");
  assert.equal(extraerCapturas(aviso({ mid: "t2", text: "hola, ¿cómo va todo?" })).length, 0);
  assert.equal(extraerCapturas(aviso({ mid: "t3", text: "mi perfil https://www.instagram.com/ecomfive/" })).length, 0);
});

test("también entiende los avisos que llegan en changes[].value", () => {
  const cuerpo = {
    entry: [{ changes: [{ field: "messages", value: { sender: { id: "5" }, message: { mid: "c1", attachments: [{ type: "ig_reel", payload: { url: "https://x.cdninstagram.com/a.mp4" } }] } } }] }],
  };
  assert.equal(extraerCapturas(cuerpo).length, 1);
  assert.equal(extraerCapturas({ entry: [{ changes: [{ field: "comments", value: {} }] }] }).length, 0);
});

test("un cuerpo que no es un aviso de Meta no da nada y no falla", () => {
  for (const x of [null, undefined, "x", 5, [], {}, { entry: "x" }, { entry: [null, 3] }]) assert.deepEqual(extraerCapturas(x), []);
});

test("página de destino: la primera que no es de Instagram ni de Facebook, sin puntuación final", () => {
  assert.equal(paginaDestinoDeTexto("https://instagram.com/p/x y https://l.facebook.com/l.php?u=1 y https://tienda.com/a?b=1)."), "https://tienda.com/a?b=1");
  assert.equal(paginaDestinoDeTexto("sin enlaces"), null);
  assert.equal(paginaDestinoDeTexto("javascript:alert(1) ftp://x.com"), null);
  assert.equal(paginaDestinoDeTexto(null), null);
});

test("video: se reconoce por su firma, no por lo que diga el servidor", () => {
  const mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0]);
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]);
  const html = new TextEncoder().encode("<!doctype html><html>error</html>");
  assert.deepEqual(formatoDeVideo(mp4), { extension: "mp4", tipo: "video/mp4" });
  assert.deepEqual(formatoDeVideo(webm), { extension: "webm", tipo: "video/webm" });
  assert.equal(formatoDeVideo(html), null);
  assert.equal(formatoDeVideo(new Uint8Array()), null);
});
