import { test } from "node:test";
import assert from "node:assert/strict";
import { sinResultados } from "./metricas";
import { ejemploDeAnuncio, mejorVideoDeAngulo, videoDelTexto } from "./video-ejemplo";

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

test("el video de ejemplo sale de lo que dice la recomendación", () => {
  const c = (id: string, angulo: string, productoClave: string, cpa: number, compras: number) => ({ id, nombre: `Video ${id}`, angulo, anguloNombre: angulo, rasgos: id === "d" ? ["pregunta", "UGC"] : [], productoClave, producto: productoClave, cpa, compras, miniatura: null });
  const candidatos = [c("a", "Salud prostática", "ETHIOPIAN", 7, 10), c("b", "Salud prostática", "ETHIOPIAN", 5, 3), c("c", "Salud prostática", "OTRO", 2, 9), c("d", "Parásitos intestinales", "ETHIOPIAN", 4, 8), c("e", "Salud prostática", "ETHIOPIAN", 1, 1)];
  const texto = "Subir creativos nuevos cada semana. El ángulo que mejor ha funcionado con este producto en 60 días es «Salud prostática (sobre todo próstata inflamada)» (CPA $6.81 con 96 compras): empieza por ahí.";
  // Del mismo producto, el de CPA más bajo con 2 compras o más.
  assert.equal(videoDelTexto(texto, candidatos, "ETHIOPIAN")?.id, "b");
  // Sin producto, el mejor de todos (y dice de qué producto es).
  const todos = videoDelTexto(texto, candidatos)!;
  assert.equal(todos.id, "c");
  assert.equal(todos.producto, "OTRO");
  // Un producto sin videos de ese ángulo toma el de otro.
  assert.equal(videoDelTexto(texto, candidatos, "NADA")?.id, "c");
  assert.equal(videoDelTexto("Apaga la campaña.", candidatos, "ETHIOPIAN"), null);
  assert.equal(videoDelTexto("Sube videos del ángulo «Antes y después».", candidatos, "ETHIOPIAN"), null);
  // También un gancho, un formato o el nombre de un video que funcionó.
  assert.equal(videoDelTexto("Es uno de los ganchos que mejor le va: «pregunta». Probarlo primero.", candidatos)?.id, "d");
  assert.equal(videoDelTexto("Usar más el formato «ugc».", candidatos)?.id, "d");
  assert.equal(videoDelTexto("Copia lo que hace «Video a».", candidatos)?.id, "a");
});
