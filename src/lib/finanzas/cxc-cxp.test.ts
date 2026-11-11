import assert from "node:assert/strict";
import test from "node:test";
import {
  antiguedad,
  diasVencido,
  estaVencido,
  estadoDe,
  montoDeFormulario,
  normalizarMetodo,
  resumirCartera,
  saldoDe,
  tramoDe,
  validarDocumentoImportado,
  vencimientoEfectivo,
  type DocumentoBase,
} from "./cxc-cxp";
import { resumirContra, validarClaves, validarHojas } from "./guardar-cartera";

const doc = (p: Partial<DocumentoBase> & { contraparte?: string }): DocumentoBase & { contraparte: string } => ({
  contraparte: "Cliente Uno",
  monto: 1000,
  fecha: "2026-01-10",
  vencimiento: null,
  estado_manual: null,
  abonos: [],
  ...p,
});

test("saldo y estado salen de los abonos; incobrable y anulado se marcan a mano", () => {
  assert.equal(saldoDe(doc({})), 1000);
  assert.equal(estadoDe(doc({})), "pendiente");
  assert.equal(estadoDe(doc({ abonos: [{ fecha: null, monto: 0.1 }, { fecha: null, monto: 0.2 }] })), "parcial");
  assert.equal(saldoDe(doc({ abonos: [{ fecha: null, monto: 0.1 }, { fecha: null, monto: 0.2 }] })), 999.7);
  assert.equal(estadoDe(doc({ abonos: [{ fecha: "2026-02-01", monto: 1000 }] })), "pagado");
  // Abonado de más: pagado con saldo negativo.
  const demas = doc({ abonos: [{ fecha: null, monto: 1000.5 }] });
  assert.equal(estadoDe(demas), "pagado");
  assert.equal(saldoDe(demas), -0.5);
  assert.equal(estadoDe(doc({ estado_manual: "incobrable", abonos: [{ fecha: null, monto: 1000 }] })), "incobrable");
  assert.equal(estadoDe(doc({ estado_manual: "anulado" })), "anulado");
});

test("antigüedad en tramos y vencimiento (30 días si no trae)", () => {
  assert.equal(antiguedad("2026-01-10", "2026-02-09"), 30);
  assert.equal(antiguedad("2026-03-01", "2026-02-09"), 0);
  assert.equal(antiguedad(null, "2026-02-09"), null);
  assert.deepEqual([0, 30, 31, 60, 61, 90, 91].map(tramoDe), ["0-30", "0-30", "31-60", "31-60", "61-90", "61-90", "90+"]);
  assert.equal(tramoDe(null), "sin-fecha");
  assert.equal(vencimientoEfectivo(doc({})), "2026-02-09");
  assert.equal(vencimientoEfectivo(doc({ vencimiento: "2026-01-20" })), "2026-01-20");
  assert.equal(vencimientoEfectivo(doc({ fecha: null })), null);
  assert.equal(estaVencido(doc({}), "2026-02-09"), false);
  assert.equal(estaVencido(doc({}), "2026-02-10"), true);
  assert.equal(diasVencido(doc({}), "2026-02-19"), 10);
  assert.equal(estaVencido(doc({ abonos: [{ fecha: null, monto: 1000 }] }), "2026-06-01"), false);
  assert.equal(estaVencido(doc({ fecha: null }), "2026-06-01"), false);
});

test("resumen: total, vencido, tramos, incobrable aparte y concentración", () => {
  const docs = [
    doc({ contraparte: "Uno", monto: 600, fecha: "2026-03-01" }), // 0-30
    doc({ contraparte: "Uno", monto: 400, fecha: "2025-12-01", abonos: [{ fecha: null, monto: 100 }] }), // 90+, vencido
    doc({ contraparte: "Dos", monto: 200, fecha: null }), // sin fecha
    doc({ contraparte: "Tres", monto: 500, fecha: "2026-01-20", estado_manual: "incobrable" }),
    doc({ contraparte: "Cuatro", monto: 900, fecha: "2026-01-20", estado_manual: "anulado" }),
    doc({ contraparte: "Cinco", monto: 50, fecha: "2026-01-20", abonos: [{ fecha: null, monto: 50 }] }),
  ];
  const r = resumirCartera(docs, "2026-03-10");
  assert.equal(r.total, 1100);
  assert.equal(r.documentosAbiertos, 3);
  assert.equal(r.vencido, 300);
  assert.equal(r.documentosVencidos, 1);
  assert.deepEqual(r.tramos, { "0-30": 600, "31-60": 0, "61-90": 0, "90+": 300, "sin-fecha": 200 });
  assert.equal(r.incobrable, 500);
  assert.deepEqual(r.top.map((t) => [t.contraparte, t.saldo, t.documentos]), [["Uno", 900, 2], ["Dos", 200, 1]]);
  assert.ok(Math.abs(r.parteTop - 1) < 1e-9);
});

