// Datos inventados con la forma de las hojas reales (CPC, « CPP» en bloques y la lista de compras).
import assert from "node:assert/strict";
import test from "node:test";
import { hojasDeCartera, leerCartera, leerFechaCelda, leerHojaCpc, leerHojaCppBloques, leerHojaCppLista, resolverFechas, separarNombre, unidadDeHoja, unidadPorCodigo } from "./cxc-cxp-excel";
import { saldoDe, type DocumentoImportado } from "./cxc-cxp";
import type { Celda } from "./libro-excel";

const f = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const saldo = (docs: DocumentoImportado[]) => Math.round(docs.reduce((a, d) => a + saldoDe(d), 0) * 100) / 100;

test("fechas: invertidas, texto mes/día, errores de Excel", () => {
  assert.deepEqual(leerFechaCelda(f(2025, 9, 25)), { fecha: "2025-09-25", alterna: null, error: false });
  assert.deepEqual(leerFechaCelda(f(2025, 1, 12)), { fecha: "2025-01-12", alterna: "2025-12-01", error: false });
  assert.deepEqual(leerFechaCelda("11/15/2025"), { fecha: "2025-11-15", alterna: null, error: false });
  assert.deepEqual(leerFechaCelda("15/11/2025"), { fecha: "2025-11-15", alterna: null, error: false });
  assert.equal(leerFechaCelda(new Date(Date.UTC(20225, 7, 19))).error, true); // el «#VALUE!» que Excel guarda como fecha
  assert.equal(leerFechaCelda("#VALUE!").error, true);
  assert.equal(leerFechaCelda(null).fecha, null);
  assert.equal(leerFechaCelda(46026).fecha, "2026-01-04");
  // Entre el 29 de nov y el 15 de dic, «12 de enero» es en realidad el 1 de diciembre.
  const r = resolverFechas([leerFechaCelda("11/29/2025"), leerFechaCelda(f(2025, 1, 12)), leerFechaCelda("12/15/2025"), leerFechaCelda(f(2025, 12, 5))]);
  assert.deepEqual(r.map((x) => [x.fecha, x.corregida]), [["2025-11-29", false], ["2025-12-01", true], ["2025-12-15", false], ["2025-12-05", false]]);
  // Sin fechas seguras alrededor no se adivina.
  assert.deepEqual(resolverFechas([leerFechaCelda(f(2025, 8, 5))]), [{ fecha: "2025-08-05", corregida: false }]);
});

test("nombres, tiendas por código y por hoja", () => {
  assert.deepEqual(separarNombre(" Proveedor Sur SA (JARABE) "), { nombre: "Proveedor Sur SA", detalle: "JARABE" });
  assert.deepEqual(separarNombre("Proveedor Sur SA"), { nombre: "Proveedor Sur SA", detalle: null });
  assert.equal(unidadPorCodigo("CO-00013"), "CALZADOS O.");
  assert.equal(unidadPorCodigo("ECOM - 0018"), "ECOMFIVE");
  assert.equal(unidadPorCodigo("PA-00171"), null);
  assert.equal(unidadDeHoja("CPP  CALZADOS O. VZLA"), "CALZADOS O.");
  assert.deepEqual(hojasDeCartera(["2026", "CPC", " CPP", "CPP  CALZADOS O. VZLA", "CPPX"], "pagar"), [" CPP", "CPP  CALZADOS O. VZLA"]);
  assert.deepEqual(hojasDeCartera(["CPC", "CUENTAS POR COBRAR 2025"], "cobrar"), ["CPC", "CUENTAS POR COBRAR 2025"]);
});

