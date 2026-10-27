import assert from "node:assert/strict";
import { test } from "node:test";
import { accesoCrm, areaParaNota, areasVisibles, escribeEnArea } from "./areas";

// Se corre con: npm run test:seguridad (incluye estas pruebas del CRM)
const atencion = accesoCrm({ modulos: ["crm-dropshippers"], modulosSoloLectura: [] });
const comercial = accesoCrm({ modulos: ["crm-dropshippers", "crm-comercial"], modulosSoloLectura: [] });
const comercialLectura = accesoCrm({ modulos: ["crm-dropshippers", "crm-comercial"], modulosSoloLectura: ["crm-comercial"] });
const sinAcceso = accesoCrm({ modulos: ["retiros"], modulosSoloLectura: [] });

test("Atención no ve el área comercial; Comercial ve las dos", () => {
  assert.deepEqual(areasVisibles(atencion), ["atencion"]);
  assert.deepEqual(areasVisibles(comercial), ["comercial", "atencion"]);
  assert.deepEqual(areasVisibles(sinAcceso), ["atencion"]);
});

test("el acceso de solo lectura no escribe en su área", () => {
  assert.equal(comercialLectura.comercial, true);
  assert.equal(comercialLectura.escribeComercial, false);
  assert.equal(atencion.escribeComercial, false);
});

test("una nota nueva se guarda en el área de quien la escribe", () => {
  assert.equal(areaParaNota(atencion, undefined), "atencion");
  assert.equal(areaParaNota(comercial, undefined), "comercial");
  assert.equal(areaParaNota(comercial, "atencion"), "atencion");
});

test("Atención no puede crear una nota comercial aunque la pida", () => {
  assert.equal(areaParaNota(atencion, "comercial"), null);
  assert.equal(areaParaNota(comercialLectura, "comercial"), null);
});

test("sin acceso no se puede escribir nada", () => {
  assert.equal(areaParaNota(sinAcceso, undefined), null);
  assert.equal(areaParaNota(sinAcceso, "atencion"), null);
});

test("en la bandeja, con Comercial en solo lectura no se escribe en conversaciones comerciales", () => {
  const a = accesoCrm({ modulos: ["crm-dropshippers", "crm-comercial"], modulosSoloLectura: ["crm-comercial"] });
  assert.equal(escribeEnArea(a, "comercial"), false);
  assert.equal(escribeEnArea(a, "atencion"), true);
  const comercial = accesoCrm({ modulos: ["crm-dropshippers", "crm-comercial"], modulosSoloLectura: ["crm-dropshippers"] });
  assert.equal(escribeEnArea(comercial, "comercial"), true);
  assert.equal(escribeEnArea(comercial, "atencion"), true);
});

test("Dirección (CEO) ve las tres áreas y solo ella escribe en la suya", () => {
  const ceo = accesoCrm({ modulos: ["crm-dropshippers", "crm-comercial", "crm-direccion"], modulosSoloLectura: [] });
  assert.deepEqual(areasVisibles(ceo), ["direccion", "comercial", "atencion"]);
  assert.equal(escribeEnArea(ceo, "direccion"), true);
  assert.equal(areasVisibles(comercial).includes("direccion"), false);
  assert.equal(areasVisibles(atencion).includes("direccion"), false);
  assert.equal(escribeEnArea(comercial, "direccion"), false);
  assert.equal(escribeEnArea(atencion, "direccion"), false);
});
