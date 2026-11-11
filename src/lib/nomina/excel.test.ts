import assert from "node:assert/strict";
import test from "node:test";
import {
  detectarTipo,
  horas,
  leerNomina,
  leerNominaExterna,
  leerPlanillaFormal,
  mapearTienda,
  numero,
  periodoDeHoja,
  texto,
  tiendaDeObservacion,
  type Celda,
} from "./excel";
import { duracionDeFraccion, fechaDeSerie } from "./hoja";

// Datos inventados: ninguna persona real.
const TITULOS_MARZO = [
  "N° de empleado", "CEDULA /PASAPORTE", "NAC", "NOMBRE COMPLETO", "CARGO", "FECHA DE INICIO", "FECHA DE COLUMINACION",
  "ESTATUS", "SALARIO MENSUAL", "HORA POR MES", "PAGO POR SEMANA", "PAGO POR DIA", "HORA RATA", "HORAS TRABAJADAS",
  "HORAS EXTRAS", "TOTAL HORAS EXTRAS", "TARDANZAS", "AUSENCIAS", "DESCUENTO TARDANZA", "DESCUENTO AUSENCIA",
  "FERIADO TRABAJADO", "HORA EXTRA EN FERIADO", "TOTAL HORAS EXTRAS 2", "BONO", "HORAS EXTRAS COMPLETAS",
  "TOTAL DESCUENTOS DE HORAS", "TOTAL ASIGNACIONES", "SEGURO SOCIAL 9.75%", "SEGURO EDUCATIVO 1.25%", "SALARIO NETO", "OBSERVACION",
];

const rata = 800 / 195;
/** Una fila con los valores que el Excel ya calculó. */
function filaFormal(o: { nombre: string; doc?: string; horasExtra?: Celda; tardanza?: Celda; css?: boolean; obs?: string; bono?: number }): Celda[] {
  const he = horas(o.horasExtra ?? null) ?? 0;
  const tardH = typeof o.tardanza === "number" ? o.tardanza / 60 : (horas(o.tardanza ?? null) ?? 0);
  const montoHe = he * rata * 1.25;
  const bruto = rata * 97.5 + montoHe + (o.bono ?? 0) - tardH * rata;
  const css = o.css ? bruto * 0.0975 : null;
  const se = o.css ? bruto * 0.0125 : null;
  return [
    1, o.doc ?? null, "P", o.nombre, "AUXILIAR", "2026-01-20", "2026-07-19", "CONTRATO", 800, 195, 45 * rata, 7.5 * rata, rata, 97.5,
    o.horasExtra ?? null, montoHe, o.tardanza ?? null, null, tardH * rata, 0, null, null, null, o.bono ?? null, montoHe, tardH * rata,
    bruto, css, se, bruto - (css ?? 0) - (se ?? 0), o.obs ?? null,
  ];
}

const HOJA_MARZO: Celda[][] = [
  ["GUIA RAPIDA DE USO "],
  ["Q = TARDANZAS (en minutos) R = AUSENCIAS (en días)"],
  [],
  TITULOS_MARZO,
  filaFormal({ nombre: "Ana  Pérez", doc: "8-123-396", horasExtra: 2.5, tardanza: 106, css: true }),
  filaFormal({ nombre: "LUIS GOMEZ", obs: "SALARIO LO CUBRE ECOMFIVE", bono: 150 }),
  [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0, 0],
  [],
  TITULOS_MARZO,
  filaFormal({ nombre: "ANA PEREZ", doc: "8-123-396", horasExtra: "2:12", tardanza: "0:38", css: true }),
  filaFormal({ nombre: "LUIS GOMEZ" }),
];

// Otra hoja con las columnas en otro orden y sin tardanzas (como noviembre).
const HOJA_NOVIEMBRE: Celda[][] = [
  ["NOTA: inventada"],
  ["NOMBRE COMPLETO", "SALARIO MENSUAL", "HORA POR MES", "HORA RATA", "HORAS TRABAJADAS", "HORAS EXTRAS", "TOTAL HORAS EXTRAS", "TOTAL ASIGNACIONES", "SALARIO NETO"],
  ["ANA PEREZ", 800, 195, rata, 97.5, 1, rata * 1.25, 400 + rata * 1.25, 400 + rata * 1.25],
  // No cuadra: el Excel dice otra cosa.
  ["LUIS GOMEZ", 800, 195, rata, 97.5, null, 0, 410, 410],
];

test("celdas: números, horas, textos y fechas", () => {
  assert.equal(numero("1,250.40"), 1250.4);
  assert.equal(numero("SE PAGA"), null);
  assert.equal(numero("2:12"), null);
  assert.equal(horas("2:12"), 2.2);
  assert.equal(horas("26:58:00"), 26 + 58 / 60);
  assert.equal(horas(3.5), 3.5);
  assert.equal(texto(406663839540011008), "406663839540011008");
  assert.equal(texto("  a   b "), "a b");
  assert.equal(fechaDeSerie(46097), "2026-03-16");
  assert.equal(duracionDeFraccion(2.2 / 24), "2:12");
  assert.equal(duracionDeFraccion(1.12361111), "26:58");
});

