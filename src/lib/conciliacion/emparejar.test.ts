import assert from "node:assert/strict";
import test from "node:test";
import {
  buscarSuma,
  clasificarLinea,
  diasEntre,
  emparejar,
  estadoDeLinea,
  faltaCubrir,
  parecido,
  repartirComision,
  transaccionesDe,
  type CobroEmp,
  type LineaEmp,
  type MovEmp,
  type OrdenEmp,
} from "./emparejar";

// Datos inventados: ningún nombre, cuenta ni monto sale de los Excel reales.
const linea = (id: string, fecha: string, monto: number, descripcion: string, referencia: string | null = null): LineaEmp => ({
  id,
  fecha,
  monto,
  descripcion,
  referencia,
  clase: clasificarLinea(descripcion, monto),
});
const yappy = (id: string, fecha: string, bruto: number): CobroEmp => ({
  id,
  fuente: "yappy",
  fecha,
  fechaDeposito: null,
  lote: null,
  referenciaBanco: null,
  bruto,
  anulada: false,
});
const sinNada = { movimientos: [] as MovEmp[], cobros: [] as CobroEmp[], ordenes: [] as OrdenEmp[] };

test("clasifica las líneas por su descripción y su signo", () => {
  assert.equal(clasificarLinea("DEPOSITO YAPPY - tiendademo (3 TRANSACCIONES)", 90), "yappy");
  assert.equal(clasificarLinea("COMISION TRANSACCIONES YAPPY tiendademo", -1.2), "comision_yappy");
  assert.equal(clasificarLinea("ACH CRE RED VERDE PANAMA SA", 40), "servientrega");
  assert.equal(clasificarLinea("DEPOSITO EN EFECTIVO", 40), "deposito_efectivo");
  assert.equal(clasificarLinea("DEP_ATM /SR", 40), "deposito_efectivo");
  assert.equal(clasificarLinea("TEF DE:PERSONA INVENTADA", 40), "transferencia_recibida");
  assert.equal(clasificarLinea("IVA por COM ACH BEL CTE COMERCIAL", -0.01), "comision_bancaria");
  assert.equal(clasificarLinea("BANCA EN LINEA TRANSFERENCIA A 0400000000001 PROVEEDOR", -100), "pago");
  assert.equal(transaccionesDe("DEPOSITO YAPPY - tiendademo (44 TRANSACCIONES)"), 44);
  assert.equal(transaccionesDe("DEPOSITO EN EFECTIVO"), null);
  assert.equal(diasEntre("2026-08-30", "2026-09-02"), 3);
});

test("exacto: una línea del banco con el movimiento del libro de igual monto, signo y fecha cercana (solo sugerencia)", () => {
  const lineas = [linea("l1", "2026-09-03", -82.5, "BANCA EN LINEA TRANSFERENCIA A 0400000000001 PERSONA INVENTADA")];
  const movimientos: MovEmp[] = [
    { id: "m-lejos", fecha: "2026-09-20", efecto: -82.5, descripcion: "OTRA COSA" },
    { id: "m-signo", fecha: "2026-09-03", efecto: 82.5, descripcion: "PERSONA INVENTADA" },
    { id: "m1", fecha: "2026-09-04", efecto: -82.5, descripcion: "TRANSPORTE SEMANA - PERSONA INVENTADA - BANCA EN LINEA TRANSFERENCIA A 0400000" },
  ];
  const r = emparejar(lineas, { ...sinNada, movimientos });
  assert.equal(r.elegidas.length, 1);
  const p = r.elegidas[0];
  assert.deepEqual(p.partes.map((x) => x.id), ["m1"]);
  assert.equal(p.metodo, "exacto");
  assert.equal(p.auto, false, "un movimiento del libro nunca se concilia solo");
  assert.ok(p.puntaje >= 90, `puntaje ${p.puntaje}`);
});

test("un movimiento del libro se propone a una sola línea: gana la de mayor puntaje", () => {
  const lineas = [linea("a", "2026-09-01", -50, "PAGO A COMERCIO DEMO"), linea("b", "2026-09-03", -50, "PAGO A OTRO LADO")];
  const movimientos: MovEmp[] = [{ id: "m", fecha: "2026-09-01", efecto: -50, descripcion: "COMERCIO DEMO factura 12" }];
  const r = emparejar(lineas, { ...sinNada, movimientos });
  assert.deepEqual(r.elegidas.map((p) => p.lineaId), ["a"]);
  assert.equal(r.alternativas.get("b")?.length, 1, "b lo ve como alternativa");
});

