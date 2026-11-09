import { test } from "node:test";
import assert from "node:assert/strict";
import { armarEerr, type FilaEerr } from "./eerr";
import { colaCierre, pesoNomina, resumirCartera, resumirResultados } from "./panel";

const fila = (periodo: string, seccion: FilaEerr["seccion"], signo: number, monto: number): FilaEerr => ({
  periodo,
  unidad_id: "t1",
  tipo: seccion,
  orden: 1,
  seccion,
  signo,
  monto,
});

test("resultados: último mes cerrado, anualizado y valor de empresa", () => {
  const meses = ["2026-08-01", "2026-09-01", "2026-10-01"];
  const filas = [
    fila("2026-08-01", "ingresos", 1, 1000),
    fila("2026-08-01", "administracion", -1, 400),
    fila("2026-09-01", "ingresos", 1, 1000),
    fila("2026-09-01", "administracion", -1, 200),
    fila("2026-10-01", "ingresos", 1, 100),
  ];
  const eerr = armarEerr(filas, meses);
  const r = resumirResultados(eerr, new Set(meses), "2026-10-01");
  assert.equal(r.meses, 3);
  assert.equal(r.ingresos, 2100);
  assert.equal(r.ebitda, 1500);
  assert.equal(r.ultimoMes, "2026-09-01");
  assert.equal(r.ebitdaUltimoMes, 800);
  assert.equal(Math.round(r.variacionEbitda ?? 0), 33);
  assert.equal(r.ebitdaAnual, 6000);
  assert.equal(r.valorEmpresa, 24000);
});

test("resultados: un mes cerrado con gastos pero sin ingresos todavía no es el «último mes»", () => {
  const meses = ["2026-08-01", "2026-09-01", "2026-10-01"];
  const filas = [
    fila("2026-08-01", "ingresos", 1, 1000),
    fila("2026-08-01", "administracion", -1, 400),
    fila("2026-09-01", "administracion", -1, 200),
    fila("2026-10-01", "ingresos", 1, 100),
  ];
  const r = resumirResultados(armarEerr(filas, meses), new Set(meses), "2026-10-01");
  assert.equal(r.ultimoMes, "2026-08-01");
  assert.equal(r.ebitdaUltimoMes, 600);
  // Sin ningún mes cerrado con ingresos se queda con el último cerrado.
  const s = resumirResultados(armarEerr([fila("2026-09-01", "administracion", -1, 200)], meses), new Set(["2026-09-01"]), "2026-10-01");
  assert.equal(s.ultimoMes, "2026-09-01");
});

test("resultados sin datos no dividen por cero", () => {
  const r = resumirResultados(armarEerr([], ["2026-10-01"]), new Set(), "2026-10-01");
  assert.equal(r.ebitdaAnual, 0);
  assert.equal(r.ultimoMes, null);
  assert.equal(r.margenEbitda, null);
});

test("cartera: suma por clase y neto", () => {
  const r = resumirCartera([
    { clase: "cobrar", saldo: "100", vencido: "40", tramo_90_mas: "10", documentos: "2" },
    { clase: "cobrar", saldo: 50, vencido: 0, tramo_90_mas: 0, documentos: 1 },
    { clase: "pagar", saldo: 300, vencido: 200, tramo_90_mas: 150, documentos: 4 },
  ]);
  assert.equal(r.porCobrar, 150);
  assert.equal(r.cobrarVencido, 40);
  assert.equal(r.documentosCobrar, 3);
  assert.equal(r.porPagar, 300);
  assert.equal(r.neto, -150);
});

test("nómina sobre ingresos y cola de cierre filtrada y ordenada", () => {
  assert.equal(pesoNomina(25, 100), 25);
  assert.equal(pesoNomina(25, 0), null);
  const base = { descripcion: "", href: "/", accion: "Ver" };
  const cola = colaCierre(
    [
      { ...base, clave: "a", titulo: "A", cantidad: 0, modulo: "libro-movimientos" },
      { ...base, clave: "b", titulo: "B", cantidad: 3, modulo: "libro-movimientos" },
      { ...base, clave: "c", titulo: "C", cantidad: 5, modulo: "nomina" },
    ],
    ["libro-movimientos"],
  );
  assert.deepEqual(cola.map((c) => c.clave), ["b", "a"]);
});