test("hojas por mes y tiendas", () => {
  assert.equal(periodoDeHoja("MARZO 2026"), "2026-03-01");
  assert.equal(periodoDeHoja("Septiembre 2026"), "2026-09-01");
  assert.equal(periodoDeHoja("PLANILLA NOMINA"), null);
  assert.equal(periodoDeHoja("CALCULOS"), null);
  assert.equal(mapearTienda("OFERFY"), "OFERFY PAN");
  assert.equal(mapearTienda("Nuvo CR"), "NUVO COSTA RICA");
  assert.equal(mapearTienda("GLOBAL"), "A DISTRIBUIR");
  assert.equal(mapearTienda("calzados"), "CALZADOS O.");
  assert.equal(mapearTienda("TIENDA NUEVA"), "TIENDA NUEVA");
  assert.equal(tiendaDeObservacion("SALARIO LO CUBRE ECOMFIVE"), "ECOMFIVE");
  assert.equal(tiendaDeObservacion("salario lo cubre nuvo"), "NUVO PAN");
  assert.equal(tiendaDeObservacion("SALARIO LO CUBRE ECOMFIVE 20 PARTE DEL SALARIO"), "ECOMFIVE");
  assert.equal(tiendaDeObservacion("el día 03/03 no asistió"), null);
});

test("planilla formal: dos quincenas por hoja, columnas por nombre y fórmulas recalculadas", () => {
  const hojas = [
    { nombre: "PLANILLA NOMINA", filas: [["NOMBRE COMPLETO", "SALARIO MENSUAL"], ["X", 1]] },
    { nombre: "NOVIEMBRE 2025", filas: HOJA_NOVIEMBRE },
    { nombre: "MARZO 2026", filas: HOJA_MARZO },
    { nombre: "CALCULOS", filas: [["POLÍTICA DE TARDANZAS"]] },
  ];
  assert.equal(detectarTipo(hojas), "formal");
  const r = leerPlanillaFormal(hojas);
  assert.deepEqual(r.hojasIgnoradas, ["PLANILLA NOMINA", "CALCULOS"]);
  assert.equal(r.lineas.length, 6);
  const marzo = r.lineas.filter((l) => l.periodo === "2026-03-01");
  assert.deepEqual(marzo.map((l) => l.tramo), ["1ª quincena", "1ª quincena", "2ª quincena", "2ª quincena"]);
  // La misma persona aunque cambie de mayúsculas, acentos o espacios.
  assert.equal(new Set(r.lineas.map((l) => l.clave)).size, 2);
  const ana = marzo[0];
  assert.equal(ana.documento, "8-123-396");
  assert.equal(ana.horas_extra, 2.5);
  assert.equal(ana.descuento_tardanza, Math.round((106 / 60) * rata * 100) / 100);
  assert.ok(ana.seguro_social > 0 && ana.neto < ana.total_bruto);
  assert.equal(marzo[2].horas_extra, 2.2); // «2:12»
  // Quien cotiza y quien no, todo cuadra con las fórmulas; la fila inventada de noviembre no.
  assert.deepEqual(
    r.noCuadran.map((x) => [x.hoja, x.fila, x.campo]),
    [
      ["NOVIEMBRE 2025", 4, "total asignaciones"],
      ["NOVIEMBRE 2025", 4, "salario neto"],
    ],
  );
  const luisNov = r.lineas.find((l) => l.periodo === "2025-11-01" && l.clave === "LUIS GOMEZ")!;
  assert.equal(luisNov.diferencia_calculo, -10);
  // Su observación dice que lo paga ECOMFIVE: esa es su tienda; la de Ana, A DISTRIBUIR.
  assert.ok(r.lineas.filter((l) => l.clave === "LUIS GOMEZ").every((l) => l.unidad_persona === "ECOMFIVE"));
  assert.ok(r.lineas.filter((l) => l.clave === "ANA PEREZ").every((l) => l.unidad_persona === "A DISTRIBUIR"));
  assert.equal(r.periodos.find((p) => p.periodo === "2026-03-01")!.lineas, 4);
});