test("por suma: un pago del banco que el libro reparte entre dos tiendas", () => {
  const lineas = [linea("l", "2026-09-03", -257.5, "BANCA EN LINEA TRANSFERENCIA A 0400000000002 REPARTIDOR DEMO")];
  const movimientos: MovEmp[] = [
    { id: "kenku", fecha: "2026-09-03", efecto: -82.5, descripcion: "TRANSPORTE REPARTIDOR DEMO" },
    { id: "oferfy", fecha: "2026-09-03", efecto: -175, descripcion: "TRANSPORTE REPARTIDOR DEMO" },
    { id: "otro", fecha: "2026-09-03", efecto: -100, descripcion: "ARRIENDO" },
    { id: "otro2", fecha: "2026-09-02", efecto: -60, descripcion: "LUZ" },
  ];
  const r = emparejar(lineas, { ...sinNada, movimientos });
  assert.equal(r.elegidas[0]?.metodo, "suma");
  assert.deepEqual(r.elegidas[0].partes.map((x) => x.id).sort(), ["kenku", "oferfy"]);
  assert.equal(r.elegidas[0].auto, false);
});

test("buscarSuma encuentra la combinación más corta y respeta el tope", () => {
  const items = [10, 20, 30, 45.5, 4.5].map((v, i) => ({ id: `i${i}`, valor: v }));
  assert.deepEqual(buscarSuma(50, items)?.sort(), ["i3", "i4"]);
  const tres = buscarSuma(60, items, { maxItems: 3 }) ?? [];
  assert.equal(tres.length, 3);
  assert.equal(tres.reduce((a, id) => a + items.find((x) => x.id === id)!.valor, 0), 60);
  assert.equal(buscarSuma(999, items), null);
  assert.equal(buscarSuma(60, items, { maxItems: 2 }), null);
});

test("corte de Yappy: el depósito es la suma del día anterior y, si el número de cobros calza, se concilia solo", () => {
  const cobros = [yappy("y1", "2026-09-01", 29.99), yappy("y2", "2026-09-01", 54.98), yappy("y3", "2026-09-01", 5.03), yappy("y4", "2026-09-02", 10)];
  const lineas = [
    linea("dep", "2026-09-02", 90, "DEPOSITO YAPPY - tiendademo (3 TRANSACCIONES)"),
    linea("com", "2026-09-02", -0.96, "COMISION TRANSACCIONES YAPPY tiendademo"),
  ];
  const r = emparejar(lineas, { ...sinNada, cobros });
  const dep = r.elegidas.find((p) => p.lineaId === "dep");
  assert.ok(dep);
  assert.equal(dep.metodo, "corte");
  assert.equal(dep.auto, true);
  assert.deepEqual(dep.partes.map((x) => x.id).sort(), ["y1", "y2", "y3"]);
  assert.ok(!r.elegidas.some((p) => p.lineaId === "com"), "la comisión se busca en el libro, no en Yappy");
});

test("corte de Yappy acumulado (fin de semana) y sin número de cobros: se sugiere, no se concilia solo", () => {
  const cobros = [yappy("s", "2026-09-05", 40), yappy("d", "2026-09-06", 60)];
  const r = emparejar([linea("lun", "2026-09-07", 100, "DEPOSITO YAPPY - tiendademo")], { ...sinNada, cobros });
  assert.equal(r.elegidas[0]?.metodo, "corte");
  assert.equal(r.elegidas[0].auto, false);
  assert.equal(r.elegidas[0].partes.length, 2);
});

test("Servientrega: la consignación con la referencia del depósito se concilia sola; sin referencia, se sugiere", () => {
  const guia = (id: string, lote: string, ref: string | null, fecha: string, bruto: number): CobroEmp => ({
    id,
    fuente: "servientrega",
    fecha,
    fechaDeposito: fecha,
    lote,
    referenciaBanco: ref,
    bruto,
    anulada: false,
  });
  const cobros = [
    guia("g1", "BAC1234CPLDEMO_01092026", "1234", "2026-09-01", 29.99),
    guia("g2", "BAC1234CPLDEMO_01092026", "1234", "2026-09-01", 15),
    guia("g3", "MPOSDEMO_29092026", null, "2026-09-29", 63.98),
  ];
  const lineas = [linea("efectivo", "2026-09-02", 44.99, "DEPOSITO EN EFECTIVO", "990001234"), linea("ach", "2026-10-05", 63.98, "ACH CRE RED VERDE PANAMA SA", "15800")];
  const r = emparejar(lineas, { ...sinNada, cobros });
  const efectivo = r.elegidas.find((p) => p.lineaId === "efectivo");
  const ach = r.elegidas.find((p) => p.lineaId === "ach");
  assert.equal(efectivo?.metodo, "referencia");
  assert.equal(efectivo?.auto, true);
  assert.equal(efectivo?.partes.length, 2);
  assert.equal(ach?.auto, false, "sin referencia en el código solo se sugiere");
  assert.equal(ach?.partes[0].id, "g3");
});

