import assert from "node:assert/strict";
import test from "node:test";
import {
  PATRON_QUINCENAL,
  aplicarEscenario,
  armarProyeccion,
  compararFotos,
  descripcionBase,
  detectarRecurrentes,
  diasDeRetiro,
  fechaDePago,
  fechaPagoCompra,
  filasTabla,
  fotoDe,
  fraccionPrimeraSemana,
  indiceSemana,
  indicadores,
  leerMontoAjuste,
  leerPorcentaje,
  leerSemana,
  lineaPromedio,
  lineaRitmo,
  lineasAjustes,
  lineasCartera,
  lineasCompras,
  lineasNomina,
  lineasRecurrentes,
  lineasRetiros,
  lunesDe,
  partidasLibro,
  patronPagos,
  pendienteCompra,
  promedioSemanal,
  realPorSemana,
  rubroLibro,
  semanasProyeccion,
  supuestosVentas,
  ultimoMesCompleto,
  validarFoto,
  ventanaPromedio,
  OPCIONES_IMPUESTOS,
  OPCIONES_RECURRENTES,
  type CompraAbierta,
  type Linea,
  type MovimientoLibro,
  type VentaSemana,
} from "./proyeccion-caja";

// Jueves 1 de octubre de 2026.
const HOY = "2026-10-01";
const SEMANAS = semanasProyeccion(HOY);

test("fechas: lunes, semanas de la proyección y ventanas", () => {
  assert.equal(lunesDe("2026-10-01"), "2026-09-28");
  assert.equal(lunesDe("2026-10-04"), "2026-09-28");
  assert.equal(lunesDe("2026-10-05"), "2026-10-05");
  assert.equal(SEMANAS.length, 13);
  assert.equal(SEMANAS[0], "2026-09-28");
  assert.equal(SEMANAS[12], "2026-12-21");
  // Jueves: quedan jueves, viernes, sábado y domingo.
  assert.equal(fraccionPrimeraSemana(HOY), 4 / 7);
  assert.equal(fraccionPrimeraSemana("2026-09-28"), 1);
  assert.equal(indiceSemana(SEMANAS, "2026-09-15", HOY), 0, "lo vencido cae en la semana 1");
  assert.equal(indiceSemana(SEMANAS, null, HOY), 0);
  assert.equal(indiceSemana(SEMANAS, "2026-10-05", HOY), 1);
  assert.equal(indiceSemana(SEMANAS, "2026-12-27", HOY), 12);
  assert.equal(indiceSemana(SEMANAS, "2026-12-28", HOY), null);
  // Ventana: 8 semanas completas antes de la semana de hoy…
  const v = ventanaPromedio(HOY, null);
  assert.deepEqual([v[0], v[7], v.length], ["2026-08-03", "2026-09-21", 8]);
  // …o que terminan donde la fuente está completa (31 ago es lunes: su semana no cuenta).
  assert.equal(ventanaPromedio(HOY, "2026-08-31").at(-1), "2026-08-24");
  assert.equal(ventanaPromedio(HOY, "2026-08-30").at(-1), "2026-08-24", "un domingo cierra su semana");
});

test("promedio semanal: divide entre las semanas desde la primera con datos", () => {
  const ventana = ["2026-09-07", "2026-09-14", "2026-09-21"];
  assert.equal(promedioSemanal([{ fecha: "2026-09-08", monto: 30 }, { fecha: "2026-09-25", monto: 60 }], ventana), 30);
  assert.equal(promedioSemanal([{ fecha: "2026-09-15", monto: 40 }], ventana), 20, "empezó en la segunda semana");
  assert.equal(promedioSemanal([{ fecha: "2026-10-01", monto: 40 }], ventana), 0, "fuera de la ventana");
  const l = lineaPromedio("marketing", "x", 700, HOY);
  assert.equal(l.valores[0], 400);
  assert.equal(l.valores[1], 700);
});