const CPC: Celda[][] = [
  ["CUENTAS POR COBRAR "],
  ["N ", "CLIENTE / DEUDOR ", "FACT", "FECH. EMI. ", "MOTIVO DE FACT", "MONTO TOTAL ", "ABONO 1", "ABONO 2", "ABONO 3", "METODO DE PAGO ", "S. PENDIENTE ", "ESTADO ", "OBSERVACIONES"],
  [1, "CLIENTE DEMO ", null, f(2025, 3, 27), "ENVIO DE MERCANCIA", 1000, null, null, null, "TRANSFERENCIA ", 1000, "PENDIENTE ", "SIN FACTURA FISCAL"],
  [2, "CLIENTE DEMO ", "FACT-0001", f(2025, 7, 18), null, 300, 100, 50, null, "TRANSFERENCIA ", 200, "EN PROCESO "],
  [3, "OTRO CLIENTE", "FACT-0002", f(2025, 7, 19), null, 80, 80, null, null, "BINANCE", 0, "PENDIENTE "],
  [5, null, null, f(2025, 7, 21), null, null, null, null, null, null, 0, "EN PROCESO "],
  ["6", null, null, f(2025, 7, 22), null, null, null, null, null, null, 0],
  ["7", null, null, f(2025, 7, 23), null, null, null, null, null, null, 0],
];

test("CPC: documentos, abonos sin fecha, plantilla, descartadas y controles contra la hoja", () => {
  const r = leerHojaCpc(CPC, "CPC");
  assert.equal(r.documentos.length, 3);
  assert.equal(r.plantilla, 2);
  assert.deepEqual(r.descartadas, [{ hoja: "CPC", fila: 6, motivo: "sin cliente ni monto (estado «EN PROCESO»)" }]);
  const [a, b, c] = r.documentos;
  assert.equal(a.contraparte, "CLIENTE DEMO");
  assert.equal(a.notas_excel, "SIN FACTURA FISCAL");
  assert.deepEqual(b.abonos.map((x) => [x.fecha, x.monto, x.metodo]), [[null, 100, "Transferencia"], [null, 50, "Transferencia"]]);
  assert.equal(saldo(r.documentos), 1150);
  // La hoja resta solo el ABONO 1 (200 en vez de 150) y marca «PENDIENTE» algo que ya está pagado.
  assert.deepEqual(r.controles.map((x) => [x.fila, x.qué, x.excel, x.portal]), [[4, "saldo", "200.00", "150.00"], [5, "estado", "PENDIENTE", "pagado"]]);
  assert.equal(c.abonos.length, 1);
  // Huellas estables y únicas.
  assert.equal(new Set(r.documentos.map((d) => d.origen_clave)).size, 3);
  assert.deepEqual(leerHojaCpc(CPC, "CPC").documentos.map((d) => d.origen_clave), r.documentos.map((d) => d.origen_clave));
});

// Dos acreedores lado a lado (A–F y H–M); debajo del segundo, otro acreedor en las mismas columnas; a la derecha (O–U)
// una lista de deudas con código y fechas invertidas.
const v = (n: number) => Array<Celda>(n).fill(null);
const fila = (...celdas: [number, Celda][]) => {
  const r = v(22);
  for (const [i, x] of celdas) r[i] = x;
  return r;
};
const titulos = (c: number, conNombre = false) =>
  (conNombre ? ["FECHA", "NOMBRE ", "DEUDA", "FECH. ABONO", "ABONO ", "REF.", "METODO "] : ["FECHA", "DEUDA", "FECH. ABONO", "ABONO ", "REF.", "METODO "]).map((t, i) => [c + i, t] as [number, Celda]);
