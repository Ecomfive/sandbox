// Conciliación bancaria v2 (migración 0916): órdenes reales, deliverys e ingresos por cuenta. Datos inventados: ningún
// nombre, número de orden ni monto sale de los Excel reales.
import assert from "node:assert/strict";
import test from "node:test";
import { semanasDelivery } from "./delivery";
import { clasificarLinea, emparejar, sumarDias, type CobroEmp, type LineaEmp, type MovEmp, type OrdenEmp, type SemanaDel } from "./emparejar";
import { claveIngreso, movimientosIngreso, puedeRegistrarIngreso, repartirIngreso, unidadDeTexto } from "./ingreso";
import { nombreEnDescripcion, palabrasEnComun, tiendaEnDescripcion } from "./nombres";

const linea = (id: string, fecha: string, monto: number, descripcion: string): LineaEmp => ({
  id,
  fecha,
  monto,
  descripcion,
  referencia: null,
  clase: clasificarLinea(descripcion, monto),
});
const sinNada = { movimientos: [] as MovEmp[], cobros: [] as CobroEmp[], ordenes: [] as OrdenEmp[] };
const orden = (id: string, monto: number, extra: Partial<OrdenEmp> = {}): OrdenEmp => ({
  id,
  fuente: "ven_ordenes",
  numero: `#${id}`,
  fecha: "2026-09-10",
  monto,
  metodo: "efectivo",
  repartidor: "MARTA PRUEBA",
  tienda: "TIENDA UNO PAN",
  ...extra,
});

test("reconoce a una persona en la descripción del banco aunque venga cortada, al revés o con una letra cambiada", () => {
  assert.ok(nombreEnDescripcion("MARTA PRUEBA", "BANCA MOVIL TRANSFERENCIA DE MARTA ELENA PRUEBA DEMO Cierre 090926 uno"));
  assert.ok(nombreEnDescripcion("MARTA PRUEBA", "ACH CRE MARTA ELENA PRUEB"), "cortado por el ancho de la columna");
  assert.ok(nombreEnDescripcion("MARTI PRUEBA", "ATM DEPOSITO DE PRUEBA/MARTA-BANCO"), "al revés y con una letra distinta");
  assert.ok(nombreEnDescripcion("ZONA 5 DEMOSTRADORA", "TRANSFERENCIA DE DEMOSTRADORA RUIZ"), "la zona no es parte del nombre");
  assert.ok(!nombreEnDescripcion("MARTA PRUEBA", "TRANSFERENCIA DE MARTA OTRA"), "falta el apellido");
  assert.ok(!nombreEnDescripcion("ANA", "TRANSFERENCIA DE ANA DEMO"), "un nombre corto solo no alcanza");
  assert.ok(!nombreEnDescripcion("LA CHORRERA", "DEPOSITO LA CHORRERA"), "un lugar no es una persona");
  assert.equal(palabrasEnComun("LUIS ALBERTO GOMEZ", "TEF DE:LUIS GOMEZ"), 2);
  assert.equal(tiendaEnDescripcion("TRANSFERENCIA DE MARTA PRUEBA Cierre 090926 tiendados", ["TIENDA UNO", "TIENDADOS"]), "TIENDADOS");
});

