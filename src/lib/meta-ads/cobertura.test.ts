import assert from "node:assert/strict";
import test from "node:test";
import { coberturaDe, diasEntre, mesesCubiertos, nombreCortoDeMes, partirTramo, tramoYaTraido } from "./cobertura";

test("los días entre dos fechas, ambas incluidas", () => {
  assert.deepEqual(diasEntre("2026-02-27", "2026-03-02"), ["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  assert.deepEqual(diasEntre("2026-03-05", "2026-03-05"), ["2026-03-05"]);
});

test("un mes con todas sus fechas dentro de lecturas registradas está completo; con algo, parcial; sin nada, sin leer", () => {
  const c = coberturaDe({ tramos: [["2026-10-01", "2026-10-31"], ["2026-09-15", "2026-09-30"]], dias: ["2026-08-04", "2026-08-05"] });
  const m = Object.fromEntries(mesesCubiertos(c, "2026-11-20", 4).map((x) => [x.mes, x.estado]));
  assert.equal(m["2026-10"], "completo");
  assert.equal(m["2026-09"], "parcial");
  assert.equal(m["2026-08"], "parcial");
  assert.equal(m["2026-11"], "sin_leer");
});

test("el mes actual solo cuenta hasta hoy", () => {
  const c = coberturaDe({ tramos: [["2026-11-01", "2026-11-20"]], dias: [] });
  const [actual] = mesesCubiertos(c, "2026-11-20", 1);
  assert.equal(actual.dias, 20);
  assert.equal(actual.estado, "completo");
});

test("trece meses seguidos, del más nuevo al más viejo, también al cruzar el año", () => {
  const meses = mesesCubiertos(coberturaDe({ tramos: [], dias: [] }), "2026-02-10", 13).map((x) => x.mes);
  assert.equal(meses.length, 13);
  assert.equal(meses[0], "2026-02");
  assert.equal(meses[1], "2026-01");
  assert.equal(meses[2], "2025-12");
  assert.equal(meses[12], "2025-02");
});

test("un tramo ya está traído si está registrado entero o casi todos sus días tienen resultados", () => {
  const registrado = coberturaDe({ tramos: [["2026-03-01", "2026-03-31"]], dias: [] });
  assert.equal(tramoYaTraido({ desde: "2026-03-05", hasta: "2026-03-20" }, registrado), true);
  assert.equal(tramoYaTraido({ desde: "2026-02-20", hasta: "2026-03-10" }, registrado), false);
  const dias = diasEntre("2026-02-01", "2026-02-28").slice(0, 22);
  const porDatos = coberturaDe({ tramos: [], dias });
  assert.equal(tramoYaTraido({ desde: "2026-02-01", hasta: "2026-02-28" }, porDatos), true);
  assert.equal(tramoYaTraido({ desde: "2026-02-01", hasta: "2026-03-10" }, porDatos), false);
});

test("un tramo se parte en dos mitades sin huecos ni solapes, la más nueva primero", () => {
  const [nueva, vieja] = partirTramo({ desde: "2026-03-01", hasta: "2026-03-30" })!;
  assert.deepEqual(nueva, { desde: "2026-03-16", hasta: "2026-03-30" });
  assert.deepEqual(vieja, { desde: "2026-03-01", hasta: "2026-03-15" });
  const [n2, v2] = partirTramo({ desde: "2026-03-01", hasta: "2026-03-03" })!;
  assert.deepEqual(n2, { desde: "2026-03-03", hasta: "2026-03-03" });
  assert.deepEqual(v2, { desde: "2026-03-01", hasta: "2026-03-02" });
  assert.equal(partirTramo({ desde: "2026-03-01", hasta: "2026-03-01" }), null);
});

test("el nombre corto de un mes", () => {
  assert.equal(nombreCortoDeMes("2025-11"), "nov 25");
  assert.equal(nombreCortoDeMes("2026-01"), "ene 26");
});
