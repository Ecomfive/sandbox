import assert from "node:assert/strict";
import test from "node:test";
import type { Celda } from "../finanzas/libro-excel";
import { modulosImportables, ordenar, reconocerArchivo, separarPorPermiso, type HojaMuestra } from "./reconocer";

// Hojas inventadas: solo imitan los títulos de los Excel reales (ningún dato real).
const h = (nombre: string, ...filas: Celda[][]): HojaMuestra => ({ nombre, filas });

const LIBRO = h("2026", ["Ejemplos de Asientos Contables"], [], ["MES", "FECHA INCLUSIÓN", "TIENDA", "TIPO", "DESCRIPCIÓN", "USD", "Pago", "Forma de Pago"], ["2026-01-01", null, "TIENDA A", "Publicidad", "x", 10]);
const EERR = h("EERR", ["PERÍODO", "PERÍODO"], ["PANAMA", "PANAMA"]);
const BIENES = h("Bienes de Uso", ["Depreciación mensual"], ["Altas Bienes de uso", "Importe", "Tipo de Bien", "Meses a Amortizar"], ["Silla", 100, "Muebles y Utiles", 60]);
const CPC = h("CPC", ["CUENTAS POR COBRAR "], ["N", "CLIENTE / DEUDOR ", "FACT", "FECH. EMI. ", "MONTO TOTAL "], [1, "Cliente inventado", "F-1", null, 50]);
const CPP = h(" CPP", ["CUENTAS POR PAGAR"], ["ACREEDOR INVENTADO"], ["MOTIVO "]);
const CPP_LISTA = h("CPP  OTRA TIENDA", ["DESCRIPCIÓN", "FECHA COMPRA", "PAIS", "# MONTO", "ESTATUS"]);
const DEFECTUOSA = h("MERCANCIA DEFECTUOSA", ["MERCANCIA DEFECTUOSA "], ["FECHA", "PRODUCTO ", "CANTIDADES", "COSTE ", "TOTAL PERDIDA", "TIENDA"]);
const BALANCE = h("Balance 2024", ["ACTIVO"], ["CAJA Y BANCOS"]);

const titulosFormal = ["N° de empleado", "CEDULA /PASAPORTE", "NAC", "NOMBRE COMPLETO", "CARGO", "SALARIO MENSUAL", "HORAS TRABAJADAS"];
const titulosExterna = ["Nombre completo", "País", "Rol / Función", "Tienda", "Sueldo Mensual USDT", "BONO USDT", "TOTAL  USDT", "TIPO DE PAGO"];

const titulosMatriz = ["TIENDA", "FECHA", "N° Orden", "NOMBRES Y APELLIDOS", "TOTAL VENTA", "CANTIDAD", "NOMBRE PRODUCTO", "FORMA DE PAGO"];
const titulosServientrega = ["Guia", "Nombre Cliente", "Destinatario", "Servicio", "Valor Recaudar", "Consignacion", "Monto Depositado"];

function gestionDeliverys(): HojaMuestra {
  const cols: [string | null, string][] = [
    ["GESTIÓN DE DELIVERYS", " FECHA"],
    [null, "MES"],
    [null, "NOMBRE DEL DELIVERY"],
    ["TIENDAS", "OFERFY"],
    [null, "NUVO"],
    ["PAGO POR ENTREGAS (COSTE DE ENVIO $3.65 cada uno)", "ENTREGADO NUVO"],
    [null, "FALLIDO NUVO"],
    ["CALCULOS DE PAGOS DE ENVIOS", "Pagar por envíos NUVO"],
  ];
  return h("GESTION DELIVERY II", ["título suelto"], cols.map((c) => c[0]), cols.map((c) => c[1]));
}

test("el libro de gastos alimenta cuatro módulos: libro (con la base de reparto), bienes y las dos carteras", () => {
  const r = reconocerArchivo([h("Memo", ["OBJETIVO"]), LIBRO, EERR, BIENES, DEFECTUOSA, BALANCE, CPC, CPP, CPP_LISTA]);
  assert.deepEqual(
    r.map((x) => x.modulo),
    ["libro-movimientos", "bienes-de-uso", "cuentas-por-cobrar", "cuentas-por-pagar"],
  );
  assert.deepEqual(r[0].hojas, ["2026", "EERR"]);
  assert.deepEqual(r[3].hojas, [" CPP", "CPP  OTRA TIENDA"]);
});

test("el libro prefiere la hoja que se llama como un año", () => {
  const otra = h("COPIA", ...LIBRO.filas);
  const r = reconocerArchivo([otra, LIBRO]);
  assert.deepEqual(r[0].hojas, ["2026"]);
  assert.equal(r[0].detalle, "Hoja «2026»");
});

test("costos: las hojas «MERCANCIA …» con COSTO UNITARIO y el mapeo; «MERCANCIA DEFECTUOSA» no cuenta", () => {
  const r = reconocerArchivo([
    h("PRESTAMO", ["CONCEPTO", "TOTAL"]),
    h("MERCANCIA TIENDA A", ["FECHA", "MES", "PROVEEDOR", "CODIGO", "DESCRIPCION", "CANTIDAD", "COSTO UNITARIO"]),
    h("MERCANCÍA TIENDA B", [], ["FECHA DE LLEGADA", "PRODUCTO", "CANTIDAD", "COSTO UNITARIO  ", "COSTO TOTAL"]),
    DEFECTUOSA,
    h("MAPEO", ["MAPEO"], ["PRODUCTO DROPI", "PRODUCTO COSTE A USAR"]),
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].modulo, "costos-mercancia");
  assert.deepEqual(r[0].hojas, ["MERCANCIA TIENDA A", "MERCANCÍA TIENDA B", "MAPEO"]);
  // Solo la hoja defectuosa: no es un archivo de costos.
  assert.deepEqual(reconocerArchivo([DEFECTUOSA]), []);
});