test("planilla formal: las huellas son estables y únicas", () => {
  const hojas = [{ nombre: "MARZO 2026", filas: HOJA_MARZO }];
  const a = leerPlanillaFormal(hojas).lineas.map((l) => l.origen_clave);
  const b = leerPlanillaFormal(hojas).lineas.map((l) => l.origen_clave);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
  assert.ok(a.every((k) => /^[0-9a-f]{24}#\d+$/.test(k)));
});

const TITULOS_EXT = [
  "Nombre completo", "País", "Rol / Función", "Frecuencia de pago", "Periodo cubierto", "Tienda", "Sueldo Mensual USDT",
  "Hora Extra", "Hora normal USDT", "Monto  horas extras", "BONO USDT", "TOTAL  USDT", "TIPO DE PAGO", "Fecha de pago",
  "Medio de pago", "Transaction ID", "Pagado", "Origen del pago", "Observaciones",
];

test("nómina externa: pagos, totales, comisión y horas como hora", () => {
  const hn = 234 / 26 / 9;
  const hojas = [
    { nombre: "INFORMACION ASESOR", filas: [["FECHA DE INICIO", "NOMBRE ", "FUNCION"]] },
    {
      nombre: "JUNIO 2026",
      filas: [
        TITULOS_EXT,
        ["PEDRO RUIZ", "VENEZUELA", "ATENCIÓN AL CLIENTE", "MENSUAL", "JUNIO", "OFERFY", 234, 3.5, hn, 3.5 * hn, 20, 234 + 3.5 * hn + 20, "INDIVIDUAL", "2026-06-30", "BINANCE USDT", 406663839540011008, "SI", "PRESTAMO", null],
        ["MARIA LOPEZ", "VENEZUELA", "EDITOR DE VIDEOS", "SEMANAL", "2026-06-15", "NUVO CR", 100, "1:30", hn, 1.5 * hn, null, 100 + 1.5 * hn, "INDIVIDUAL", "2026-06-15", "BINANCE USDT", "ABC123", null, "INGRESO OPERATIVO", null],
        ["MARIA LOPEZ", "VENEZUELA", "EDITOR DE VIDEOS", "SEMANAL", "2026-06-15", "NUVO CR", 100, null, hn, 0, null, 100, "INDIVIDUAL", null, "BINANCE USDT", null, "NO", null, null],
        // Fila con un total que no da la suma.
        ["JOSE DIAZ", "VENEZUELA", "COMPRAS", "MENSUAL", "JUNIO", "GLOBAL", 300, null, 300 / 26 / 9, 0, null, 310, "Global prorrateado", null, null, null, null, null, null],
        [],
        ["OFERFY TOTAL", "", "", "", "", "OFERFY", "", "", "", "", "", 999],
        ["TOTAL USDT PAGADO", null, null, null, null, null, null, null, null, null, null, 800],
        ["COMISION P2P / BINANCE", null, null, null, null, null, null, null, null, null, null, 12.5],
        ["TOTAL USDT CON COMISION", null, null, null, null, null, null, null, null, null, null, 812.5],
      ],
    },
  ];
  assert.equal(detectarTipo(hojas), "externa");
  const r = leerNomina(hojas)!;
  assert.equal(r.tipo, "externa");
  assert.deepEqual(r.hojasIgnoradas, ["INFORMACION ASESOR"]);
  assert.equal(r.lineas.length, 4);
  const [pedro, maria1, maria2, jose] = r.lineas;
  assert.equal(pedro.unidad, "OFERFY PAN");
  assert.equal(pedro.moneda, "USDT");
  assert.equal(pedro.referencia, "406663839540011008");
  assert.equal(pedro.pagado, true);
  assert.equal(pedro.salario_mensual, 234);
  assert.equal(pedro.neto, 257.5);
  assert.equal(maria1.unidad, "NUVO COSTA RICA");
  assert.equal(maria1.tramo, "15/06/2026");
  assert.equal(maria1.horas_extra, 1.5);
  assert.equal(maria1.pagado, null);
  assert.equal(maria2.pagado, false);
  // Dos pagos iguales de la misma persona en el mismo tramo: huellas distintas.
  assert.notEqual(maria1.origen_clave, maria2.origen_clave);
  assert.equal(jose.unidad, "A DISTRIBUIR");
  assert.equal(jose.diferencia_calculo, -10);
  assert.deepEqual(r.noCuadran.map((x) => [x.fila, x.campo]), [[5, "total USDT"]]);
  const p = r.periodos[0];
  assert.equal(p.comision, 12.5);
  assert.equal(p.total_excel, 800);
  assert.equal(p.lineas, 4);
  assert.equal(p.suma_lineas, Math.round((257.5 + 100 + 1.5 * hn + 100 + 310) * 100) / 100);
});

test("nómina externa: total del Excel con error queda vacío", () => {
  const r = leerNominaExterna([
    { nombre: "OCTUBRE 2026", filas: [TITULOS_EXT, ["A B", "VENEZUELA", "X", "MENSUAL", "OCTUBRE", "KENKU", 200, null, null, null, null, 200], ["TOTAL USDT PAGADO", null, null, null, null, null, null, null, null, null, null, null]] },
  ]);
  assert.equal(r.periodos[0].total_excel, null);
  assert.equal(r.periodos[0].suma_lineas, 200);
});

test("un libro que no es nómina", () => {
  assert.equal(leerNomina([{ nombre: "2026", filas: [["MES", "TIENDA", "TIPO", "USD"]] }]), null);
});
