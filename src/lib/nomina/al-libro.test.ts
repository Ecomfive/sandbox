// Nómina al libro: lógica pura (datos inventados).
import assert from "node:assert/strict";
import test from "node:test";
import {
  claveNomina,
  clasificarSueldos,
  estaCerrado,
  leerPeriodo,
  mesDePago,
  movimientosDeNomina,
  planNominaAlLibro,
  type LineaAlLibro,
  type SueldoLibro,
} from "./al-libro";

const MES = "2026-03-01";
const REPARTO = "u-reparto";
const L = (tipo: LineaAlLibro["tipo"], unidadId: string | null, neto: number, fechaPago: string | null = null): LineaAlLibro => ({ tipo, unidadId, neto, fechaPago });
const S = (id: string, unidadId: string, tipo: SueldoLibro["tipo"], monto: number, extra: Partial<SueldoLibro> = {}): SueldoLibro => ({
  id, unidadId, tipo, monto, enEerr: true, origen: "GASTOS.xlsx", descripcion: "Pago quincena", reemplazadoPor: null, ...extra,
});

test("leer el mes y el mes de pago", () => {
  assert.equal(leerPeriodo("2026-03"), MES);
  assert.equal(leerPeriodo("2026-03-01"), MES);
  assert.equal(leerPeriodo("2026-13"), null);
  assert.equal(leerPeriodo("x; drop"), null);
  assert.equal(mesDePago(MES, null), MES);
  assert.equal(mesDePago(MES, "2026-04-05"), "2026-04-01");
  assert.equal(mesDePago(MES, "2026-02-28"), "2026-02-01");
  // Fuera de rango: error de carga, se usa el período.
  assert.equal(mesDePago(MES, "2025-03-15"), MES);
  assert.equal(mesDePago(MES, "basura"), MES);
});

test("un movimiento por tipo, tienda y mes de pago; sin tienda va a la unidad de reparto", () => {
  const movs = movimientosDeNomina(
    MES,
    [
      L("formal", "u-a", 300, "2026-03-15"),
      L("formal", "u-a", 310.5, "2026-03-31"),
      L("formal", "u-a", 290, "2026-04-02"),
      L("formal", null, 100, "2026-03-15"),
      L("externa", "u-b", 250, "2026-03-20"),
      L("externa", "u-b", 0),
      L("externa", "u-c", 0),
      L("formal", "u-d", 50, "2025-01-01"),
    ],
    REPARTO,
  );
  const por = new Map(movs.map((m) => [m.origen_clave, m]));
  const a = por.get(claveNomina(MES, "formal", "u-a", MES))!;
  assert.equal(a.monto, 610.5);
  assert.equal(a.fecha_pago, "2026-03-31");
  assert.equal(a.tipo, "formal");
  const aAbr = por.get(claveNomina(MES, "formal", "u-a", "2026-04-01"))!;
  assert.equal(aAbr.monto, 290);
  assert.match(aAbr.descripcion, /pagada en abr 26/);
  assert.equal(por.get(claveNomina(MES, "formal", REPARTO, MES))!.monto, 100);
  assert.equal(por.get(claveNomina(MES, "externa", "u-b", MES))!.monto, 250);
  // Lo que suma cero no se crea.
  assert.ok(!movs.some((m) => m.unidad_id === "u-c"));
  // Fecha fuera de rango: el mes del período y sin fecha de pago.
  const d = por.get(claveNomina(MES, "formal", "u-d", MES))!;
  assert.equal(d.fecha_pago, null);
  // Las claves son únicas y del mes (la función SQL lo exige).
  assert.equal(new Set(movs.map((m) => m.origen_clave)).size, movs.length);
  assert.ok(movs.every((m) => m.origen_clave.startsWith("nomina:2026-03:")));
  // Sin datos personales en la descripción.
  assert.ok(movs.every((m) => /^Nómina (formal|externa)/.test(m.descripcion)));
});

