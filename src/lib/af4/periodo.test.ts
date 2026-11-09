import assert from "node:assert/strict";
import { test } from "node:test";
import { eerrDelPeriodo } from "./eerr-periodo";
import { elegirPeriodoAF4, mesesElegibles, opcionesPeriodo, periodoAnterior, rangoPeriodo } from "./periodo";
import { barrasCascada, bandaEscenarios } from "./grafica";
import { desdeEerr, desdeProyeccion, filasVisibles, marcaNegativo, seccionesConDetalle, sobreBase, totalFila, type FilaAF4 } from "./tabla-financiera";

// Se corre con: npm run test:seguridad (incluye src/lib/af4/*.test.ts)

const MESES = ["2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01"];
const EN_CURSO = "2026-03-01";

test("período: los meses elegibles no incluyen el mes en curso salvo que se pida", () => {
  assert.deepEqual(mesesElegibles(MESES, EN_CURSO).at(-1), "2026-02-01");
  assert.deepEqual(mesesElegibles(MESES, EN_CURSO, true).at(-1), "2026-03-01");
  // Sin ningún mes cerrado se usa lo que haya.
  assert.deepEqual(mesesElegibles(["2026-03-01"], EN_CURSO), ["2026-03-01"]);
});

test("período: últimos N, año a la fecha y un mes", () => {
  const u3 = elegirPeriodoAF4("u3", MESES, EN_CURSO);
  assert.deepEqual(u3.meses, ["2025-12-01", "2026-01-01", "2026-02-01"]);
  assert.equal(u3.etiqueta, "Últimos 3 meses");
  const anio = elegirPeriodoAF4("a2026", MESES, EN_CURSO);
  assert.deepEqual(anio.meses, ["2026-01-01", "2026-02-01"]);
  assert.equal(anio.etiqueta, "Año 2026");
  const mes = elegirPeriodoAF4("2025-11", MESES, EN_CURSO);
  assert.deepEqual(mes.meses, ["2025-11-01"]);
  assert.equal(mes.clave, "2025-11");
  assert.equal(mes.etiqueta, "Nov 2025");
  // Las claves de Rentabilidad («AAAA-MM-01») siguen valiendo.
  assert.deepEqual(elegirPeriodoAF4("2025-11-01", MESES, EN_CURSO).meses, ["2025-11-01"]);
});

test("período: lo que no existe cae al predeterminado", () => {
  assert.equal(elegirPeriodoAF4("u7", MESES, EN_CURSO).clave, "u3");
  assert.equal(elegirPeriodoAF4("2024-01", MESES, EN_CURSO).clave, "u3");
  assert.equal(elegirPeriodoAF4(undefined, MESES, EN_CURSO, { predeterminado: "u12" }).meses.length, 5);
  assert.equal(elegirPeriodoAF4("a2019", MESES, EN_CURSO).clave, "u3");
  assert.deepEqual(elegirPeriodoAF4("u3", [], EN_CURSO).meses, []);
});

test("período: opciones (rápidos según los meses que hay, año y meses del más nuevo al más viejo)", () => {
  const { rapidos, meses } = opcionesPeriodo(MESES, EN_CURSO, { ultimos: [3, 6, 12] });
  assert.deepEqual(rapidos.map((r) => r.valor), ["u3", "a2026"]);
  assert.equal(meses[0].valor, "2026-03");
  assert.equal(meses.length, 6);
});

test("período: el anterior comparable y el rango", () => {
  const u3 = elegirPeriodoAF4("u3", MESES, EN_CURSO);
  assert.deepEqual(periodoAnterior(u3, MESES), ["2025-10-01", "2025-11-01"]);
  assert.equal(rangoPeriodo(u3), "dic 25 – feb 26");
  assert.equal(rangoPeriodo(elegirPeriodoAF4("2026-01", MESES, EN_CURSO)), "ene 26");
});

test("cascada: ventas, costos y totales intermedios como barras apiladas", () => {
  const barras = barrasCascada([
    { etiqueta: "Ventas", valor: 100, tipo: "inicio" },
    { etiqueta: "Mercancía", valor: -60, tipo: "delta" },
    { etiqueta: "Margen bruto", valor: 40, tipo: "total" },
    { etiqueta: "Marketing", valor: -55, tipo: "delta" },
    { etiqueta: "EBITDA", valor: -15, tipo: "total" },
  ]);
  assert.deepEqual(
    barras.map((b) => [b.base, b.alto, b.acumulado, b.clase]),
    [
      [0, 100, 100, "total"],
      [40, 60, 40, "baja"],
      [0, 40, 40, "total"],
      [-15, 55, -15, "baja"],
      [-15, 15, -15, "total"],
    ],
  );
});

test("escenarios: la banda va del peor al mejor en cada punto", () => {
  assert.deepEqual(bandaEscenarios([[10, 20], [5, 25], [7]]), [[5, 10], [20, 25]]);
});

