import assert from "node:assert/strict";
import { test } from "node:test";
import { codigoDePublicacion, datosQueFaltan, repetidasDe } from "./repetidas";

test("repetidas: el código sale del enlace de un reel o una publicación de instagram.com", () => {
  assert.equal(codigoDePublicacion("https://www.instagram.com/p/DeR1_WGsSMh/"), "DeR1_WGsSMh");
  assert.equal(codigoDePublicacion("https://www.instagram.com/reel/DFqpz-OxUx2/?igsh=abc"), "DFqpz-OxUx2");
  assert.equal(codigoDePublicacion("https://www.instagram.com/nuvotienda.ve/reel/DFqpz-OxUx2/"), "DFqpz-OxUx2");
  assert.equal(codigoDePublicacion("https://www.instagram.com/nuvotienda.ve/"), null);
  assert.equal(codigoDePublicacion("https://evil.example/p/ABC/"), null);
  assert.equal(codigoDePublicacion(null), null);
});

test("repetidas: la misma publicación por el id de Meta o por el enlace, con la primera como original", () => {
  const r = repetidasDe([
    { numero: 5, enlace: "https://www.instagram.com/p/DeR1_WGsSMh/", mediaId: "111" },
    { numero: 9, enlace: "https://www.instagram.com/p/DeR1_WGsSMh/?igsh=x", mediaId: "222" },
    { numero: 11, enlace: null, mediaId: "333" },
    { numero: 12, enlace: "https://www.instagram.com/p/DdmZSerggFG/", mediaId: "333" },
    { numero: 13, enlace: null, mediaId: "444" },
  ]);
  assert.equal(r.get(9), 5);
  assert.equal(r.get(12), 11);
  assert.equal(r.has(5), false);
  assert.equal(r.has(11), false);
  assert.equal(r.has(13), false);
});

test("repetidas: se encadenan (A y B por el id, B y C por el enlace) y no importa el orden de entrada", () => {
  const r = repetidasDe([
    { numero: 3, enlace: "https://www.instagram.com/reel/XYZ/", mediaId: null },
    { numero: 1, enlace: null, mediaId: "77" },
    { numero: 2, enlace: "https://www.instagram.com/reel/XYZ/", mediaId: "77" },
  ]);
  assert.equal(r.get(2), 1);
  assert.equal(r.get(3), 1);
  assert.equal(r.size, 2);
});

test("repetidas: sin identificador ni enlace ninguna es repetida", () => {
  assert.equal(repetidasDe([{ numero: 1, enlace: null, mediaId: null }, { numero: 2, enlace: null, mediaId: null }]).size, 0);
});

test("datos que faltan: completa enlace, cuenta, nombre, cifras y fecha sin pisar lo que ya hay", () => {
  const origen = { enlace: "https://www.instagram.com/p/AB/", autor_usuario: "tienda", metricas: { like_count: 10, comments_count: 2, fecha_publicacion: "2026-10-09", nombre_pagina: "Mi Tienda", fuente: "vista_previa", consulta: { error: "x" } } };
  const vacio = { enlace: null, autor_usuario: null, metricas: { consulta: { error: "y" } } };
  const r = datosQueFaltan(vacio, origen);
  assert.equal(r?.enlace, "https://www.instagram.com/p/AB/");
  assert.equal(r?.autor_usuario, "tienda");
  assert.deepEqual(r?.metricas, { consulta: { error: "y" }, like_count: 10, comments_count: 2, fecha_publicacion: "2026-10-09", nombre_pagina: "Mi Tienda", fuente: "vista_previa" });
  const conDatos = { enlace: "https://www.instagram.com/p/ZZ/", autor_usuario: "otra", metricas: { like_count: 99, fuente: "manual" } };
  const r2 = datosQueFaltan(conDatos, origen);
  assert.equal(r2?.enlace, undefined);
  assert.equal(r2?.autor_usuario, undefined);
  assert.equal((r2?.metricas as Record<string, unknown>).like_count, 99);
  assert.equal((r2?.metricas as Record<string, unknown>).fuente, "manual");
  assert.equal((r2?.metricas as Record<string, unknown>).comments_count, 2);
});

test("datos que faltan: si no hay nada que copiar, null", () => {
  const d = { enlace: "https://www.instagram.com/p/AB/", autor_usuario: "a", metricas: { like_count: 1 } };
  assert.equal(datosQueFaltan(d, d), null);
  assert.equal(datosQueFaltan({ enlace: null, autor_usuario: null, metricas: null }, { enlace: null, autor_usuario: null, metricas: null }), null);
});
