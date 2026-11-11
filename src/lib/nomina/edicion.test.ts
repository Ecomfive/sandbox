import assert from "node:assert/strict";
import test from "node:test";
import { validarDatosLinea, validarDatosPersona } from "./edicion";

const UNIDAD = "0d7c0a4e-6f2b-4b8e-9a51-3c2d1e0f9a8b";

test("datos de una persona", () => {
  assert.deepEqual(validarDatosPersona({ unidad_id: UNIDAD, cargo: "  Auxiliar  de despacho ", correo: "Ana@Ejemplo.com", fecha_fin: "" }), {
    unidad_id: UNIDAD, cargo: "Auxiliar de despacho", estatus: null, correo: "ana@ejemplo.com", medio_pago: null, fecha_fin: null, activo: true,
  });
  assert.ok("error" in validarDatosPersona({ unidad_id: "1 or 1=1" }));
  assert.ok("error" in validarDatosPersona({ correo: "sin-arroba" }));
  assert.ok("error" in validarDatosPersona({ fecha_fin: "31/12/2026" }));
  assert.ok("error" in validarDatosPersona(null));
  assert.equal((validarDatosPersona({ activo: false }) as { activo: boolean }).activo, false);
});

test("datos de una línea", () => {
  assert.deepEqual(validarDatosLinea({ unidad_id: "", pagado: true, fecha_pago: "2026-06-30", referencia: " 4066638 " }), {
    unidad_id: null, pagado: true, fecha_pago: "2026-06-30", medio_pago: null, referencia: "4066638", observacion: null,
  });
  assert.ok("error" in validarDatosLinea({ pagado: "SI" }));
  assert.ok("error" in validarDatosLinea({ fecha_pago: "2026-13-45" }));
  assert.equal((validarDatosLinea({ pagado: null }) as { pagado: boolean | null }).pagado, null);
});
