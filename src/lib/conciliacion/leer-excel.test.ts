import assert from "node:assert/strict";
import test from "node:test";
import { cuentaSugerida, detectarHoja, fechaBanco, leerConsignacion, leerHoja, montoBanco } from "./leer-excel";

// Datos inventados con la forma de las hojas reales (sin nombres, teléfonos ni montos de verdad).
const BG = [
  ["Fecha", "Referencia", "Referencia 1", "Referencia 2", "Referencia 3", "Referencia 4", "Transacción", "Descripción", "Débito", "Crédito", "Tipo de ingreso", "Estado Conciliación", "Tienda Detectada", "Orden Detectada", "Origen", "Monto Detectado"],
  ["01-Sep-2026", 457, "DDFER0000001", null, null, null, 253, "DEPOSITO YAPPY - tiendademo (2 TRANSACCIONES)", null, "$1,250.50", "Corte Yappy", "Conciliado", "DEMO", "CORTE YAPPY 31/08/2026", "Pestaña YAPPY", 1250.5],
  ["01-Sep-2026", 457, 275000001, null, null, null, 264, "COMISION TRANSACCIONES YAPPY tiendademo", "$13.38", null],
  ["02-Sep-2026", 93, 277000001, "VARIO0000NBD", null, null, 300, "BANCA MOVIL TRANSFERENCIA DE PERSONA DEMO", null, "$45.00", "Transferencia", "Conciliado", "DEMO", "CIERRE 01/09/2026", "Monday Cierre (REPARTIDOR DEMO)", 45],
  ["02-Sep-2026", 93, 277000001, "VARIO0000NBD", null, null, 300, "BANCA MOVIL TRANSFERENCIA DE PERSONA DEMO", null, "$45.00"],
  [null, null, null, null, null, null, null, null, null, null],
];

const BAC = [
  ["Fecha", "Referencia", null, "Código", "Descripción", null, null, "Débitos", "Créditos", "Tipo de Ingreso", "Estado Conciliación"],
  [new Date(2026, 8, 1), 418000001, null, "DF", "DEPOSITO EN EFECTIVO", null, null, "0.00", "29.98", "Depósito", "NO CONCILIADO"],
  [new Date(2026, 8, 1), 8000001, null, "FE", "COM ACH BEL CTE COMERCIAL", null, null, "0.10", "0.00"],
  [new Date(2026, 8, 2), 8000002, null, "FE", "SIN MONTO", null, null, "0.00", "0.00"],
];

test("montos de extracto con cualquier separador", () => {
  assert.equal(montoBanco("$1,769.71"), 1769.71);
  assert.equal(montoBanco("$0,00"), 0);
  assert.equal(montoBanco("$63,90"), 63.9);
  assert.equal(montoBanco("-1.250,40"), -1250.4);
  assert.equal(montoBanco("(25.00)"), -25);
  assert.equal(montoBanco(12.345), 12.35);
  assert.equal(montoBanco("—"), null);
});

test("fechas de extracto en todas sus formas", () => {
  assert.equal(fechaBanco("01-Sep-2026"), "2026-09-01");
  assert.equal(fechaBanco("15-Ago-2026"), "2026-08-15");
  assert.equal(fechaBanco("mar 15/09/2026"), "2026-09-15");
  assert.equal(fechaBanco("1/9/26"), "2026-09-01");
  assert.equal(fechaBanco(new Date(2026, 8, 9, 22, 30)), "2026-09-09", "la hora no cambia el día");
  assert.equal(fechaBanco("31-Sep-2026"), null);
  assert.equal(fechaBanco("hola"), null);
});

test("Banco General: referencia principal, débito y crédito con signo, y lo que marcó Majo", () => {
  assert.equal(detectarHoja(BG), "banco_general");
  const h = leerHoja("BANCO GENERAL", BG)!;
  assert.equal(h.lineas.length, 4);
  const [dep, com, t1, t2] = h.lineas;
  assert.equal(dep.monto, 1250.5);
  assert.equal(dep.referencia, "DDFER0000001");
  assert.equal(dep.estado_excel, "conciliado");
  assert.equal(com.monto, -13.38);
  assert.equal(com.estado_excel, null);
  assert.notEqual(t1.huella, t2.huella, "dos líneas idénticas tienen huellas distintas");
  assert.equal(t1.huella.split("#")[0], t2.huella.split("#")[0]);
  assert.equal(leerHoja("BANCO GENERAL", BG)!.lineas[2].huella, t1.huella, "la huella es estable");
  // Del cruce de Majo: el cierre es una orden; el corte de Yappy no (es un cobro).
  assert.deepEqual(
    h.ordenes.map((o) => [o.numero, o.metodo_pago, o.repartidor, o.fecha, o.monto]),
    [["CIERRE 01/09/2026", "cierre", "REPARTIDOR DEMO", "2026-09-01", 45]],
  );
});

test("BAC: «0.00» en la otra columna y la fila sin monto se descarta", () => {
  assert.equal(detectarHoja(BAC), "bac");
  const h = leerHoja("BAC", BAC)!;
  assert.deepEqual(h.lineas.map((l) => [l.fecha, l.monto, l.codigo, l.estado_excel]), [
    ["2026-09-01", 29.98, "DF", "no_conciliado"],
    ["2026-09-01", -0.1, "FE", null],
  ]);
  assert.deepEqual(h.descartadas.map((d) => d.motivo), ["sin monto"]);
});

