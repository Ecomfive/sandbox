import assert from "node:assert/strict";
import { test } from "node:test";
import { AREAS_DE_SALA, etiquetaDeSala, esSala, esTelefonoInterno, opcionesDeSalas, salaDeTelefono, SALAS, telefonoDeSala } from "./chat-interno";

test("el teléfono de una copia se arma y se lee de vuelta", () => {
  assert.equal(telefonoDeSala("ac", "atencion"), "interno:ac:atencion");
  assert.deepEqual(salaDeTelefono("interno:acd:direccion"), { sala: "acd", area: "direccion" });
  assert.deepEqual(salaDeTelefono(telefonoDeSala("cd", "comercial")), { sala: "cd", area: "comercial" });
});

test("un teléfono de verdad o uno mal formado no es de una sala", () => {
  assert.equal(salaDeTelefono("+50760001111"), null);
  assert.equal(salaDeTelefono("interno:zz:atencion"), null);
  // El área tiene que ser una de las de la sala.
  assert.equal(salaDeTelefono("interno:ac:direccion"), null);
  assert.equal(salaDeTelefono(null), null);
  // Aunque esté mal formado, nunca se trata como un número de WhatsApp.
  assert.equal(esTelefonoInterno("interno:zz:atencion"), true);
  assert.equal(esTelefonoInterno("+50760001111"), false);
});

test("las salas y sus áreas", () => {
  assert.equal(SALAS.length, 4);
  assert.ok(SALAS.every(esSala));
  assert.equal(esSala("xyz"), false);
  assert.equal(AREAS_DE_SALA.acd.length, 3);
  for (const s of SALAS) assert.ok(s.length === AREAS_DE_SALA[s].length, "las letras de la sala son una por área");
});

test("cada área ve a las otras y a todas, en ese orden", () => {
  assert.deepEqual(opcionesDeSalas("direccion").map((o) => [o.sala, o.etiqueta]), [["ad", "Atención"], ["cd", "Comercial"], ["acd", "Todas las áreas"]]);
  assert.deepEqual(opcionesDeSalas("atencion").map((o) => [o.sala, o.etiqueta]), [["ac", "Comercial"], ["ad", "Dirección"], ["acd", "Todas las áreas"]]);
  assert.deepEqual(opcionesDeSalas("comercial").map((o) => [o.sala, o.etiqueta]), [["ac", "Atención"], ["cd", "Dirección"], ["acd", "Todas las áreas"]]);
});

test("el nombre de la sala depende de quién la mira", () => {
  assert.equal(etiquetaDeSala("ac", "atencion"), "Comercial");
  assert.equal(etiquetaDeSala("ac", "comercial"), "Atención");
  assert.equal(etiquetaDeSala("acd", "direccion"), "Todas las áreas");
});