test("ventas: envíos × tasa de entrega × ticket, menos comisiones; tienda sin envíos recientes no cuenta", () => {
  const ventana = ["2026-09-07", "2026-09-14", "2026-09-21"];
  const filas: VentaSemana[] = [
    { unidad_id: "A", semana: "2026-09-07", metodo: "efectivo", enviadas: 10, entregadas: 8, devueltas: 2, valor_entregadas: 400 },
    { unidad_id: "A", semana: "2026-09-14", metodo: "yappy", enviadas: 10, entregadas: 8, devueltas: 2, valor_entregadas: 400 },
    // En tránsito: cuenta como enviada pero no para la tasa.
    { unidad_id: "A", semana: "2026-09-21", metodo: null, enviadas: 10, entregadas: 0, devueltas: 0, valor_entregadas: 0 },
    { unidad_id: "B", semana: "2026-09-07", metodo: "efectivo", enviadas: 5, entregadas: 5, devueltas: 0, valor_entregadas: 100 },
  ];
  assert.equal(supuestosVentas(filas, ventana, {}, new Set(["B"])).length, 0, "A no es propia (sin ingresos en el libro)");
  const s = supuestosVentas(filas, ventana, { yappy: 0.02 });
  assert.equal(s.length, 1, "B no tiene envíos en las dos últimas semanas");
  const a = s[0];
  assert.equal(a.enviadasPorSemana, 10);
  assert.equal(a.tasaEntrega, 0.8);
  assert.equal(a.ticket, 50);
  assert.equal(a.comision, 0.01);
  // 10 × 0,8 × 50 × 0,99
  assert.equal(a.cobroPorSemana, 396);
  // Una tienda que empezó en la ventana se divide entre sus semanas.
  const nueva = supuestosVentas([{ unidad_id: "C", semana: "2026-09-21", metodo: "efectivo", enviadas: 4, entregadas: 4, devueltas: 0, valor_entregadas: 40 }], ventana);
  assert.equal(nueva[0].cobroPorSemana, 40);
});

test("cartera: lo vencido en la semana 1 por su probabilidad; lo demás en su semana", () => {
  const l = lineasCartera(
    [
      { clase: "cobrar", saldo: 100, vencimiento: "2026-09-01" },
      { clase: "cobrar", saldo: 50, vencimiento: null },
      { clase: "cobrar", saldo: 70, vencimiento: "2026-10-20" },
      { clase: "cobrar", saldo: 70, vencimiento: "2027-03-01" },
      { clase: "pagar", saldo: 200, vencimiento: "2026-09-01" },
      { clase: "pagar", saldo: 0, vencimiento: "2026-10-02" },
    ],
    HOY,
    SEMANAS,
    { cobroVencido: 0.5, pagoVencido: 1 },
  );
  const de = (c: string, d: string) => l.find((x) => x.concepto === c && x.detalle === d)!;
  assert.equal(de("cxc", "Vencido").valores[0], 75);
  assert.equal(de("cxc", "Por vencer").valores[3], 70);
  assert.equal(de("cxc", "Por vencer").valores.reduce((a, b) => a + b), 70, "lo que vence después de las 13 semanas no entra");
  assert.equal(de("cxp", "Vencido").valores[0], 200);
  assert.equal(l.filter((x) => x.concepto === "cxp").length, 1);
});

test("retiros de Dropi: llegan a los días promedio; lo atrasado, en la semana 1", () => {
  assert.equal(diasDeRetiro([]), 3);
  assert.equal(diasDeRetiro([{ fecha: "2026-09-01", recibido: "2026-09-03" }, { fecha: "2026-09-10", recibido: "2026-09-14" }, { fecha: "2026-09-10", recibido: "2026-08-01" }]), 3);
  const l = lineasRetiros([{ etiqueta: "#0007", monto: 500, fecha: "2026-10-03" }, { etiqueta: "#0005", monto: 100, fecha: "2026-09-01" }], 3, HOY, SEMANAS);
  assert.equal(l.find((x) => x.detalle === "#0007")!.valores[1], 500);
  assert.equal(l.find((x) => x.detalle === "#0005")!.valores[0], 100);
});

