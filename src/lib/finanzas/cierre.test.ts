import assert from "node:assert/strict";
import test from "node:test";
import {
  avance,
  colorDelMes,
  combinarTareas,
  compararFotografia,
  cuadraVentas,
  evaluarTareas,
  filaPanel,
  finDeMes,
  juevesDelMes,
  leerFotografia,
  leerPeriodo,
  mesDe,
  mesesDeMovimiento,
  nombreMes,
  puedeCerrar,
  rangoMeses,
  resumirEerrMes,
  separarPorCierre,
  TAREAS,
  transicionValida,
  validarMarca,
  type DatosMes,
  type Fotografia,
} from "./cierre";
import type { FilaEerr } from "./eerr";

const AL_DIA: DatosMes = {
  sinTipo: 0,
  sinTienda: 0,
  reparto: { sinRepartir: 0, envios: 1200 },
  ventas: { ordenes: 1500, tiendas: 3 },
  cuadreVentas: [
    { tienda: "TIENDA A", ventas: 1000, ingresos: 1000 },
    { tienda: "TIENDA B", ventas: 2000, ingresos: 2010 },
  ],
  conciliacion: [{ cuenta: "BANCO 1", lineas: 40, porConciliar: 0 }],
  nomina: { esperados: ["formal", "externa"], importados: ["externa", "formal"] },
  nominaLibro: { nomina: 5000, libro: 5000.5 },
  deliverys: { semanas: 4, sinPagar: 0 },
  costoVentas: { ingresos: 10000, costo: 3000 },
  saldos: { conMovimiento: 2, sinSaldo: [] },
  devengos: { esperados: 1, registrados: 1 },
  provisiones: { conPlanilla: true, registradas: 3 },
  cuadreInventario: { cuadre: { libros: 100, sistema: 100, diferencia: 0, explicacion: null }, tolerancia: 50 },
  cuadreDropi: { cuadre: { libros: 300, sistema: 100, diferencia: 200, explicacion: "Retiro en tránsito" }, tolerancia: 50 },
  variaciones: { superan: 2, sinExplicar: 0 },
  quickbooks: { portal: 10000, qbo: 10050, desviacion: -0.5 },
};

const NADA: DatosMes = {
  sinTipo: null,
  sinTienda: null,
  reparto: null,
  ventas: null,
  cuadreVentas: null,
  conciliacion: null,
  nomina: null,
  nominaLibro: null,
  deliverys: null,
  costoVentas: null,
  saldos: null,
  devengos: null,
  provisiones: null,
  cuadreInventario: null,
  cuadreDropi: null,
  variaciones: null,
};

const res = (d: DatosMes) => Object.fromEntries(evaluarTareas("2026-07-01", d).map((t) => [t.clave, t.resultado]));