const CPP: Celda[][] = [
  fila([0, "CUENTAS POR PAGAR"]),
  v(22),
  fila([0, "SOCIA DEMO (ANTIGUA SOCIA)"], [7, "PROYECTO DEMO"], [14, " Proveedor Sur SA "]),
  fila([0, "MOTIVO "], [1, "SIN MOTIVO"], [7, "MOTIVO "], [8, "GASTOS CORPORATIVOS"], [14, "MOTIVO "], [16, "DEUDAS DE GESTION "]),
  fila(...titulos(0), ...titulos(7), ...titulos(14, true)),
  fila([0, f(2025, 7, 23)], [1, 30000], [7, f(2025, 7, 1)], [8, 3000], [14, f(2025, 11, 9)], [15, "PA-00001"], [16, 500]),
  fila([2, f(2025, 7, 23)], [3, 500], [5, "TRASNFERENCIA"], [9, f(2025, 7, 7)], [10, 2000], [12, "TRASNFERENCIA"], [14, f(2025, 10, 11)], [15, "CO-00005"], [16, 1768]),
  fila([0, f(2025, 7, 23)], [1, 29500], [9, f(2025, 7, 24)], [10, 500], [14, "11/15/2025"], [15, "ECOM-0001"], [16, 2665]),
  fila([2, f(2025, 8, 12)], [3, 600], [5, "BINANCE"], [7, f(2025, 7, 24)], [8, 500], [14, f(2025, 1, 12)], [15, "ECOM-0002"], [16, 1002]),
  fila([0, f(2025, 8, 13)], [1, 28800], [9, f(2025, 8, 4)], [10, 500], [11, "#8470"], [14, "12/15/2025"], [15, "ECOM-0003"], [16, 858]),
  fila([7, f(2025, 8, 4)], [8, 0], [15, "ECOM-0003"], [16, 858]),
  fila([7, "CUENTA CERRADA "], [16, null], [17, new Date(Date.UTC(20225, 7, 19))]),
  v(22),
  fila([7, " Proveedor Sur SA (JARABE)"]),
  fila([7, "MOTIVO "], [8, "PRESTAMOS PARA IMPORTAR"]),
  fila(...titulos(7)),
  fila([7, f(2025, 8, 5)], [8, 3900]),
  fila([9, f(2025, 8, 5)], [10, 1950], [12, "TRASNFERENCIA"]),
  fila([7, "CUENTA CERRADA "]),
];

test("CPP en bloques: saldos intermedios, cuenta cerrada, sub-bloque, fechas invertidas y errores", () => {
  const r = leerHojaCppBloques(CPP, "CPP");
  const por = (n: string) => r.documentos.filter((d) => d.contraparte === n);
  // Socia: una deuda de 30.000 con dos abonos; las filas de 29.500 y 28.800 son saldos, no deudas nuevas.
  const socia = por("SOCIA DEMO");
  assert.equal(socia.length, 1);
  assert.equal(socia[0].motivo, "SIN MOTIVO · ANTIGUA SOCIA");
  assert.deepEqual(socia[0].abonos.map((a) => [a.fecha, a.monto, a.metodo]), [["2025-07-23", 500, "Transferencia"], ["2025-08-12", 600, "Binance"]]);
  assert.equal(saldoDe(socia[0]), 28900);
  // La hoja dice 28.800 donde quedaban 28.900.
  assert.deepEqual(r.controles.filter((c) => c.contraparte === "SOCIA DEMO").map((c) => [c.fila, c.excel, c.portal]), [[10, "28800.00", "28900.00"]]);
  // Proyecto: 3.000 con abonos de 2.000 + 500 + 500 y «CUENTA CERRADA»: queda en cero, sin aviso.
  const proyecto = por("PROYECTO DEMO");
  assert.equal(proyecto.length, 1);
  assert.equal(saldoDe(proyecto[0]), 0);
  assert.equal(proyecto[0].abonos[2].referencia, "#8470");
  // Debajo, otro acreedor en las mismas columnas; cerrado con saldo: se avisa.
  const sur = por("Proveedor Sur SA");
  const jarabe = sur.find((d) => d.motivo?.includes("JARABE"))!;
  assert.equal(jarabe.motivo, "PRESTAMOS PARA IMPORTAR · JARABE");
  assert.equal(saldoDe(jarabe), 1950);
  assert.ok(r.controles.some((c) => c.qué === "cuenta cerrada con saldo" && c.portal === "1950.00"));
  // La lista con código: una deuda por fila, con la tienda por el código y la fecha invertida corregida.
  const lista = sur.filter((d) => d.documento);
  assert.deepEqual(lista.map((d) => [d.documento, d.fecha, d.unidad]), [
    ["PA-00001", "2025-11-09", null],
    ["CO-00005", "2025-11-10", "CALZADOS O."],
    ["ECOM-0001", "2025-11-15", "ECOMFIVE"],
    ["ECOM-0002", "2025-12-01", "ECOMFIVE"],
    ["ECOM-0003", "2025-12-15", "ECOMFIVE"],
    ["ECOM-0003", null, "ECOMFIVE"],
  ]);
  assert.deepEqual(r.fechasCorregidas.map((c) => [c.fila, c.excel, c.portal]), [[7, "2025-10-11", "2025-11-10"], [9, "2025-01-12", "2025-12-01"]]);
  assert.match(lista[1].notas_excel ?? "", /invertidos/);
  // El mismo código dos veces es otro documento (no se juntan): huellas distintas.
  assert.equal(new Set(r.documentos.map((d) => d.origen_clave)).size, r.documentos.length);
  // La fecha de abono con error del Excel (#VALUE!) y sin monto se descarta con su motivo.
  assert.deepEqual(r.descartadas, [{ hoja: "CPP", fila: 12, motivo: "abono sin monto y con la fecha en error (#VALUE!)" }]);
  assert.equal(saldo(lista), 500 + 1768 + 2665 + 1002 + 858 + 858);
});

