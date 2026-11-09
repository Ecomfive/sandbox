// Portal AF4 360° › Planificación: modelo por motores (mejora 12), plan financiero integrado (10), pronóstico continuo de
// 18 meses (11) y escenarios por decisión (13). Lógica pura: sirve en el servidor y en el cliente. Prueba en
// `planificacion.test.ts`. Las metas por tienda (16) viven en `metas-plan.ts`.
//
// Motores de cada tienda (salen de los últimos 3 meses reales y se pueden editar):
//   pedidos del mes k = pedidos × (1 + crecimiento)^k
//   ventas            = pedidos × ticket promedio
//   ingresos netos    = ventas × tasa de entrega
//   contribución      = ingresos − mercancía (% de ingresos) − envío por pedido × pedidos − comisión (% de ingresos)
//                       − pauta (% de ventas)
//   EBITDA tienda     = contribución − fijos del mes + otros del libro
// «Otros del libro» concilia las órdenes con el Estado de resultados: es el promedio de los últimos 3 meses de (EBITDA de
// la tienda en el EERR − EBITDA que explican sus órdenes). Sin él, el primer mes proyectado salta contra el último real
// (el EERR tiene ingresos, costos y gastos que no salen de las órdenes); con él, parte del nivel real.
// El consolidado suma las tiendas y resta los fijos del corporativo. Debajo del EBITDA: depreciación, gastos financieros
// (los habituales + el interés de la deuda de cobertura), impuesto (sobre la utilidad acumulada del año, nunca negativo).
//
// Balance y flujo cuadran por construcción a partir del balance de apertura (el último mes cerrado):
//   CxC = ingresos × días de cobro ÷ 30; inventario = mercancía × días de inventario ÷ 30;
//   CxP = (costo de ventas + marketing) × días de pago ÷ 30;
//   activo fijo = anterior + capex − depreciación; deuda = la programada de Tesorería + la de cobertura;
//   patrimonio = anterior + utilidad − dividendos;
//   flujo = utilidad + depreciación − ΔCxC − Δinventario + ΔCxP − capex + Δdeuda − dividendos = Δcaja.
// Si la caja cae bajo la caja mínima, se toma deuda de cobertura por la diferencia (y se devuelve cuando sobra): así se
// ve cuánta deuda pide cada escenario. La diferencia de apertura del balance (lo que no cuadraba al cierre) se arrastra
// igual, nunca se fuerza.

const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function sumarMesesPlan(periodo: string, n: number): string {
  const total = Number(periodo.slice(0, 4)) * 12 + Number(periodo.slice(5, 7)) - 1 + n;
  const anio = Math.floor(total / 12);
  return `${anio}-${String(total - anio * 12 + 1).padStart(2, "0")}-01`;
}

export const mesesDesde = (primero: string, n: number) => Array.from({ length: n }, (_, i) => sumarMesesPlan(primero, i));

// ---------------------------------------------------------------------------------------------------------------------
// Motores
// ---------------------------------------------------------------------------------------------------------------------

export interface Motores {
  /** Pedidos (no cancelados) del primer mes proyectado. */
  pedidos: number;
  /** Crecimiento mensual de los pedidos (%). */
  crecimiento: number;
  /** Ventas por pedido (USD). */
  ticket: number;
  /** Ingresos entregados ÷ ventas (%). */
  tasaEntrega: number;
  /** Mercancía ÷ ingresos (%). */
  costoMercancia: number;
  /** Envío y devoluciones por pedido (USD). */
  envioPedido: number;
  /** Comisión de cobro ÷ ingresos (%). */
  comision: number;
  /** Pauta ÷ ventas (%). */
  pauta: number;
  /** Gastos fijos de la tienda por mes (USD, con su parte de lo repartido). */
  fijos: number;
  /** Otros ingresos y gastos del libro que las órdenes no explican, por mes (USD; negativo = resta). */
  ajusteLibro: number;
}

export type ClaveMotor = keyof Motores;

export interface DefMotor {
  clave: ClaveMotor;
  etiqueta: string;
  unidad: "pedidos" | "%" | "USD";
  min: number;
  max: number;
}

export const CAMPOS_MOTORES: DefMotor[] = [
  { clave: "pedidos", etiqueta: "Pedidos por mes", unidad: "pedidos", min: 0, max: 10_000_000 },
  { clave: "crecimiento", etiqueta: "Crecimiento mensual", unidad: "%", min: -50, max: 100 },
  { clave: "ticket", etiqueta: "Ticket promedio", unidad: "USD", min: 0, max: 100_000 },
  { clave: "tasaEntrega", etiqueta: "Tasa de entrega", unidad: "%", min: 0, max: 100 },
  { clave: "costoMercancia", etiqueta: "Costo de mercancía", unidad: "%", min: 0, max: 200 },
  { clave: "envioPedido", etiqueta: "Envío por pedido", unidad: "USD", min: 0, max: 10_000 },
  { clave: "comision", etiqueta: "Comisión de cobro", unidad: "%", min: 0, max: 100 },
  { clave: "pauta", etiqueta: "Pauta sobre ventas", unidad: "%", min: 0, max: 200 },
  { clave: "fijos", etiqueta: "Gastos fijos por mes", unidad: "USD", min: 0, max: 100_000_000 },
  { clave: "ajusteLibro", etiqueta: "Otros del libro por mes", unidad: "USD", min: -100_000_000, max: 100_000_000 },
];

