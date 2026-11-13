import assert from "node:assert/strict";
import test from "node:test";
import { mensajeTrasladoDropi, normalizarDatosRepublicar, unidadesEnBodegaDropi } from "./traslado-b280";

test("datos de una republicación de la B280: solo con b280; lo demás, revisado", () => {
  assert.equal(normalizarDatosRepublicar(null), null);
  assert.equal(normalizarDatosRepublicar({ precio: 3 }), null, "una republicación de siempre");
  assert.deepEqual(normalizarDatosRepublicar({ b280: true }), { b280: true, temporal: 100, unidadesB280: null, variable: false, trasladoTarea: null, trasladado: null });
  assert.deepEqual(normalizarDatosRepublicar({ b280: true, temporal: 50, unidadesB280: 237.4, variable: true, trasladoTarea: " t1 ", trasladado: "2026-11-13T10:00:00Z" }), {
    b280: true,
    temporal: 50,
    unidadesB280: 237,
    variable: true,
    trasladoTarea: "t1",
    trasladado: "2026-11-13T10:00:00Z",
  });
});

test("unidades en la bodega de Dropi: B280 (Panamá) y B15 (Costa Rica); las nuestras no cuentan", () => {
  assert.equal(unidadesEnBodegaDropi([{ id: 280, stock: 237 }, { id: 81, stock: 5 }]), 237);
  assert.equal(unidadesEnBodegaDropi([{ id: 15, stock: 12 }]), 12);
  assert.equal(unidadesEnBodegaDropi([{ id: 81, stock: 100 }]), 0);
  assert.equal(unidadesEnBodegaDropi(null), 0);
});

test("el mensaje para el grupo de Dropi dice cuántas, de qué bodega, de qué ID a cuál", () => {
  const m = mensajeTrasladoDropi({ viejo: 8946, nuevo: 12034, nombre: "Truly Smooth Legend After Shave", unidades: 237, pais: "PA" });
  assert.match(m, /trasladar las 237 unidades de la Bodega Dropi Panamá \(B280\) del ID 8946 al ID nuevo 12034/);
  assert.match(mensajeTrasladoDropi({ viejo: 1, nuevo: 2, nombre: "X", unidades: null, pais: "CR" }), /todas las unidades de la bodega de Dropi Costa Rica \(B15\)/);
  assert.doesNotMatch(m, /variación/);
  assert.match(mensajeTrasladoDropi({ viejo: 7000, nuevo: 9001, nombre: "Rodillera", unidades: 18, pais: "PA", variable: true }), /cada variación \(talla, color…\) a la misma variación del ID nuevo/);
});
