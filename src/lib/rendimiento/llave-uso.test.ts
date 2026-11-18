import assert from "node:assert/strict";
import test from "node:test";
import { DIAS_LLAVE, crearLlaveUso, leerLlaveUso, llaveDeCabecera, secretosLlaveUso } from "./llave-uso";

const ID = "ffe79fe4-bb46-4522-b35a-7b3005719d58";
const OTRO = "a3e6cde5-006a-42a6-91df-db2ac88dffbb";
const AHORA = 1_800_000_000_000;

test("una llave dice de quién es", () => {
  assert.equal(leerLlaveUso(crearLlaveUso(ID, "secreto", AHORA), "secreto", AHORA), ID);
});

test("una llave vencida no sirve", () => {
  const llave = crearLlaveUso(ID, "secreto", AHORA);
  assert.equal(leerLlaveUso(llave, "secreto", AHORA + (DIAS_LLAVE - 1) * 86_400_000), ID);
  assert.equal(leerLlaveUso(llave, "secreto", AHORA + DIAS_LLAVE * 86_400_000), null);
});

test("no se puede cambiar la persona ni alargar el vencimiento", () => {
  const [, vence, firma] = crearLlaveUso(ID, "secreto", AHORA).split(".");
  assert.equal(leerLlaveUso(`${OTRO}.${vence}.${firma}`, "secreto", AHORA), null);
  assert.equal(leerLlaveUso(`${ID}.${Number(vence) + 1}.${firma}`, "secreto", AHORA), null);
});

test("otra firma, un secreto vacío o algo que no es una llave no sirven", () => {
  assert.equal(leerLlaveUso(crearLlaveUso(ID, "otro", AHORA), "secreto", AHORA), null);
  assert.equal(leerLlaveUso(crearLlaveUso(ID, "", AHORA), "", AHORA), null);
  assert.equal(leerLlaveUso("hola", "secreto", AHORA), null);
  assert.equal(leerLlaveUso(`${ID}.1.2.3`, "secreto", AHORA), null);
  assert.equal(leerLlaveUso(null, "secreto", AHORA), null);
});

test("la llave sale de la cabecera", () => {
  assert.equal(llaveDeCabecera("Bearer abc"), "abc");
  assert.equal(llaveDeCabecera("Basic abc"), null);
  assert.equal(llaveDeCabecera(null), null);
});

// Secreto propio con transición (auditoría de seguridad, 18 nov 2026).
const SERVICIO = "clave-de-servicio-de-prueba";
const PROPIO = "p".repeat(40);

test("sin USO_EXTERNO_LLAVE_SECRETO (o corta) todo sigue con la clave de servicio", () => {
  assert.deepEqual(secretosLlaveUso({ SUPABASE_SERVICE_ROLE_KEY: SERVICIO }), { firmar: SERVICIO, aceptar: [SERVICIO] });
  assert.deepEqual(secretosLlaveUso({ SUPABASE_SERVICE_ROLE_KEY: SERVICIO, USO_EXTERNO_LLAVE_SECRETO: "corta" }), { firmar: SERVICIO, aceptar: [SERVICIO] });
  assert.deepEqual(secretosLlaveUso({}), { firmar: "", aceptar: [] });
});

test("con USO_EXTERNO_LLAVE_SECRETO se firma con ella y las llaves viejas siguen valiendo", () => {
  const s = secretosLlaveUso({ SUPABASE_SERVICE_ROLE_KEY: SERVICIO, USO_EXTERNO_LLAVE_SECRETO: ` ${PROPIO} ` });
  assert.deepEqual(s, { firmar: PROPIO, aceptar: [PROPIO, SERVICIO] });
  const nueva = crearLlaveUso(ID, s.firmar, AHORA);
  const vieja = crearLlaveUso(ID, SERVICIO, AHORA);
  assert.equal(leerLlaveUso(nueva, s.aceptar, AHORA), ID);
  assert.equal(leerLlaveUso(vieja, s.aceptar, AHORA), ID);
  // La nueva no la acepta quien solo conoce la clave de servicio: ya no depende de ella.
  assert.equal(leerLlaveUso(nueva, [SERVICIO], AHORA), null);
  // Una vieja vencida sigue sin servir, y una firmada con otro secreto tampoco.
  assert.equal(leerLlaveUso(vieja, s.aceptar, AHORA + DIAS_LLAVE * 86_400_000), null);
  assert.equal(leerLlaveUso(crearLlaveUso(ID, "otro", AHORA), s.aceptar, AHORA), null);
  assert.equal(leerLlaveUso(nueva, [], AHORA), null);
  assert.equal(leerLlaveUso(nueva, ["", PROPIO], AHORA), ID);
});
