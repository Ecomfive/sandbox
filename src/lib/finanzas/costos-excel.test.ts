import assert from "node:assert/strict";
import test from "node:test";
import { costoPromedio, leerLotes, leerMapeo, lineaDeHoja, loteVigente } from "./costos-excel";
import { validarLote, validarMapeo } from "./guardar-costos";

const TITULOS = ["FECHA DE LLEGADA", "MES LLEGADA", "PROVEEDOR", "NOMBRE HOMOLOGADO", "PRODUCTO", "CODIGO", "CANTIDAD", "COSTO UNITARIO ", "COMISION BANCO 1", "COMISION BANCO 2", "COMISION CAMBIO", "PAGO DE IMPUESTO", "COSTE DE ENVIO", "FINANCIAMIENTO", "COSTO TOTAL"];

test("lee los lotes, suma componentes cuando falta el total y descarta las filas sin costo", () => {
  const filas = [
    TITULOS,
    [new Date(Date.UTC(2026, 0, 10)), "ENERO", "UPS", null, "Crema de prueba", "Oferfy", 100, 1, 0.1, null, null, null, 0.2, null, 1.3],
    [null, "MAYO", "CHIN", "Crema homologada", "Crema prueba v2", "ECOMFIVE", 50, 2, 0.05, null, null, 0.1, null, 0.05, null],
    [null, null, null, null, "Sin costo", null, null, null, null, null, null, null, null, null, "#DIV/0!"],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0],
  ];
  const { lotes, descartadas } = leerLotes(filas, "MERCANCIA ECOMFIVE");
  assert.equal(lotes.length, 2);
  assert.equal(descartadas, 2);
  assert.equal(lotes[0].linea, "OFERFY");
  assert.equal(lotes[0].fecha_llegada, "2026-01-10");
  assert.equal(lotes[0].costo_total, 1.3);
  assert.equal(lotes[1].costo_total, 2.2); // 2 + 0,05 + 0,1 + 0,05
  assert.equal(lotes[1].producto_clave, "CREMA HOMOLOGADA");
  assert.equal(lineaDeHoja("MERCANCIA CALZADOS"), "CALZADOS");
});

test("vigente = llegada más nueva; sin fecha, el último de la hoja; promedio ponderado", () => {
  const ls = [
    { fecha_llegada: "2026-01-01", fila: 9, cantidad: 100, costo_total: 1 },
    { fecha_llegada: "2026-03-01", fila: 2, cantidad: 300, costo_total: 2 },
    { fecha_llegada: null, fila: 20, cantidad: null, costo_total: 5 },
  ];
  assert.equal(loteVigente(ls)?.costo_total, 2);
  assert.equal(loteVigente([ls[2], { ...ls[2], fila: 30, costo_total: 6 }])?.costo_total, 6);
  assert.equal(costoPromedio(ls), 1.75);
  assert.equal(costoPromedio([{ cantidad: null, costo_total: 3 }]), null);
});

test("mapeo y validaciones del servidor", () => {
  const m = leerMapeo([["MAPEO ECOMFIVE"], ["Relaciona…"], ["PRODUCTO DROPI", "PRODUCTO COSTE A USAR", "ESTADO MAPEO"], ["PRODUCTO", null, "PENDIENTE"], ["Balsamo X", "Balsamo (multiuso)", "MAPEADO"], ["Sin par", null, "PENDIENTE"], ["Balsamo X", "otro", "MAPEADO"]]);
  assert.deepEqual(m.map((x) => [x.producto_dropi, x.estado]), [["Balsamo X", "mapeado"], ["Sin par", "pendiente"]]);
  assert.equal(validarLote({ producto: "x", costo_total: -1, origen_clave: "0123456789abcdef01234567#1" }), null);
  assert.equal(validarLote({ producto: "x", costo_total: 2, origen_clave: "malo" }), null);
  assert.equal(validarLote({ producto: "Crema", costo_total: 2, origen_clave: "0123456789abcdef01234567#1", linea: "oferfy" })?.linea, "OFERFY");
  assert.equal(validarMapeo({ producto_dropi: "A", producto_costo: null, estado: "mapeado" })?.estado, "pendiente");
});