test("órdenes reales: el depósito de un repartidor es su cierre del día en una tienda (lo cobrado en efectivo)", () => {
  const ordenes = [
    orden("a1", 29.99),
    orden("a2", 34.99),
    orden("a3", 40.02),
    orden("b1", 12, { tienda: "TIENDA DOS PAN" }),
    orden("y1", 50, { metodo: "yappy" }),
    orden("c1", 34.99, { repartidor: "OTRO REPARTIDOR" }),
  ];
  const r = emparejar([linea("l1", "2026-09-11", 105, "BANCA MOVIL TRANSFERENCIA DE MARTA ELENA PRUEBA Cierre 100926 uno")], { ...sinNada, ordenes });
  const p = r.elegidas[0];
  assert.equal(p.metodo, "corte");
  assert.deepEqual(p.partes.map((x) => x.id).sort(), ["a1", "a2", "a3"]);
  assert.ok(p.puntaje >= 85, `puntaje ${p.puntaje}`);
  assert.equal(p.auto, false, "nunca se concilia solo");
  assert.match(p.detalle, /Cierre del 10\/09 · TIENDA UNO · 3 órdenes de MARTA PRUEBA/);
  // Todas las tiendas del día juntas.
  const todo = emparejar([linea("l2", "2026-09-11", 117, "ACH CRE MARTA ELENA PRUEBA")], { ...sinNada, ordenes });
  assert.deepEqual(todo.elegidas[0].partes.map((x) => x.id).sort(), ["a1", "a2", "a3", "b1"]);
});

test("órdenes: manda la orden real sobre el cruce marcado a mano en el Excel", () => {
  const ordenes = [orden("real", 45.5, { metodo: "transferencia", repartidor: null }), orden("excel", 45.5, { fuente: "libro_conciliacion", metodo: "transferencia", repartidor: null })];
  const r = emparejar([linea("l", "2026-09-10", 45.5, "TEF DE:PERSONA INVENTADA")], { ...sinNada, ordenes });
  assert.equal(r.elegidas[0].partes[0].id, "real");
  assert.equal(r.elegidas[0].partes[0].fuente, "ven_ordenes");
  assert.equal(r.alternativas.get("l")?.[0].partes[0].id, "excel");
});

test("órdenes: el nombre de quien compró desempata entre órdenes del mismo monto", () => {
  const ordenes = [
    orden("x1", 39.99, { metodo: "transferencia", repartidor: null, cliente: "OTRA PERSONA DEMO" }),
    orden("x2", 39.99, { metodo: "transferencia", repartidor: null, cliente: "LUIS ALBERTO GOMEZ" }),
  ];
  const r = emparejar([linea("l", "2026-09-10", 39.99, "TEF DE:LUIS GOMEZ")], { ...sinNada, ordenes });
  assert.equal(r.elegidas[0].partes[0].id, "x2");
  assert.ok(r.elegidas[0].puntaje > (r.alternativas.get("l")?.[0].puntaje ?? 0));
});

test("con ~50 mil órdenes el emparejador no explota: índice por día y suma acotada", () => {
  const ordenes: OrdenEmp[] = [];
  const repartidores = ["MARTA PRUEBA", "LUIS DEMOSTRADOR", "ROSA INVENTADA", "PEDRO FICTICIO", "JUANA EJEMPLO"];
  let n = 0;
  for (let d = 0; d < 180; d++) {
    const fecha = sumarDias("2026-04-01", d);
    for (let i = 0; i < 280; i++) {
      ordenes.push(
        orden(`o${n++}`, 20 + ((i * 7.31) % 60), {
          fecha,
          metodo: i % 5 === 0 ? "transferencia" : i % 3 === 0 ? "yappy" : "efectivo",
          repartidor: repartidores[i % repartidores.length],
          tienda: i % 2 ? "TIENDA UNO PAN" : "TIENDA DOS PAN",
        }),
      );
    }
  }
  assert.ok(ordenes.length >= 50_000);
  const lineas: LineaEmp[] = [];
  for (let i = 0; i < 1500; i++) {
    const fecha = sumarDias("2026-04-05", i % 170);
    lineas.push(linea(`l${i}`, fecha, 30 + (i % 400) * 1.37, i % 2 ? `TRANSFERENCIA DE ${repartidores[i % 5]} DEMO` : "DEPOSITO EN EFECTIVO"));
  }
  const t0 = performance.now();
  const r = emparejar(lineas, { ...sinNada, ordenes });
  const ms = performance.now() - t0;
  assert.ok(ms < 20_000, `tardó ${Math.round(ms)} ms`);
  assert.ok(r.elegidas.every((p) => !p.auto));
});

