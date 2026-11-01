import assert from "node:assert/strict";
import { test } from "node:test";
import { agruparPorDia, cambiosNuevos, filtrarCambios, ultimaFecha } from "./actualizaciones";
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

test("la última fecha y cuántos cambios son nuevos", () => {
  assert.equal(ultimaFecha(N), "2026-10-31");
  assert.equal(ultimaFecha([]), null);
  assert.equal(cambiosNuevos(N.slice(0, 3), "2026-10-30"), 2);
  assert.equal(cambiosNuevos(N.slice(0, 3), "2026-10-31"), 0);
  assert.equal(cambiosNuevos(N.slice(0, 3), null), 3);
});

test("busca sin acentos en título y texto, y por módulo", () => {
  assert.deepEqual(filtrarCambios(N, "contrasena", "").map((n) => n.titulo), ["Cambiar tu contraseña"]);
  assert.deepEqual(filtrarCambios(N, "colones configuracion", "").map((n) => n.titulo), ["Fulfillment por plataforma"]);
  assert.equal(filtrarCambios(N, "", "configuracion").length, 1);
});

test("todas las novedades reales tienen fecha válida", () => {
  for (const n of NOVEDADES) assert.match(n.fecha, /^\d{4}-\d{2}-\d{2}$/, n.titulo);
});
