import assert from "node:assert/strict";
import test from "node:test";
import { sonDeContenidosDistintos, sugerirUniones, textoMinutos, unionProbable, type CapturaParaUnir } from "./unir";

const T0 = Date.UTC(2026, 9, 15, 15, 0, 0);
const cap = (id: string, numero: number, minutos: number, extra: Partial<CapturaParaUnir> = {}): CapturaParaUnir => ({ id, numero, recibidoEn: new Date(T0 + minutos * 60_000).toISOString(), remitenteId: "ig1", enlace: null, tieneArchivo: false, ...extra });

// Un anuncio reenviado desde un chat: solo archivo. Compartido después con «Compartir en…»: solo enlace.
const soloArchivo = cap("a", 24, 0, { tieneArchivo: true, remitenteId: "17841461625047923" });
const conEnlace = cap("b", 28, 4, { enlace: "https://www.instagram.com/p/DazA500gZYm/", remitenteId: "web:u1" });

test("a un archivo sin enlace se le sugiere la captura con enlace de pocos minutos después", () => {
  const r = sugerirUniones(soloArchivo, [soloArchivo, conEnlace]);
  assert.equal(r.length, 1);
  assert.equal(r[0].numero, 28);
  assert.equal(r[0].minutos, 4);
  assert.deepEqual(r[0].aporta, ["enlace", "archivo"]);
  assert.equal(r[0].mismaPersona, false);
});

test("y a la captura con enlace se le sugiere el archivo, de antes o de después", () => {
  const r = sugerirUniones(conEnlace, [soloArchivo, conEnlace]);
  assert.equal(r[0].numero, 24);
});

test("no se sugiere lo que está lejos, lo que no aporta nada ni lo de otro contenido", () => {
  assert.equal(sugerirUniones(soloArchivo, [cap("c", 30, 300, { enlace: "https://www.instagram.com/p/AAAA1111/" })]).length, 0);
  // Las dos con enlace y archivo: no hay nada que una le dé a la otra.
  const completa = cap("d", 25, 1, { enlace: "https://www.instagram.com/p/AAAA1111/", tieneArchivo: true });
  assert.equal(sugerirUniones(cap("e", 26, 2, { enlace: "https://www.instagram.com/p/AAAA1111/", tieneArchivo: true }), [completa]).length, 0);
  // Enlaces distintos: son contenidos distintos.
  const otra = cap("f", 29, 3, { enlace: "https://www.instagram.com/p/OTRA9999/" });
  assert.equal(sugerirUniones(cap("g", 27, 0, { enlace: "https://www.instagram.com/p/AAAA1111/" }), [otra]).length, 0);
  assert.equal(sonDeContenidosDistintos({ enlace: "https://www.instagram.com/p/AAAA1111/" }, { enlace: "https://www.instagram.com/reel/AAAA1111/" }), false);
  assert.equal(sonDeContenidosDistintos({ enlace: null }, { enlace: "https://www.instagram.com/p/AAAA1111/" }), false);
});

test("primero la misma persona, luego la más cercana; con un máximo", () => {
  const misma = cap("m", 40, 50, { enlace: "https://www.instagram.com/p/XXXX1111/", remitenteId: "17841461625047923" });
  const cerca = cap("n", 41, 1, { enlace: "https://www.instagram.com/p/YYYY2222/", remitenteId: "web:u1" });
  const r = sugerirUniones(soloArchivo, [cerca, misma]);
  assert.deepEqual(r.map((s) => s.numero), [40, 41]);
  assert.equal(r[0].mismaPersona, true);
  const muchas = Array.from({ length: 12 }, (_, i) => cap(`z${i}`, 50 + i, i + 1, { enlace: `https://www.instagram.com/p/ZZZZ${i}000/` }));
  assert.equal(sugerirUniones(soloArchivo, muchas).length, 5);
  assert.equal(sugerirUniones(soloArchivo, muchas, 2).length, 2);
});

test("textoMinutos", () => {
  assert.equal(textoMinutos(0), "al mismo tiempo");
  assert.equal(textoMinutos(4), "4 min de diferencia");
  assert.equal(textoMinutos(60), "1 h de diferencia");
  assert.equal(textoMinutos(80), "1 h 20 min de diferencia");
});

test("unionProbable avisa solo cuando una captura de solo archivo tiene una única con enlace cerca", () => {
  assert.equal(unionProbable(soloArchivo, [conEnlace])?.numero, 28);
  // Dos candidatas: no se adivina.
  const otra = cap("h", 29, 6, { enlace: "https://www.instagram.com/p/OTRA9999/" });
  assert.equal(unionProbable(soloArchivo, [conEnlace, otra]), null);
  // Lejos: no se avisa (aunque la ficha sí la sugiera).
  assert.equal(unionProbable(soloArchivo, [cap("i", 30, 90, { enlace: "https://www.instagram.com/p/OTRA9999/" })]), null);
  // La que tiene enlace no avisa: el aviso va en la de solo archivo.
  assert.equal(unionProbable(conEnlace, [soloArchivo]), null);
});
