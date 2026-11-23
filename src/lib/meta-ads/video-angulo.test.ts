import assert from "node:assert/strict";
import test from "node:test";
import { anguloDeCampana, esHostDeVideoMeta, estructuraValida, normalizarAnalisisVideo, pedidoAnalisisVideo, pedidoSoloAngulo, recursosValidos, reutilizarAngulo } from "./video-angulo";

test("el pedido de ángulo pide ser específico y no forzar un ángulo amplio que ya existe", () => {
  const p = pedidoAnalisisVideo({ producto: null, copy: null, titulo: null, angulosExistentes: ["Vitalidad masculina"], soloTexto: false });
  assert.match(p, /ESPECÍFICO/);
  assert.match(p, /Salud de la próstata/);
  assert.match(p, /No fuerces un ángulo amplio/);
});

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
  // Un ángulo largo se acorta a sus primeras 8 palabras, no se descarta el análisis.
  assert.equal(normalizarAnalisisVideo('{"angulo":"uno dos tres cuatro cinco seis siete ocho nueve"}')?.angulo, "Uno dos tres cuatro cinco seis siete ocho");
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

test("el pedido también pide el llamado a la acción, la oferta, los recursos y la estructura; sin video, sin segundos", () => {
  const con = pedidoAnalisisVideo({ producto: null, copy: null, titulo: null, angulosExistentes: [], soloTexto: false });
  for (const k of ["cta_segundo", "cta_tipo", "oferta", "recursos", "estructura"]) assert.match(con, new RegExp(k));
  assert.match(con, /segundos reales/);
  assert.match(pedidoAnalisisVideo({ producto: null, copy: null, titulo: null, angulosExistentes: [], soloTexto: true }), /cta_segundo en null/);
});

test("el llamado, la oferta, los recursos y la estructura que contesta la IA se validan", () => {
  const a = normalizarAnalisisVideo(
    JSON.stringify({
      angulo: "Vitaminas para neuropatía",
      cta: "Pide el tuyo con pago contra entrega",
      cta_segundo: "25",
      cta_tipo: "Compra directa",
      oferta: "2x1 y envío gratis",
      recursos: ["testimonio", "Música", "inventado", "testimonio"],
      estructura: [
        { parte: "Gancho", desde: 0, hasta: 3, resumen: "Una mujer cuenta que compró las vitaminas" },
        { parte: "cosa rara", desde: 10, hasta: 4, resumen: "Muestra el frasco" },
        { parte: "oferta", desde: 3, hasta: 5, resumen: "" },
      ],
    }),
  );
  assert.equal(a?.cta, "Pide el tuyo con pago contra entrega");
  assert.equal(a?.ctaSegundo, 25);
  assert.equal(a?.ctaTipo, "compra directa");
  assert.deepEqual(a?.recursos, ["testimonio", "música"]);
  assert.equal(a?.estructura.length, 2, "una parte sin resumen no vale");
  assert.deepEqual(a?.estructura[1], { parte: "otro", desde: 10, hasta: 10, resumen: "Muestra el frasco" }, "el fin no va antes del inicio");
});

test("sin llamado a la acción, el tipo es «ninguno»; un segundo absurdo es «no se sabe»", () => {
  const a = normalizarAnalisisVideo(JSON.stringify({ angulo: "Ahorro", cta_segundo: 99999, estructura: "no es lista" }));
  assert.equal(a?.cta, "");
  assert.equal(a?.ctaTipo, "ninguno");
  assert.equal(a?.ctaSegundo, null);
  assert.deepEqual(a?.estructura, []);
  assert.equal(normalizarAnalisisVideo(JSON.stringify({ angulo: "Ahorro", cta: "Compra ya", cta_tipo: "xyz" }))?.ctaTipo, "otro");
  assert.deepEqual(recursosValidos("texto"), []);
  assert.deepEqual(estructuraValida(null), []);
});

