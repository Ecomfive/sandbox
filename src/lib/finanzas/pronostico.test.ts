import assert from "node:assert/strict";
import test from "node:test";
import {
  backtest,
  diaSemana,
  diasDelMes,
  explicarMetodo,
  factorCalendario,
  metodoPara,
  pesosDiaSemana,
  pronosticar,
  rectaMinimosCuadrados,
  sumarPronosticos,
} from "./pronostico";

// Series inventadas.

test("el método depende de cuántos meses completos hay", () => {
  assert.equal(metodoPara(0), "sin_datos");
  assert.equal(metodoPara(2), "promedio");
  assert.equal(metodoPara(4), "lineal");
  assert.equal(metodoPara(10), "holt");
  assert.equal(metodoPara(24), "holt_winters");
  assert.match(explicarMetodo("holt", 10, { diasSemana: false }), /Sin estacionalidad anual/);
});

test("calendario: días del mes, día de la semana y factor", () => {
  assert.equal(diasDelMes("2026-02-01"), 28);
  assert.equal(diasDelMes("2024-02-01"), 29);
  assert.equal(diaSemana("2026-10-26"), 1, "lunes");
  // Sin pesos, el factor es la cantidad de días sobre un mes promedio.
  assert.ok(Math.abs(factorCalendario("2026-01-01", Array(7).fill(1)) - 31 / (365.25 / 12)) < 1e-9);
  assert.ok(factorCalendario("2026-02-01", Array(7).fill(1)) < 1);
});

test("pesos por día de la semana: solo cuentan si se diferencian", () => {
  const parejos = pesosDiaSemana([100, 101, 99, 100, 100, 102, 98], Array(7).fill(10));
  assert.equal(parejos.aplica, false);
  assert.deepEqual(parejos.pesos, Array(7).fill(1));
  const distintos = pesosDiaSemana([50, 100, 100, 100, 100, 150, 200], Array(7).fill(10));
  assert.equal(distintos.aplica, true);
  const media = distintos.pesos.reduce((a, b) => a + b, 0) / 7;
  assert.ok(Math.abs(media - 1) < 1e-9, "promedio 1");
  assert.equal(pesosDiaSemana([1, 2, 3], [1, 1, 1]).aplica, false, "días sin datos");
});

test("recta de mínimos cuadrados", () => {
  const r = rectaMinimosCuadrados([10, 12, 14, 16]);
  assert.ok(Math.abs(r.pendiente - 2) < 1e-9);
  assert.ok(Math.abs(r.ordenada - 10) < 1e-9);
});

test("una serie creciente se pronostica creciente y dentro de su intervalo", () => {
  const serie = [100, 108, 115, 124, 130, 139, 146, 155, 161, 170];
  const p = pronosticar(serie, 12);
  assert.equal(p.metodo, "holt");
  assert.equal(p.proyeccion.length, 12);
  assert.ok(p.proyeccion[0].valor > 170, "sigue la tendencia");
  assert.ok(p.proyeccion[11].valor >= p.proyeccion[0].valor);
  for (const x of p.proyeccion) assert.ok(x.bajo <= x.valor && x.valor <= x.alto);
  // El intervalo se abre con el horizonte.
  assert.ok(p.proyeccion[11].alto - p.proyeccion[11].bajo > p.proyeccion[0].alto - p.proyeccion[0].bajo);
  assert.ok(p.mape !== null && p.mape < 0.1, "error bajo en una serie casi recta");
  assert.ok((p.crecimientoMensual ?? 0) > 0);
  // La tendencia amortiguada crece menos que la recta a 12 meses.
  const r = rectaMinimosCuadrados(serie);
  assert.ok(p.proyeccion[11].valor < r.ordenada + r.pendiente * (serie.length - 1 + 12) + 1);
});

test("pocos meses: promedio o recta, sin negativos", () => {
  assert.equal(pronosticar([100, 120], 3).metodo, "promedio");
  assert.equal(pronosticar([100, 120], 3).proyeccion[0].valor, 110);
  const cae = pronosticar([400, 300, 200, 100], 6);
  assert.equal(cae.metodo, "lineal");
  assert.ok(cae.proyeccion.every((x) => x.valor >= 0 && x.bajo >= 0));
  assert.equal(pronosticar([], 3).metodo, "sin_datos");
});

test("Holt-Winters recoge la estacionalidad con dos años", () => {
  const anio = [80, 70, 90, 100, 110, 120, 130, 125, 115, 140, 170, 220];
  const serie = [...anio, ...anio.map((v) => v + 20)];
  const p = pronosticar(serie, 12);
  assert.equal(p.metodo, "holt_winters");
  // Diciembre sigue siendo el pico y febrero el valle.
  const valores = p.proyeccion.map((x) => x.valor);
  assert.equal(valores.indexOf(Math.max(...valores)), 11);
  assert.equal(valores.indexOf(Math.min(...valores)), 1);
});

test("el factor de calendario se quita y se vuelve a poner", () => {
  const plana = [100, 100, 100, 100, 100, 100];
  const factores = [1, 1, 1, 1, 1, 1, 1.1, 0.9];
  const p = pronosticar(plana, 2, { factores, metodo: "promedio" });
  assert.equal(p.proyeccion[0].valor, 110);
  assert.equal(p.proyeccion[1].valor, 90);
});

test("backtest: un mes a la vez, con los meses anteriores", () => {
  const serie = [100, 100, 100, 100, 200];
  const bt = backtest(serie, Array(5).fill(1), "promedio");
  assert.equal(bt.length, 2);
  assert.equal(bt[1].real, 200);
  assert.equal(bt[1].pronostico, 100);
  assert.equal(bt[1].error, 0.5);
  assert.equal(bt[0].error, 0);
});

test("sumar pronósticos de tiendas: valores sumados, intervalo en cuadratura", () => {
  const s = sumarPronosticos([
    [{ valor: 100, bajo: 70, alto: 130 }],
    [{ valor: 50, bajo: 10, alto: 90 }],
  ]);
  assert.equal(s[0].valor, 150);
  assert.equal(s[0].bajo, 100);
  assert.equal(s[0].alto, 200);
});