export const MOTORES_CERO: Motores = { pedidos: 0, crecimiento: 0, ticket: 0, tasaEntrega: 0, costoMercancia: 0, envioPedido: 0, comision: 0, pauta: 0, fijos: 0, ajusteLibro: 0 };

/** Un mes real de una tienda (de `fin_plan_historia` y del EERR). */
export interface HistoriaMes {
  periodo: string;
  unidadId: string;
  pedidos: number;
  /** Valor de los pedidos no cancelados. */
  ventas: number;
  /** Valor de los pedidos entregados. */
  entregado: number;
  mercancia: number;
  envio: number;
  devolucion: number;
  comision: number;
  marketing: number;
  /** Administración del EERR de la tienda (con su parte de A DISTRIBUIR). */
  fijos: number;
  /** EBITDA de la tienda en el Estado de resultados (null o ausente = sin dato: no se concilia ese mes). */
  ebitdaLibro?: number | null;
}

/** El EBITDA que explican las órdenes de un mes (lo mismo que dan los motores con ese mes). */
export const ebitdaDeOrdenes = (m: HistoriaMes) => m.entregado - m.mercancia - m.envio - m.devolucion - m.comision - m.marketing - m.fijos;

/** Promedio de (EBITDA del libro − EBITDA de las órdenes) de los meses que tienen el dato del libro. */
export function ajusteDelLibro(meses: HistoriaMes[]): number {
  const con = meses.filter((m) => typeof m.ebitdaLibro === "number" && Number.isFinite(m.ebitdaLibro));
  if (!con.length) return 0;
  return r2(con.reduce((a, m) => a + (m.ebitdaLibro as number) - ebitdaDeOrdenes(m), 0) / con.length);
}

export const MESES_MOTORES = 3;
/** El crecimiento que sale del pronóstico se acota (un mes raro no debe dar ±30 % por mes durante 18 meses). */
export const CRECIMIENTO_TOPE = 5;

const div = (a: number, b: number) => (b > 0 ? a / b : 0);

/** Los motores de una tienda desde sus últimos meses reales. `crecimiento` viene del pronóstico (acotado). */
export function motoresDesdeHistoria(meses: HistoriaMes[], crecimiento: number | null = null): Motores {
  const ult = [...meses].sort((a, b) => a.periodo.localeCompare(b.periodo)).slice(-MESES_MOTORES);
  if (!ult.length) return { ...MOTORES_CERO };
  const s = ult.reduce(
    (a, m) => ({
      pedidos: a.pedidos + m.pedidos,
      ventas: a.ventas + m.ventas,
      entregado: a.entregado + m.entregado,
      mercancia: a.mercancia + m.mercancia,
      envio: a.envio + m.envio + m.devolucion,
      comision: a.comision + m.comision,
      marketing: a.marketing + m.marketing,
      fijos: a.fijos + m.fijos,
    }),
    { pedidos: 0, ventas: 0, entregado: 0, mercancia: 0, envio: 0, comision: 0, marketing: 0, fijos: 0 },
  );
  const n = ult.length;
  const c = crecimiento === null || !Number.isFinite(crecimiento) ? 0 : Math.max(-CRECIMIENTO_TOPE, Math.min(CRECIMIENTO_TOPE, crecimiento));
  return {
    pedidos: Math.round(s.pedidos / n),
    crecimiento: r2(c),
    ticket: r2(div(s.ventas, s.pedidos)),
    tasaEntrega: r2(div(s.entregado, s.ventas) * 100),
    costoMercancia: r2(div(s.mercancia, s.entregado) * 100),
    envioPedido: r2(div(s.envio, s.pedidos)),
    comision: r2(div(s.comision, s.entregado) * 100),
    pauta: r2(div(s.marketing, s.ventas) * 100),
    fijos: r2(s.fijos / n),
    ajusteLibro: ajusteDelLibro(ult),
  };
}

/** Lo editado a mano (solo los campos válidos) encima de los motores de la historia. */
export function leerMotoresEditados(v: unknown): Partial<Motores> {
  if (!v || typeof v !== "object") return {};
  const salida: Partial<Motores> = {};
  for (const d of CAMPOS_MOTORES) {
    const x = num((v as Record<string, unknown>)[d.clave]);
    if (x !== null && x >= d.min && x <= d.max) salida[d.clave] = x;
  }
  return salida;
}

export const aplicarEditados = (base: Motores, editados: Partial<Motores>): Motores => ({ ...base, ...editados });

/** El formulario de motores: un campo vacío = vuelve al de la historia. */
export function validarMotores(leer: (campo: string) => unknown): { editados: Partial<Motores> } | { error: string } {
  const editados: Partial<Motores> = {};
  for (const d of CAMPOS_MOTORES) {
    const crudo = leer(d.clave);
    if (crudo === null || crudo === undefined || String(crudo).trim() === "") continue;
    const x = num(String(crudo).trim());
    if (x === null || x < d.min || x > d.max) return { error: `${d.etiqueta}: entre ${d.min} y ${d.max}.` };
    editados[d.clave] = d.clave === "pedidos" ? Math.round(x) : x;
  }
  return { editados };
}

