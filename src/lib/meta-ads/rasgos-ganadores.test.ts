import assert from "node:assert/strict";
import test from "node:test";
import { compararGanadores, funciono, rasgosDeCampana, rasgosDeCopy, rasgosDePagina, rasgosDeVideo, rasgosParaIA, leerValorRasgos, type Entidad } from "./rasgos-ganadores";
import { sinResultados } from "./metricas";

test("el texto de un anuncio se describe con rasgos concretos", () => {
  const r = rasgosDeCopy("¿Cansado de las manchas? ✅ Fórmula con vitamina C ✅ Resultados en 2 semanas. Paga contra entrega, envío gratis. Últimas unidades: compra hoy por $29.99", "3 pasos para tu piel");
  assert.ok(r.includes("Texto del anuncio: empieza con una pregunta"));
  assert.ok(r.includes("Texto del anuncio: menciona el precio"));
  assert.ok(r.includes("Texto del anuncio: menciona el pago contra entrega"));
  assert.ok(r.includes("Texto del anuncio: menciona el envío gratis"));
  assert.ok(r.includes("Texto del anuncio: crea urgencia"));
  assert.ok(r.includes("Texto del anuncio: con lista de beneficios"));
  assert.ok(r.includes("Título: lleva un número"));
  assert.ok(r.some((x) => x.includes("medio (150 a 400") || x.includes("corto")));
  assert.deepEqual(rasgosDeCopy("hola", null), [], "un texto casi vacío no dice nada");
});

test("un video se describe por lo que la IA vio, con el momento del llamado y la duración", () => {
  const r = rasgosDeVideo({ angulo: "Energía", ganchoTipo: "Pregunta", formato: "UGC", ctaTipo: "Compra ya", duracionS: 28, ctaSegundo: 24, oferta: "2x1", recursos: ["Subtítulos", "Música"] });
  assert.ok(r.includes("Ángulo: Energía"));
  assert.ok(r.includes("Duración del video: de 16 a 30 segundos"));
  assert.ok(r.includes("Cuándo pide la compra: al final"));
  assert.ok(r.includes("Oferta en el video: la muestra"));
  assert.ok(r.includes("Recurso del video: Subtítulos"));
  assert.deepEqual(rasgosDeVideo(null), []);
  assert.deepEqual(rasgosDeCampana({ estructura: "CBO", puja: null, familia: "suplemento" }), ["Estructura de la campaña: CBO", "Tipo de producto: suplemento"]);
});

test("una página se describe por su tipo, lo que trae y cómo carga", () => {
  const html = `<html><body><h1>Corrector</h1><img src=a><img src=b><video src="v.mp4"></video><p>Reseñas de clientes ★★★★★</p><p>Solo $24.99</p><p>Pagas cuando te llega</p><button>Comprar ahora</button><p>Garantía de 30 días</p>${"palabra ".repeat(100)}</body></html>`;
  const r = rasgosDePagina("https://tienda.com/products/corrector", { bytes: 300_000, ms: 700, html });
  assert.ok(r.includes("Tipo de página: página de producto de la tienda"));
  assert.ok(r.includes("La página: trae un video"));
  assert.ok(r.includes("La página: muestra reseñas o testimonios"));
  assert.ok(r.includes("La página: muestra el precio"));
  assert.ok(r.includes("La página: dice que se paga contra entrega"));
  assert.ok(r.includes("La página: habla de garantía o devolución"));
  assert.ok(r.includes("Botones de compra: uno"));
  assert.ok(r.includes("Velocidad de la página: rápida (menos de 1 segundo)"));
  assert.ok(r.includes("Peso de la página: liviana (menos de 0,5 MB)"));
  assert.ok(rasgosDePagina("oferta.com/promo", { bytes: 3_000_000, ms: 4000, html: "<p>hola</p>" }).includes("Velocidad de la página: lenta (más de 2,5 segundos)"));
});

const ent = (id: string, gasto: number, compras: number, ctrPct: number, rasgos: string[]): Entidad => ({
  id,
  nombre: `Anuncio ${id}`,
  rasgos,
  tope: 10,
  r: { ...sinResultados(), gasto, compras, impresiones: 10_000, clics: Math.round(10_000 * (ctrPct / 100)) },
});

test("lo que comparten los anuncios con CTR alto que funcionaron se separa de lo que casi nunca tienen", () => {
  const gana = (i: number, extra: string[] = []) => ent(`g${i}`, 100, 20, 4, ["Gancho: Pregunta", "Formato: UGC", ...extra]);
  const pierde = (i: number, extra: string[] = []) => ent(`p${i}`, 100, 2, 1, ["Formato: Producto solo", ...extra]);
  const ganadores = [gana(1, ["Texto del anuncio: menciona el pago contra entrega"]), gana(2, ["Texto del anuncio: menciona el pago contra entrega"]), gana(3, ["Texto del anuncio: menciona el pago contra entrega"]), gana(4), gana(5)];
  const resto = [pierde(1, ["Texto del anuncio: crea urgencia"]), pierde(2, ["Texto del anuncio: crea urgencia"]), pierde(3, ["Texto del anuncio: crea urgencia"]), pierde(4, ["Texto del anuncio: crea urgencia"]), pierde(5), pierde(6, ["Gancho: Pregunta"])];
  const r = compararGanadores([...ganadores, ...resto, ent("poco", 10, 5, 9, ["Gancho: X"])], "ctr")!;
  assert.equal(r.ganadores, 5);
  assert.equal(r.resto, 6, "el que gastó $10 no cuenta");
  assert.equal(r.criterio, "CTR de 3 % o más y con CPA dentro del tope");
  assert.equal(r.comunes[0].rasgo, "Formato: UGC", "está en el 100 % de los ganadores y en ninguno del resto");
  assert.ok(r.comunes.some((x) => x.rasgo === "Texto del anuncio: menciona el pago contra entrega" && x.enGanadores === 3));
  assert.ok(r.evitar.some((x) => x.rasgo === "Texto del anuncio: crea urgencia" && x.enResto === 4));
  assert.ok(r.evitar.some((x) => x.rasgo === "Formato: Producto solo"));
  assert.match(r.recomendaciones[0], /Probar formato: UGC \(lo tienen 5 de 5 anuncios que funcionaron y 0 de 6 de los demás\)/);
  assert.equal(r.ejemplos.length, 3);
  const ia = rasgosParaIA(r) as Record<string, unknown>;
  assert.equal(ia.ganadores, 5);
});

test("con pocos ganadores o sin diferencias no se concluye nada, y «funcionó» pide gasto, compras y CPA dentro del tope", () => {
  assert.equal(compararGanadores([ent("a", 100, 20, 4, ["x: 1"]), ent("b", 100, 2, 1, ["x: 1"])], "ctr"), null);
  const iguales = [...Array.from({ length: 5 }, (_, i) => ent(`g${i}`, 100, 20, 4, ["Formato: UGC"])), ...Array.from({ length: 6 }, (_, i) => ent(`p${i}`, 100, 2, 1, ["Formato: UGC"]))];
  assert.equal(compararGanadores(iguales, "ctr"), null, "el rasgo está en todos: no distingue");
  assert.equal(funciono(ent("x", 100, 5, 4, [])), false, "CPA $20 con tope $10");
  assert.equal(funciono(ent("x", 100, 0, 4, [])), false);
  assert.equal(funciono(ent("x", 100, 20, 4, [])), true);
  assert.equal(leerValorRasgos({ generadoEn: "x", items: [{ metrica: "ctr", comunes: [] }, { metrica: 3 }] })!.items.length, 1);
});