// ---------------------------------------------------------------------------------------------
// Deliverys
// ---------------------------------------------------------------------------------------------

const semana = (extra: Partial<SemanaDel>): SemanaDel => ({
  repartidorId: "r1",
  nombre: "MARTA PRUEBA",
  nombres: ["MARTA PRUEBA", "ZONA 9 MARTA"],
  semana: "2026-09-03",
  unidadId: null,
  tienda: null,
  pagar: 0,
  rendir: 0,
  pago: null,
  ...extra,
});

test("deliverys: el pago a un repartidor es lo de una tienda de su semana, o la suma de varias, o el neto", () => {
  const semanas = [
    semana({ unidadId: "u1", tienda: "TIENDA UNO PAN", pagar: 145.4 }),
    semana({ unidadId: "u2", tienda: "TIENDA DOS PAN", pagar: 47.45 }),
    semana({ unidadId: "u3", tienda: "TIENDA TRES PAN", pagar: 10 }),
    semana({ pagar: 202.85 }),
  ];
  const r = emparejar(
    [
      linea("p1", "2026-09-10", -145.4, "BANCA EN LINEA TRANSFERENCIA A 0400000000009 MARTA ELENA PRUEBA DELIVERY ENVIO"),
      linea("p2", "2026-09-10", -57.45, "BANCA EN LINEA TRANSFERENCIA A 0400000000009 MARTA ELENA PRUEBA DELIVERY ENVIO"),
      linea("p3", "2026-09-10", -145.4, "BANCA EN LINEA TRANSFERENCIA A 0400000000001 OTRA PERSONA"),
    ],
    { ...sinNada, semanas },
  );
  const p1 = r.elegidas.find((p) => p.lineaId === "p1")!;
  assert.equal(p1.partes[0].clase, "delivery");
  assert.deepEqual(p1.partes[0].delivery, { repartidorId: "r1", semana: "2026-09-03", unidadId: "u1" });
  assert.equal(p1.partes[0].monto, -145.4, "con el signo de la línea");
  assert.equal(p1.auto, false);
  const p2 = r.elegidas.find((p) => p.lineaId === "p2")!;
  assert.equal(p2.metodo, "suma");
  assert.deepEqual(p2.partes.map((x) => x.delivery?.unidadId).sort(), ["u2", "u3"]);
  assert.equal(r.elegidas.find((p) => p.lineaId === "p3"), undefined, "sin el nombre del repartidor no se propone");
  // Por tiendas o completa, no de las dos formas: si ya se usó una tienda, el neto de la semana no se elige.
  const r2 = emparejar([linea("a", "2026-09-10", -145.4, "TRANSFERENCIA A MARTA PRUEBA"), linea("b", "2026-09-11", -202.85, "TRANSFERENCIA A MARTA PRUEBA")], { ...sinNada, semanas });
  assert.equal(r2.elegidas.length, 1);
});

test("deliverys: un depósito del repartidor es lo que su cierre dice que debe rendir; el pago registrado suma puntaje", () => {
  const r = emparejar([linea("d", "2026-09-10", 80.5, "ACH CRE MARTA ELENA PRUEBA")], { ...sinNada, semanas: [semana({ rendir: 80.5 })] });
  assert.equal(r.elegidas[0].partes[0].clase, "delivery");
  assert.equal(r.elegidas[0].partes[0].monto, 80.5);
  const sin = emparejar([linea("p", "2026-09-10", -90, "TRANSFERENCIA A MARTA PRUEBA")], { ...sinNada, semanas: [semana({ pagar: 90 })] });
  const con = emparejar([linea("p", "2026-09-10", -90, "TRANSFERENCIA A MARTA PRUEBA")], { ...sinNada, semanas: [semana({ pagar: 90, pago: { fecha: "2026-09-10", monto: 90 } })] });
  assert.ok(con.elegidas[0].puntaje > sin.elegidas[0].puntaje);
  // Demasiado tarde (más de dos semanas después del miércoles) no se propone.
  assert.equal(emparejar([linea("p", "2026-10-10", -90, "TRANSFERENCIA A MARTA PRUEBA")], { ...sinNada, semanas: [semana({ pagar: 90 })] }).elegidas.length, 0);
});

