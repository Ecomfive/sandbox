import assert from "node:assert/strict";
import test from "node:test";
import { SIN_TIENDA, filtrarUnidades, leerTiendasPermitidas, modulosSegunTiendas, puedeVerUnidad, textoTiendasPermitidas, tiendaPermitida, unidadesFueraDePermiso, veTodaLaEmpresa } from "./tiendas-permitidas";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const unidades = [{ id: A, nombre: "A" }, { id: B, nombre: "B" }, { id: C, nombre: "C" }];

test("null = todas; la lista se limpia (solo UUID, sin repetir, en minúsculas)", () => {
  assert.equal(leerTiendasPermitidas(null), null);
  assert.deepEqual(leerTiendasPermitidas([A, A.toUpperCase(), "x", 3]), [A]);
  assert.deepEqual(leerTiendasPermitidas([]), []);
});

test("filtra unidades y decide la tienda que se ve", () => {
  assert.equal(filtrarUnidades(null, unidades).length, 3);
  assert.deepEqual(filtrarUnidades([B], unidades).map((u) => u.id), [B]);
  assert.ok(puedeVerUnidad(null, C));
  assert.ok(!puedeVerUnidad([B], C));
  assert.ok(!puedeVerUnidad([B], null));
  assert.equal(tiendaPermitida(null, null, unidades), null);
  assert.equal(tiendaPermitida(C, [B, C], unidades), C);
  assert.equal(tiendaPermitida(A, [B, C], unidades), B);
  assert.equal(tiendaPermitida(null, [], unidades), SIN_TIENDA);
  assert.ok(veTodaLaEmpresa(null));
  assert.ok(!veTodaLaEmpresa([A]));
  assert.equal(textoTiendasPermitidas([A, B], { [A]: "A", [B]: "B" }), "A, B");
  assert.equal(textoTiendasPermitidas([], {}), "Ninguna");
});

test("con tiendas limitadas no se ven balance, tesorería ni cierre", () => {
  assert.deepEqual(modulosSegunTiendas(["estado-resultados", "tesoreria", "balance-general", "cierre-mes"], ["x"]), ["estado-resultados"]);
  assert.deepEqual(modulosSegunTiendas(["tesoreria"], null), ["tesoreria"]);
});

test("unidades fuera de permiso: sin tienda o de otra tienda; sin límite, ninguna", () => {
  const a = "00000000-0000-4000-8000-00000000000a";
  const b = "00000000-0000-4000-8000-00000000000b";
  assert.deepEqual(unidadesFueraDePermiso(null, [a, null]), []);
  assert.deepEqual(unidadesFueraDePermiso([a], [a, a]), []);
  assert.deepEqual(unidadesFueraDePermiso([a], [a, b, null, ""]), [b, null]);
});
