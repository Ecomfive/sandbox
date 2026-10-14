import assert from "node:assert/strict";
import { test } from "node:test";
import { enlaceEnRespuesta, midDeMensaje, respuestaParaGuardar } from "./mensaje";

test("mid: sale del id de la captura sin la posición, y solo si tiene forma de id de Meta", () => {
  assert.equal(midDeMensaje("aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlE0:0"), "aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlE0");
  assert.equal(midDeMensaje("aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlE0:texto"), "aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlE0");
  for (const x of ["m1:0", "", null, undefined, "con espacios y símbolos <>/?:0", "x".repeat(700) + ":0"]) assert.equal(midDeMensaje(x), null);
});

test("enlace en la respuesta: lo encuentra en cualquier parte y lo deja sin parámetros", () => {
  assert.equal(enlaceEnRespuesta({ shares: { data: [{ link: "https://www.instagram.com/reel/DFqpz-OxUx2/?igsh=abc" }] } }), "https://www.instagram.com/reel/DFqpz-OxUx2/");
  assert.equal(enlaceEnRespuesta({ attachments: { data: [{ target: { url: "https://instagram.com/p/DeR1_WGsSMh/" } }] } }), "https://www.instagram.com/p/DeR1_WGsSMh/");
  assert.equal(enlaceEnRespuesta(["x", { a: { b: "https://www.instagram.com/tienda.ve/reel/ABC123/" } }]), "https://www.instagram.com/tienda.ve/reel/ABC123/");
});

test("enlace en la respuesta: no inventa nada con otros sitios, perfiles, errores o datos raros", () => {
  for (const x of [null, undefined, "hola", 5, [], {}, { error: { message: "Unsupported get request" } }, { link: "https://evil.example/reel/AB/" }, { link: "https://www.instagram.com/nuvotienda.ve/" }, { link: "http://www.instagram.com/p/AB/" }]) assert.equal(enlaceEnRespuesta(x), null);
  let hondo: unknown = "https://www.instagram.com/p/ABC/";
  for (let i = 0; i < 10; i++) hondo = { x: hondo };
  assert.equal(enlaceEnRespuesta(hondo), null);
});

test("respuesta para guardar: quita los parámetros de las direcciones y recorta lo muy largo", () => {
  const r = respuestaParaGuardar({ id: "1", attachments: { data: [{ image_data: { url: "https://scontent.cdninstagram.com/a.jpg?sig=secreto" } }] } }) as { attachments: { data: { image_data: { url: string } }[] } };
  assert.equal(r.attachments.data[0].image_data.url, "https://scontent.cdninstagram.com/a.jpg");
  const larga = respuestaParaGuardar({ x: "y".repeat(5000) }) as { recortada: string };
  assert.equal(larga.recortada.length, 3000);
  assert.equal(respuestaParaGuardar(undefined), null);
});