test("nómina: planilla formal y nómina externa por sus títulos; la hoja de cálculos no cuenta", () => {
  const formal = reconocerArchivo([h("PLANILLA NOMINA", titulosFormal), h("ENERO 2026", ["GUIA RAPIDA DE USO"], titulosFormal), h("CALCULOS", ["TARDANZAS"])]);
  assert.equal(formal.length, 1);
  assert.equal(formal[0].modulo, "nomina");
  assert.equal(formal[0].detalle, "Planilla formal");
  assert.deepEqual(formal[0].hojas, ["PLANILLA NOMINA", "ENERO 2026"]);
  const externa = reconocerArchivo([h("INFORMACION", ["FECHA DE INICIO", "NOMBRE "]), h("MARZO 2026", titulosExterna)]);
  assert.equal(externa[0].detalle, "Nómina externa (USDT)");
  assert.deepEqual(externa[0].hojas, ["MARZO 2026"]);
});

test("ventas: «Excel Matriz» con sus complementos; la hoja de Servientrega no se ofrece aparte a conciliación", () => {
  const r = reconocerArchivo([
    h("Tiendas", ["TIENDA A"]),
    h("TIENDA_A", ["Fecha", "N° Orden", "Total Venta"]),
    h("Excel Matriz", titulosMatriz),
    h("Monday", ["Name", "Tienda", "Estado", "Forma de Pago"]),
    h("BASE COSTO ECOMFIVE", ["PRODUCTO", "COSTO TOTAL"]),
    h("Informe SE", titulosServientrega),
  ]);
  assert.deepEqual(
    r.map((x) => x.modulo),
    ["ventas-tiendas"],
  );
  assert.deepEqual(r[0].hojas, ["Excel Matriz", "Monday", "BASE COSTO ECOMFIVE", "Informe SE"]);
});

test("deliverys: la hoja con «NOMBRE DEL DELIVERY» y los bloques de tarifa", () => {
  const r = reconocerArchivo([gestionDeliverys(), h("CIERRE SEMANAL DELIVERY", ["OFERFY", "TOTAL PAGO DE LA SEMANA"]), DEFECTUOSA]);
  assert.deepEqual(r, [{ modulo: "deliverys", hojas: ["GESTION DELIVERY II"], detalle: "Hoja «GESTION DELIVERY II»" }]);
});

test("conciliación: extractos de banco, Yappy, MiPOS y Servientrega; los reportes y el resumen no cuentan", () => {
  const r = reconocerArchivo([
    h("ECOMFIVE", ["Fecha", "Referencia", "Código", "Descripción", "Débitos", "Créditos", "Estado Conciliación"]),
    h("BANCO GENERAL", ["Fecha", "Referencia", "Transacción", "Descripción", "Débito", "Crédito"]),
    h("Servientrega - Datos", ["TIENDA A"], titulosServientrega),
    h("Reporte BAC", ["N° Orden", "Veces", "Filas del banco"]),
    h("YAPPY", ["Fecha", "Hora", "Referencia", "Punto de cobro", "Sub-Total", "Total"]),
    h("MIPos", ["Fecha", "Estado", "Tipo", "Importe", "No Autorización"]),
    h("Resumen", ["Tienda", "Importe Banco (Conciliado)", "Diferencia"]),
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].modulo, "conciliacion-bancaria");
  assert.deepEqual(r[0].hojas, ["ECOMFIVE", "BANCO GENERAL", "Servientrega - Datos", "YAPPY", "MIPos"]);
  assert.equal(r[0].detalle, "Extracto BAC, Extracto Banco General, Guías Servientrega, Cobros Yappy, Cobros MiPOS");
});

test("un CSV de banco (una sola hoja con Fecha, Descripción y Monto) es un extracto", () => {
  const r = reconocerArchivo([h("movimientos-octubre", ["Fecha", "Descripción", "Referencia", "Monto", "Saldo"])]);
  assert.equal(r[0]?.modulo, "conciliacion-bancaria");
  assert.equal(r[0].detalle, "Extracto bancario");
});

test("un archivo que no es de nada no se reconoce", () => {
  assert.deepEqual(reconocerArchivo([h("Hoja1", ["Nombre", "Edad"], ["x", 1])]), []);
  assert.deepEqual(reconocerArchivo([]), []);
});

test("orden de carga: libro antes que conciliación, ventas antes que deliverys", () => {
  const xs = ordenar([{ modulo: "conciliacion-bancaria" as const }, { modulo: "deliverys" as const }, { modulo: "ventas-tiendas" as const }, { modulo: "libro-movimientos" as const }]);
  assert.deepEqual(
    xs.map((x) => x.modulo),
    ["libro-movimientos", "ventas-tiendas", "deliverys", "conciliacion-bancaria"],
  );
});

test("solo se ofrece lo que la persona puede modificar", () => {
  const r = reconocerArchivo([LIBRO, EERR, BIENES, CPC]);
  const { permitidos, sinPermiso } = separarPorPermiso(r, ["libro-movimientos", "bienes-de-uso"], ["bienes-de-uso"]);
  assert.deepEqual(
    permitidos.map((x) => x.modulo),
    ["libro-movimientos"],
  );
  assert.deepEqual(
    sinPermiso.map((x) => x.modulo),
    ["bienes-de-uso", "cuentas-por-cobrar"],
  );
  assert.deepEqual(modulosImportables(["nomina", "retiros", "deliverys"], ["deliverys"]), ["nomina"]);
});
