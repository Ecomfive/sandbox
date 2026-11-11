import assert from "node:assert/strict";
import { test } from "node:test";
import { armarCalendario, leerFecha, leerMonto, pagosFiscales, prioridadDe, priorizarPagos, puedeDarPaso, type FuentesCalendario, type PagoCalendario } from "./pagos";

const semanas = ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"];
const base: FuentesCalendario = { hoy: "2026-10-23", semanas, cxp: [], programados: [], deuda: [], proyeccion: [] };

test("prioridad: la del pago, luego proveedor, luego categoría, luego la de por defecto", () => {
  const reglas = [
    { ambito: "contraparte" as const, valor: "proveedor  ejemplo", prioridad: "critico" as const },
    { ambito: "categoria" as const, valor: "recurrente", prioridad: "postergable" as const },
  ];
  assert.equal(prioridadDe({ categoria: "cxp", contraparte: "Proveedor Ejemplo" }, reglas), "critico");
  assert.equal(prioridadDe({ categoria: "cxp", contraparte: "Otro" }, reglas), "negociable");
  assert.equal(prioridadDe({ categoria: "recurrente", contraparte: null }, reglas), "postergable");
  assert.equal(prioridadDe({ categoria: "nomina", contraparte: null }, []), "critico");
  assert.equal(prioridadDe({ categoria: "cxp", contraparte: "Proveedor Ejemplo", prioridad: "postergable" }, reglas), "postergable");
});

test("calendario: lo vencido va hoy, lo de más de 4 semanas queda fuera y lo programado no se repite", () => {
  const cal = armarCalendario(
    {
      ...base,
      cxp: [
        { id: "a", contraparte: "Prov A", documento: "F-1", saldo: 500, vencimiento: "2026-10-01" },
        { id: "b", contraparte: "Prov B", documento: null, saldo: 300, vencimiento: "2026-11-04" },
        { id: "c", contraparte: "Prov C", documento: null, saldo: 900, vencimiento: "2026-12-30" },
      ],
      programados: [
        { id: "p1", concepto: "Prov B", contraparte: "Prov B", categoria: "cxp", monto: 300, fecha: "2026-11-05", estado: "aprobado", prioridad: "negociable", origenRef: "cxp:b", carteraId: "b" },
        { id: "p2", concepto: "Alquiler extra", contraparte: null, categoria: "otro", monto: 120, fecha: "2026-10-28", estado: "solicitado", prioridad: "postergable", origenRef: null, carteraId: null },
      ],
      deuda: [{ fecha: "2026-10-31", concepto: "Préstamo · cuota 3", monto: 888.49, origen: "prestamo", ref: "x:3" }],
      proyeccion: [{ categoria: "nomina", detalle: "Planilla", valores: [0, 1500, 0, 1500, 9] }],
    },
    [],
  );
  const por = Object.fromEntries(cal.map((p) => [p.clave, p]));
  assert.equal(por["cxp:a"].fecha, "2026-10-23");
  assert.equal(por["cxp:a"].vencido, true);
  assert.equal(por["cxp:b"].programado?.estado, "aprobado");
  assert.equal(por["cxp:b"].fecha, "2026-11-05");
  assert.equal(por["cxp:c"], undefined);
  assert.equal(por["prog:p1"], undefined);
  assert.equal(por["prog:p2"].semana, 1);
  assert.equal(por["deuda:x:3"].prioridad, "critico");
  assert.deepEqual(cal.filter((p) => p.categoria === "nomina").map((p) => [p.fecha, p.monto, p.estimado]), [
    ["2026-10-26", 1500, true],
    ["2026-11-09", 1500, true],
  ]);
});

const pago = (clave: string, semana: number, monto: number, prioridad: PagoCalendario["prioridad"]): PagoCalendario => ({
  clave,
  fecha: semanas[semana],
  vence: semanas[semana],
  vencido: false,
  semana,
  categoria: "cxp",
  concepto: clave,
  contraparte: null,
  monto,
  prioridad,
  estimado: false,
  origenRef: null,
  carteraId: null,
  programado: null,
});

test("priorizar: lo crítico se paga siempre, lo demás se corre hasta que haya caja", () => {
  const r = priorizarPagos(
    [pago("nomina", 0, 800, "critico"), pago("prov", 0, 500, "negociable"), pago("extra", 0, 300, "postergable")],
    { inicial: 1000, entradas: [0, 600, 0, 0], otrasSalidas: [0, 0, 0, 0], reserva: 100 },
  );
  assert.equal(r.propuestas.get("nomina")?.decision, "pagar");
  assert.equal(r.propuestas.get("prov")?.decision, "postergar");
  assert.equal(r.propuestas.get("prov")?.semanaPago, 1);
  assert.equal(r.propuestas.get("extra")?.decision, "sin_caja");
  assert.deepEqual(r.cajaFinal, [200, 300, 300, 300]);
  assert.equal(r.alcanza, false);
});

