import assert from "node:assert/strict";
import { test } from "node:test";
import { agruparPorDia, claveNovedad, filtrarCambios, recientes, sinVer, ultimaFecha } from "./actualizaciones";
import { NOVEDADES } from "./contenido";

const N = [
  { fecha: "2026-10-30", titulo: "Pareto", texto: "Dirección", modulo: "crm-dropshippers" },
  { fecha: "2026-10-31", titulo: "Fulfillment por plataforma", texto: "En Configuración, en colones", modulo: "configuracion" },
  { fecha: "2026-10-31", titulo: "Cambiar tu contraseña", texto: "Menú de la cuenta" },
  { fecha: "malo", titulo: "x", texto: "y" },
];

test("agrupa por día, del más nuevo al más viejo, y salta fechas inválidas", () => {
  const d = agruparPorDia(N);
  assert.deepEqual(d.map((x) => [x.fecha, x.cambios.length]), [["2026-10-31", 2], ["2026-10-30", 1]]);
  assert.equal(d[0].cambios[0].titulo, "Fulfillment por plataforma");
});

test("la última fecha, la clave de cada una y cuántas no vio", () => {
  assert.equal(ultimaFecha(N), "2026-10-31");
  assert.equal(ultimaFecha([]), null);
  const k = claveNovedad(N[1]);
  assert.match(k, /^2026-10-31-[0-9a-f]{8}$/);
  assert.equal(claveNovedad({ ...N[1] }), k, "la misma novedad da la misma clave");
  assert.notEqual(claveNovedad(N[2]), k);
  assert.equal(sinVer(N.slice(0, 3), new Set([k])), 2);
  assert.equal(sinVer(N.slice(0, 3), new Set()), 3);
});

test("recientes: los últimos días hasta hoy, de la más nueva a la más vieja", () => {
  const r = recientes(N.slice(0, 3), "2026-10-31", 1);
  assert.deepEqual(r.map((n) => n.titulo), ["Fulfillment por plataforma", "Cambiar tu contraseña"]);
  assert.equal(recientes(N.slice(0, 3), "2026-10-31", 2).length, 3);
  assert.equal(recientes([{ fecha: "2026-11-05", titulo: "futura", texto: "" }], "2026-10-31").length, 0, "una fecha futura no sale");
});

test("todas las claves de las novedades reales son distintas", () => {
  const claves = NOVEDADES.map(claveNovedad);
  assert.equal(new Set(claves).size, claves.length);
});

test("busca sin acentos en título y texto, y por módulo", () => {
  assert.deepEqual(filtrarCambios(N, "contrasena", "").map((n) => n.titulo), ["Cambiar tu contraseña"]);
  assert.deepEqual(filtrarCambios(N, "colones configuracion", "").map((n) => n.titulo), ["Fulfillment por plataforma"]);
  assert.equal(filtrarCambios(N, "", "configuracion").length, 1);
});

test("todas las novedades reales tienen fecha válida", () => {
  for (const n of NOVEDADES) assert.match(n.fecha, /^\d{4}-\d{2}-\d{2}$/, n.titulo);
});