test("un CSV cualquiera: fecha, concepto, monto con signo y saldo", () => {
  const csv = [
    ["Fecha", "Concepto", "Referencia", "Monto", "Saldo"],
    ["05/09/2026", "PAGO PROVEEDOR DEMO", "A1", "-1.250,40", "8.000,00"],
    ["06/09/2026", "DEPOSITO", "A2", "300", "8.300,00"],
  ];
  assert.equal(detectarHoja(csv), "generico");
  const h = leerHoja("csv", csv)!;
  assert.deepEqual(h.lineas.map((l) => [l.fecha, l.monto, l.saldo, l.referencia]), [
    ["2026-09-05", -1250.4, 8000, "A1"],
    ["2026-09-06", 300, 8300, "A2"],
  ]);
  // Un reporte con «Fecha depósito (código)» no es un extracto.
  assert.equal(detectarHoja([["Consignación", "Monto", "Fecha depósito (código)", "Detalle"]]), null);
});

test("Yappy, MiPOS y Servientrega: cobros, anuladas y la referencia del código de consignación", () => {
  const yappy = leerHoja("YAPPY", [
    ["Fecha", null, null, "Hora", null, "Referencia", null, null, "Nombre del cliente", null, null, "Celular", "Comentario", "Estado", "Punto de cobro", "Identificador", "Motivo de pago", "Sub-Total", "Propina", "Descuento", "Impuesto", "Total", null, "ID Grupo", null, "ID Caja", "OrdenDetectado", "EstadoConciliacion", "DeliveryDetectado", "TiendaMonday", "MontoMonday"],
    ["mar 15/09/2026", null, null, null, null, "AAAAA-00000001", null, null, "CLIENTE DEMO", null, null, 50760000000, null, "Procesada", "tiendademo", "-", "-", "$0,00", "$0,00", "$0,00", "$0,00", "$63,90", null, "-", null, "-", 100001, "Conciliado", "REPARTIDOR DEMO", "DEMO", 63.9],
  ])!;
  assert.equal(yappy.formato, "yappy");
  assert.deepEqual(
    yappy.cobros.map((c) => [c.fecha, c.monto_bruto, c.orden, c.anulada, c.referencia]),
    [["2026-09-15", 63.9, "100001", false, "AAAAA-00000001"]],
  );
  assert.ok(!JSON.stringify(yappy).includes("CLIENTE DEMO"), "no se guarda el nombre del cliente");
  assert.ok(!JSON.stringify(yappy).includes("50760000000"), "ni su teléfono");
  assert.equal(yappy.ordenes[0].metodo_pago, "yappy");

  const mipos = leerHoja("MIPos", [
    ["Fecha", "Nombre de comercio", "Estado", "Nombre del cliente", "Número tarjeta", "Método de pago", "Importe", "Nº autorización", "Nº de afiliado", "Tipo", "Nº de lote", "OrdenDetectado", "EstadoConciliacion"],
    [new Date(2026, 8, 9, 13, 0), "DEMO", "Abierta", "TARJETAHABIENTE", "400000XXXXXX0000", "Visa", "29.99", 111111, 98000000, "Venta", 1, 100002, "Conciliado"],
    [new Date(2026, 8, 9, 13, 5), "DEMO", "Finalizada", null, "400000XXXXXX0000", "Visa", "0.01", 222222, 98000000, "Anulación", null, null, "Anulado (excluido)"],
  ])!;
  assert.equal(mipos.formato, "mipos");
  assert.deepEqual(mipos.cobros.map((c) => [c.monto_bruto, c.anulada, c.lote]), [
    [29.99, false, "98000000/1"],
    [0.01, true, null],
  ]);
  assert.ok(!JSON.stringify(mipos).includes("XXXXXX"), "no se guarda la tarjeta");

  assert.deepEqual(leerConsignacion("BAC6458CPLPEN_01092026"), { referencia: "6458", fecha: "2026-09-01" });
  assert.deepEqual(leerConsignacion("ACHBAC11436619NUVO_28082026"), { referencia: "11436619", fecha: "2026-08-28" });
  assert.deepEqual(leerConsignacion("MPOSNUVOFT26257TDY9RW_081112092026"), { referencia: null, fecha: null });

  const se = leerHoja("Servientrega - Datos", [
    [" ", "DEMO", null, null, null, null, null, null, null, "No.:", "0001-2026"],
    ["Guia", "Nombre Cliente", "Destinatario", "CPL", "Servicio", "Valor Recaudar", "Consignacion", "Metodo de Pago", "Monto Depositado", "Fecha Emision", "Fecha de Entrega", "Numero factura"],
    [7000000001, "DEMO", "DESTINATARIO DEMO", "CPL DEMO", "RECAUDO", 29.99, "BAC1234CPLDEMO_02102026", "EFECTIVO", 29.99, new Date(2026, 8, 29), new Date(2026, 9, 1), "#40001"],
  ])!;
  assert.equal(se.formato, "servientrega");
  assert.deepEqual(se.cobros.map((c) => [c.fecha, c.fecha_deposito, c.referencia_banco, c.lote, c.orden]), [["2026-10-01", "2026-10-02", "1234", "BAC1234CPLDEMO_02102026", "40001"]]);
  assert.ok(!JSON.stringify(se).includes("DESTINATARIO DEMO"));
});

test("la cuenta del libro que corresponde a cada hoja", () => {
  const cuentas = [
    { id: "bg", nombre: "BANCO GENERAL" },
    { id: "tdc", nombre: "TDC BAC OCEANS 6202" },
    { id: "oceans", nombre: "BAC OCEANS" },
    { id: "eco", nombre: "BAC ECOMFIVE" },
  ];
  assert.equal(cuentaSugerida("BANCO GENERAL", cuentas), "bg");
  assert.equal(cuentaSugerida("BAC", cuentas), "oceans");
  assert.equal(cuentaSugerida("ECOMFIVE", cuentas), "eco");
  assert.equal(cuentaSugerida("Hoja1", cuentas), null);
});
