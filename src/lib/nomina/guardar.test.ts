import assert from "node:assert/strict";
import test from "node:test";
import type { LineaExcel } from "./excel";
import { fusionarPersona, validarLinea, validarPeriodo } from "./guardar";

// Datos inventados.
const LINEA: LineaExcel = {
  hoja: "MARZO 2026", fila: 12, tipo: "formal", periodo: "2026-03-01", tramo: "1ª quincena", clave: "ANA PEREZ", nombre: "Ana Pérez",
  documento: "8-123-396", nacionalidad: "P", pais: null, numero_empleado: "5", cargo: "AUXILIAR", fecha_inicio: "2026-01-20",
  fecha_fin: "2026-07-19", estatus: "CONTRATO", correo: null, frecuencia: "QUINCENAL", unidad: null, unidad_persona: "A DISTRIBUIR",
  moneda: "USD", salario_mensual: 800, hora_rata: 4.102564, horas_trabajadas: 97.5, devengado: 400, horas_extra: 2.5,
  monto_horas_extra: 12.82, monto_feriado: 0, bono: 0, descuento_tardanza: 7.25, descuento_ausencia: 0, otros_descuentos: 0,
  total_bruto: 405.57, seguro_social: 39.54, seguro_educativo: 5.07, neto: 360.96, pagado: null, fecha_pago: null,
  medio_pago: null, referencia: null, origen_pago: null, tipo_pago: null, observacion: null, diferencia_calculo: 0,
  origen_clave: "0123456789abcdef01234567#1",
};

test("acepta una línea bien formada", () => {
  const r = validarLinea(LINEA);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.linea, { ...LINEA, clave: "ANA PEREZ" });
});

test("rechaza o limpia lo que el navegador no debería mandar", () => {
  assert.equal(validarLinea(null).ok, false);
  assert.equal(validarLinea({ ...LINEA, tipo: "otro" }).ok, false);
  assert.equal(validarLinea({ ...LINEA, periodo: "2026-03-15" }).ok, false);
  assert.equal(validarLinea({ ...LINEA, nombre: "   " }).ok, false);
  assert.equal(validarLinea({ ...LINEA, neto: "360" }).ok, false);
  assert.equal(validarLinea({ ...LINEA, neto: 1e12 }).ok, false);
  assert.equal(validarLinea({ ...LINEA, origen_clave: "x' or 1=1" }).ok, false);
  // La clave sale del nombre, no de lo que mandó el navegador; la moneda, del tipo.
  const r = validarLinea({ ...LINEA, clave: "OTRA PERSONA", moneda: "USDT", fecha_pago: "ayer", pagado: "SI" });
  assert.ok(r.ok && r.linea.clave === "ANA PEREZ" && r.linea.moneda === "USD" && r.linea.fecha_pago === null && r.linea.pagado === null);
  const ext = validarLinea({ ...LINEA, tipo: "externa", moneda: "USD" });
  assert.ok(ext.ok && ext.linea.moneda === "USDT");
});

test("valida los datos del mes", () => {
  assert.deepEqual(validarPeriodo({ periodo: "2026-06-01", tipo: "externa", comision: 131.63, total_excel: 6985.27, suma_lineas: 6985.27, lineas: 40 }), {
    periodo: "2026-06-01", tipo: "externa", comision: 131.63, total_excel: 6985.27, suma_lineas: 6985.27, lineas: 40,
  });
  assert.equal(validarPeriodo({ periodo: "2026-06-01", tipo: "externa", comision: -1 }), null);
  assert.equal(validarPeriodo({ periodo: "junio", tipo: "externa" }), null);
  assert.equal(validarPeriodo({ periodo: "2026-06-01", tipo: "externa", total_excel: null })?.total_excel, null);
});

test("una persona: lo último del Excel, sin borrar lo que ya estaba y sin pisar la tienda puesta a mano", () => {
  const ids: Record<string, string> = { "A DISTRIBUIR": "u-reparto", ECOMFIVE: "u-ecom" };
  const unidadId = (n: string | null) => (n ? (ids[n] ?? null) : null);
  const abril = { ...LINEA, periodo: "2026-04-01", documento: null, cargo: "SUPERVISOR", unidad_persona: "ECOMFIVE" };
  const nueva = fusionarPersona([LINEA, abril], null, unidadId);
  assert.equal(nueva.documento, "8-123-396");
  assert.equal(nueva.cargo, "SUPERVISOR");
  assert.equal(nueva.unidad_id, "u-ecom");
  assert.equal(nueva.fecha_inicio, "2026-01-20");
  const existente = {
    unidad_id: "u-otra", unidad_editada: true, documento: "8-999-111", nacionalidad: null, pais: null, numero_empleado: null,
    cargo: null, fecha_inicio: "2025-01-01", fecha_fin: null, estatus: null, correo: "ana@ejemplo.com", medio_pago: "ACH",
    frecuencia_pago: null, salario_mensual: 700,
  };
  const fusion = fusionarPersona([abril], existente, unidadId);
  assert.equal(fusion.unidad_id, "u-otra");
  assert.equal(fusion.unidad_editada, true);
  assert.equal(fusion.documento, "8-999-111");
  assert.equal(fusion.correo, "ana@ejemplo.com");
  assert.equal(fusion.fecha_inicio, "2025-01-01");
  assert.equal(fusion.salario_mensual, 800);
});