test("qué sueldos del libro se reemplazan y cuáles se quedan", () => {
  const s = clasificarSueldos([
    S("1", "u-a", "formal", 600),
    S("2", "u-a", "formal", 80, { descripcion: "Pago CSS marzo" }),
    S("3", "u-a", "formal", 500, { descripcion: "Liquidación de un ex colaborador" }),
    S("4", "u-a", "formal", 40, { enEerr: false }),
    S("5", "u-b", "externa", 245),
    S("6", "u-a", "formal", 610.5, { origen: "nomina" }),
    S("7", "u-a", "formal", 590, { enEerr: false, reemplazadoPor: "nomina" }),
    S("8", "u-a", "formal", 12, { descripcion: "Décimo tercer mes" }),
  ]);
  assert.deepEqual(s.reemplazar.map((x) => x.id), ["1", "5"]);
  assert.deepEqual(s.quedan.map((x) => x.id), ["2", "3", "8"]);
  assert.deepEqual(s.yaReemplazados.map((x) => x.id), ["7"]);
  assert.deepEqual(s.deNomina.map((x) => x.id), ["6"]);
});

test("el plan: cuadro por tienda, totales y pasar dos veces no vuelve a reemplazar", () => {
  const lineas = [L("formal", "u-a", 610.5, "2026-03-31"), L("externa", "u-b", 250, "2026-03-20")];
  const libro = [S("1", "u-a", "formal", 600), S("5", "u-b", "externa", 245), S("2", "u-a", "formal", 80, { descripcion: "CSS" })];
  const p1 = planNominaAlLibro(MES, lineas, libro, REPARTO);
  assert.equal(p1.yaPasado, false);
  assert.deepEqual(p1.reemplazar.sort(), ["1", "5"]);
  const a = p1.cuadro.find((f) => f.unidadId === "u-a")!;
  assert.deepEqual(a, { unidadId: "u-a", libroSueldos: 600, nominaFormal: 610.5, libroOtros: 0, nominaExterna: 0, seQuedan: 80, diferencia: 10.5 });
  assert.deepEqual(p1.totales, { libro: 845, nomina: 860.5, seQuedan: 80, diferencia: 15.5 });

  // Después de pasar: los del Excel quedan reemplazados y los de nómina están en el libro.
  const despues = [
    S("1", "u-a", "formal", 600, { enEerr: false, reemplazadoPor: "nomina" }),
    S("5", "u-b", "externa", 245, { enEerr: false, reemplazadoPor: "nomina" }),
    S("2", "u-a", "formal", 80, { descripcion: "CSS" }),
    S("n1", "u-a", "formal", 610.5, { origen: "nomina" }),
    S("n2", "u-b", "externa", 250, { origen: "nomina" }),
  ];
  const p2 = planNominaAlLibro(MES, lineas, despues, REPARTO);
  assert.equal(p2.yaPasado, true);
  assert.deepEqual(p2.reemplazar, []);
  assert.deepEqual(p2.movimientos, p1.movimientos);
  // El cuadro sigue comparando contra lo que había en el libro.
  assert.deepEqual(p2.totales, p1.totales);
});

test("mes cerrado según una fila de fin_cierres", () => {
  assert.equal(estaCerrado(null), false);
  assert.equal(estaCerrado(undefined), false);
  assert.equal(estaCerrado({ periodo: MES }), true);
  assert.equal(estaCerrado({ periodo: MES, estado: "cerrado" }), true);
  assert.equal(estaCerrado({ periodo: MES, estado: "abierto" }), false);
  assert.equal(estaCerrado({ periodo: MES, cerrado: false }), false);
  assert.equal(estaCerrado({ periodo: MES, reabierto_en: "2026-04-02T10:00:00Z" }), false);
});

test("un mes reabierto y vuelto a cerrar sigue cerrado", () => {
  assert.equal(estaCerrado({ estado: "cerrado", reabierto_en: "2026-09-02T10:00:00Z" }), true);
  assert.equal(estaCerrado({ estado: "abierto", reabierto_en: "2026-09-02T10:00:00Z" }), false);
});