const LISTA: Celda[][] = [
  [null, null, "DESCRIPCIÓN", "FECHA COMPRA", "PAIS", "SHIPPING  ", "ESTADO", "# MONTO", "ESTATUS"],
  [null, null, "Zapato Demo - CO-00013", f(2025, 9, 24), "VZLA", "BARCO", "EN TRANSITO", 1627.4, "PENDIENTE DE PAGO"],
  [null, null, "Bolsas Demo", f(2025, 9, 23), "VZLA", "BARCO", "EN TRANSITO", 602.55, "PAGADO"],
  [null, null, "TOTAL", null, null, null, null, 2229.95, null],
];

test("CPP en lista: tienda por la hoja, código en la descripción, «PAGADO» como abono total, sin la fila de totales", () => {
  const r = leerHojaCppLista(LISTA, "CPP CALZADOS O. VZLA");
  assert.equal(r.documentos.length, 2);
  const [a, b] = r.documentos;
  assert.equal(a.contraparte, "Compras CALZADOS O. VZLA");
  assert.equal(a.unidad, "CALZADOS O.");
  assert.equal(a.documento, "CO-00013");
  assert.equal(a.notas_excel, "País: VZLA · Envío: BARCO · Estado: EN TRANSITO · Estatus: PENDIENTE DE PAGO");
  assert.equal(saldoDe(a), 1627.4);
  assert.equal(saldoDe(b), 0);
});

test("leerCartera elige las hojas y su formato", () => {
  const hojas: Record<string, Celda[][]> = { CPC, " CPP": CPP, "CPP  CALZADOS O. VZLA": LISTA, "2026": [["MES"]] };
  const cobrar = leerCartera(Object.keys(hojas), (h) => hojas[h], "cobrar");
  const pagar = leerCartera(Object.keys(hojas), (h) => hojas[h], "pagar");
  assert.deepEqual(cobrar.hojas, ["CPC"]);
  assert.deepEqual(pagar.hojas, ["CPP", "CPP CALZADOS O. VZLA"]);
  assert.equal(cobrar.documentos.length, 3);
  assert.equal(pagar.documentos.filter((d) => d.hoja === "CPP CALZADOS O. VZLA").length, 2);
  assert.ok(pagar.documentos.every((d) => d.clase === "pagar"));
});