test("meses y semanas", () => {
  assert.equal(leerPeriodo("2026-07"), "2026-07-01");
  assert.equal(leerPeriodo("2026-07-01"), "2026-07-01");
  assert.equal(leerPeriodo("2026-13-01"), null);
  assert.equal(leerPeriodo("2026-07-02"), null);
  assert.equal(leerPeriodo("2026-07-01' or 1=1"), null);
  assert.equal(mesDe("2026-07-31"), "2026-07-01");
  assert.equal(mesDe(null), null);
  assert.equal(nombreMes("2026-09-01"), "septiembre de 2026");
  assert.equal(finDeMes("2026-02-01"), "2026-02-28");
  assert.equal(finDeMes("2028-02-01"), "2028-02-29");
  assert.deepEqual(rangoMeses("2025-11-01", "2026-02-01"), ["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]);
  // Octubre de 2026 empieza en jueves.
  assert.deepEqual(juevesDelMes("2026-10-01"), ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29"]);
});

test("transiciones del cierre", () => {
  assert.ok(transicionValida("abierto", "en_revision"));
  assert.ok(transicionValida("en_revision", "cerrado"));
  assert.ok(transicionValida("en_revision", "abierto"));
  assert.ok(transicionValida("cerrado", "abierto"));
  assert.ok(!transicionValida("abierto", "cerrado"));
  assert.ok(!transicionValida("cerrado", "en_revision"));
});

test("bloqueo: un movimiento toca el mes del libro y el de pago", () => {
  assert.deepEqual(mesesDeMovimiento({ periodo: "2026-08-01", fecha_pago: "2026-07-30" }), ["2026-08-01", "2026-07-01"]);
  assert.deepEqual(mesesDeMovimiento({ periodo: "2026-08-01", fecha_pago: null }), ["2026-08-01", "2026-08-01"]);
  const movs = [
    { id: 1, periodo: "2026-07-01", fecha_pago: null },
    { id: 2, periodo: "2026-08-01", fecha_pago: "2026-08-03" },
    { id: 3, periodo: "2026-08-01", fecha_pago: "2026-07-31" },
  ];
  const { abiertas, enCerrado } = separarPorCierre(movs, new Set(["2026-07-01"]), mesesDeMovimiento);
  assert.deepEqual(abiertas.map((m) => m.id), [2]);
  assert.deepEqual(enCerrado.map((m) => m.id), [1, 3]);
  // Sin meses cerrados no se separa nada.
  assert.equal(separarPorCierre(movs, new Set(), mesesDeMovimiento).abiertas.length, 3);
});

test("checklist al día: todo en verde", () => {
  const r = res(AL_DIA);
  assert.ok(Object.values(r).every((x) => x === "ok"), JSON.stringify(r));
  assert.equal(evaluarTareas("2026-07-01", AL_DIA).length, TAREAS.length);
  const nom = evaluarTareas("2026-07-01", AL_DIA).find((t) => t.clave === "nomina-libro")!;
  assert.equal(nom.href, "/nomina/conciliacion?mes=2026-07-01");
});

test("checklist: cada problema en su tarea", () => {
  const r = res({
    ...AL_DIA,
    sinTipo: 3,
    sinTienda: 2,
    reparto: { sinRepartir: 150.5, envios: 0 },
    ventas: { ordenes: 0, tiendas: 0 },
    cuadreVentas: [{ tienda: "TIENDA A", ventas: 1000, ingresos: 900 }],
    conciliacion: [
      { cuenta: "BANCO 1", lineas: 40, porConciliar: 3 },
      { cuenta: "BANCO 2", lineas: 0, porConciliar: 0 },
    ],
    nomina: { esperados: ["formal", "externa"], importados: ["formal"] },
    nominaLibro: { nomina: 5000, libro: 4800 },
    deliverys: { semanas: 4, sinPagar: 1 },
    // Un mes como agosto, sin costo de ventas.
    costoVentas: { ingresos: 10000, costo: 0 },
    saldos: { conMovimiento: 2, sinSaldo: ["BANCO 2"] },
    devengos: { esperados: 2, registrados: 0 },
    provisiones: { conPlanilla: true, registradas: 0 },
    cuadreInventario: { cuadre: null, tolerancia: 50 },
    cuadreDropi: { cuadre: { libros: 500, sistema: 100, diferencia: 400, explicacion: null }, tolerancia: 50 },
    variaciones: { superan: 2, sinExplicar: 1 },
    quickbooks: { portal: 1000, qbo: 1100, desviacion: -9.09 },
  });
  assert.deepEqual(r, {
    "sin-tipo": "falta",
    "sin-tienda": "falta",
    "base-reparto": "falta",
    ventas: "falta",
    "cuadre-ventas": "revisar",
    conciliacion: "falta",
    nomina: "falta",
    "nomina-libro": "revisar",
    deliverys: "falta",
    "costo-ventas": "falta",
    saldos: "falta",
    devengos: "falta",
    provisiones: "falta",
    "cuadre-inventario": "falta",
    "cuadre-dropi": "revisar",
    variaciones: "falta",
    quickbooks: "revisar",
  });
  const conc = evaluarTareas("2026-07-01", { ...AL_DIA, conciliacion: [{ cuenta: "BANCO 2", lineas: 0, porConciliar: 0 }] }).find((t) => t.clave === "conciliacion")!;
  assert.match(conc.detalle, /BANCO 2: sin extracto del mes/);
});

test("checklist: costo de ventas fuera de rango y casos límite", () => {
  assert.equal(res({ ...AL_DIA, costoVentas: { ingresos: 10000, costo: 500 } })["costo-ventas"], "revisar");
  assert.equal(res({ ...AL_DIA, costoVentas: { ingresos: 10000, costo: 7000 } })["costo-ventas"], "revisar");
  assert.equal(res({ ...AL_DIA, costoVentas: { ingresos: 0, costo: 0 } })["costo-ventas"], "revisar");
  assert.equal(res({ ...AL_DIA, conciliacion: [] }).conciliacion, "falta");
  assert.equal(res({ ...AL_DIA, nomina: { esperados: [], importados: [] } }).nomina, "falta");
  assert.equal(res({ ...AL_DIA, deliverys: { semanas: 0, sinPagar: 0 } }).deliverys, "revisar");
  assert.equal(res({ ...AL_DIA, cuadreVentas: [] })["cuadre-ventas"], "falta");
  assert.equal(res({ ...AL_DIA, reparto: { sinRepartir: 0, envios: 0 } })["base-reparto"], "ok");
});

test("cuadre de ventas: un dólar o el 1 % de los ingresos", () => {
  assert.ok(cuadraVentas(100, 100.9));
  assert.ok(!cuadraVentas(100, 101.5));
  assert.ok(cuadraVentas(10000, 10090));
  assert.ok(!cuadraVentas(10000, 10200));
  assert.ok(!cuadraVentas(500, null));
});

test("una fuente que no existe deja su tarea «no disponible» sin romper las demás", () => {
  const r = res({ ...NADA, sinTipo: 0 });
  assert.equal(r["sin-tipo"], "ok");
  assert.equal(r.conciliacion, "no_disponible");
  assert.match(evaluarTareas("2026-07-01", NADA).find((t) => t.clave === "deliverys")!.detalle, /0911/);
});

test("marcas a mano: justificar las excepciones", () => {
  assert.equal(validarMarca("no_aplica", " ", "ok"), "Escribe por qué no aplica.");
  assert.equal(validarMarca("no_aplica", "No hubo deliverys", "falta"), null);
  assert.equal(validarMarca("hecho", null, "ok"), null);
  assert.match(validarMarca("hecho", "", "revisar")!, /por qué/);
  assert.equal(validarMarca("pendiente", null, "falta"), null);

  const evaluadas = evaluarTareas("2026-08-01", { ...AL_DIA, deliverys: { semanas: 0, sinPagar: 0 }, sinTipo: 4, conciliacion: null });
  const tareas = combinarTareas(evaluadas, [
    { clave: "deliverys", estado: "no_aplica", aMano: true, comentario: "No hubo repartos propios", marcadoPor: "Persona", marcadoEn: "2026-09-02T10:00:00Z" },
    // Una marca «hecho» sin comentario no tapa lo que el sistema ve pendiente.
    { clave: "sin-tipo", estado: "hecho", aMano: true, comentario: null },
    { clave: "conciliacion", estado: "hecho", aMano: true, comentario: "Conciliado fuera del portal" },
  ]);
  const de = (c: string) => tareas.find((t) => t.clave === c)!;
  assert.equal(de("deliverys").color, "verde");
  assert.equal(de("deliverys").estado, "no_aplica");
  assert.equal(de("deliverys").marcadoPor, "Persona");
  assert.equal(de("sin-tipo").color, "rojo");
  assert.ok(de("sin-tipo").bloquea);
  assert.equal(de("conciliacion").color, "verde");
  assert.equal(de("ventas").estado, "hecho");
  assert.equal(de("ventas").aMano, false);
  assert.deepEqual(avance(tareas), { listas: TAREAS.length - 1, total: TAREAS.length });

  const ambar = combinarTareas(evaluarTareas("2026-08-01", { ...AL_DIA, nominaLibro: { nomina: 10, libro: 50 } }), []);
  assert.equal(ambar.find((t) => t.clave === "nomina-libro")!.color, "ambar");
  assert.equal(colorDelMes(ambar), "ambar");
  assert.equal(colorDelMes(tareas), "rojo");
  assert.equal(colorDelMes(combinarTareas(evaluarTareas("2026-07-01", AL_DIA), [])), "verde");
});

test("cerrar: solo en revisión y con todo verde o justificado", () => {
  const verdes = combinarTareas(evaluarTareas("2026-07-01", AL_DIA), []);
  assert.deepEqual(puedeCerrar("en_revision", verdes), { ok: true });
  assert.equal(puedeCerrar("abierto", verdes).ok, false);
  const conFalta = combinarTareas(evaluarTareas("2026-07-01", { ...AL_DIA, sinTienda: 1 }), []);
  const r = puedeCerrar("en_revision", conFalta);
  assert.ok(!r.ok && r.motivo.includes("Movimientos sin tienda"));
  const justificada = combinarTareas(evaluarTareas("2026-07-01", { ...AL_DIA, sinTienda: 1 }), [
    { clave: "sin-tienda", estado: "hecho", aMano: true, comentario: "Se asignan en el mes siguiente" },
  ]);
  assert.deepEqual(puedeCerrar("en_revision", justificada), { ok: true });
});

test("fila del Panel financiero", () => {
  const verdes = combinarTareas(evaluarTareas("2026-07-01", AL_DIA), []);
  assert.equal(filaPanel("cerrado", verdes).cantidad, 0);
  assert.equal(filaPanel("abierto", verdes).cantidad, 1);
  assert.match(filaPanel("en_revision", verdes).descripcion, /falta cerrarlo/);
  const conFalta = combinarTareas(evaluarTareas("2026-07-01", { ...AL_DIA, sinTienda: 1, sinTipo: 2 }), []);
  assert.deepEqual(filaPanel("abierto", conFalta), { cantidad: 2, descripcion: "2 tareas del checklist sin resolver", accion: "Revisar" });
});

const fila = (unidad: string, seccion: FilaEerr["seccion"], signo: number, monto: number, tipo: string = seccion): FilaEerr => ({
  periodo: "2026-07-01",
  unidad_id: unidad,
  tipo,
  orden: 1,
  seccion,
  signo,
  monto,
});

test("fotografía: EERR del mes consolidado y por tienda, y lo que cambió después", () => {
  const filas = [
    fila("u1", "ingresos", 1, 1000, "Ingresos"),
    fila("u1", "ingresos", -1, 50, "Devoluciones"),
    fila("u1", "costo_ventas", -1, 300),
    fila("u1", "marketing", -1, 100),
    fila("u2", "ingresos", 1, 500, "Ingresos"),
    fila("u2", "administracion", -1, 200),
    fila("u2", "finanzas", -1, 10),
    { ...fila("u2", "ingresos", 1, 999, "Ingresos"), periodo: "2026-08-01" },
  ];
  const nombres = new Map([
    ["u1", "TIENDA A"],
    ["u2", "TIENDA B"],
  ]);
  const eerr = resumirEerrMes(filas, "2026-07-01", nombres);
  assert.deepEqual(eerr.consolidado, { ingresos: 1450, costoVentas: 300, margenBruto: 1150, ebitda: 850, resultadoNeto: 840 });
  assert.deepEqual(eerr.tiendas.map((t) => [t.nombre, t.resumen.ebitda]), [
    ["TIENDA A", 550],
    ["TIENDA B", 300],
  ]);

  const guardada: Fotografia = {
    version: 1,
    tomadaEn: "2026-08-05T12:00:00Z",
    eerr,
    flujo: { entradas: 100, salidas: 80, neto: 20, operativo: 20, inversion: 0, financiamiento: 0, cajaFinal: 500, cuentas: [] },
    cartera: { porCobrar: 10, cobrarVencido: 0, porPagar: 5, pagarVencido: 0 },
  };
  assert.ok(compararFotografia(guardada, guardada).every((f) => !f.cambio));
  const hoy: Fotografia = {
    ...guardada,
    eerr: resumirEerrMes([...filas, fila("u1", "administracion", -1, 25)], "2026-07-01", nombres),
    cartera: { ...guardada.cartera!, porCobrar: 12 },
  };
  const cambios = compararFotografia(guardada, hoy).filter((f) => f.cambio);
  assert.deepEqual(
    cambios.map((f) => [f.grupo, f.concepto, f.diferencia]),
    [
      ["Consolidado", "EBITDA", -25],
      ["Consolidado", "Resultado neto", -25],
      ["TIENDA A", "EBITDA", -25],
      ["TIENDA A", "Resultado neto", -25],
      ["Cartera al cierre", "Por cobrar", 2],
    ],
  );
  assert.equal(leerFotografia({ version: 2 }), null);
  assert.deepEqual(leerFotografia(JSON.parse(JSON.stringify(guardada))), guardada);
});

test("las variaciones no se dan por hechas a mano", async () => {
  const { validarMarca, TAREAS_SIN_MARCA } = await import("./cierre");
  assert.ok(TAREAS_SIN_MARCA.has("variaciones"));
  assert.match(validarMarca("hecho", "porque sí", "falta", "variaciones") ?? "", /no se marca/);
  const tareas = combinarTareas(evaluarTareas("2026-07-01", { ...AL_DIA, variaciones: { superan: 3, sinExplicar: 1 } }), [
    { clave: "variaciones", estado: "hecho", aMano: true, comentario: "ok" },
  ]);
  assert.equal(tareas.find((t) => t.clave === "variaciones")!.bloquea, true);
});

test("sin la migración, las variaciones sí se justifican a mano", async () => {
  const { validarMarca } = await import("./cierre");
  assert.equal(validarMarca("no_aplica", "Falta la migración 0927", "no_disponible", "variaciones"), null);
  const tareas = combinarTareas(evaluarTareas("2026-07-01", { ...AL_DIA, variaciones: null }), [
    { clave: "variaciones", estado: "no_aplica", aMano: true, comentario: "Falta la migración 0927" },
  ]);
  assert.equal(tareas.find((t) => t.clave === "variaciones")!.bloquea, false);
});

test("QuickBooks: sin conectar la tarea no aparece; conectado se marca sola bajo 1 %", () => {
  const { quickbooks: _q, ...sinQbo } = AL_DIA;
  assert.ok(!evaluarTareas("2026-07-01", sinQbo).some((t) => t.clave === "quickbooks"));
  const de = (q: DatosMes["quickbooks"]) => evaluarTareas("2026-07-01", { ...AL_DIA, quickbooks: q }).find((t) => t.clave === "quickbooks")!;
  assert.equal(de({ portal: 100, qbo: 100.5, desviacion: -0.5 }).resultado, "ok");
  assert.equal(de({ portal: 100, qbo: 110, desviacion: -9.1 }).resultado, "revisar");
  assert.equal(de({ portal: 100, qbo: null, desviacion: null }).resultado, "falta");
  assert.equal(de(null).resultado, "no_disponible");
});
