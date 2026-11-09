import { strict as assert } from "node:assert";
import { test } from "node:test";
import { armarBalance, bienesAlCorte, gastosImportacionAl, partidasSinDuplicar, partidasVigentes, type InsumosBalance, type Partida } from "./balance";

const partidas: Partida[] = [
  { entidad_id: null, rubro: "prestamo", concepto: "Banco A", periodo: "2026-01-01", monto: 1000 },
  { entidad_id: null, rubro: "prestamo", concepto: "banco a ", periodo: "2026-03-01", monto: 600 },
  { entidad_id: null, rubro: "prestamo", concepto: "Banco A", periodo: "2026-05-01", monto: 0 },
  { entidad_id: null, rubro: "patrimonio_inicial", concepto: "Al empezar", periodo: "2026-01-01", monto: 500 },
];

test("de cada concepto vale la última partida hasta el corte y el cero lo cierra", () => {
  assert.deepEqual(partidasVigentes(partidas, "2026-02-01").map((p) => p.monto), [500, 1000]);
  assert.deepEqual(partidasVigentes(partidas, "2026-04-01").map((p) => p.monto), [500, 600]);
  assert.deepEqual(partidasVigentes(partidas, "2026-06-01").map((p) => p.monto), [500]);
});

test("el balance suma activo, pasivo y patrimonio y muestra la diferencia", () => {
  const M = "2026-04-01";
  const i: InsumosBalance = {
    caja: [{ id: "b1", nombre: "Banco", saldo: 2000 }],
    tarjetas: -300,
    cxc: 400,
    cxp: 250,
    bienesCosto: 1200,
    bienesDepreciacion: 200,
    inventario: null,
    partidas: partidasVigentes(partidas, M),
    aportesLibro: 1000,
    utilidadAcumulada: 1800,
    retiros: 700,
  };
  const b = armarBalance([M], { [M]: i });
  assert.deepEqual(b.activo, [2000 + 400 + 1000]);
  assert.deepEqual(b.pasivo, [250 + 300 + 600]);
  assert.deepEqual(b.patrimonio, [500 + 1000 + 1800 - 700]);
  assert.deepEqual(b.diferencia, [3400 - 1150 - 2600]);
  const inv = b.filas.find((f) => f.clave === "inventario")!;
  assert.deepEqual(inv.valores, [null]);
  assert.equal(b.filas.at(-1)!.etiqueta, "Diferencia por cuadrar");
  assert.ok(b.filas.every((f) => f.total === null));
});

test("los bienes de baja no suman", () => {
  assert.deepEqual(bienesAlCorte([{ importe: 1000, neto: 600, deBaja: false }, { importe: 500, neto: 0, deBaja: true }]), { costo: 1000, depreciacion: 400 });
});

test("la deuda de Tesorería, los anticipos y los gastos de importación entran al balance sin contar dos veces", () => {
  const M = "2026-04-01";
  const vigentes = partidasSinDuplicar(partidasVigentes(partidas, M), ["BANCO  a"]);
  assert.equal(vigentes.filter((p) => p.rubro === "prestamo").length, 0);
  const i: InsumosBalance = {
    caja: [{ id: "b1", nombre: "Banco", saldo: 1000 }],
    tarjetas: 0,
    cxc: 0,
    cxp: 100,
    bienesCosto: 0,
    bienesDepreciacion: 0,
    inventario: 0,
    partidas: vigentes,
    aportesLibro: 0,
    utilidadAcumulada: 0,
    retiros: 0,
    deuda: [{ id: "p1", nombre: "Banco A", saldo: 800, corriente: 300 }],
    anticipos: 250,
    gastosImportacion: 40,
  };
  const b = armarBalance([M], { [M]: i });
  assert.deepEqual(b.activo, [1250]);
  assert.deepEqual(b.pasivo, [100 + 40 + 800]);
  assert.deepEqual(b.filas.find((f) => f.clave === "prestamos")!.valores, [800]);
  assert.deepEqual(b.filas.find((f) => f.clave === "prestamos-corriente")!.valores, [300]);
  assert.ok(b.filas.some((f) => f.clave === "anticipos"));
});

test("gastos de importación por pagar: solo de compras llegadas y sin pagar al corte", () => {
  const g = [
    { monto: 10, pagado: false, fecha: null, llegada: "2026-03-10" },
    { monto: 20, pagado: true, fecha: "2026-05-02", llegada: "2026-03-10" },
    { monto: 30, pagado: true, fecha: "2026-04-02", llegada: "2026-03-10" },
    { monto: 40, pagado: false, fecha: null, llegada: null },
    { monto: 50, pagado: false, fecha: null, llegada: "2026-05-10" },
  ];
  assert.equal(gastosImportacionAl(g, "2026-04-30"), 30);
});
