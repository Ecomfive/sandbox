import assert from "node:assert/strict";
import test from "node:test";
import { sinResultados, type Resultados } from "./metricas";
import { ordenarVideos, sentidoNatural } from "./orden-videos";
import type { VideoVista } from "./vistas";

const r = (o: Partial<Resultados>): Resultados => ({ ...sinResultados(), ...o });
const video = (id: string, o: Partial<VideoVista> = {}): VideoVista => ({ id, nombre: id, miniatura: null, producto: "Corrector", angulo: null, campanas: 1, anuncios: 1, numero: null, analisis: null, anunciosDetalle: [], r: sinResultados(), tope: 3, ...o });

const lista = [
  video("a", { r: r({ gasto: 300, compras: 100, impresiones: 20000, video3s: 9000, video15s: 3000, clics: 400 }), campanas: 2 }),
  video("b", { r: r({ gasto: 120, compras: 20, impresiones: 20000, video3s: 4000, video15s: 400, clics: 200 }), campanas: 4 }),
  video("c", { r: r({ gasto: 40, compras: 20, impresiones: 5000, video3s: 2500, video15s: 1250, clics: 100 }) }),
  video("d", { r: r({ gasto: 500, compras: 0, impresiones: 30000 }) }),
];
const ids = (v: VideoVista[]) => v.map((x) => x.id).join("");

test("por gasto, de mayor a menor y al revés", () => {
  assert.equal(ids(ordenarVideos(lista, "gasto", "desc")), "dabc");
  assert.equal(ids(ordenarVideos(lista, "gasto", "asc")), "cbad");
});

test("el CPA ordena de menor a mayor y los que no tienen compras quedan al final en los dos sentidos", () => {
  assert.equal(ids(ordenarVideos(lista, "cpa", sentidoNatural("cpa"))), "cabd");
  assert.equal(ids(ordenarVideos(lista, "cpa", "desc")), "bacd");
});

test("«mejor resultado» pone antes los de data suficiente y después los de poca data", () => {
  // a ($3.00) y b ($6.00) pasan los $100; c ($2.00) no: va después aunque su CPA sea menor.
  assert.equal(ids(ordenarVideos(lista, "mejor", "asc")), "abcd");
});

test("hook, pasan 15 s y resultado estimado", () => {
  assert.equal(ids(ordenarVideos(lista, "hook", "desc")), "cabd");
  assert.equal(ids(ordenarVideos(lista, "hold", "desc")), "cabd");
  assert.equal(ids(ordenarVideos(lista, "resultado", "desc")), "cabd");
});

test("campañas donde se usa y nombre", () => {
  assert.equal(ids(ordenarVideos(lista, "campanas", "desc")).slice(0, 2), "ba");
  assert.equal(ids(ordenarVideos(lista, "nombre", "asc")), "abcd");
  assert.equal(ids(ordenarVideos(lista, "nombre", "desc")), "dcba");
});

test("no cambia la lista original", () => {
  const antes = ids(lista);
  ordenarVideos(lista, "gasto", "asc");
  assert.equal(ids(lista), antes);
});