/** El promedio ponderado por ventas de los motores de varias tiendas (la referencia de una tienda nueva). */
export function motoresPromedio(lista: Motores[]): Motores {
  const conVentas = lista.filter((m) => m.pedidos * m.ticket > 0);
  if (!conVentas.length) return { ...MOTORES_CERO };
  const peso = conVentas.map((m) => m.pedidos * m.ticket);
  const total = peso.reduce((a, b) => a + b, 0);
  const prom = (k: ClaveMotor) => r2(conVentas.reduce((a, m, i) => a + m[k] * peso[i], 0) / total);
  return {
    pedidos: Math.round(conVentas.reduce((a, m) => a + m.pedidos, 0) / conVentas.length),
    crecimiento: prom("crecimiento"),
    ticket: prom("ticket"),
    tasaEntrega: prom("tasaEntrega"),
    costoMercancia: prom("costoMercancia"),
    envioPedido: prom("envioPedido"),
    comision: prom("comision"),
    pauta: prom("pauta"),
    fijos: r2(conVentas.reduce((a, m) => a + m.fijos, 0) / conVentas.length),
    // Una tienda nueva no hereda lo que el libro tiene de las otras.
    ajusteLibro: 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Supuestos y apertura
// ---------------------------------------------------------------------------------------------------------------------

export interface SupuestosPlan {
  diasCxc: number;
  diasInventario: number;
  diasCxp: number;
  /** Impuesto sobre la renta (%), sobre la utilidad acumulada del año. */
  tasaImpuesto: number;
  depreciacionMes: number;
  capexMes: number;
  dividendosMes: number;
  /** Gastos financieros habituales por mes (comisiones bancarias, intereses de la deuda actual). */
  financierosMes: number;
  /** Gastos del corporativo por mes (no se reparten a las tiendas). */
  fijosCorporativo: number;
  cajaMinima: number;
  /** Tasa anual (%) de la deuda de cobertura. */
  tasaCobertura: number;
}

export const CLAVE_PLANIFICACION = "planificacion";

export const CAMPOS_SUPUESTOS: { clave: keyof SupuestosPlan; etiqueta: string; unidad: "días" | "%" | "USD"; min: number; max: number }[] = [
  { clave: "diasCxc", etiqueta: "Días de cobro", unidad: "días", min: 0, max: 365 },
  { clave: "diasInventario", etiqueta: "Días de inventario", unidad: "días", min: 0, max: 730 },
  { clave: "diasCxp", etiqueta: "Días de pago", unidad: "días", min: 0, max: 365 },
  { clave: "tasaImpuesto", etiqueta: "Impuesto sobre la renta", unidad: "%", min: 0, max: 60 },
  { clave: "depreciacionMes", etiqueta: "Depreciación por mes", unidad: "USD", min: 0, max: 100_000_000 },
  { clave: "capexMes", etiqueta: "Inversión en activo fijo por mes", unidad: "USD", min: 0, max: 100_000_000 },
  { clave: "dividendosMes", etiqueta: "Retiros de socios por mes", unidad: "USD", min: 0, max: 100_000_000 },
  { clave: "financierosMes", etiqueta: "Gastos financieros por mes", unidad: "USD", min: 0, max: 100_000_000 },
  { clave: "fijosCorporativo", etiqueta: "Gastos del corporativo por mes", unidad: "USD", min: 0, max: 100_000_000 },
  { clave: "cajaMinima", etiqueta: "Caja mínima", unidad: "USD", min: 0, max: 1_000_000_000 },
  { clave: "tasaCobertura", etiqueta: "Tasa de la deuda de cobertura", unidad: "%", min: 0, max: 100 },
];

export const SUPUESTOS_CERO: SupuestosPlan = {
  diasCxc: 0,
  diasInventario: 0,
  diasCxp: 0,
  tasaImpuesto: 25,
  depreciacionMes: 0,
  capexMes: 0,
  dividendosMes: 0,
  financierosMes: 0,
  fijosCorporativo: 0,
  cajaMinima: 0,
  tasaCobertura: 18,
};

/** Días de rotación desde un saldo y el flujo mensual que lo genera (saldo ÷ flujo × 30), acotados. */
export function diasDeRotacion(saldo: number | null, flujoMensual: number, tope = 365): number {
  if (saldo === null || saldo <= 0 || flujoMensual <= 0) return 0;
  return Math.min(tope, r2((saldo / flujoMensual) * 30));
}

export function leerSupuestos(v: unknown, base: SupuestosPlan): SupuestosPlan {
  const salida = { ...base };
  if (!v || typeof v !== "object") return salida;
  for (const d of CAMPOS_SUPUESTOS) {
    const x = num((v as Record<string, unknown>)[d.clave]);
    if (x !== null && x >= d.min && x <= d.max) salida[d.clave] = x;
  }
  return salida;
}

/** El formulario de supuestos: solo lo escrito; un campo vacío vuelve al que sale de los datos. */
export function validarSupuestos(leer: (campo: string) => unknown): { editados: Partial<SupuestosPlan> } | { error: string } {
  const editados: Partial<SupuestosPlan> = {};
  for (const d of CAMPOS_SUPUESTOS) {
    const crudo = leer(d.clave);
    if (crudo === null || crudo === undefined || String(crudo).trim() === "") continue;
    const x = num(String(crudo).trim());
    if (x === null || x < d.min || x > d.max) return { error: `${d.etiqueta}: entre ${d.min} y ${d.max}.` };
    editados[d.clave] = x;
  }
  return { editados };
}

/** El balance al cierre del último mes cerrado, en dólares. */
export interface Apertura {
  corte: string;
  caja: number;
  cxc: number;
  inventario: number;
  activoFijo: number;
  otrosActivos: number;
  cxp: number;
  deuda: number;
  otrosPasivos: number;
  patrimonio: number;
}

export const diferenciaApertura = (a: Apertura) => r2(a.caja + a.cxc + a.inventario + a.activoFijo + a.otrosActivos - a.cxp - a.deuda - a.otrosPasivos - a.patrimonio);

// ---------------------------------------------------------------------------------------------------------------------
// Escenarios
// ---------------------------------------------------------------------------------------------------------------------

/** pct: multiplica por (1 + v/100); pp: suma v (puntos o unidades); valor: reemplaza. */
export type ModoCambio = "pct" | "pp" | "valor";

export interface CambioMotor {
  /** null = todas las tiendas. */
  unidadId: string | null;
  motor: ClaveMotor;
  modo: ModoCambio;
  valor: number;
  desde: string;
}

export interface TiendaNueva {
  clave: string;
  nombre: string;
  motores: Motores;
  desde: string;
  /** Inversión inicial (activo fijo) en el mes de apertura. */
  inversion: number;
}

export interface Escenario {
  cambios: CambioMotor[];
  nuevas: TiendaNueva[];
}

export const ESCENARIO_BASE: Escenario = { cambios: [], nuevas: [] };

export type TipoEscenario = "pauta" | "precio" | "entrega" | "tienda" | "pais";

export const TIPOS_ESCENARIO: { clave: TipoEscenario; etiqueta: string }[] = [
  { clave: "pauta", etiqueta: "Subir o bajar pauta" },
  { clave: "precio", etiqueta: "Cambiar precio" },
  { clave: "entrega", etiqueta: "Mejorar entrega" },
  { clave: "tienda", etiqueta: "Lanzar tienda" },
  { clave: "pais", etiqueta: "Abrir país" },
];

export const esTipoEscenario = (v: unknown): v is TipoEscenario => TIPOS_ESCENARIO.some((t) => t.clave === v);

/** Los parámetros de un escenario guardado (todas las cifras opcionales salvo las de su tipo). */
export interface ParametrosEscenario {
  /** null = todas las tiendas (pauta, precio, entrega). */
  unidadId: string | null;
  desde: string;
  /** Pauta: puntos de pauta sobre ventas. Precio: % de cambio del ticket. Entrega: puntos de tasa de entrega. */
  cambio: number;
  /** Pauta: % de pedidos por cada punto de pauta. Precio: elasticidad (% de pedidos por cada 1 % de precio). */
  respuesta: number;
  /** Tienda o país nuevo. */
  nombre: string;
  pedidos: number;
  ticket: number;
  crecimiento: number;
  fijos: number;
  inversion: number;
}

/** Los cambios a los motores de un escenario por decisión. `referencia` = los motores promedio (para una tienda nueva). */
export function escenarioDe(tipo: TipoEscenario, p: ParametrosEscenario, referencia: Motores): Escenario {
  if (tipo === "pauta") {
    const cambios: CambioMotor[] = [{ unidadId: p.unidadId, motor: "pauta", modo: "pp", valor: p.cambio, desde: p.desde }];
    if (p.respuesta) cambios.push({ unidadId: p.unidadId, motor: "pedidos", modo: "pct", valor: r2(p.cambio * p.respuesta), desde: p.desde });
    return { cambios, nuevas: [] };
  }
  if (tipo === "precio") {
    const cambios: CambioMotor[] = [{ unidadId: p.unidadId, motor: "ticket", modo: "pct", valor: p.cambio, desde: p.desde }];
    if (p.respuesta) cambios.push({ unidadId: p.unidadId, motor: "pedidos", modo: "pct", valor: r2(-p.cambio * p.respuesta), desde: p.desde });
    return { cambios, nuevas: [] };
  }
  if (tipo === "entrega") return { cambios: [{ unidadId: p.unidadId, motor: "tasaEntrega", modo: "pp", valor: p.cambio, desde: p.desde }], nuevas: [] };
  return {
    cambios: [],
    nuevas: [
      {
        clave: `nueva-${tipo}`,
        nombre: p.nombre || (tipo === "pais" ? "País nuevo" : "Tienda nueva"),
        motores: { ...referencia, pedidos: p.pedidos, ticket: p.ticket || referencia.ticket, crecimiento: p.crecimiento, fijos: p.fijos },
        desde: p.desde,
        inversion: p.inversion,
      },
    ],
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIODO = /^\d{4}-(0[1-9]|1[0-2])-01$/;

/** Lee los parámetros guardados o del formulario; `null` si falta lo esencial. */
export function leerParametros(tipo: TipoEscenario, v: Record<string, unknown>): ParametrosEscenario | { error: string } {
  const desde = typeof v.desde === "string" && /^\d{4}-\d{2}$/.test(v.desde) ? `${v.desde}-01` : String(v.desde ?? "");
  if (!PERIODO.test(desde)) return { error: "Elegí desde qué mes rige." };
  const unidad = typeof v.unidadId === "string" && UUID.test(v.unidadId) ? v.unidadId.toLowerCase() : null;
  const n = (k: string, min: number, max: number, def = 0) => {
    const x = num(v[k]);
    return x === null ? def : Math.max(min, Math.min(max, x));
  };
  const p: ParametrosEscenario = {
    unidadId: unidad,
    desde,
    cambio: n("cambio", -100, 1000),
    respuesta: n("respuesta", -50, 50),
    nombre: typeof v.nombre === "string" ? v.nombre.trim().slice(0, 80) : "",
    pedidos: Math.round(n("pedidos", 0, 10_000_000)),
    ticket: n("ticket", 0, 100_000),
    crecimiento: n("crecimiento", -50, 100),
    fijos: n("fijos", 0, 100_000_000),
    inversion: n("inversion", 0, 1_000_000_000),
  };
  if ((tipo === "pauta" || tipo === "precio" || tipo === "entrega") && !p.cambio) return { error: "Escribí el cambio." };
  if ((tipo === "tienda" || tipo === "pais") && p.pedidos <= 0) return { error: "Escribí los pedidos del primer mes." };
  return p;
}

const aplicarCambio = (v: number, c: CambioMotor) => (c.modo === "pct" ? v * (1 + c.valor / 100) : c.modo === "pp" ? v + c.valor : c.valor);

/** Los motores de una tienda en un mes, con los cambios que rigen desde ese mes. */
export function motoresDelMes(base: Motores, unidadId: string, periodo: string, cambios: CambioMotor[]): Motores {
  const m = { ...base };
  for (const c of cambios) {
    if (c.desde > periodo || (c.unidadId !== null && c.unidadId !== unidadId)) continue;
    if (c.motor === "pedidos") continue; // los pedidos se cambian sobre el valor del mes (ver `proyectarTienda`)
    m[c.motor] = aplicarCambio(m[c.motor], c);
  }
  const def = (k: ClaveMotor) => CAMPOS_MOTORES.find((d) => d.clave === k)!;
  for (const k of Object.keys(m) as ClaveMotor[]) m[k] = Math.max(def(k).min, Math.min(def(k).max, m[k]));
  return m;
}

// ---------------------------------------------------------------------------------------------------------------------
// Proyección
// ---------------------------------------------------------------------------------------------------------------------

export interface MesTienda {
  periodo: string;
  pedidos: number;
  ventas: number;
  ingresos: number;
  mercancia: number;
  envio: number;
  comision: number;
  pauta: number;
  fijos: number;
  contribucion: number;
  /** Otros del libro (conciliación con el EERR). */
  ajusteLibro: number;
  ebitda: number;
}

/** Una tienda mes a mes. `inicio` = el mes desde el que cuenta el crecimiento (el primero proyectado o el de apertura). */
export function proyectarTienda(unidadId: string, base: Motores, meses: string[], cambios: CambioMotor[] = [], inicio = meses[0]): MesTienda[] {
  return meses.map((periodo) => {
    if (periodo < inicio) return { periodo, pedidos: 0, ventas: 0, ingresos: 0, mercancia: 0, envio: 0, comision: 0, pauta: 0, fijos: 0, contribucion: 0, ajusteLibro: 0, ebitda: 0 };
    const m = motoresDelMes(base, unidadId, periodo, cambios);
    const k = mesesEntre(inicio, periodo);
    let pedidos = base.pedidos * (1 + m.crecimiento / 100) ** k;
    for (const c of cambios) if (c.motor === "pedidos" && c.desde <= periodo && (c.unidadId === null || c.unidadId === unidadId)) pedidos = Math.max(0, aplicarCambio(pedidos, c));
    const ventas = pedidos * m.ticket;
    const ingresos = ventas * (m.tasaEntrega / 100);
    const mercancia = ingresos * (m.costoMercancia / 100);
    const envio = pedidos * m.envioPedido;
    const comision = ingresos * (m.comision / 100);
    const pauta = ventas * (m.pauta / 100);
    const contribucion = ingresos - mercancia - envio - comision - pauta;
    return {
      periodo,
      pedidos: r2(pedidos),
      ventas: r2(ventas),
      ingresos: r2(ingresos),
      mercancia: r2(mercancia),
      envio: r2(envio),
      comision: r2(comision),
      pauta: r2(pauta),
      fijos: r2(m.fijos),
      contribucion: r2(contribucion),
      ajusteLibro: r2(m.ajusteLibro),
      ebitda: r2(contribucion - m.fijos + m.ajusteLibro),
    };
  });
}

export function mesesEntre(a: string, b: string): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
}

export interface MesPlan {
  periodo: string;
  pedidos: number;
  ventas: number;
  ingresos: number;
  costoVentas: number;
  marketing: number;
  administracion: number;
  /** Otros del libro de las tiendas (lo que el EERR tiene y las órdenes no explican). */
  otrosLibro: number;
  ebitda: number;
  depreciacion: number;
  financieros: number;
  impuesto: number;
  utilidad: number;
  dividendos: number;
  // Flujo
  operativo: number;
  inversion: number;
  financiamiento: number;
  flujoNeto: number;
  // Balance al cierre
  caja: number;
  cxc: number;
  inventario: number;
  activoFijo: number;
  otrosActivos: number;
  totalActivo: number;
  cxp: number;
  deudaProgramada: number;
  deudaCobertura: number;
  otrosPasivos: number;
  totalPasivo: number;
  patrimonio: number;
  /** Activo − pasivo − patrimonio: igual a la diferencia de apertura todos los meses. */
  diferencia: number;
}

export interface TiendaPlan {
  id: string;
  nombre: string;
  motores: Motores;
}

export interface EntradaPlan {
  /** Meses proyectados (el primero es el siguiente al corte de la apertura). */
  meses: string[];
  tiendas: TiendaPlan[];
  supuestos: SupuestosPlan;
  apertura: Apertura;
  /** Saldo de la deuda actual (préstamos y líneas) al cierre de cada mes; un mes que falta repite el anterior. */
  deudaProgramada: Record<string, number>;
}

export interface ResultadoPlan {
  meses: string[];
  /** Por tienda (y por tienda nueva, con su clave). */
  tiendas: { id: string; nombre: string; nueva: boolean; meses: MesTienda[] }[];
  consolidado: MesPlan[];
}

export function proyectarPlan(e: EntradaPlan, escenario: Escenario = ESCENARIO_BASE): ResultadoPlan {
  const { meses, supuestos: s, apertura: a } = e;
  const tiendas = [
    ...e.tiendas.map((t) => ({ id: t.id, nombre: t.nombre, nueva: false, meses: proyectarTienda(t.id, t.motores, meses, escenario.cambios) })),
    ...escenario.nuevas.map((n) => ({ id: n.clave, nombre: n.nombre, nueva: true, meses: proyectarTienda(n.clave, n.motores, meses, [], n.desde) })),
  ];
  const consolidado: MesPlan[] = [];
  let prev = {
    caja: a.caja,
    cxc: a.cxc,
    inventario: a.inventario,
    activoFijo: a.activoFijo,
    cxp: a.cxp,
    deudaProgramada: a.deuda,
    deudaCobertura: 0,
    patrimonio: a.patrimonio,
  };
  let ebtAnio = 0;
  let impuestoAnio = 0;
  let anio = meses[0]?.slice(0, 4) ?? "";
  meses.forEach((periodo, k) => {
    const del = (f: (m: MesTienda) => number) => tiendas.reduce((acc, t) => acc + f(t.meses[k]), 0);
    const ingresos = del((m) => m.ingresos);
    const costoVentas = del((m) => m.mercancia + m.envio + m.comision);
    const marketing = del((m) => m.pauta);
    const administracion = del((m) => m.fijos) + s.fijosCorporativo;
    const otrosLibro = del((m) => m.ajusteLibro);
    const ebitda = ingresos - costoVentas - marketing - administracion + otrosLibro;
    const inversionNueva = escenario.nuevas.filter((n) => n.desde === periodo).reduce((acc, n) => acc + n.inversion, 0);
    const capex = s.capexMes + inversionNueva;
    const activoFijo = Math.max(0, prev.activoFijo + capex - s.depreciacionMes);
    // Con el activo fijo depreciado del todo, solo se deprecia lo que queda.
    const depreciacion = prev.activoFijo + capex - activoFijo;
    const financieros = s.financierosMes + prev.deudaCobertura * (s.tasaCobertura / 100 / 12);
    const ebt = ebitda - depreciacion - financieros;
    if (periodo.slice(0, 4) !== anio) {
      anio = periodo.slice(0, 4);
      ebtAnio = 0;
      impuestoAnio = 0;
    }
    ebtAnio += ebt;
    const impuestoAcum = Math.max(0, ebtAnio) * (s.tasaImpuesto / 100);
    const impuesto = impuestoAcum - impuestoAnio;
    impuestoAnio = impuestoAcum;
    const utilidad = ebt - impuesto;

    const cxc = ingresos * (s.diasCxc / 30);
    const inventario = del((m) => m.mercancia) * (s.diasInventario / 30);
    const cxp = (costoVentas + marketing) * (s.diasCxp / 30);
    const deudaProgramada = e.deudaProgramada[periodo] ?? prev.deudaProgramada;

    const operativo = utilidad + depreciacion - (cxc - prev.cxc) - (inventario - prev.inventario) + (cxp - prev.cxp);
    const inversion = -capex;
    const finBase = deudaProgramada - prev.deudaProgramada - s.dividendosMes;
    const cajaAntes = prev.caja + operativo + inversion + finBase;
    let deudaCobertura = prev.deudaCobertura;
    let caja = cajaAntes;
    if (cajaAntes < s.cajaMinima) {
      deudaCobertura += s.cajaMinima - cajaAntes;
      caja = s.cajaMinima;
    } else if (deudaCobertura > 0) {
      const pago = Math.min(deudaCobertura, cajaAntes - s.cajaMinima);
      deudaCobertura -= pago;
      caja = cajaAntes - pago;
    }
    const financiamiento = finBase + (deudaCobertura - prev.deudaCobertura);
    const patrimonio = prev.patrimonio + utilidad - s.dividendosMes;
    const totalActivo = caja + cxc + inventario + activoFijo + a.otrosActivos;
    const totalPasivo = cxp + deudaProgramada + deudaCobertura + a.otrosPasivos;
    consolidado.push({
      periodo,
      pedidos: r2(del((m) => m.pedidos)),
      ventas: r2(del((m) => m.ventas)),
      ingresos: r2(ingresos),
      costoVentas: r2(costoVentas),
      marketing: r2(marketing),
      administracion: r2(administracion),
      otrosLibro: r2(otrosLibro),
      ebitda: r2(ebitda),
      depreciacion: r2(depreciacion),
      financieros: r2(financieros),
      impuesto: r2(impuesto),
      utilidad: r2(utilidad),
      dividendos: r2(s.dividendosMes),
      operativo: r2(operativo),
      inversion: r2(inversion),
      financiamiento: r2(financiamiento),
      flujoNeto: r2(operativo + inversion + financiamiento),
      caja: r2(caja),
      cxc: r2(cxc),
      inventario: r2(inventario),
      activoFijo: r2(activoFijo),
      otrosActivos: r2(a.otrosActivos),
      totalActivo: r2(totalActivo),
      cxp: r2(cxp),
      deudaProgramada: r2(deudaProgramada),
      deudaCobertura: r2(deudaCobertura),
      otrosPasivos: r2(a.otrosPasivos),
      totalPasivo: r2(totalPasivo),
      patrimonio: r2(patrimonio),
      diferencia: r2(totalActivo - totalPasivo - patrimonio),
    });
    prev = { caja, cxc, inventario, activoFijo, cxp, deudaProgramada, deudaCobertura, patrimonio };
  });
  return { meses, tiendas, consolidado };
}

// ---------------------------------------------------------------------------------------------------------------------
// Resumen y comparación de escenarios
// ---------------------------------------------------------------------------------------------------------------------

export interface ResumenPlan {
  ventas: number;
  ingresos: number;
  ebitda: number;
  utilidad: number;
  cajaMinima: number;
  mesCajaMinima: string | null;
  cajaFinal: number;
  /** La mayor deuda total (programada + cobertura) de los meses. */
  deudaMaxima: number;
  deudaCoberturaMaxima: number;
  /** EBITDA de los meses × múltiplo (anualizado si son menos de 12). */
  valorEmpresa: number;
}

export function resumirPlan(meses: MesPlan[], multiplo: number, n = 12): ResumenPlan {
  const tramo = meses.slice(0, n);
  const suma = (f: (m: MesPlan) => number) => r2(tramo.reduce((a, m) => a + f(m), 0));
  const ebitda = suma((m) => m.ebitda);
  let min: MesPlan | null = null;
  for (const m of tramo) if (!min || m.caja < min.caja) min = m;
  return {
    ventas: suma((m) => m.ventas),
    ingresos: suma((m) => m.ingresos),
    ebitda,
    utilidad: suma((m) => m.utilidad),
    cajaMinima: min?.caja ?? 0,
    mesCajaMinima: min?.periodo ?? null,
    cajaFinal: tramo[tramo.length - 1]?.caja ?? 0,
    deudaMaxima: r2(Math.max(0, ...tramo.map((m) => m.deudaProgramada + m.deudaCobertura))),
    deudaCoberturaMaxima: r2(Math.max(0, ...tramo.map((m) => m.deudaCobertura))),
    valorEmpresa: tramo.length ? r2((ebitda * 12) / tramo.length * multiplo) : 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Fotos y versiones (lo que se guarda en jsonb)
// ---------------------------------------------------------------------------------------------------------------------

export interface MesFoto {
  periodo: string;
  pedidos: number;
  ventas: number;
  ingresos: number;
  ebitda: number;
  utilidad: number;
  caja: number;
}

export interface TiendaFoto {
  id: string;
  nombre: string;
  meses: { periodo: string; pedidos: number; ventas: number; ingresos: number; pauta: number; ebitda: number }[];
}

export interface DatosFoto {
  consolidado: MesFoto[];
  tiendas: TiendaFoto[];
}

export function fotoDePlan(r: ResultadoPlan): DatosFoto {
  return {
    consolidado: r.consolidado.map((m) => ({ periodo: m.periodo, pedidos: m.pedidos, ventas: m.ventas, ingresos: m.ingresos, ebitda: m.ebitda, utilidad: m.utilidad, caja: m.caja })),
    tiendas: r.tiendas
      .filter((t) => !t.nueva)
      .map((t) => ({
        id: t.id,
        nombre: t.nombre,
        meses: t.meses.map((m) => ({ periodo: m.periodo, pedidos: m.pedidos, ventas: m.ventas, ingresos: m.ingresos, pauta: m.pauta, ebitda: m.ebitda })),
      })),
  };
}

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Lee una foto guardada; lo que no tenga la forma esperada se descarta. */
export function leerFoto(v: unknown): DatosFoto | null {
  if (!esObjeto(v) || !Array.isArray(v.consolidado)) return null;
  const mes = (x: unknown): MesFoto | null => {
    if (!esObjeto(x) || typeof x.periodo !== "string" || !PERIODO.test(x.periodo)) return null;
    const n = (k: string) => num(x[k]) ?? 0;
    return { periodo: x.periodo, pedidos: n("pedidos"), ventas: n("ventas"), ingresos: n("ingresos"), ebitda: n("ebitda"), utilidad: n("utilidad"), caja: n("caja") };
  };
  const consolidado = v.consolidado.map(mes).filter((m): m is MesFoto => m !== null);
  const tiendas: TiendaFoto[] = (Array.isArray(v.tiendas) ? v.tiendas : []).flatMap((t) => {
    if (!esObjeto(t) || typeof t.id !== "string" || !Array.isArray(t.meses)) return [];
    return [
      {
        id: t.id,
        nombre: typeof t.nombre === "string" ? t.nombre : "",
        meses: t.meses.flatMap((x) => {
          if (!esObjeto(x) || typeof x.periodo !== "string" || !PERIODO.test(x.periodo)) return [];
          const n = (k: string) => num(x[k]) ?? 0;
          return [{ periodo: x.periodo, pedidos: n("pedidos"), ventas: n("ventas"), ingresos: n("ingresos"), pauta: n("pauta"), ebitda: n("ebitda") }];
        }),
      },
    ];
  });
  return { consolidado, tiendas };
}

// ---------------------------------------------------------------------------------------------------------------------
// Pronóstico continuo de 18 meses
// ---------------------------------------------------------------------------------------------------------------------

export const MESES_CONTINUO = 18;
export const MESES_REALES_CONTINUO = 6;

export interface FilaContinuo {
  periodo: string;
  real: boolean;
  ventas: number | null;
  ingresos: number;
  ebitda: number;
  caja: number | null;
  /** Lo que dice el plan aprobado para ese mes. */
  plan: { ingresos: number; ebitda: number } | null;
  /** Lo que decía la foto anterior (la del cierre previo). */
  anterior: { ingresos: number; ebitda: number } | null;
}

export interface MesReal {
  periodo: string;
  ventas: number | null;
  ingresos: number;
  ebitda: number;
  caja: number | null;
}

/** Los meses reales hasta el último cierre y la proyección desde los motores, contra el plan y la foto anterior. */
export function armarContinuo(reales: MesReal[], proyeccion: MesPlan[], plan: DatosFoto | null, anterior: DatosFoto | null): FilaContinuo[] {
  const deFoto = (f: DatosFoto | null, p: string) => {
    const m = f?.consolidado.find((x) => x.periodo === p);
    return m ? { ingresos: m.ingresos, ebitda: m.ebitda } : null;
  };
  return [
    ...reales.map((r) => ({ ...r, real: true, plan: deFoto(plan, r.periodo), anterior: deFoto(anterior, r.periodo) })),
    ...proyeccion.map((m) => ({
      periodo: m.periodo,
      real: false,
      ventas: m.ventas,
      ingresos: m.ingresos,
      ebitda: m.ebitda,
      caja: m.caja,
      plan: deFoto(plan, m.periodo),
      anterior: deFoto(anterior, m.periodo),
    })),
  ];
}

/** La suma de un indicador de las filas que tienen comparación (para el «contra el plan» del total). */
export function totalesComparables(filas: FilaContinuo[], contra: "plan" | "anterior", campo: "ingresos" | "ebitda"): { actual: number; contra: number } | null {
  const con = filas.filter((f) => f[contra] !== null);
  if (!con.length) return null;
  return { actual: r2(con.reduce((a, f) => a + f[campo], 0)), contra: r2(con.reduce((a, f) => a + (f[contra] as { ingresos: number; ebitda: number })[campo], 0)) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Del plan aprobado al módulo Presupuesto
// ---------------------------------------------------------------------------------------------------------------------

export type SeccionPresupuestoPlan = "ingresos" | "costo_ventas" | "administracion" | "marketing" | "finanzas" | "impuesto_ganancias";

export interface LineaPresupuestoPlan {
  periodo: string;
  unidadId: string;
  seccion: SeccionPresupuestoPlan;
  monto: number;
}

/**
 * Las líneas del escenario base de un presupuesto por tienda (`fin_presupuesto_lineas`, montos en positivo como en el
 * EERR) para los meses del plan: cada tienda con sus ingresos, costo de ventas, administración y marketing; el
 * corporativo con sus gastos, los financieros y el impuesto. La depreciación no se presupuesta (el módulo no la tiene).
 */
export function lineasPresupuesto(
  tiendas: { id: string; nueva: boolean; meses: MesTienda[] }[],
  consolidado: MesPlan[],
  corporativoId: string | null,
): LineaPresupuestoPlan[] {
  const salida: LineaPresupuestoPlan[] = [];
  const poner = (periodo: string, unidadId: string, seccion: SeccionPresupuestoPlan, monto: number) => {
    if (Math.abs(monto) < 0.005) return;
    const previa = salida.find((l) => l.periodo === periodo && l.unidadId === unidadId && l.seccion === seccion);
    if (previa) previa.monto = r2(previa.monto + monto);
    else salida.push({ periodo, unidadId, seccion, monto: r2(monto) });
  };
  const propias = tiendas.filter((t) => !t.nueva);
  for (const t of propias)
    for (const m of t.meses) {
      poner(m.periodo, t.id, "ingresos", m.ingresos);
      poner(m.periodo, t.id, "costo_ventas", m.mercancia + m.envio + m.comision);
      poner(m.periodo, t.id, "administracion", m.fijos);
      poner(m.periodo, t.id, "marketing", m.pauta);
      // Otros del libro: lo positivo suma a los ingresos y lo negativo a la administración (el presupuesto no tiene
      // una línea propia para la conciliación).
      if (m.ajusteLibro > 0) poner(m.periodo, t.id, "ingresos", m.ajusteLibro);
      else if (m.ajusteLibro < 0) poner(m.periodo, t.id, "administracion", -m.ajusteLibro);
    }
  if (corporativoId)
    for (const c of consolidado) {
      const fijosTiendas = propias.reduce((a, t) => a + (t.meses.find((m) => m.periodo === c.periodo)?.fijos ?? 0), 0);
      poner(c.periodo, corporativoId, "administracion", c.administracion - fijosTiendas);
      poner(c.periodo, corporativoId, "finanzas", c.financieros);
      poner(c.periodo, corporativoId, "impuesto_ganancias", c.impuesto);
    }
  return salida;
}
