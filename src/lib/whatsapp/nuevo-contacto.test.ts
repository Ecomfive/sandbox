import assert from "node:assert/strict";
import { test } from "node:test";
import { contactosRestantes, inicioDelDiaPanama, MAX_CONTACTOS_NUEVOS_DIA, motivoSinPlantilla, notaDePermiso, validarNuevoContacto } from "./nuevo-contacto";

const valido = { nombre: "María Pérez", medio: "formulario", nota: "", confirmo: true };

test("para escribirle primero a alguien hay que dar su nombre, confirmar su permiso y decir cómo lo dio", () => {
  assert.equal(validarNuevoContacto(valido), null);
  assert.match(validarNuevoContacto({ ...valido, nombre: " " }) ?? "", /nombre/);
  assert.match(validarNuevoContacto({ ...valido, confirmo: false }) ?? "", /aceptó/);
  assert.match(validarNuevoContacto({ ...valido, medio: "" }) ?? "", /cómo/);
  assert.match(validarNuevoContacto({ ...valido, medio: "inventado" }) ?? "", /cómo/);
  assert.match(validarNuevoContacto({ ...valido, nota: "x".repeat(301) }) ?? "", /nota/);
  assert.match(validarNuevoContacto({ ...valido, nombre: "x".repeat(81) }) ?? "", /largo/);
});

test("solo sirve una plantilla aprobada con botón para rechazar", () => {
  assert.equal(motivoSinPlantilla({ estado: "aprobada", botones: ["Sí, escríbeme", "No, gracias"] }), null);
  assert.equal(motivoSinPlantilla({ estado: "aprobada", botones: ["No, gracias"] }), null);
  assert.match(motivoSinPlantilla({ estado: "pendiente", botones: ["No, gracias"] }) ?? "", /aprobó/);
  assert.match(motivoSinPlantilla({ estado: "aprobada", botones: [] }) ?? "", /rechace/);
  assert.match(motivoSinPlantilla({ estado: "aprobada", botones: ["", "  "] }) ?? "", /rechace/);
});

test("el día de los contactos nuevos empieza a las 00:00 de Panamá (05:00 UTC)", () => {
  assert.equal(inicioDelDiaPanama(new Date("2026-10-30T15:00:00Z")), "2026-10-30T05:00:00.000Z");
  // A las 02:00 UTC del 31 todavía es 30 en Panamá.
  assert.equal(inicioDelDiaPanama(new Date("2026-10-31T02:00:00Z")), "2026-10-30T05:00:00.000Z");
  assert.equal(inicioDelDiaPanama(new Date("2026-10-31T05:00:00Z")), "2026-10-31T05:00:00.000Z");
});

test("los contactos que quedan hoy nunca bajan de cero", () => {
  assert.equal(contactosRestantes(0), MAX_CONTACTOS_NUEVOS_DIA);
  assert.equal(contactosRestantes(MAX_CONTACTOS_NUEVOS_DIA), 0);
  assert.equal(contactosRestantes(MAX_CONTACTOS_NUEVOS_DIA + 5), 0);
});

test("la nota del chat dice quién escribió primero y con qué permiso", () => {
  assert.equal(
    notaDePermiso("Jhokser", " María Pérez ", "llamada", ""),
    "Jhokser inició este chat con una plantilla. Confirmó que María Pérez aceptó recibir mensajes por WhatsApp (lo aceptó en una llamada).",
  );
  assert.match(notaDePermiso("Ana", "Luis", "formulario", " Formulario de la web del 12 oct "), /formulario o registro: Formulario de la web del 12 oct\)\.$/);
});
