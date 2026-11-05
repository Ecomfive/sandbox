import assert from "node:assert/strict";
import test from "node:test";
import { esMotivoFuera, inicioSemana, porcentajeSistema, resumirUso, tipoDeAlta, type AltaPublicacion } from "./origen";

const alta = (x: Partial<AltaPublicacion>): AltaPublicacion => ({
  id: "1",
  numero: 1,
  nombre: "Producto",
  pais: "PA",
  origen: "dropi",
  tipo: "nuevo",
  fecha: "2026-10-28",
  persona: null,
  motivo: null,
  nota: "",
  ...x,
});

test("el tipo sale de la actividad y, si no, de la publicación", () => {
  assert.equal(tipoDeAlta({ detalle: "Crema (ID 1) · republicada desde el ID 2", privado: false, relacionados: 0 }), "republicacion");
  assert.equal(tipoDeAlta({ detalle: "Crema (ID 1) · privatizada a Ana desde el ID 2", privado: true, relacionados: 1 }), "privatizacion");
  assert.equal(tipoDeAlta({ detalle: "Crema (ID 1) · estaba en Dropi sin publicación", privado: true, relacionados: 0 }), "privatizacion");
  assert.equal(tipoDeAlta({ detalle: "Crema (ID 1) · estaba en Dropi sin publicación", privado: false, relacionados: 1 }), "republicacion");
  assert.equal(tipoDeAlta({ detalle: null, privado: false, relacionados: 0 }), "nuevo");
});

test("la semana empieza el lunes", () => {
  assert.equal(inicioSemana("2026-11-05"), "2026-11-02"); // jueves
  assert.equal(inicioSemana("2026-11-02"), "2026-11-02"); // lunes
  assert.equal(inicioSemana("2026-11-01"), "2026-10-26"); // domingo
});

test("el porcentaje hecho en el sistema", () => {
  assert.equal(porcentajeSistema({ sistema: 1, dropi: 3 }), 25);
  assert.equal(porcentajeSistema({ sistema: 0, dropi: 36 }), 0);
  assert.equal(porcentajeSistema({ sistema: 0, dropi: 0 }), null);
});

test("el resumen cuenta por tipo, país, semana y motivo", () => {
  const r = resumirUso([
    alta({ id: "1", motivo: "mas_rapido" }),
    alta({ id: "2", motivo: "mas_rapido", pais: "CR", fecha: "2026-11-03" }),
    alta({ id: "3", motivo: "no_sabia", pais: "CR" }),
    alta({ id: "4" }),
    alta({ id: "5", origen: "sistema", tipo: "republicacion", fecha: "2026-11-04" }),
  ]);
  assert.deepEqual(r.total, { sistema: 1, dropi: 4 });
  assert.deepEqual(r.porTipo.find((t) => t.tipo === "nuevo"), { tipo: "nuevo", sistema: 0, dropi: 4 });
  assert.deepEqual(r.porTipo.find((t) => t.tipo === "republicacion"), { tipo: "republicacion", sistema: 1, dropi: 0 });
  assert.deepEqual(r.porPais.map((p) => p.pais), ["CR", "PA"]);
  assert.deepEqual(r.porSemana, [
    { semana: "2026-11-02", sistema: 1, dropi: 1 },
    { semana: "2026-10-26", sistema: 0, dropi: 3 },
  ]);
  assert.deepEqual(r.motivos, [
    { motivo: "mas_rapido", n: 2 },
    { motivo: "no_sabia", n: 1 },
  ]);
  assert.equal(r.sinMotivo, 1);
});

test("el motivo se valida contra la lista", () => {
  assert.ok(esMotivoFuera("no_permite"));
  assert.ok(!esMotivoFuera("cualquiera"));
  assert.ok(!esMotivoFuera(null));
});