test("el segundo intento tras un bloqueo por recitation no pide transcripción", () => {
  const normal = pedidoAnalisisVideo({ producto: null, copy: null, titulo: null, angulosExistentes: [], soloTexto: false });
  const sin = pedidoAnalisisVideo({ producto: null, copy: null, titulo: null, angulosExistentes: [], soloTexto: false, sinTranscribir: true });
  assert.match(normal, /"transcripcion": "lo que se dice/);
  assert.match(sin, /"transcripcion": "" \(déjala vacía\)/);
  assert.match(sin, /No copies ni transcribas literalmente/);
  assert.doesNotMatch(normal, /No copies ni transcribas/);
});

test("una respuesta cortada a la mitad se rescata en vez de dar error", () => {
  const cortada = '{"angulo": "Detox en pocas semanas", "promesa": "Limpia el cuerpo", "gancho": "Un hombre muestra el frasco", "gancho_tipo": "curiosidad", "resumen": "Testimonio", "transcripcion": "hola a todos hoy les voy a contar que';
  const a = normalizarAnalisisVideo(cortada);
  assert.equal(a?.angulo, "Detox en pocas semanas");
  assert.equal(a?.promesa, "Limpia el cuerpo");
  assert.deepEqual(a?.estructura, []);
  assert.equal(normalizarAnalisisVideo('{"promesa": "x", "resumen": "y"'), null);
  assert.equal(normalizarAnalisisVideo("no hay json"), null);
});

test("una coma de más tampoco tira el análisis", () => {
  assert.equal(normalizarAnalisisVideo('{"angulo": "Ahorro", "promesa": "x",}')?.angulo, "Ahorro");
});

test("con el video a la vista el ángulo sale del video: el texto del anuncio no se le muestra a la IA", () => {
  const conVideo = pedidoAnalisisVideo({ producto: "Shilajit", copy: "Energía para todos", titulo: "Oferta", angulosExistentes: [], soloTexto: false });
  assert.doesNotMatch(conVideo, /Energía para todos/);
  assert.match(conVideo, /ÚNICAMENTE de lo que se ve y se dice en el video/);
  const soloTexto = pedidoAnalisisVideo({ producto: "Shilajit", copy: "Energía para todos", titulo: null, angulosExistentes: [], soloTexto: true });
  assert.match(soloTexto, /Energía para todos/);
});

test("el reanálisis pide solo el ángulo, con la misma regla específica y sin texto del anuncio", () => {
  const p = pedidoSoloAngulo({ producto: "Shilajit", angulosExistentes: ["Vitalidad masculina"] });
  assert.match(p, /ESPECÍFICO/);
  assert.match(p, /ÚNICAMENTE de lo que se ve y se dice en el video/);
  assert.match(p, /\{"angulo": "…", "angulo_detalle": "…"\}/);
  assert.doesNotMatch(p, /transcripcion|estructura|cta_tipo/);
  assert.match(p, /Vitalidad masculina/);
});

test("un ángulo vago como «Beneficios clave» no se ofrece para reutilizar y se le dice a la IA que no sirve", async () => {
  const { esAnguloVago } = await import("./video-angulo");
  assert.equal(esAnguloVago("Beneficios clave"), true);
  assert.equal(esAnguloVago(" beneficios  CLAVE. "), true);
  assert.equal(esAnguloVago("Salud de la próstata"), false);
  const p = pedidoAnalisisVideo({ producto: null, copy: null, titulo: null, angulosExistentes: ["Beneficios clave", "Antes y después"], soloTexto: false });
  const linea = p.split("\n").find((l) => l.startsWith("Estos ángulos ya existen")) ?? "";
  assert.match(linea, /«Antes y después»/);
  assert.doesNotMatch(linea, /Beneficios clave/);
  assert.match(p, /NO sirven: no dicen nada/);
  assert.doesNotMatch(pedidoSoloAngulo({ producto: null, angulosExistentes: ["Beneficios clave"] }), /Estos ángulos ya existen/);
});

test("las tácticas generales llevan su detalle aparte y los demás ángulos no", async () => {
  const { esAnguloTactico } = await import("./video-angulo");
  assert.equal(esAnguloTactico("Antes y después"), true);
  assert.equal(esAnguloTactico("testimonio de cliente."), true);
  assert.equal(esAnguloTactico("Salud de la próstata"), false);
  const t = normalizarAnalisisVideo('{"angulo": "Antes y después", "angulo_detalle": "«Manchas en la cara»."}');
  assert.equal(t?.anguloDetalle, "Manchas en la cara");
  const o = normalizarAnalisisVideo('{"angulo": "Salud de la próstata", "angulo_detalle": "algo que se debe ignorar"}');
  assert.equal(o?.anguloDetalle, "");
  assert.match(pedidoAnalisisVideo({ producto: null, copy: null, titulo: null, angulosExistentes: [], soloTexto: false }), /angulo_detalle/);
  assert.match(pedidoSoloAngulo({ producto: null, angulosExistentes: [], vagoAnterior: "Beneficios clave" }), /Tu respuesta anterior fue «Beneficios clave»/);
});
