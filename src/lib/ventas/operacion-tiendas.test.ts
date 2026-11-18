import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aprobacionDeSusTiendas, remesasDeSusTiendas } from "./operacion-tiendas";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("remesasDeSusTiendas", () => {
  const ordenes = [
    { remesaId: "r1", unidadId: A },
    { remesaId: "r1", unidadId: A },
    { remesaId: "r2", unidadId: A },
    { remesaId: "r2", unidadId: B },
    { remesaId: "r3", unidadId: B },
    { remesaId: "r4", unidadId: null },
  ];
  it("sin límite, todas las que tienen órdenes", () => {
    assert.deepEqual([...remesasDeSusTiendas(null, ordenes)].sort(), ["r1", "r2", "r3", "r4"]);
  });
  it("con límite, solo las que son enteras de sus tiendas (una mezclada o sin tienda no)", () => {
    assert.deepEqual([...remesasDeSusTiendas([A], ordenes)], ["r1"]);
    assert.deepEqual([...remesasDeSusTiendas([], ordenes)], []);
  });
});

describe("aprobacionDeSusTiendas", () => {
  const unidades = new Map<string, string | null>([["o1", A], ["o2", B]]);
  const remesas = new Set(["r1"]);
  it("sin límite, todas", () => {
    assert.equal(aprobacionDeSusTiendas(null, { accion: "cancelar_orden", referencia: "o2" }, unidades, remesas), true);
    assert.equal(aprobacionDeSusTiendas(null, { accion: "otra", referencia: "x" }, unidades, remesas), true);
  });
  it("con límite: la orden o la remesa tienen que ser suyas", () => {
    assert.equal(aprobacionDeSusTiendas([A], { accion: "cancelar_orden", referencia: "o1" }, unidades, remesas), true);
    assert.equal(aprobacionDeSusTiendas([A], { accion: "cancelar_orden", referencia: "o2" }, unidades, remesas), false);
    assert.equal(aprobacionDeSusTiendas([A], { accion: "cancelar_orden", referencia: "no-existe" }, unidades, remesas), false);
    assert.equal(aprobacionDeSusTiendas([A], { accion: "anular_remesa", referencia: "r1" }, unidades, remesas), true);
    assert.equal(aprobacionDeSusTiendas([A], { accion: "anular_remesa", referencia: "r2" }, unidades, remesas), false);
    assert.equal(aprobacionDeSusTiendas([A], { accion: "otra", referencia: "o1" }, unidades, remesas), false);
  });
});