test("semanasDelivery: por tienda y el neto (abierto: tarifas − adelantos − descuentos − efectivo; cerrado: el del cierre)", () => {
  const tiendas = [
    { repartidor_id: "r1", semana: "2026-09-03", unidad_id: "u1", pago_aparte: false, monto: 100, cobrado_efectivo: 0 },
    { repartidor_id: "r1", semana: "2026-09-03", unidad_id: "u2", pago_aparte: true, monto: 20, cobrado_efectivo: 0 },
    { repartidor_id: "r1", semana: "2026-09-10", unidad_id: "u1", pago_aparte: false, monto: 50, cobrado_efectivo: 80 },
    { repartidor_id: "r1", semana: "2026-09-17", unidad_id: "u1", pago_aparte: false, monto: 60, cobrado_efectivo: 0 },
  ];
  const cierres = [
    { repartidor_id: "r1", semana: "2026-09-03", estado: "abierto" as const, adelantos: 10, descuentos: 5, neto: null, fecha_pago: null },
    { repartidor_id: "r1", semana: "2026-09-17", estado: "pagado" as const, adelantos: 0, descuentos: 0, neto: 58, fecha_pago: "2026-09-24" },
  ];
  const s = semanasDelivery(tiendas, cierres, [{ id: "r1", nombre: "MARTA PRUEBA", alias: ["ZONA 9 MARTA"] }], new Map([["u1", "TIENDA UNO PAN"], ["u2", "TIENDA DOS PAN"]]));
  const de = (sem: string, u: string | null) => s.find((x) => x.semana === sem && x.unidadId === u);
  assert.equal(de("2026-09-03", "u1")?.pagar, 100);
  assert.equal(de("2026-09-03", "u2")?.pagar, 20, "la tienda que paga aparte se ofrece sola");
  assert.equal(de("2026-09-03", null)?.pagar, 85, "100 − 10 − 5; lo que paga aparte no entra al neto");
  assert.equal(de("2026-09-10", null)?.rendir, 30, "cobró 80 y se le pagan 50: rinde 30");
  assert.deepEqual(de("2026-09-17", null)?.pago, { fecha: "2026-09-24", monto: 58 });
  assert.equal(de("2026-09-17", null)?.pagar, 58);
  assert.deepEqual(de("2026-09-03", null)?.nombres, ["MARTA PRUEBA", "ZONA 9 MARTA"]);
  // Lo ya conciliado no se ofrece: una tienda confirmada quita también la semana completa.
  const sin = semanasDelivery(tiendas, cierres, [{ id: "r1", nombre: "MARTA PRUEBA", alias: [] }], new Map(), new Set(["r1|2026-09-03|u1", "r1|2026-09-10|"]));
  assert.equal(sin.filter((x) => x.semana === "2026-09-03").map((x) => x.unidadId).join(","), "u2");
  assert.equal(sin.filter((x) => x.semana === "2026-09-10").length, 0);
});

// ---------------------------------------------------------------------------------------------
// Ingresos por cuenta
// ---------------------------------------------------------------------------------------------

const unidades = [
  { id: "u1", nombre: "TIENDA UNO PAN", etiquetas: ["UNO"] },
  { id: "u2", nombre: "TIENDA DOS PAN", etiquetas: ["DOS"] },
  { id: "u3", nombre: "CALZADO DEMO.", etiquetas: [] },
  { id: "sa", nombre: "SIN ASIGNAR" },
];

test("unidadDeTexto: el nombre de la tienda en cada fuente → su unidad del libro; lo ambiguo no se adivina", () => {
  assert.equal(unidadDeTexto("TIENDA UNO", unidades)?.id, "u1");
  assert.equal(unidadDeTexto("uno", unidades)?.id, "u1");
  assert.equal(unidadDeTexto("TIENDA DOS PAN", unidades)?.id, "u2");
  assert.equal(unidadDeTexto("CALZADO", unidades)?.id, "u3");
  assert.equal(unidadDeTexto("UNO/DOS", unidades), null);
  assert.equal(unidadDeTexto(null, unidades), null);
});