test("MiPOS llega neto: se acepta la comisión hasta el tope y la suma de las partes es lo depositado", () => {
  const tarjeta = (id: string, bruto: number): CobroEmp => ({ id, fuente: "mipos", fecha: "2026-09-09", fechaDeposito: null, lote: null, referenciaBanco: null, bruto, anulada: false });
  const cobros = [tarjeta("t1", 60), tarjeta("t2", 40), { ...tarjeta("anulada", 500), anulada: true }];
  const r = emparejar([linea("pos", "2026-09-11", 97.5, "ACH CRE PROCESADORA DE TARJETAS DEMO")], { ...sinNada, cobros });
  const p = r.elegidas[0];
  assert.equal(p?.metodo, "comision");
  assert.equal(p.partes.reduce((a, x) => a + x.monto, 0).toFixed(2), "97.50");
  assert.equal(p.partes.reduce((a, x) => a + (x.comision ?? 0), 0).toFixed(2), "2.50");
  // Más del 4 % de comisión ya no es MiPOS.
  assert.equal(emparejar([linea("pos", "2026-09-11", 90, "ACH CRE PROCESADORA DE TARJETAS DEMO")], { ...sinNada, cobros }).elegidas.length, 0);
});

test("repartirComision: los netos suman lo depositado aunque haya redondeo", () => {
  const partes = repartirComision([{ id: "a", bruto: 33.33 }, { id: "b", bruto: 33.33 }, { id: "c", bruto: 33.34 }], 1);
  assert.equal(partes.reduce((a, x) => a + Math.round(x.comision! * 100), 0), 100);
  assert.equal(Math.round(partes.reduce((a, x) => a + x.monto, 0) * 100), 9900);
});

test("órdenes: un depósito de un repartidor con su orden, o con la suma de varias suyas", () => {
  const orden = (id: string, monto: number, repartidor: string, metodo = "cierre"): OrdenEmp => ({
    id,
    fuente: "conc_ordenes",
    numero: id,
    fecha: "2026-09-10",
    monto,
    metodo,
    repartidor,
  });
  const ordenes = [orden("o1", 29.99, "ANA DEMO"), orden("o2", 45, "ANA DEMO"), orden("o3", 74.99, "LUIS PRUEBA"), orden("yap", 74.99, "ANA DEMO", "yappy")];
  const r = emparejar(
    [linea("t1", "2026-09-11", 74.99, "BANCA MOVIL TRANSFERENCIA DE LUIS PRUEBA"), linea("t2", "2026-09-11", 74.99, "ACH CRE ANA DEMO")],
    { ...sinNada, ordenes },
  );
  assert.deepEqual(r.elegidas.find((p) => p.lineaId === "t1")?.partes.map((x) => x.id), ["o3"]);
  const t2 = r.elegidas.find((p) => p.lineaId === "t2");
  assert.equal(t2?.metodo, "suma", "la orden pagada por Yappy no es candidata al banco");
  assert.deepEqual(t2?.partes.map((x) => x.id).sort(), ["o1", "o2"]);
});

test("lo descartado por una persona no se vuelve a proponer", () => {
  const lineas = [linea("l", "2026-09-03", -10, "PAGO DEMO")];
  const movimientos: MovEmp[] = [{ id: "m", fecha: "2026-09-03", efecto: -10, descripcion: "PAGO DEMO" }];
  const primera = emparejar(lineas, { ...sinNada, movimientos });
  const otra = emparejar(lineas, { ...sinNada, movimientos }, {}, new Set([primera.elegidas[0].grupo]));
  assert.equal(otra.elegidas.length, 0);
  assert.equal(emparejar(lineas, { ...sinNada, movimientos }).elegidas[0].grupo, primera.elegidas[0].grupo, "el grupo es estable");
});

test("estado de la línea según lo confirmado", () => {
  assert.equal(estadoDeLinea("sugerida", -82.5, [{ estado: "confirmado", monto: -82.5 }]), "conciliada");
  assert.equal(estadoDeLinea("pendiente", 100, [{ estado: "confirmado", monto: 60 }, { estado: "sugerido", monto: 40 }]), "sugerida");
  assert.equal(estadoDeLinea("pendiente", 100, [{ estado: "descartado", monto: 100 }]), "pendiente");
  assert.equal(estadoDeLinea("ignorada", 100, []), "ignorada");
  assert.equal(estadoDeLinea("sugerida", 100, [{ estado: "sugerido", monto: 100, principal: false }]), "pendiente", "con solo alternativas sigue pendiente");
  assert.equal(faltaCubrir(100, [{ monto: 60 }]), 40);
  assert.ok(parecido("TRANSFERENCIA A 0421017099565 PERSONA DEMO", "REEMBOLSO 23775 TRANSFERENCIA A 0421017") > 0);
});
