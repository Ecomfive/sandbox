import assert from "node:assert/strict";
import test from "node:test";
import { claveRepartidor, enmascararDocumento, enmascararTelefono, limpiarAlias, resolverEtiqueta, sugerirDueno } from "./repartidor";

// Datos inventados.
const REPARTIDORES = [
  { id: "a", clave: "PEDRO PRUEBA", alias: ["ZONA 2 PEDRO", "LUGAR LEJANO"] },
  { id: "b", clave: "ANA EJEMPLO", alias: [] },
  { id: "c", clave: "ANA OTRA", alias: [] },
];

test("documento y teléfono nunca completos en listas", () => {
  assert.equal(enmascararDocumento("AB1234567"), "AB***567");
  assert.equal(enmascararTelefono("+507 6123-4567"), "•••• 4567");
  assert.equal(enmascararTelefono("123"), "••••");
  assert.equal(enmascararTelefono(null), "");
  assert.ok(!enmascararTelefono("61234567").includes("6123"));
});

test("clave del repartidor: mayúsculas, sin acentos, un espacio", () => {
  assert.equal(claveRepartidor("  José   Núñez "), "JOSE NUNEZ");
});

test("un nombre de la hoja es del repartidor o de quien lo tiene como zona", () => {
  assert.deepEqual(resolverEtiqueta("Pedro  Prueba", REPARTIDORES), { repartidorId: "a", zona: null });
  assert.deepEqual(resolverEtiqueta("zona 2 pedro", REPARTIDORES), { repartidorId: "a", zona: "ZONA 2 PEDRO" });
  assert.deepEqual(resolverEtiqueta("Lugar Lejano", REPARTIDORES), { repartidorId: "a", zona: "LUGAR LEJANO" });
  assert.equal(resolverEtiqueta("NADIE", REPARTIDORES), null);
  assert.equal(resolverEtiqueta("", REPARTIDORES), null);
});

test("sugerencia para una zona nueva solo si hay un único dueño posible", () => {
  assert.equal(sugerirDueno("ZONA 5 PEDRO", REPARTIDORES), "a");
  assert.equal(sugerirDueno("ZONA 1 y 2 PEDRO", REPARTIDORES), "a");
  assert.equal(sugerirDueno("ZONA 4 ANA", REPARTIDORES), null); // dos Anas
  assert.equal(sugerirDueno("CIUDAD", REPARTIDORES), null);
});

test("alias limpios, sin repetir y sin la propia clave", () => {
  assert.deepEqual(limpiarAlias(["zona 1 pedro", "ZONA 1 PEDRO", "Pedro Prueba", 3, ""], "PEDRO PRUEBA"), ["ZONA 1 PEDRO"]);
  assert.deepEqual(limpiarAlias("x", "A"), []);
});
