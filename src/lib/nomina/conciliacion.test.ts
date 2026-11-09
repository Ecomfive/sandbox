import assert from "node:assert/strict";
import test from "node:test";
import { conciliarPorMes, conciliarPorTienda, explicarDiferencias, repartir, sinExplicar, type CostoNomina, type MovimientoSueldo } from "./conciliacion";

const REPARTO = new Set(["A DISTRIBUIR"]);
const mov = (o: Partial<MovimientoSueldo>): MovimientoSueldo => ({
  periodo: "2026-04-01", unidad: "A DISTRIBUIR", tipo: "SUELDOS", en_eerr: true, monto: 0, descripcion: "", fecha: null, ...o,
});

const COSTOS: CostoNomina[] = [
  { periodo: "2026-04-01", tipo: "formal", unidad: "A DISTRIBUIR", neto: 1000 },
  { periodo: "2026-04-01", tipo: "formal", unidad: "NUVO PAN", neto: 300 },
  { periodo: "2026-04-01", tipo: "externa", unidad: "OFERFY PAN", neto: 500 },
];
const LIBRO: MovimientoSueldo[] = [
  mov({ monto: 1000, descripcion: "Q1 y Q2" }),
  mov({ monto: 200, descripcion: "PAGO DEL CSS - CAJA DE SEGURO SOCIAL" }),
  mov({ monto: 150, descripcion: "DECIMO - BANCA EN LINEA" }),
  mov({ unidad: "NUVO PAN", monto: 300 }),
  mov({ unidad: "OFERFY PAN", tipo: "Otros sueldos", monto: 480 }),
  mov({ unidad: "OFERFY PAN", tipo: "OTROS SUELDOS", monto: 999, en_eerr: false }),
];

test("por mes: planilla contra SUELDOS y externa contra OTROS SUELDOS (solo lo que va al EERR)", () => {
  const [f] = conciliarPorMes(COSTOS, LIBRO, { "2026-04-01": 7 });
  assert.equal(f.formal, 1300);
  assert.equal(f.sueldosLibro, 1650);
  assert.equal(f.difFormal, 350);
  assert.equal(f.externa, 500);
  assert.equal(f.otrosLibro, 480);
  assert.equal(f.difExterna, -20);
  assert.equal(f.fueraEerr, 999);
  assert.equal(f.comision, 7);
  assert.equal(f.diferencia, 330);
});

test("explica la diferencia con lo que dice el libro", () => {
  const [f] = conciliarPorMes(COSTOS, LIBRO, { "2026-04-01": 7 });
  const e = explicarDiferencias(f, LIBRO, 0);
  const textos = e.map((x) => [x.texto.split(" ")[0], x.monto]);
  assert.deepEqual(textos, [
    ["Pago", 200],
    ["Liquidaciones,", 150],
    ["Sueldos", 999],
    ["Parte", 20],
    ["Comisión", 7],
  ]);
  // De los 330 de diferencia, 350 son CSS y décimo (parte del libro); lo de fuera del EERR y la comisión no cuentan.
  assert.equal(sinExplicar(f, e), -20);
});

test("reparte A DISTRIBUIR por envíos; sin base queda sin repartir", () => {
  const montos = new Map([["A DISTRIBUIR", 1000], ["NUVO PAN", 300]]);
  const base = [
    { periodo: "2026-04-01", unidad: "NUVO PAN", envios: 1 },
    { periodo: "2026-04-01", unidad: "ECOMFIVE", envios: 3 },
    { periodo: "2026-04-01", unidad: "KENKU", envios: 0 },
  ];
  const r = repartir(montos, base, REPARTO);
  assert.equal(r.porTienda.get("NUVO PAN"), 550);
  assert.equal(r.porTienda.get("ECOMFIVE"), 750);
  assert.equal(r.porTienda.has("KENKU"), false);
  assert.equal(r.sinRepartir, 0);
  const sin = repartir(montos, [], REPARTO);
  assert.equal(sin.sinRepartir, 1000);
  assert.equal(sin.porTienda.get("NUVO PAN"), 300);
});

test("por tienda: nómina repartida contra el EERR del libro", () => {
  const base = [
    { periodo: "2026-04-01", unidad: "NUVO PAN", envios: 1 },
    { periodo: "2026-04-01", unidad: "OFERFY PAN", envios: 1 },
  ];
  const eerr = [
    { periodo: "2026-04-01", unidad: "NUVO PAN", tipo: "SUELDOS", monto: 975 },
    { periodo: "2026-04-01", unidad: "OFERFY PAN", tipo: "SUELDOS", monto: 675 },
    { periodo: "2026-04-01", unidad: "OFERFY PAN", tipo: "OTROS SUELDOS", monto: 480 },
  ];
  const filas = conciliarPorTienda("2026-04-01", COSTOS, eerr, LIBRO, base, REPARTO);
  assert.deepEqual(filas, [
    { unidad: "NUVO PAN", nominaFormal: 800, libroSueldos: 975, nominaExterna: 0, libroOtros: 0, diferencia: 175 },
    { unidad: "OFERFY PAN", nominaFormal: 500, libroSueldos: 675, nominaExterna: 500, libroOtros: 480, diferencia: 155 },
  ]);
  // Sin base: A DISTRIBUIR queda en «Sin repartir» de los dos lados.
  const sin = conciliarPorTienda("2026-04-01", COSTOS, [], LIBRO, [], REPARTO);
  const sr = sin.find((f) => f.unidad === "Sin repartir")!;
  assert.equal(sr.nominaFormal, 1000);
  assert.equal(sr.libroSueldos, 1350);
});
