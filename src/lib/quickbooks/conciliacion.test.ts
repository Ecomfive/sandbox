import assert from "node:assert/strict";
import test from "node:test";
import { armarEerr, type FilaEerr } from "../finanzas/eerr";
import { compararMeses, cuadreVentasQbo, cuentasMapeadas, desviacionPct, diferencias, semaforoDesviacion, sugerirDestino, type Destino, type FilaQbo } from "./conciliacion";

const M = "2026-09-01";
const fila = (seccion: FilaEerr["seccion"], tipo: string, monto: number, signo = seccion === "ingresos" ? 1 : -1): FilaEerr => ({ periodo: M, unidad_id: "u", tipo, orden: 1, seccion, signo, monto });

test("sugerirDestino por grupo y nombre", () => {
  assert.equal(sugerirDestino("Income", "Ventas"), "ingresos");
  assert.equal(sugerirDestino("COGS", "Costo"), "costo_ventas");
  assert.equal(sugerirDestino("Expense", "Publicidad en Facebook"), "marketing");
  assert.equal(sugerirDestino("Expense", "Depreciación mobiliario"), "depreciacion");
  assert.equal(sugerirDestino("Expense", "Intereses préstamo"), "finanzas");
  assert.equal(sugerirDestino("Expense", "Alquiler oficina"), "administracion");
  assert.equal(sugerirDestino("OtherExpense", "Impuesto sobre la renta"), "impuesto_ganancias");
  assert.equal(sugerirDestino("OtherIncome", "Diferencia cambiaria"), "otros");
});

test("desviación y semáforo: < 1 % verde, < 5 % ámbar", () => {
  assert.equal(desviacionPct(1005, 1000), 0.5);
  assert.equal(desviacionPct(0, 0), 0);
  assert.equal(desviacionPct(10, 0), null);
  assert.equal(semaforoDesviacion(0.99, true), "verde");
  assert.equal(semaforoDesviacion(-3, true), "ambar");
  assert.equal(semaforoDesviacion(7, true), "rojo");
  assert.equal(semaforoDesviacion(null, true), "rojo");
  assert.equal(semaforoDesviacion(0, false), "sin_datos");
  assert.deepEqual(cuadreVentasQbo(1000, 1009), { desviacion: (1000 - 1009) / 1009 * 100, cuadra: true });
  assert.equal(cuadreVentasQbo(1000, 1100)?.cuadra, false);
  assert.equal(cuadreVentasQbo(1000, null), null);
});

test("compararMeses: el EERR del portal contra QuickBooks con el mapeo", () => {
  const portal = armarEerr([fila("ingresos", "VENTAS", 10_000), fila("costo_ventas", "COSTO", 4_000), fila("administracion", "ALQUILER", 1_000), fila("marketing", "META", 2_000)], [M]);
  const qbo: FilaQbo[] = [
    { periodo: M, cuentaId: "1", cuentaNombre: "Ventas", grupo: "Income", monto: 10_050 },
    { periodo: M, cuentaId: "2", cuentaNombre: "Costo", grupo: "COGS", monto: 4_000 },
    { periodo: M, cuentaId: "3", cuentaNombre: "Alquiler", grupo: "Expense", monto: 1_000 },
    { periodo: M, cuentaId: "4", cuentaNombre: "Gasto varios", grupo: "Expense", monto: 2_000 },
    { periodo: M, cuentaId: "5", cuentaNombre: "Ajuste", grupo: "Expense", monto: 999 },
  ];
  // Sin mapeo, «Gasto varios» va a administración y «Ajuste» también: no cuadra.
  const sin = compararMeses(portal, qbo, new Map(), new Set([M]));
  assert.equal(sin.find((c) => c.concepto === "administracion")?.semaforo, "rojo");
  const mapeo = new Map<string, Destino>([["4", "marketing"], ["5", "ignorar"]]);
  const con = compararMeses(portal, qbo, mapeo, new Set([M]));
  const de = (k: string) => con.find((c) => c.concepto === k)!;
  assert.equal(de("ventas").qbo, 10_050);
  assert.equal(de("ventas").semaforo, "verde");
  assert.equal(de("marketing").semaforo, "verde");
  assert.equal(de("costo_ventas").portal, 4_000);
  assert.equal(de("ebitda").portal, 3_000);
  assert.equal(de("ebitda").qbo, 3_050);
  assert.equal(de("ebitda").semaforo, "ambar");
  assert.deepEqual(diferencias(con).map((c) => c.concepto), ["ebitda", "resultado_neto"]);
  assert.equal(compararMeses(portal, [], mapeo, new Set())[0].semaforo, "sin_datos");
});

test("cuentasMapeadas: destino guardado o sugerido y total", () => {
  const f: FilaQbo[] = [
    { periodo: M, cuentaId: "9", cuentaNombre: "Publicidad", grupo: "Expense", monto: 5 },
    { periodo: "2026-10-01", cuentaId: "9", cuentaNombre: "Publicidad", grupo: "Expense", monto: 7 },
    { periodo: M, cuentaId: "1", cuentaNombre: "Ventas", grupo: "Income", monto: 1 },
  ];
  const c = cuentasMapeadas(f, new Map([["1", "otros" as Destino]]));
  assert.equal(c[0].cuentaId, "1");
  assert.equal(c[0].destino, "otros");
  assert.equal(c[0].sugerido, false);
  assert.equal(c[1].destino, "marketing");
  assert.equal(c[1].sugerido, true);
  assert.equal(c[1].total, 12);
});
