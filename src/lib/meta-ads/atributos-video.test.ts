import assert from "node:assert/strict";
import test from "node:test";
import { anguloDominante, composicionDeAngulos, gruposDeVideos, MEZCLA_DE_ANGULOS, mejorGrupo, patronDeEstructura, rangoDeDuracion, rangoDelLlamado, textoDeMezcla, valoresDeVideo, ventajaDeCpa } from "./atributos-video";
import { certezaDe, motivoDeCerteza, sinResultados, type Resultados } from "./metricas";
import type { AnalisisVideoVista, VideoVista } from "./vistas";

const r = (gasto: number, compras: number): Resultados => ({ ...sinResultados(), gasto, compras, impresiones: 1000 });
const analisis = (o: Partial<AnalisisVideoVista> = {}): AnalisisVideoVista => ({ estado: "analizado", origen: "video", angulo: "Antes y después", anguloDetalle: null, anguloManual: false, promesa: null, gancho: null, ganchoTipo: null, resumen: null, transcripcion: null, publico: null, formato: "testimonio", duracionS: 30, error: null, analizadoEn: "2026-11-20", version: 2, cta: null, ctaSegundo: null, ctaTipo: "compra directa", oferta: null, recursos: [], estructura: [], ...o });
const video = (id: string, resultados: Resultados, a: AnalisisVideoVista | null): VideoVista => ({ id, nombre: id, miniatura: null, producto: "Faja", angulo: null, campanas: 1, anuncios: 1, numero: null, analisis: a, anunciosDetalle: [], r: resultados, tope: 3 });

test("una campaña con 10 videos, 5 y 5, es 50 % y 50 %", () => {
  const videos = Array.from({ length: 10 }, (_, i) => ({ videoId: `v${i}`, angulo: i < 5 ? "Antes y después" : "Testimonio", gasto: 10 }));
  const c = composicionDeAngulos(videos);
  assert.deepEqual(c.angulos.map((a) => [a.angulo, a.videos, a.pct]), [["Antes y después", 5, 50], ["Testimonio", 5, 50]]);
  assert.equal(c.videosTotal, 10);
  assert.equal(c.videosConAngulo, 10);
  assert.equal(textoDeMezcla(c.angulos), "Antes y después 50 % · Testimonio 50 %");
});

test("los porcentajes siempre suman 100", () => {
  const c = composicionDeAngulos([{ videoId: "a", angulo: "A", gasto: 1 }, { videoId: "b", angulo: "B", gasto: 1 }, { videoId: "c", angulo: "C", gasto: 1 }]);
  assert.equal(c.angulos.reduce((s, x) => s + x.pct, 0), 100);
  assert.deepEqual(c.angulos.map((x) => x.pct).sort(), [33, 33, 34]);
});

test("un video repetido en varios anuncios de la campaña cuenta una vez y los que no tienen ángulo no entran", () => {
  const c = composicionDeAngulos([{ videoId: "a", angulo: "A", gasto: 5 }, { videoId: "a", angulo: "A", gasto: 7 }, { videoId: "b", angulo: null, gasto: 3 }]);
  assert.equal(c.videosTotal, 2);
  assert.equal(c.videosConAngulo, 1);
  assert.deepEqual(c.angulos, [{ angulo: "A", videos: 1, pct: 100, gasto: 12 }]);
});

test("sin ángulos no hay mezcla", () => {
  const c = composicionDeAngulos([{ videoId: "a", angulo: null, gasto: 5 }]);
  assert.deepEqual(c.angulos, []);
  assert.equal(anguloDominante(c.angulos), null);
});

test("la campaña se clasifica con el ángulo que domina (60 % o más) y, si ninguno, es una mezcla", () => {
  assert.equal(anguloDominante([{ angulo: "A", videos: 7, pct: 70, gasto: 1 }, { angulo: "B", videos: 3, pct: 30, gasto: 1 }]), "A");
  assert.equal(anguloDominante([{ angulo: "A", videos: 5, pct: 50, gasto: 1 }, { angulo: "B", videos: 5, pct: 50, gasto: 1 }]), MEZCLA_DE_ANGULOS);
  assert.equal(anguloDominante([{ angulo: "A", videos: 1, pct: 100, gasto: 1 }]), "A");
  assert.equal(anguloDominante([{ angulo: "A", videos: 3, pct: 60, gasto: 1 }, { angulo: "B", videos: 2, pct: 40, gasto: 1 }]), "A");
});

