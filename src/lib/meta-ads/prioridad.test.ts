import assert from "node:assert/strict";
import { test } from "node:test";
import { ordenDePrioridad, pendienteDeProducto, pendientesPorCampana, pendientesPorVideo } from "./prioridad";
import type { Sugerencia } from "./sugerencias";

const s = (o: Partial<Sugerencia> & Pick<Sugerencia, "clave" | "tipo" | "prioridad">): Sugerencia => ({ severidad: "media", positiva: false, titulo: o.clave, detalle: "", accion: `hacer ${o.clave}`, objeto: { tipo: "campana", id: "c1" }, gasto: 10, ...o });

test("cada campaña lleva lo más urgente que tiene y cuántas piden lo mismo", () => {
  const m = pendientesPorCampana([
    s({ clave: "cpa_subiendo:c1", tipo: "cpa_subiendo", prioridad: "observar" }),
    s({ clave: "anuncio_apagar:a1", tipo: "anuncio_apagar", prioridad: "actuar", gasto: 20 }),
    s({ clave: "anuncio_apagar:a2", tipo: "anuncio_apagar", prioridad: "actuar", gasto: 40 }),
    s({ clave: "apagar_campana:c2", tipo: "apagar_campana", prioridad: "apagar", objeto: { tipo: "campana", id: "c2" } }),
  ]);
  assert.deepEqual([m.get("c1")?.prioridad, m.get("c1")?.titulo, m.get("c1")?.cuantas], ["actuar", "anuncio_apagar:a2", 2]);
  assert.equal(m.get("c2")?.prioridad, "apagar");
  assert.deepEqual([ordenDePrioridad(m.get("c2")), ordenDePrioridad(m.get("c1")), ordenDePrioridad(null)], [0, 1, null]);
});

test("un video recibe lo suyo y lo de los anuncios que lo usan", () => {
  const videos = [{ id: "v1", anunciosDetalle: [{ id: "a1" }] }, { id: "v2", anunciosDetalle: [{ id: "a2" }] }, { id: "v3", anunciosDetalle: [{ id: "a3" }] }, { id: "v4", anunciosDetalle: [{ id: "a4" }] }];
  const m = pendientesPorVideo(
    [
      s({ clave: "video_ganador:v1", tipo: "video_ganador", prioridad: "oportunidad", objeto: { tipo: "video", id: "v1" } }),
      s({ clave: "anuncio_apagar:a2", tipo: "anuncio_apagar", prioridad: "actuar" }),
      s({ clave: "apagar_campana:c1", tipo: "apagar_campana", prioridad: "apagar", anuncios: [{ id: "a3", nombre: "V3", cifra: "$14.00 sin ventas", grupo: "apagar" }, { id: "a4", nombre: "V4", cifra: "CPA $18.00", grupo: "vigilar" }] }),
    ],
    videos,
  );
  assert.deepEqual([...m].map(([id, p]) => `${id} ${p.prioridad}`).sort(), ["v1 oportunidad", "v2 actuar", "v3 actuar"]);
  assert.equal(m.get("v3")?.accion, "Apagar V3: $14.00 sin ventas.");
});

test("un producto lleva lo peor de sus campañas y en cuántas pasa", () => {
  const apagar = { prioridad: "apagar" as const, titulo: "t", accion: "a", cuantas: 1 };
  const p = pendienteDeProducto([null, { ...apagar, prioridad: "observar" }, apagar, apagar]);
  assert.deepEqual([p?.prioridad, p?.cuantas], ["apagar", 2]);
  assert.equal(pendienteDeProducto([null, undefined]), null);
});