test("priorizar: lo crítico sin caja cuenta como déficit", () => {
  const r = priorizarPagos([pago("impuesto", 0, 900, "critico")], { inicial: 500, entradas: [0, 0, 0, 0], otrasSalidas: [0, 0, 0, 0], reserva: 100 });
  assert.equal(r.propuestas.get("impuesto")?.decision, "pagar_sin_caja");
  assert.equal(r.deficitCritico, 500);
  assert.equal(r.cajaFinal[0], -400);
});

test("pasos: dos manos para aprobar, salvo administración", () => {
  const p = { estado: "solicitado" as const, solicitadoPor: "u1" };
  assert.equal(puedeDarPaso("aprobar", p, { id: "u1", esAdmin: false }).ok, false);
  assert.equal(puedeDarPaso("aprobar", p, { id: "u1", esAdmin: true }).ok, true);
  assert.equal(puedeDarPaso("aprobar", p, { id: "u2", esAdmin: false }).ok, true);
  assert.equal(puedeDarPaso("pagar", p, { id: "u2", esAdmin: false }).ok, false);
  assert.equal(puedeDarPaso("pagar", { ...p, estado: "aprobado" }, { id: "u1", esAdmin: false }).ok, true);
  assert.equal(puedeDarPaso("anular", { ...p, estado: "pagado" }, { id: "u1", esAdmin: true }).ok, false);
});

test("leer monto y fecha", () => {
  assert.equal(leerMonto("$1,250.50"), 1250.5);
  assert.equal(leerMonto("0"), null);
  assert.equal(leerFecha("2026-10-23"), "2026-10-23");
  assert.equal(leerFecha("23/10/2026"), null);
});

test("calendario fiscal: vencimientos sin presentar con monto estimado y sin repetir el impuesto de la proyección", () => {
  const filas = [
    { obligacionId: "o1", clave: "itbms", nombre: "ITBMS", periodicidad: "mensual" as const, periodo: "2026-09-01", nombrePeriodo: "septiembre", vence: "2026-10-15", presentada: false },
    { obligacionId: "o1", clave: "itbms", nombre: "ITBMS", periodicidad: "mensual" as const, periodo: "2026-10-01", nombrePeriodo: "octubre", vence: "2026-11-13", presentada: false },
    { obligacionId: "o2", clave: "retenciones", nombre: "Retenciones", periodicidad: "mensual" as const, periodo: "2026-09-01", nombrePeriodo: "septiembre", vence: "2026-10-12", presentada: true },
    { obligacionId: "o3", clave: "renta-anual", nombre: "Renta", periodicidad: "anual" as const, periodo: "2026-01-01", nombrePeriodo: "año 2026", vence: "2027-03-31", presentada: false },
  ];
  const { pagos, tiposCubiertos } = pagosFiscales(filas, new Map([["o3", 900]]), [{ tipo: "Impuestos sobre ventas", monto: 420 }, { tipo: "Otro impuesto", monto: 10 }], "2026-11-22");
  assert.deepEqual(pagos.map((p) => [p.ref, p.monto]), [["fiscal:itbms:2026-09", 420], ["fiscal:itbms:2026-10", 420]]);
  assert.deepEqual([...tiposCubiertos], ["Impuestos sobre ventas"]);
  const cal = armarCalendario({ ...base, fiscal: pagos }, []);
  const por = Object.fromEntries(cal.map((p) => [p.clave, p]));
  assert.equal(por["fiscal:itbms:2026-09"].vencido, true);
  assert.equal(por["fiscal:itbms:2026-09"].fecha, "2026-10-23");
  assert.equal(por["fiscal:itbms:2026-10"].semana, 4 - 1);
  assert.equal(por["fiscal:itbms:2026-10"].categoria, "impuesto");
  assert.equal(por["fiscal:itbms:2026-10"].estimado, true);
});

test("calendario fiscal: lo vencido hace más de `desde` no entra al calendario de pagos", () => {
  const f = { obligacionId: "o1", clave: "itbms", nombre: "ITBMS", periodicidad: "mensual" as const, nombrePeriodo: "x", presentada: false };
  const { pagos } = pagosFiscales(
    [{ ...f, periodo: "2026-01-01", vence: "2026-02-16" }, { ...f, periodo: "2026-09-01", vence: "2026-10-15" }],
    new Map(),
    [],
    "2026-11-22",
    "2026-09-18",
  );
  assert.deepEqual(pagos.map((p) => p.ref), ["fiscal:itbms:2026-09"]);
});
