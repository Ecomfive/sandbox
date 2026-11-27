import { test } from "node:test";
import assert from "node:assert/strict";
import { sinResultados } from "./metricas";
import { ejemploDeAnuncio, mejorVideoDeAngulo } from "./video-ejemplo";

const r = (gasto: number, compras: number) => ({ ...sinResultados(), gasto, compras });

test("el mejor video de un ángulo: el de CPA más bajo con al menos 2 compras", () => {
  const videos = [
    { id: "a", nombre: "Bienestar A", angulo: "Salud prostática", r: r(100, 10) },
    { id: "b", nombre: "Bienestar B", angulo: "Salud prostática", r: r(30, 5) },
    { id: "c", nombre: "Barato con 1", angulo: "Salud prostática", r: r(2, 1) },
    { id: "d", nombre: "Otro ángulo", angulo: "Parásitos intestinales", r: r(10, 5) },
    { id: "e", nombre: "Mismo CPA, más compras", angulo: "Salud prostática", r: r(60, 10) },
  ];
  const v = mejorVideoDeAngulo(videos, "Salud prostática")!;
  assert.equal(v.id, "e");
  assert.equal(v.cpa, 6);
  assert.equal(v.compras, 10);
  assert.equal(mejorVideoDeAngulo(videos, "Antes y después"), null);
  assert.equal(mejorVideoDeAngulo([{ id: "x", nombre: "x", angulo: "Salud prostática", r: r(50, 0) }], "Salud prostática"), null);
});

test("un anuncio con video sirve de ejemplo; sin video, no", () => {
  const v = ejemploDeAnuncio({ videoId: "123", nombre: "Bienestar completo", numero: "V1", angulo: "Salud prostática", miniatura: "https://x/y.jpg", r: r(87.4, 10) })!;
  assert.deepEqual(v, { id: "123", nombre: "V1 · Bienestar completo", angulo: "Salud prostática", cpa: 8.74, compras: 10, dias: 30, miniatura: "https://x/y.jpg" });
  assert.equal(ejemploDeAnuncio({ videoId: null, nombre: "Imagen", angulo: null, r: r(10, 2) }), null);
  assert.equal(ejemploDeAnuncio(null), null);
  assert.equal(ejemploDeAnuncio({ videoId: "1", nombre: "Sin ventas", angulo: null, r: r(10, 0) })!.cpa, null);
});
