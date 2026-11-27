import assert from "node:assert/strict";
import test from "node:test";
import { CATALOGO_COLUMNAS } from "./columnas";
import { sinResultados, type Resultados } from "./metricas";
import { MAX_ORDENES, ordenarPor, ordenValido, siguienteCriterio } from "./orden";
import { CRITERIOS_CAMPANAS, CRITERIOS_GRUPOS, CRITERIOS_PRODUCTOS, CRITERIOS_VIDEOS, ORDEN_CAMPANAS, ORDEN_PRODUCTOS, ORDEN_VIDEOS } from "./orden-listas";
import type { Grupo, VideoVista } from "./vistas";

const r = (o: Partial<Resultados>): Resultados => ({ ...sinResultados(), ...o });
const video = (id: string, o: Partial<VideoVista> = {}): VideoVista => ({ id, nombre: id, miniatura: null, producto: "Corrector", angulo: null, campanas: 1, anuncios: 1, numero: null, analisis: null, anunciosDetalle: [], r: sinResultados(), tope: 3, ...o });

const lista = [
  video("a", { r: r({ gasto: 300, compras: 100, impresiones: 20000, video3s: 9000, video15s: 3000, clics: 400 }), campanas: 2 }),
  video("b", { r: r({ gasto: 120, compras: 20, impresiones: 20000, video3s: 4000, video15s: 400, clics: 200 }), campanas: 4 }),
  video("c", { r: r({ gasto: 40, compras: 20, impresiones: 5000, video3s: 2500, video15s: 1250, clics: 100 }) }),
  video("d", { r: r({ gasto: 500, compras: 0, impresiones: 30000 }) }),
];
const ids = (v: readonly VideoVista[]) => v.map((x) => x.id).join("");
const por = (criterio: string, sentido: "asc" | "desc") => ids(ordenarPor(lista, CRITERIOS_VIDEOS, [{ criterio, sentido }], (v) => v.r.gasto));

test("por gasto, de mayor a menor y al revés", () => {
  assert.equal(por("gasto", "desc"), "dabc");
  assert.equal(por("gasto", "asc"), "cbad");
});

test("el CPA ordena en los dos sentidos y los que no tienen compras quedan al final en ambos", () => {
  assert.equal(CRITERIOS_VIDEOS.find((c) => c.valor === "cpa")!.sentido, "asc", "el CPA arranca de menor a mayor");
  assert.equal(por("cpa", "asc"), "cabd");
  assert.equal(por("cpa", "desc"), "bacd");
});

test("«mejor resultado» pone antes los de data suficiente y después los de poca data", () => {
  // a ($3.00) y b ($6.00) pasan los $100; c ($2.00) no: va después aunque su CPA sea menor.
  assert.equal(por("mejor", "asc"), "abcd");
});

test("hook, pasan 15 s, resultado, campañas donde se usa y nombre", () => {
  assert.equal(por("hook", "desc"), "cabd");
  assert.equal(por("hold", "desc"), "cabd");
  assert.equal(por("resultado", "desc"), "cabd");
  assert.equal(por("campanas", "desc").slice(0, 2), "ba");
  assert.equal(por("nombre", "asc"), "abcd");
  assert.equal(por("nombre", "desc"), "dcba");
});

test("«luego por» desempata: el segundo orden solo cuenta cuando el primero empata", () => {
  const empatados = ["x", "y", "z"].map((id, i) => video(id, { campanas: 1, r: r({ gasto: 100 + i * 10, compras: 10 }) }));
  const dos = (segundo: "asc" | "desc") => ids(ordenarPor(empatados, CRITERIOS_VIDEOS, [{ criterio: "campanas", sentido: "desc" }, { criterio: "gasto", sentido: segundo }]));
  assert.equal(dos("asc"), "xyz");
  assert.equal(dos("desc"), "zyx");
});

test("no cambia la lista original y un criterio que no existe no ordena", () => {
  const antes = ids(lista);
  ordenarPor(lista, CRITERIOS_VIDEOS, [{ criterio: "gasto", sentido: "asc" }]);
  assert.equal(ids(lista), antes);
  assert.equal(ids(ordenarPor(lista, CRITERIOS_VIDEOS, [{ criterio: "inventado", sentido: "asc" }])), antes);
});

test("toda métrica del catálogo se puede ordenar en todas las listas (la frecuencia solo donde existe)", () => {
  const claves = (l: { valor: string }[]) => new Set(l.map((c) => c.valor));
  for (const c of CATALOGO_COLUMNAS) {
    assert.ok(claves(CRITERIOS_CAMPANAS).has(c.clave), `campañas sin ${c.clave}`);
    if (c.clave !== "frecuencia") {
      for (const l of [CRITERIOS_VIDEOS, CRITERIOS_PRODUCTOS, CRITERIOS_GRUPOS]) assert.ok(claves(l).has(c.clave), `sin ${c.clave}`);
    }
  }
  for (const [criterios, defecto] of [[CRITERIOS_CAMPANAS, ORDEN_CAMPANAS], [CRITERIOS_PRODUCTOS, ORDEN_PRODUCTOS], [CRITERIOS_VIDEOS, ORDEN_VIDEOS]] as const) {
    assert.equal(new Set(criterios.map((c) => c.valor)).size, criterios.length, "sin criterios repetidos");
    for (const o of defecto) assert.ok(criterios.some((c) => c.valor === o.criterio));
  }
});

test("lo guardado en el navegador se valida: solo criterios que existen, sin repetir, hasta tres", () => {
  const defecto = ORDEN_VIDEOS;
  assert.deepEqual(ordenValido(null, CRITERIOS_VIDEOS, defecto), defecto);
  assert.deepEqual(ordenValido([{ criterio: "no-existe" }], CRITERIOS_VIDEOS, defecto), defecto);
  const v = ordenValido([{ criterio: "cpa", sentido: "desc" }, { criterio: "cpa" }, { criterio: "gasto", sentido: "raro" }, { criterio: "hook", sentido: "asc" }, { criterio: "ctr" }], CRITERIOS_VIDEOS, defecto);
  assert.deepEqual(v, [{ criterio: "cpa", sentido: "desc" }, { criterio: "gasto", sentido: "desc" }, { criterio: "hook", sentido: "asc" }]);
  assert.equal(v.length, MAX_ORDENES);
});

test("un «luego por» nuevo arranca con una métrica que no se use, y no pasa de tres", () => {
  assert.deepEqual(siguienteCriterio(CRITERIOS_VIDEOS, [{ criterio: "gasto", sentido: "desc" }]), { criterio: "compras", sentido: "desc" });
  assert.equal(siguienteCriterio(CRITERIOS_VIDEOS, [{ criterio: "a", sentido: "asc" }, { criterio: "b", sentido: "asc" }, { criterio: "c", sentido: "asc" }]), null);
});

test("las tablas de «Qué funciona» ordenan por el resultado ya sumado del grupo", () => {
  const g = (nombre: string, gasto: number, compras: number, resultado: number): Grupo => ({ nombre, campanas: 1, videos: 1, r: r({ gasto, compras }), resultado, confiable: true, certeza: "firme" });
  const grupos = [g("a", 100, 10, 5), g("b", 100, 20, 50), g("c", 0, 0, 0)];
  assert.equal(ordenarPor(grupos, CRITERIOS_GRUPOS, [{ criterio: "resultado", sentido: "desc" }]).map((x) => x.nombre).join(""), "bac");
  assert.equal(ordenarPor(grupos, CRITERIOS_GRUPOS, [{ criterio: "cpa", sentido: "desc" }]).map((x) => x.nombre).join(""), "abc");
});
