import assert from "node:assert/strict";
import test from "node:test";
import { anguloDeCampana, esHostDeVideoMeta, normalizarAnalisisVideo, pedidoAnalisisVideo, reutilizarAngulo } from "./video-angulo";

test("el pedido trae el producto, el texto y los ángulos que ya existen", () => {
  const p = pedidoAnalisisVideo({ producto: "Shampoo anticaspa", copy: "Adiós a la caspa en 7 días", titulo: null, angulosExistentes: ["Dolor de espalda", "Oferta 2x1"], soloTexto: false });
  assert.match(p, /Mira el video completo/);
  assert.match(p, /Shampoo anticaspa/);
  assert.match(p, /«Oferta 2x1»/);
  assert.match(p, /SOLO un JSON/);
  assert.match(pedidoAnalisisVideo({ producto: null, copy: null, titulo: null, angulosExistentes: [], soloTexto: true }), /No hay video/);
});

test("lo que contesta la IA se valida: ángulo obligatorio, textos recortados, formato conocido", () => {
  const a = normalizarAnalisisVideo('```json\n{"angulo":"«dolor de espalda».","promesa":"Alivia el dolor","gancho":"Una mujer se agarra la espalda","resumen":"x","transcripcion":"hola","publico":"mujeres","formato":"Testimonio"}\n```', ["Dolor de espalda"]);
  assert.equal(a?.angulo, "Dolor de espalda");
  assert.equal(a?.formato, "testimonio");
  assert.equal(normalizarAnalisisVideo('{"angulo":"","promesa":"x"}'), null);
  assert.equal(normalizarAnalisisVideo("no es json"), null);
  assert.equal(normalizarAnalisisVideo('{"angulo":"uno dos tres cuatro cinco seis siete ocho nueve"}'), null);
  assert.equal(normalizarAnalisisVideo('{"angulo":"Ahorro","formato":"raro"}')?.formato, "otro");
  assert.equal(normalizarAnalisisVideo(`{"angulo":"Ahorro","transcripcion":"${"a".repeat(3000)}"}`)?.transcripcion.length, 1200);
});

test("un ángulo que ya existe se reutiliza aunque cambien mayúsculas, acentos o signos", () => {
  assert.equal(reutilizarAngulo("piel mas firme!", ["Piel más firme"]), "Piel más firme");
  assert.equal(reutilizarAngulo("Regalo", ["Ahorro"]), "Regalo");
});

test("el ángulo de una campaña es el de sus videos con más gasto", () => {
  assert.equal(anguloDeCampana([{ angulo: "Ahorro", gasto: 10 }, { angulo: "Regalo", gasto: 50 }, { angulo: "Ahorro", gasto: 20 }]), "Regalo");
  assert.equal(anguloDeCampana([{ angulo: "Ahorro", gasto: 10 }, { angulo: "Regalo", gasto: 5 }, { angulo: "Regalo", gasto: 10 }]), "Regalo");
  assert.equal(anguloDeCampana([]), null);
});

test("solo se baja video de la red de archivos de Meta, por https", () => {
  assert.equal(esHostDeVideoMeta("https://video.xx.fbcdn.net/v/t42.mp4?x=1"), true);
  assert.equal(esHostDeVideoMeta("http://video.xx.fbcdn.net/v.mp4"), false);
  assert.equal(esHostDeVideoMeta("https://fbcdn.net.malo.com/v.mp4"), false);
  assert.equal(esHostDeVideoMeta("https://169.254.169.254/latest"), false);
});