test("la estructura se escribe como un orden de partes, sin repetir ni «otro»", () => {
  assert.equal(patronDeEstructura([{ parte: "gancho" }, { parte: "problema" }, { parte: "problema" }, { parte: "otro" }, { parte: "solución" }, { parte: "oferta" }]), "Gancho → problema → solución → oferta");
  assert.equal(patronDeEstructura([{ parte: "otro" }]), null);
  assert.equal(patronDeEstructura(["gancho", "problema", "solución", "demostración", "prueba social", "oferta", "cierre"].map((parte) => ({ parte }))), "Gancho → problema → solución → demostración → prueba social → oferta …");
});

test("la duración y el momento del llamado se reparten en rangos", () => {
  assert.equal(rangoDeDuracion(15), "Hasta 15 s");
  assert.equal(rangoDeDuracion(16), "16 a 30 s");
  assert.equal(rangoDeDuracion(61), "Más de 60 s");
  assert.equal(rangoDeDuracion(0), null);
  assert.equal(rangoDeDuracion(null), null);
  assert.equal(rangoDelLlamado(0), "En los primeros 10 s");
  assert.equal(rangoDelLlamado(19), "Entre 10 y 20 s");
  assert.equal(rangoDelLlamado(30), "Después de 30 s");
  assert.equal(rangoDelLlamado(null), null);
});

test("cada dimensión usa el dato que le corresponde y calla lo que no se sabe", () => {
  const v = video("v", r(500, 20), analisis({ ganchoTipo: "pregunta", recursos: ["testimonio", "música"], oferta: "2x1", ctaSegundo: 25, estructura: [{ parte: "gancho", desde: 0, hasta: 3, resumen: "x" }, { parte: "oferta", desde: 3, hasta: 30, resumen: "y" }] }));
  assert.deepEqual(valoresDeVideo(v, "Gancho"), ["Pregunta"]);
  assert.deepEqual(valoresDeVideo(v, "Recursos"), ["Testimonio", "Música"]);
  assert.deepEqual(valoresDeVideo(v, "Oferta"), ["Con oferta concreta"]);
  assert.deepEqual(valoresDeVideo(v, "Momento del llamado"), ["Entre 20 y 30 s"]);
  assert.deepEqual(valoresDeVideo(v, "Estructura"), ["Gancho → oferta"]);
  // Un análisis viejo (versión 1) o solo de texto no mide estructura, recursos, llamado ni oferta.
  const viejo = video("w", r(500, 20), analisis({ version: 1 }));
  assert.deepEqual(valoresDeVideo(viejo, "Recursos"), []);
  assert.deepEqual(valoresDeVideo(viejo, "Oferta"), []);
  assert.deepEqual(valoresDeVideo(viejo, "Formato"), ["Testimonio"]);
  assert.deepEqual(valoresDeVideo(video("x", r(1, 0), null), "Formato"), []);
  assert.deepEqual(valoresDeVideo(video("y", r(1, 0), analisis({ estado: "error", formato: "otro" })), "Formato"), []);
  // Sin llamado a la acción no hay momento del llamado.
  assert.deepEqual(valoresDeVideo(video("z", r(1, 0), analisis({ ctaTipo: "ninguno", ctaSegundo: 5 })), "Momento del llamado"), []);
});