test("compras: pendiente y fecha del pago que falta", () => {
  const c = (x: Partial<CompraAbierta>): CompraAbierta => ({
    etiqueta: "OC-1", monto_total: 1000, primer_pago: null, segundo_pago: null, pagado_a_proveedor: null,
    fecha_pago_1: null, fecha_pago_2: null, fecha_envio: null, fecha_limite: null, fecha_llegada: null, ...x,
  });
  assert.equal(pendienteCompra(c({ primer_pago: 300 })), 700);
  assert.equal(pendienteCompra(c({ primer_pago: 300, pagado_a_proveedor: 1000 })), 0);
  assert.equal(fechaPagoCompra(c({ primer_pago: 300, fecha_pago_1: "2026-09-01", fecha_pago_2: "2026-10-15" }), HOY), "2026-10-15");
  assert.equal(fechaPagoCompra(c({ fecha_pago_1: "2026-10-10", fecha_pago_2: "2026-11-15" }), HOY), "2026-10-10", "sin pagos, el primero");
  assert.equal(fechaPagoCompra(c({ fecha_envio: "2026-09-01", fecha_llegada: "2026-11-01" }), HOY), "2026-11-01");
  assert.equal(fechaPagoCompra(c({ fecha_envio: "2026-09-01" }), HOY), HOY, "todas pasaron: ya");
  assert.equal(fechaPagoCompra(c({}), HOY), null);
  const l = lineasCompras([c({ etiqueta: "OC-1", primer_pago: 200, fecha_pago_2: "2026-10-06" }), c({ etiqueta: "OC-2" })], HOY, SEMANAS);
  assert.equal(l.find((x) => x.detalle === "OC-1")!.valores[1], 800);
  assert.deepEqual(l.find((x) => x.detalle === "OC-2")!.valores.slice(0, 5), [250, 250, 250, 250, 0], "sin fecha: cuatro semanas");
  // La reposición completa hasta el ritmo, sin contar dos veces lo ya comprado.
  const r = lineaRitmo("mercancia", "Ritmo", 700, l, HOY)!;
  assert.equal(r.valores[0], 150);
  assert.equal(r.valores[1], 0);
  assert.equal(r.valores[4], 700);
  assert.equal(lineaRitmo("mercancia", "Ritmo", 0, l, HOY), null);
});

test("nómina: patrón de pagos desde las fechas reales y quincena por defecto", () => {
  assert.deepEqual(patronPagos([{ periodo: "2026-09-01", fecha: null, monto: 100 }]), PATRON_QUINCENAL);
  const p = patronPagos([
    { periodo: "2026-08-01", fecha: "2026-08-15", monto: 300 },
    { periodo: "2026-08-01", fecha: "2026-08-14", monto: 100 },
    { periodo: "2026-08-01", fecha: "2026-08-29", monto: 600 },
    { periodo: "2026-09-01", fecha: "2026-09-15", monto: 400 },
    { periodo: "2026-09-01", fecha: "2026-09-30", monto: 580 },
    { periodo: "2026-09-01", fecha: "2026-09-02", monto: 20 },
  ]);
  assert.deepEqual(p.map((x) => x.dia), [14, 30]);
  assert.equal(Math.round(p[0].fraccion * 100), 41);
  assert.equal(Math.round(p[1].fraccion * 100), 59);
  assert.equal(fechaDePago("2026-02-01", 30), "2026-02-28");
  assert.equal(fechaDePago("2026-10-01", 14), "2026-10-15");
  const l = lineasNomina(
    [
      { periodo: "2026-09-01", tipo: "formal", monto: 1000 },
      { periodo: "2026-10-01", tipo: "formal", monto: 1200 },
    ],
    { formal: PATRON_QUINCENAL },
    HOY,
    SEMANAS,
  );
  const v = l[0].valores;
  assert.equal(l[0].detalle, "Planilla formal");
  assert.equal(v[2], 600, "15 de octubre");
  assert.equal(v[4], 600, "31 de octubre");
  assert.equal(v[6], 600, "15 de noviembre: la última cargada");
  assert.equal(v.reduce((a, b) => a + b), 1200 * 2 + 600, "oct, nov y la quincena de dic (el 31 queda fuera)");
});

const mov = (fecha: string, tipo: string, seccion: string, monto: number, descripcion = "", signo = -1, bloque = "operativo"): MovimientoLibro => ({
  fecha, tipo, seccion, signo, bloque, descripcion, monto,
});

