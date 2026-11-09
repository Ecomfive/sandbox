import assert from "node:assert/strict";
import test from "node:test";
import { armarIdentidades, llaveHash, normalizarCorreo, normalizarTelefono, primerNombre, secretoLlaves } from "./identidad";

// Todos los teléfonos, nombres y correos de estas pruebas son inventados.

test("normaliza móviles y fijos de Panamá con cualquier formato", () => {
  for (const t of ["60001234", "6000-1234", "6000 1234", "+507 6000-1234", "(507) 6000 1234", "00507 60001234", "507-6000-1234"]) {
    assert.deepEqual(normalizarTelefono(t), { numero: "+50760001234", calidad: "movil" }, t);
  }
  assert.deepEqual(normalizarTelefono("200-1234"), { numero: "+5072001234", calidad: "fijo" });
  assert.deepEqual(normalizarTelefono("+507 300 1234"), { numero: "+5073001234", calidad: "fijo" });
});

test("marca inválidos, de otro país, vacíos y de relleno", () => {
  assert.equal(normalizarTelefono(null).calidad, "sin_dato");
  assert.equal(normalizarTelefono("   ").calidad, "sin_dato");
  assert.equal(normalizarTelefono("(none)").calidad, "sin_dato");
  assert.equal(normalizarTelefono("7001234").numero, "+5077001234");
  assert.equal(normalizarTelefono("6001234").calidad, "invalido"); // 7 dígitos que empiezan en 6: móvil viejo incompleto
  assert.equal(normalizarTelefono("50001234").calidad, "invalido"); // 8 dígitos que no empiezan en 6
  assert.equal(normalizarTelefono("600012345").calidad, "invalido");
  assert.equal(normalizarTelefono("+1 321 555 0100").calidad, "invalido");
  assert.equal(normalizarTelefono("+57 300 000 0000").calidad, "invalido");
  assert.equal(normalizarTelefono("66666666").calidad, "sospechoso");
  assert.equal(normalizarTelefono("60000000").calidad, "sospechoso");
  assert.equal(normalizarTelefono("61234567").calidad, "sospechoso");
  assert.equal(normalizarTelefono("67654321").calidad, "sospechoso");
  assert.equal(normalizarTelefono("60000000").numero, null);
});

test("correo y primer nombre", () => {
  assert.equal(normalizarCorreo("  Alguien@Ejemplo.COM "), "alguien@ejemplo.com");
  assert.equal(normalizarCorreo("sin-arroba.com"), null);
  assert.equal(normalizarCorreo(null), null);
  assert.equal(primerNombre("María José Inventada"), "maria");
  assert.equal(primerNombre("  maria  "), "maria");
  assert.equal(primerNombre("J. Inventado"), "inventado");
  assert.equal(primerNombre(""), null);
});

test("la llave es un HMAC estable que no contiene el teléfono", () => {
  const a = llaveHash("tel:+50760001234", "s1");
  assert.equal(a, llaveHash("tel:+50760001234", "s1"));
  assert.notEqual(a, llaveHash("tel:+50760001234", "s2"));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.ok(!a.includes("60001234"));
  assert.equal(secretoLlaves({ CLIENTES_LLAVE_SECRETO: "x", SUPABASE_SERVICE_ROLE_KEY: "y" }), "x");
  assert.equal(secretoLlaves({ SUPABASE_SERVICE_ROLE_KEY: "y" }), "y");
  assert.throws(() => secretoLlaves({}));
});

test("arma clientes: mismo teléfono en cualquier formato es la misma persona; sin dato, una orden sola", () => {
  const ordenes = [
    { orden_id: "o1", nombre: "Ana Inventada", telefono: "6000-1111" },
    { orden_id: "o2", nombre: "ana", telefono: "+507 60001111" },
    { orden_id: "o3", nombre: "Beto Inventado", telefono: "60002222" },
    { orden_id: "o4", nombre: "Caro Inventada", telefono: null },
    { orden_id: "o5", nombre: "Caro Inventada", telefono: null },
    { orden_id: "o6", nombre: "Dani Inventado", telefono: "123", correo: "dani@ejemplo.com" },
    { orden_id: "o7", nombre: "Dani", telefono: null, correo: "DANI@ejemplo.com" },
  ];
  const { asignaciones, resumen } = armarIdentidades(ordenes, "secreto");
  const llave = (id: string) => asignaciones.find((a) => a.orden_id === id)!.llave;
  assert.equal(llave("o1"), llave("o2"));
  assert.notEqual(llave("o1"), llave("o3"));
  assert.notEqual(llave("o4"), llave("o5")); // sin teléfono ni correo no se junta por nombre
  assert.equal(llave("o6"), llave("o7")); // por correo
  assert.equal(resumen.clientes, 5);
  assert.equal(resumen.clientesIdentificados, 3);
  assert.deepEqual(resumen.porTipo, { telefono: 3, correo: 2, orden: 2 });
  assert.equal(resumen.porCalidad.movil, 3);
  assert.equal(resumen.porCalidad.invalido, 1);
  assert.equal(resumen.porCalidad.sin_dato, 3);
  // Es determinista: dos corridas dan lo mismo.
  assert.deepEqual(armarIdentidades(ordenes, "secreto").asignaciones, asignaciones);
});

test("un teléfono con órdenes de muchos nombres distintos es sospechoso y no junta a esas personas", () => {
  const ordenes = ["Ana", "Beto", "Caro", "Dani", "Eva", "ana"].map((n, i) => ({ orden_id: `o${i}`, nombre: `${n} Inventado`, telefono: "60003333" }));
  ordenes.push({ orden_id: "x", nombre: "Fede Inventado", telefono: "60004444" });
  const { asignaciones, resumen } = armarIdentidades(ordenes, "secreto");
  assert.equal(resumen.telefonosCompartidos, 1);
  assert.equal(resumen.ordenesTelefonoCompartido, 6);
  assert.equal(resumen.porCalidad.sospechoso, 6);
  assert.equal(new Set(asignaciones.filter((a) => a.orden_id !== "x").map((a) => a.llave)).size, 6);
  assert.ok(asignaciones.filter((a) => a.orden_id !== "x").every((a) => a.tipo_llave === "orden"));
  // Tres nombres no llegan al umbral: es una familia o la misma persona escrita distinto.
  const pocos = ["Ana", "Beto", "Caro"].map((n, i) => ({ orden_id: `p${i}`, nombre: n, telefono: "60005555" }));
  assert.equal(new Set(armarIdentidades(pocos, "secreto").asignaciones.map((a) => a.llave)).size, 1);
});

test("sin secreto no arma llaves", () => {
  assert.throws(() => armarIdentidades([{ orden_id: "o", nombre: null, telefono: "60001111" }], ""));
});