test("tabla: totales, saldos, detalle plegable y % sobre la base", () => {
  const filas: FilaAF4[] = [
    { clave: "ing", etiqueta: "Ingresos", tipo: "seccion", valores: [100, 200] },
    { clave: "ing-a", etiqueta: "Venta A", tipo: "detalle", valores: [100, 150], padre: "ing" },
    { clave: "ing-b", etiqueta: "Venta B", tipo: "detalle", valores: [null, 50], padre: "ing" },
    { clave: "caja", etiqueta: "Caja", tipo: "saldo", valores: [10, 20] },
    { clave: "fijo", etiqueta: "Con total", tipo: "subtotal", valores: [1, 1], total: 99 },
  ];
  assert.equal(totalFila(filas[0]), 300);
  assert.equal(totalFila(filas[2]), 50);
  assert.equal(totalFila(filas[3]), null);
  assert.equal(totalFila(filas[4]), 99);
  assert.deepEqual(seccionesConDetalle(filas), ["ing"]);
  assert.deepEqual(filasVisibles(filas, new Set()).map((f) => f.clave), ["ing", "caja", "fijo"]);
  assert.equal(filasVisibles(filas, new Set(["ing"])).length, 5);
  assert.equal(sobreBase(25, 100), 25);
  assert.equal(sobreBase(25, 0), null);
  assert.equal(marcaNegativo(filas[1]), false);
  assert.equal(marcaNegativo(filas[4]), true);
});

test("tabla: el EERR se adapta con su detalle bajo cada sección y los márgenes con su total ponderado", () => {
  const meses = ["2026-01-01", "2026-02-01"];
  const filas = desdeEerr(
    [
      { clave: "ingresos", etiqueta: "Ingresos", tipo: "seccion", valores: { [meses[0]]: 100, [meses[1]]: 300 } },
      { clave: "ingresos-x", etiqueta: "Venta", tipo: "detalle", valores: { [meses[0]]: 100, [meses[1]]: 300 } },
      { clave: "ingresos-netos", etiqueta: "Ingresos netos", tipo: "resultado", valores: { [meses[0]]: 100, [meses[1]]: 300 } },
      {
        clave: "ebitda-pct",
        etiqueta: "Margen EBITDA %",
        tipo: "porcentaje",
        valores: { [meses[0]]: 10, [meses[1]]: 90 },
        base: { [meses[0]]: 100, [meses[1]]: 300 },
      },
      { clave: "resultado-neto", etiqueta: "Resultado neto", tipo: "resultado", valores: { [meses[0]]: -5, [meses[1]]: 20 } },
    ],
    meses,
  );
  assert.deepEqual(filas.map((f) => f.tipo), ["seccion", "detalle", "subtotal", "porcentaje", "total"]);
  assert.equal(filas[1].padre, "ingresos");
  assert.deepEqual(filas[3].valores, [10, 30]);
  assert.equal(filas[3].total, 25);
});

test("tabla: la proyección se adapta con saldos de caja y conceptos desplegables", () => {
  const filas = desdeProyeccion([
    { clave: "caja-inicial", etiqueta: "Caja al comenzar", tipo: "resultado", valores: [10], total: null },
    { clave: "entradas", etiqueta: "Entradas", tipo: "grupo", valores: [5], total: 5 },
    { clave: "entradas-ventas", etiqueta: "Ventas", tipo: "concepto", valores: [5], total: 5 },
    { clave: "entradas-ventas-x", etiqueta: "Tienda", tipo: "detalle", padre: "entradas-ventas", valores: [5], total: 5 },
    { clave: "neto", etiqueta: "Neto", tipo: "resultado", valores: [5], total: 5 },
    { clave: "caja-final", etiqueta: "Caja final", tipo: "resultado", valores: [15], total: null },
  ]);
  assert.deepEqual(filas.map((f) => f.tipo), ["saldo", "grupo", "seccion", "detalle", "subtotal", "total"]);
  assert.equal(totalFila(filas[5]), null);
});

test("EERR del período: últimos 12 con el mes en curso, y el anterior solo si hay el mismo largo", () => {
  const fila = (periodo: string, monto: number) => ({ periodo, unidad_id: "u", tipo: "Venta", orden: 1, seccion: "ingresos" as const, signo: 1, monto });
  const filas = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"].map((m, i) => fila(m, (i + 1) * 100));
  const conDatos = filas.map((f) => f.periodo);
  const r = eerrDelPeriodo(filas, conDatos, undefined, "2026-04-01");
  assert.equal(r.periodo.clave, "u12");
  assert.deepEqual(r.eerr.meses, conDatos);
  assert.equal(r.anterior, null);
  const uno = eerrDelPeriodo(filas, conDatos, "2026-04", "2026-04-01");
  assert.deepEqual(uno.eerr.meses, ["2026-04-01"]);
  assert.deepEqual(uno.anterior?.meses, ["2026-03-01"]);
  assert.equal(uno.anterior?.ingresosNetos["2026-03-01"], 300);
  const u3 = eerrDelPeriodo(filas, conDatos, "u3", "2026-04-01");
  assert.deepEqual(u3.eerr.meses, ["2026-02-01", "2026-03-01", "2026-04-01"]);
  assert.equal(u3.anterior, null);
});