test("gastos recurrentes: mismo tipo y descripción, al menos 3 de 4 meses con monto parecido", () => {
  assert.equal(descripcionBase("Pago alquiler oficina SEPTIEMBRE 2026 #45"), "PAGO ALQUILER OFICINA");
  const meses = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01"];
  const movs = [
    ...["05", "06", "07", "08"].map((m) => mov(`2026-${m}-05`, "Oficina - ARRIENDO", "administracion", 1000, `Alquiler oficina ${m}`)),
    ...["06", "07", "08"].map((m, i) => mov(`2026-${m}-20`, "SISTEMAS", "administracion", 100 + i * 10, "Suscripción correo")),
    // Monto que varía demasiado: no es fijo.
    ...["05", "06", "07"].map((m, i) => mov(`2026-${m}-10`, "GASTOS VARIOS OFICINA", "administracion", 100 * (i + 1) ** 2, "Varios")),
    // Solo dos meses.
    ...["07", "08"].map((m) => mov(`2026-${m}-11`, "SISTEMAS", "administracion", 50, "Dominio")),
  ];
  const r = detectarRecurrentes(movs, { meses, ...OPCIONES_RECURRENTES });
  assert.deepEqual(r.map((g) => [g.tipo, g.descripcion, g.monto, g.dia, g.meses]), [
    ["Oficina - ARRIENDO", "ALQUILER OFICINA", 1000, 5, 4],
    ["SISTEMAS", "SUSCRIPCION CORREO", 110, 20, 3],
  ]);
  const l = lineasRecurrentes(r, "recurrentes", HOY, SEMANAS, (g) => g.tipo);
  const arriendo = l.find((x) => x.detalle === "Oficina - ARRIENDO")!;
  assert.equal(arriendo.valores[1], 1000, "5 de octubre");
  assert.equal(arriendo.valores.reduce((a, b) => a + b), 3000, "oct, nov y dic");
  // Impuestos: por tipo, monto promedio de los últimos meses.
  const imp = detectarRecurrentes([mov("2026-07-15", "Impuesto a las Ganancias", "impuesto_ganancias", 300), mov("2026-08-14", "Impuesto a las Ganancias", "impuesto_ganancias", 500)], { meses: meses.slice(-3), ...OPCIONES_IMPUESTOS });
  assert.equal(imp[0].monto, 400);
});

test("rubros del libro y partidas proyectadas desde el libro", () => {
  assert.equal(rubroLibro({ tipo: "SUELDOS", seccion: "administracion", signo: -1, bloque: "operativo" }), "nomina");
  assert.equal(rubroLibro({ tipo: "Importación - Compra de mercancia", seccion: "costo_ventas", signo: -1, bloque: "operativo" }), "mercancia");
  assert.equal(rubroLibro({ tipo: "Importación - Impuestos", seccion: "costo_ventas", signo: -1, bloque: "operativo" }), "mercancia");
  assert.equal(rubroLibro({ tipo: "Impuestos sobre ventas", seccion: "costo_ventas", signo: -1, bloque: "operativo" }), "impuestos");
  assert.equal(rubroLibro({ tipo: "Shipping por Ventas", seccion: "costo_ventas", signo: -1, bloque: "operativo" }), "envio");
  assert.equal(rubroLibro({ tipo: "Devoluciones", seccion: "ingresos", signo: -1, bloque: "operativo" }), "ingresos");
  assert.equal(rubroLibro({ tipo: "PAGO TDC", seccion: "pago_tdc", signo: -1, bloque: null }), "fuera");
  assert.equal(rubroLibro({ tipo: "Alta Bien de Uso", seccion: "administracion", signo: -1, bloque: "inversion" }), "inversion");
  assert.equal(rubroLibro({ tipo: "Retiro de dividendos", seccion: "otros", signo: -1, bloque: "financiamiento" }), "dividendos");

  const meses = ["2026-07-01", "2026-08-01"];
  const ventana = ["2026-08-10", "2026-08-17"];
  const movs = [
    mov("2026-08-11", "Publicidad Online - FACEBOOK", "marketing", 300),
    mov("2026-08-18", "Publicidad Online - FACEBOOK", "marketing", 100),
    mov("2026-08-19", "Publicidad Online - FACEBOOK", "marketing", -100, "reverso"),
    mov("2026-08-12", "GASTOS VARIOS OFICINA", "administracion", 80, "Café"),
    mov("2026-08-12", "Amortización de Financiamiento", "finanzas", 500, "Cuota", -1, "financiamiento"),
    mov("2026-08-13", "Compra Mercancia Local", "costo_ventas", 1000),
    mov("2026-08-13", "Retiro de dividendos", "otros", 2600, "", -1, "financiamiento"),
    mov("2026-08-14", "Shipping por Ventas", "costo_ventas", 60),
    { ...mov("2026-08-14", "Ingresos", "ingresos", 800, "", 1), unidad_id: "DROPI" },
    { ...mov("2026-08-20", "Devoluciones", "ingresos", 200, "", -1), unidad_id: "DROPI" },
    { ...mov("2026-08-14", "Ingresos", "ingresos", 5000, "", 1), unidad_id: "TIENDA" },
  ];
  const p = partidasLibro(movs, meses, ventana, ventana, new Set(["TIENDA"]));
  assert.deepEqual(p.marketing, [{ tipo: "Publicidad Online - FACEBOOK", porSemana: 150 }]);
  assert.equal(p.otrosPorSemana, 40, "sin la cuota del financiamiento");
  assert.equal(p.mercanciaPorSemana, 500);
  assert.equal(p.dividendosPorSemana, 1300);
  assert.equal(p.envioPorSemana, 30);
  assert.deepEqual(p.ingresosOtros, [{ unidad_id: "DROPI", porSemana: 300 }], "la tienda con ventas no cuenta; la devolución resta");
  assert.deepEqual(p.conIngresos.sort(), ["DROPI", "TIENDA"]);
});

