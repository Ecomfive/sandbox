import assert from "node:assert/strict";
import { test } from "node:test";
import { accionesPublicacion, enDropi, estaArchivada } from "./automatico";

test("En Dropi sale de lo que reporta Dropi", () => {
  assert.equal(enDropi({ hayCarga: false, tieneId: true, dropi: null }), "sin_datos");
  assert.equal(enDropi({ hayCarga: true, tieneId: false, dropi: null }), "sin_id");
  assert.equal(enDropi({ hayCarga: true, tieneId: true, dropi: null }), "no_aparece");
  assert.equal(enDropi({ hayCarga: true, tieneId: true, dropi: { activo: true } }), "activo");
  assert.equal(enDropi({ hayCarga: true, tieneId: true, dropi: { activo: false } }), "archivado");
});

test("archivada: manda Dropi; sin datos, lo marcado a mano", () => {
  assert.equal(estaArchivada("archivado", false), true);
  assert.equal(estaArchivada("activo", true), false);
  assert.equal(estaArchivada("sin_datos", true), true);
  assert.equal(estaArchivada("no_aparece", false), false);
});

const base = { archivada: false, fechaPublicacion: "2026-01-01", primeraVenta: null, margen: 0.4, netas30: 50, netas30Antes: 40, privatizadaA: null, competidorMasBarato: false };
const HOY = "2026-10-21";

test("al día si no hay nada que revisar", () => {
  assert.deepEqual(accionesPublicacion(base, HOY), []);
  assert.deepEqual(accionesPublicacion({ ...base, archivada: true, margen: 0.1 }, HOY), []);
});

test("cada regla", () => {
  assert.deepEqual(accionesPublicacion({ ...base, fechaPublicacion: "2026-10-05" }, HOY), [], "nuevo ya no es una acción");
  assert.deepEqual(accionesPublicacion({ ...base, margen: 0.25 }, HOY), ["margen_bajo"]);
  assert.deepEqual(accionesPublicacion({ ...base, netas30: 15, netas30Antes: 40 }, HOY), ["ventas_caida"]);
  assert.deepEqual(accionesPublicacion({ ...base, margen: 0.1, netas30: 15, netas30Antes: 40 }, HOY), ["margen_bajo", "ventas_caida"]);
  assert.deepEqual(accionesPublicacion({ ...base, netas30: 2, netas30Antes: 8 }, HOY), [], "con pocas ventas antes no cuenta como caída");
  assert.deepEqual(accionesPublicacion({ ...base, competidorMasBarato: true }, HOY), ["bajar_precio"]);
  assert.deepEqual(accionesPublicacion({ ...base, privatizadaA: "Juan", netas30: 0, netas30Antes: 0 }, HOY), ["verificar_dropshipper"]);
  assert.deepEqual(accionesPublicacion({ ...base, privatizadaA: "Juan", netas30: 0, netas30Antes: 0, fechaPublicacion: "2026-10-15" }, HOY), [], "uno nuevo todavía no se verifica");
  assert.deepEqual(accionesPublicacion({ ...base, margen: 0.2, competidorMasBarato: true }, HOY), ["margen_bajo", "bajar_precio"]);
});

test("republicar: 30 días sin ninguna venta, activa y de nuestra bodega (nunca la B280)", async () => {
  const { necesitaRepublicar: r, BODEGA_DROPI: b280 } = await import("./automatico");
  const base = { archivada: false, enDropi: "activo" as const, bodegaId: 81, hayVentas: true, ultimaVenta: "2026-09-10", publicadaDesde: "2026-05-01" };
  const hoy = "2026-10-22";
  assert.equal(r(base, hoy), true);
  assert.equal(r({ ...base, bodegaId: b280 }, hoy), false, "la B280 es de Dropi: no se republica");
  assert.equal(r({ ...base, privada: true }, hoy), false, "una privada no se republica");
  assert.equal(r({ ...base, stock: 0 }, hoy), false, "sin stock no se republica");
  assert.equal(r({ ...base, stock: 12 }, hoy), true);
  assert.equal(r({ ...base, bodegaId: null }, hoy), false, "sin bodega conocida no se sabe");
  assert.equal(r({ ...base, ultimaVenta: "2026-10-05" }, hoy), false, "vendió hace menos de 30 días");
  assert.equal(r({ ...base, ultimaVenta: null, publicadaDesde: "2026-10-01" }, hoy), false, "nunca vendió pero es nueva");
  assert.equal(r({ ...base, ultimaVenta: null, publicadaDesde: "2026-08-01" }, hoy), true, "nunca vendió y lleva más de 30 días");
  assert.equal(r({ ...base, enDropi: "archivado" }, hoy), false);
  assert.equal(r({ ...base, hayVentas: false }, hoy), false, "sin datos de Dropi no se sabe");
  assert.equal(r(base, hoy, { dias_republicar: 60 }), false, "el plazo sale de las reglas");
});