test("los grupos juntan los videos por gancho, un video con varios recursos cuenta en cada uno y se dice cuántos no tenían dato", () => {
  const a = video("a", r(400, 20), analisis({ ganchoTipo: "pregunta", recursos: ["testimonio", "música"] }));
  const b = video("b", r(400, 4), analisis({ ganchoTipo: "dato o cifra", recursos: ["testimonio"] }));
  const c = video("c", r(50, 1), analisis({ ganchoTipo: null }));
  const sinGasto = video("d", sinResultados(), analisis({ ganchoTipo: "pregunta" }));
  const g = gruposDeVideos([a, b, c, sinGasto]);
  assert.equal(g.videos, 3);
  assert.deepEqual(g.grupos.Gancho.map((x) => [x.nombre, x.videos]), [["Pregunta", 1], ["Dato o cifra", 1]]);
  assert.equal(g.sinDato.Gancho, 1);
  const testimonio = g.grupos.Recursos.find((x) => x.nombre === "Testimonio");
  assert.equal(testimonio?.videos, 2);
  assert.equal(testimonio?.r.gasto, 800);
  assert.equal(g.grupos.Recursos.find((x) => x.nombre === "Música")?.videos, 1);
});

test("la duración se ordena por su escala natural", () => {
  const g = gruposDeVideos([video("a", r(300, 10), analisis({ duracionS: 50 })), video("b", r(300, 20), analisis({ duracionS: 12 })), video("c", r(300, 5), analisis({ duracionS: 28 }))]);
  assert.deepEqual(g.grupos.Duración.map((x) => x.nombre), ["Hasta 15 s", "16 a 30 s", "46 a 60 s"]);
});

test("el mejor grupo es el de menor CPA entre los que ya se pueden comparar", () => {
  const g = gruposDeVideos([video("a", r(300, 30), analisis({ ganchoTipo: "pregunta" })), video("b", r(300, 10), analisis({ ganchoTipo: "dato o cifra" })), video("c", r(40, 40), analisis({ ganchoTipo: "testimonio" }))]);
  assert.equal(mejorGrupo(g.grupos.Gancho)?.nombre, "Pregunta");
  assert.equal(mejorGrupo([]), null);
});

test("la ventaja de CPA frente al promedio", () => {
  assert.equal(ventajaDeCpa({ r: r(100, 10) }, r(300, 20)), ((10 - 15) / 15) * 100);
  assert.equal(ventajaDeCpa({ r: r(100, 0) }, r(300, 20)), null);
  assert.equal(ventajaDeCpa({ r: r(100, 5) }, r(300, 0)), null);
});

test("la certeza: poca data, probable o firme", () => {
  assert.equal(certezaDe(r(50, 5), 5), "poca");
  assert.equal(certezaDe(r(150, 5), 5), "probable");
  assert.equal(certezaDe(r(400, 12), 2), "probable");
  assert.equal(certezaDe(r(400, 12), 3), "firme");
  assert.equal(certezaDe(r(400, 5), 4), "probable");
  assert.equal(certezaDe(r(400, 0), 4), "firme");
});

test("cada nivel explica qué significa y, si es probable, qué le falta para ser firme", () => {
  assert.match(motivoDeCerteza(r(50, 5), 5, "videos"), /^Poca data: menos de \$100/);
  assert.match(motivoDeCerteza(r(400, 12), 3, "videos"), /^Firme: hay datos de sobra/);
  assert.equal(motivoDeCerteza(r(109, 3), 4, "videos"), "Probable: va bien encaminado, pero todavía no es seguro. Para ser firme falta $191 más de gasto, 7 compras más.");
  assert.equal(motivoDeCerteza(r(400, 20), 2, "campañas"), "Probable: va bien encaminado, pero todavía no es seguro. Para ser firme falta 1 campaña más.");
});

test("el detalle del ángulo solo existe en las tácticas generales y sale junto a su ángulo", async () => {
  const { valoresDeVideo } = await import("./atributos-video");
  assert.deepEqual(valoresDeVideo(video("a", r(100, 5), analisis({ angulo: "Antes y después", anguloDetalle: "Manchas en la cara" })), "Detalle del ángulo"), ["Antes y después · manchas en la cara"]);
  assert.deepEqual(valoresDeVideo(video("b", r(100, 5), analisis({ angulo: "Salud de la próstata", anguloDetalle: null })), "Detalle del ángulo"), []);
});