test("último mes completo del libro", () => {
  const c = new Map([
    ["2026-06-01", 600],
    ["2026-07-01", 650],
    ["2026-08-01", 700],
    ["2026-09-01", 280],
    ["2026-10-01", 80],
  ]);
  assert.equal(ultimoMesCompleto(c, HOY), "2026-08-01", "septiembre todavía se está cargando");
  assert.equal(ultimoMesCompleto(c, HOY, ["2026-09-01"]), "2026-09-01", "un mes cerrado cuenta");
  c.set("2026-09-01", 500);
  assert.equal(ultimoMesCompleto(c, HOY), "2026-09-01");
});

test("ajustes y lectura de formularios", () => {
  assert.equal(leerMontoAjuste("-1.500,50"), -1500.5);
  assert.equal(leerMontoAjuste("2500.75"), 2500.75);
  assert.equal(leerMontoAjuste("$ 300"), 300);
  assert.equal(leerMontoAjuste("0"), null);
  assert.equal(leerMontoAjuste("abc"), null);
  assert.equal(leerSemana("2026-10-08"), "2026-10-05");
  assert.equal(leerSemana("2026-02-30"), null);
  assert.equal(leerPorcentaje("12,5"), 0.125);
  assert.equal(leerPorcentaje("101"), null);
  const l = lineasAjustes(
    [
      { id: "1", semana: "2026-10-05", concepto: "Préstamo", monto: 5000, nota: null },
      { id: "2", semana: "2026-10-12", concepto: "Compra grande", monto: -3000, nota: null },
      { id: "3", semana: "2026-09-21", concepto: "Pasada", monto: -10, nota: null },
    ],
    SEMANAS,
  );
  assert.equal(l.find((x) => x.concepto === "ajustes_entrada")!.valores[1], 5000);
  assert.equal(l.find((x) => x.concepto === "ajustes_salida")!.valores[2], 3000);
  assert.equal(l.length, 2);
});

const LINEAS: Linea[] = [
  { concepto: "ventas", detalle: "Tienda A", valores: [100, 100, 100, ...Array(10).fill(100)] },
  { concepto: "cxc", detalle: "Vencido", valores: [50, ...Array(12).fill(0)] },
  { concepto: "repartidores", detalle: "Promedio", valores: Array(13).fill(20) },
  { concepto: "nomina", detalle: "Planilla formal", valores: [0, 0, 300, ...Array(10).fill(0)] },
];

test("escenarios: ventas y repartidores bajan; los cobros se corren una semana", () => {
  const c = aplicarEscenario(LINEAS, "conservador");
  assert.equal(c[0].valores[0], 0);
  assert.equal(c[0].valores[1], 85);
  assert.equal(c[1].valores[0], 0);
  assert.equal(c[1].valores[1], 50);
  assert.equal(c[2].valores[0], 17);
  assert.deepEqual(c[3].valores, LINEAS[3].valores);
  const e = aplicarEscenario(LINEAS, "estres");
  assert.equal(e[0].valores[5], 70);
  assert.deepEqual(aplicarEscenario(LINEAS, "base"), LINEAS);
});

