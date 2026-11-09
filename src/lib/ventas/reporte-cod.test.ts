import test from "node:test";
import assert from "node:assert/strict";
import { csvReporteCod, reporteCod } from "./reporte-cod";

const s = (quien: string, pendiente: number, dias: number, esperado = pendiente, cobrado = pendiente) => ({ quien, numero: "1", esperado, cobrado, remitido: 0, pendiente, dias });

test("agrupa por quien cobra y separa lo vencido", () => {
  const r = reporteCod([s("Ana", 50, 1), s("Ana", 30, 9), s("Beto", 100, 2)]);
  assert.equal(r[0].quien, "Ana");
  assert.deepEqual([r[0].ordenes, r[0].pendiente, r[0].vencido, r[0].maxDias], [2, 80, 30, 9]);
  assert.equal(r[1].vencido, 0);
});

test("cobró de menos suma solo los faltantes", () => {
  const r = reporteCod([s("Ana", 40, 1, 60, 40), s("Ana", 10, 1, 10, 15)]);
  assert.equal(r[0].faltante, 20);
});

test("el CSV lleva total y protege fórmulas", () => {
  const csv = csvReporteCod(reporteCod([s("=Mal", 10, 5), s("Beto", 5, 1)]));
  assert.ok(csv.includes("'=Mal"));
  assert.ok(csv.trimEnd().split("\r\n").pop()!.startsWith("Total,2,15"));
});
