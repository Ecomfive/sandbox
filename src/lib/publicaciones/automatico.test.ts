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
  assert.deepEqual(accionesPublicacion({ ...base, fechaPublicacion: "2026-10-05" }, HOY), ["nuevo"]);
  assert.deepEqual(accionesPublicacion({ ...base, fechaPublicacion: null, primeraVenta: "2026-10-10" }, HOY), ["nuevo"]);
  assert.deepEqual(accionesPublicacion({ ...base, margen: 0.25 }, HOY), ["revisar_precio"]);
  assert.deepEqual(accionesPublicacion({ ...base, netas30: 15, netas30Antes: 40 }, HOY), ["revisar_precio"]);
  assert.deepEqual(accionesPublicacion({ ...base, netas30: 2, netas30Antes: 8 }, HOY), [], "con pocas ventas antes no cuenta como caída");
  assert.deepEqual(accionesPublicacion({ ...base, competidorMasBarato: true }, HOY), ["bajar_precio"]);
  assert.deepEqual(accionesPublicacion({ ...base, privatizadaA: "Juan", netas30: 0, netas30Antes: 0 }, HOY), ["verificar_dropshipper"]);
  assert.deepEqual(accionesPublicacion({ ...base, privatizadaA: "Juan", netas30: 0, netas30Antes: 0, fechaPublicacion: "2026-10-15" }, HOY), ["nuevo"], "uno nuevo todavía no se verifica");
  assert.deepEqual(accionesPublicacion({ ...base, margen: 0.2, competidorMasBarato: true }, HOY), ["revisar_precio", "bajar_precio"]);
});