test("armado: caja semana a semana, indicadores y filas de la tabla", () => {
  const p = armarProyeccion(LINEAS, SEMANAS, 1000);
  assert.deepEqual(p.totalEntradas.slice(0, 3), [150, 100, 100]);
  assert.deepEqual(p.totalSalidas.slice(0, 3), [20, 20, 320]);
  assert.deepEqual(p.cajaFinal.slice(0, 3), [1130, 1210, 990]);
  assert.equal(p.cajaInicioSemana[1], 1130);
  const k = indicadores(p, 1100);
  assert.equal(k.cajaHoy, 1000);
  assert.equal(k.cajaMinima, 990);
  assert.equal(k.semanaMinima, 2);
  assert.equal(k.semanaNegativa, null);
  assert.deepEqual(k.bajoMinimo, [2, 3]);
  assert.equal(k.cobertura, Math.round((1000 / ((20 * 13 + 300) / 13)) * 10) / 10);
  const neg = indicadores(armarProyeccion(LINEAS, SEMANAS, -200), 0);
  assert.equal(neg.semanaNegativa, 0);
  const filas = filasTabla(p);
  assert.deepEqual(filas.map((f) => f.clave).slice(0, 5), ["caja-inicial", "entradas", "entradas-ventas", "entradas-ventas-Tienda A", "entradas-cxc"]);
  assert.equal(filas.find((f) => f.clave === "caja-final")!.total, null);
  assert.equal(filas.find((f) => f.clave === "entradas-ventas-Tienda A")!.padre, "entradas-ventas");
});

test("precisión: la foto contra lo real en las semanas que ya terminaron", () => {
  const p = armarProyeccion(LINEAS, SEMANAS, 1000);
  const foto = fotoDe(p, SEMANAS[0]);
  assert.equal(foto.valores["2026-10-05"].ventas, 100);
  assert.deepEqual(validarFoto(JSON.parse(JSON.stringify(foto))), foto);
  assert.equal(validarFoto({ semana: 1 }), null);
  const real = realPorSemana([
    mov("2026-10-06", "Ingresos", "ingresos", 90, "", 1),
    mov("2026-10-07", "Devoluciones", "ingresos", 10, "", -1),
    mov("2026-10-08", "Shipping por Ventas", "costo_ventas", 25),
    mov("2026-10-13", "Ingresos", "ingresos", 120, "", 1),
    mov("2026-10-13", "PAGO TDC", "pago_tdc", 999),
  ]);
  assert.equal(real["2026-10-05"].ventas, 80);
  assert.equal(real["2026-10-05"].envio, 25);
  // Con Ventas por tienda: el cobro de ventas sale de ahí; el ingreso de otra unidad va a otras entradas.
  const conVentas = realPorSemana(
    [{ ...mov("2026-10-06", "Ingresos", "ingresos", 900, "", 1), unidad_id: "TIENDA" }, { ...mov("2026-10-06", "Ingresos", "ingresos", 70, "", 1), unidad_id: "DROPI" }],
    { tiendas: new Set(["TIENDA"]), ventas: { "2026-10-05": 95 } },
  );
  assert.deepEqual(conVentas["2026-10-05"], { ventas: 95, otras_entradas: 70 });
  // Hoy 19 de octubre: terminaron las semanas del 5 y del 12 (la del 28 de septiembre es la de la foto).
  const r = compararFotos([foto], real, "2026-10-19");
  assert.deepEqual(r.semanas, ["2026-10-05", "2026-10-12"]);
  const ventas = r.rubros.find((x) => x.rubro === "ventas")!;
  assert.equal(ventas.proyectado, 200);
  assert.equal(ventas.real, 200);
  assert.equal(ventas.error, 0);
  assert.equal(ventas.errorAbsoluto, 0.2, "|100−80| + |100−120| sobre 200");
  const envio = r.rubros.find((x) => x.rubro === "envio")!;
  assert.equal(envio.proyectado, 40);
  assert.equal(envio.real, 25);
  assert.equal(envio.error, 0.6);
  assert.equal(r.rubros.find((x) => x.rubro === "dividendos")!.error, null);
  assert.deepEqual(r.porSemana.map((s) => [s.semana, s.proyectado, s.real]), [["2026-10-05", 80, 55], ["2026-10-12", -220, 120]]);
});
