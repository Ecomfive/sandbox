import assert from "node:assert/strict";
import test from "node:test";
import {
  compararConGrilla,
  cuotaMensual,
  depreciacionDelMes,
  depreciacionPorMes,
  importeSospechoso,
  leerBienesExcel,
  mesesDepreciados,
  situacion,
  sumarMeses,
  tipoDeBien,
  ultimoMes,
  validarBienExcel,
  type Bien,
} from "./bienes-uso";

const bien = (x: Partial<Bien> = {}): Bien => ({ fecha_alta: "2025-03-20", importe: 1200, meses_vida: 12, valor_residual: 0, fecha_baja: null, ...x });

test("meses y cuota lineal", () => {
  assert.equal(sumarMeses("2025-11-01", 3), "2026-02-01");
  assert.equal(sumarMeses("2025-01-01", -1), "2024-12-01");
  assert.equal(cuotaMensual(bien()), 100);
  assert.equal(cuotaMensual(bien({ valor_residual: 240 })), 80);
});

test("el mes de alta ya deprecia y se deprecia durante la vida útil", () => {
  const b = bien();
  assert.equal(depreciacionDelMes(b, "2025-02-01"), 0);
  assert.equal(depreciacionDelMes(b, "2025-03-01"), 100);
  assert.equal(depreciacionDelMes(b, "2026-02-01"), 100);
  assert.equal(depreciacionDelMes(b, "2026-03-01"), 0);
  assert.equal(ultimoMes(b), "2026-02-01");
  assert.equal(mesesDepreciados(b, "2025-08-01"), 6);
  assert.equal(mesesDepreciados(b, "2030-01-01"), 12);
});

test("la baja corta la depreciación desde su mes", () => {
  const b = bien({ fecha_baja: "2025-06-10" });
  assert.equal(depreciacionDelMes(b, "2025-05-01"), 100);
  assert.equal(depreciacionDelMes(b, "2025-06-01"), 0);
  const s = situacion(b, "2025-10-01");
  assert.equal(s.estado, "De baja");
  assert.equal(s.acumulada, 300);
  assert.equal(s.neto, 0);
  // Dado de baja el mismo mes de alta: nunca deprecia.
  assert.equal(ultimoMes(bien({ fecha_baja: "2025-03-25" })), null);
});

test("situación al cierre de un mes", () => {
  const s = situacion(bien(), "2025-08-01");
  assert.equal(s.acumulada, 600);
  assert.equal(s.neto, 600);
  assert.equal(s.mesesRestantes, 6);
  assert.equal(s.delMes, 100);
  assert.equal(s.estado, "En uso");
  const fin = situacion(bien(), "2026-05-01");
  assert.equal(fin.estado, "Depreciado");
  assert.equal(fin.neto, 0);
  assert.equal(fin.mesesRestantes, 0);
  assert.equal(situacion(bien(), "2025-01-01").mesesRestantes, 12);
});

test("total por mes", () => {
  const m = depreciacionPorMes([bien(), bien({ fecha_alta: "2025-04-01", importe: 600 })], "2025-03-01", "2025-04-01");
  assert.deepEqual([...m], [["2025-03-01", 100], ["2025-04-01", 150]]);
});

test("lee la hoja Bienes de Uso con su grilla y la compara", () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const filas = [
    [],
    [null, null, null, null, null, null, null, null, null, "Depreciación mensual"],
    [],
    [null, "Mes de Alta", "Mes Final VR", "Altas Bienes de uso", "Importe", "Tipo de Bien", "Meses a Amortizar", "Dep, Mensual", null, d("2025-01-31"), d("2025-02-28"), d("2025-03-31"), null, "VR"],
    ["(*)", d("2025-01-31"), null, "Silla de prueba", 120, "Muebles y Utiles", 2, 60, null, 60, 60, null],
    [null, d("2025-02-15"), null, "Laptop de prueba", 1.169, "Equipos computacion", null, null, null, null, 0.5, 0.5],
    [null, d("2025-02-15"), null, "Cosa rara", 50, "Barco", 10],
    [null, d("2025-03-01")],
    [],
    [null, "Aclaraciones", null, null, 5000],
  ];
  const { bienes, descartadas } = leerBienesExcel(filas, "prueba.xlsx");
  assert.equal(bienes.length, 2);
  assert.deepEqual(descartadas, [{ fila: 7, motivo: "tipo de bien desconocido" }]);
  assert.equal(bienes[0].meses_vida, 2);
  assert.equal(bienes[0].fecha_alta, "2025-01-31");
  assert.match(bienes[0].notas ?? "", /\(\*\)/);
  assert.deepEqual(bienes[0].grilla, { "2025-01-01": 60, "2025-02-01": 60 });
  assert.equal(bienes[1].tipo, "Equipos Computación");
  assert.equal(bienes[1].meses_vida, 60);
  assert.equal(bienes[1].sospechoso, true);
  const r = compararConGrilla(bienes, ["2025-01-01", "2025-02-01", "2025-03-01"]);
  assert.equal(r.celdas, 6);
  // La grilla del segundo bien dice 0,5 y el cálculo 1,169 / 60: se informa.
  assert.equal(r.distintas.length, 2);
  // La huella no cambia al releer.
  assert.equal(leerBienesExcel(filas, "prueba.xlsx").bienes[0].origen_clave, bienes[0].origen_clave);
});

test("validación de lo que llega del navegador", () => {
  assert.equal(tipoDeBien("rodados"), "Rodados");
  assert.equal(importeSospechoso(1.169), true);
  assert.equal(importeSospechoso(9.5), false);
  const ok = validarBienExcel({ descripcion: " Mesa ", tipo: "Muebles y Utiles", fecha_alta: "2025-01-02", importe: 10, meses_vida: 60, origen_clave: "0".repeat(24) + "#1" });
  assert.equal(ok?.descripcion, "Mesa");
  assert.equal(validarBienExcel({ descripcion: "Mesa", tipo: "Muebles y Utiles", fecha_alta: "2025-01-02", importe: -1, meses_vida: 60, origen_clave: "0".repeat(24) + "#1" }), null);
  assert.equal(validarBienExcel({ descripcion: "Mesa", tipo: "Muebles y Utiles", fecha_alta: "2025-01-02", importe: 10, meses_vida: 60, origen_clave: "x" }), null);
});