test("repartirIngreso: por tienda, suma exacta al depósito (la diferencia la absorbe la de más monto)", () => {
  const r = repartirIngreso(100, [{ monto: 30.33, tienda: "UNO" }, { monto: 30.33, unidadId: "u1" }, { monto: 38.34, tienda: "DOS" }, { monto: 0.5, tienda: "UNO/DOS" }], unidades, "sa");
  assert.equal(Math.round(r.reduce((a, x) => a + x.monto, 0) * 100), 10000);
  assert.equal(r.find((x) => x.unidadId === "u1")?.monto, 61.16, "60.66 + los 0.50 que faltan para el depósito");
  assert.equal(r.find((x) => x.unidadId === "sa")?.monto, 0.5);
  assert.deepEqual(repartirIngreso(-5, [{ monto: -5, tienda: "UNO" }], unidades, "sa"), [], "un débito no es un ingreso");
});

test("movimientosIngreso: un traspaso de «sin forma de pago» al banco que no toca el EERR ni la caja total", () => {
  const filas = movimientosIngreso(
    { huella: "abc#1", fecha: "2026-09-14", cuentaId: "c1", cuenta: "BANCO DEMO", descripcion: "TRANSFERENCIA DE MARTA PRUEBA" },
    [{ unidadId: "u1", monto: 60.16 }, { unidadId: "u2", monto: 39.84 }],
    { tipoIngresosId: "t-ing", usuarioId: "yo", hoy: "2026-10-20", ahora: "2026-10-20T10:00:00Z", origen: "conciliacion" },
  );
  assert.equal(filas.length, 4);
  assert.ok(filas.every((f) => f.en_eerr === false && f.en_flujo === true && f.tipo_id === "t-ing" && f.periodo === "2026-09-01" && f.fecha_pago === "2026-09-14"));
  assert.equal(Math.round(filas.reduce((a, f) => a + f.monto, 0) * 100), 0, "+X en el banco y −X sin cuenta");
  assert.equal(filas.filter((f) => f.cuenta_id === "c1").reduce((a, f) => a + f.monto, 0), 100);
  assert.ok(filas.filter((f) => f.cuenta_id === null).every((f) => f.monto < 0));
  assert.deepEqual(filas.map((f) => f.origen_clave), [claveIngreso("abc#1", "u1", false), claveIngreso("abc#1", "u1", true), claveIngreso("abc#1", "u2", false), claveIngreso("abc#1", "u2", true)]);
  assert.equal(new Set(filas.map((f) => f.origen_clave)).size, 4, "claves estables: registrar dos veces no duplica");
});

test("puedeRegistrarIngreso: solo créditos conciliados con cobros de tiendas, una vez", () => {
  const l = { monto: 50, estado: "conciliada", ingresoEn: null };
  assert.ok(puedeRegistrarIngreso(l, ["orden", "orden"]));
  assert.ok(puedeRegistrarIngreso(l, ["cobro"]));
  assert.ok(puedeRegistrarIngreso(l, ["delivery"]));
  assert.ok(!puedeRegistrarIngreso(l, ["movimiento"]), "lo del libro ya tiene cuenta");
  assert.ok(!puedeRegistrarIngreso(l, ["orden", "movimiento"]));
  assert.ok(!puedeRegistrarIngreso({ ...l, estado: "sugerida" }, ["orden"]));
  assert.ok(!puedeRegistrarIngreso({ ...l, monto: -50 }, ["delivery"]));
  assert.ok(!puedeRegistrarIngreso({ ...l, ingresoEn: "2026-10-01" }, ["orden"]));
  assert.ok(!puedeRegistrarIngreso(l, []));
});