test("método de pago y monto del formulario", () => {
  assert.equal(normalizarMetodo("TRASNFERENCIA"), "Transferencia");
  assert.equal(normalizarMetodo("transferencia "), "Transferencia");
  assert.equal(normalizarMetodo("BINANCE"), "Binance");
  assert.equal(normalizarMetodo("CRUCE DE CUENTAS"), "Compensación");
  assert.equal(normalizarMetodo("WISE"), "Wise");
  assert.equal(normalizarMetodo("  "), null);
  assert.equal(montoDeFormulario("1500"), 1500);
  assert.equal(montoDeFormulario("1.250,40"), 1250.4);
  assert.equal(montoDeFormulario("1,250.40"), 1250.4);
  assert.equal(montoDeFormulario("12,5"), 12.5);
  assert.equal(montoDeFormulario("$ 1,000"), 1000);
  assert.equal(montoDeFormulario("0"), null);
  assert.equal(montoDeFormulario("-5"), null);
  assert.equal(montoDeFormulario("abc"), null);
});

test("lo que llega del navegador al importar se valida sin confiar en nada", () => {
  const bueno = {
    fila: 3,
    hoja: "CPC",
    clase: "cobrar",
    contraparte: "  Cliente   Uno ",
    unidad: null,
    documento: "F-1",
    fecha: "2026-01-10",
    motivo: "Mercancía",
    monto: 100.456,
    notas_excel: null,
    origen_clave: "0123456789abcdef01234567#1",
    abonos: [{ fecha: "2026-13-01", monto: 10, metodo: "TRASNFERENCIA", referencia: "#1", origen_clave: "0123456789abcdef01234568#1" }],
  };
  const r = validarDocumentoImportado(bueno, "cobrar");
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.doc.contraparte, "Cliente Uno");
    assert.equal(r.doc.monto, 100.46);
    assert.equal(r.doc.abonos[0].fecha, null); // mes 13: no es fecha
    assert.equal(r.doc.abonos[0].metodo, "Transferencia");
  }
  assert.equal(validarDocumentoImportado(bueno, "pagar").ok, false);
  assert.equal(validarDocumentoImportado({ ...bueno, monto: -1 }, "cobrar").ok, false);
  assert.equal(validarDocumentoImportado({ ...bueno, contraparte: " " }, "cobrar").ok, false);
  assert.equal(validarDocumentoImportado({ ...bueno, origen_clave: "x" }, "cobrar").ok, false);
  assert.equal(validarDocumentoImportado({ ...bueno, abonos: [{ monto: 0, origen_clave: "0123456789abcdef01234568#1" }] }, "cobrar").ok, false);
  assert.equal(validarDocumentoImportado({ ...bueno, fecha: "20225-08-19" }, "cobrar").ok, true);
  assert.equal((validarDocumentoImportado({ ...bueno, fecha: "1899-12-30" }, "cobrar") as { doc: { fecha: null } }).doc.fecha, null);
});

test("resumen previo de una importación y hojas o huellas que llegan del navegador", () => {
  const ex = new Map([
    ["a", { id: "1", origen_clave: "a", protegido: false, editado: false }],
    ["b", { id: "2", origen_clave: "b", protegido: false, editado: false }],
    ["c", { id: "3", origen_clave: "c", protegido: true, editado: true }],
  ]);
  assert.deepEqual(resumirContra(ex, new Set(["a", "z"])), { nuevos: 1, actualizan: 1, borran: 1, conservan: 1 });
  assert.deepEqual(validarHojas([" CPP ", "CPP", 3, "  "]), ["CPP"]);
  assert.equal(validarClaves(["0123456789abcdef01234567#1", "nada", 5]).size, 1);
});
