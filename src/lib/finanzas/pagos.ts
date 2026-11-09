// Portal AF4 360° › Tesorería › Pagos. Lógica pura: el calendario de pagos de las próximas 4 semanas (cuentas por pagar,
// nómina, impuestos, cuotas de deuda, gastos recurrentes y compras, más lo ya programado), la prioridad de cada pago
// (crítico / negociable / postergable, configurable por categoría o proveedor), qué pagar con la caja proyectada cuando
// no alcanza, y los pasos de un pago programado (solicitado → aprobado → pagado). Prueba en `pagos.test.ts`.

const r2 = (v: number) => Math.round(v * 100) / 100;
const aFecha = (f: string) => Date.parse(`${f.slice(0, 10)}T00:00:00Z`);
const diasEntre = (a: string, b: string) => Math.round((aFecha(b) - aFecha(a)) / 86_400_000);

export const SEMANAS_CALENDARIO = 4;

export const PRIORIDADES = [
  { clave: "critico", etiqueta: "Crítico" },
  { clave: "negociable", etiqueta: "Negociable" },
  { clave: "postergable", etiqueta: "Postergable" },
] as const;
export type Prioridad = (typeof PRIORIDADES)[number]["clave"];
export const esPrioridad = (v: unknown): v is Prioridad => typeof v === "string" && PRIORIDADES.some((p) => p.clave === v);
export const etiquetaPrioridad = (p: Prioridad) => PRIORIDADES.find((x) => x.clave === p)!.etiqueta;
const RANGO: Record<Prioridad, number> = { critico: 0, negociable: 1, postergable: 2 };

export const CATEGORIAS_PAGO = [
  { clave: "nomina", etiqueta: "Nómina", prioridad: "critico" },
  { clave: "impuesto", etiqueta: "Impuestos", prioridad: "critico" },
  { clave: "prestamo", etiqueta: "Cuotas de préstamos", prioridad: "critico" },
  { clave: "linea", etiqueta: "Líneas de crédito", prioridad: "critico" },
  { clave: "cxp", etiqueta: "Cuentas por pagar", prioridad: "negociable" },
  { clave: "compra", etiqueta: "Compras a proveedores", prioridad: "negociable" },
  { clave: "recurrente", etiqueta: "Gastos recurrentes", prioridad: "negociable" },
  { clave: "otro", etiqueta: "Otros", prioridad: "postergable" },
] as const satisfies readonly { clave: string; etiqueta: string; prioridad: Prioridad }[];
export type CategoriaPago = (typeof CATEGORIAS_PAGO)[number]["clave"];
export const esCategoriaPago = (v: unknown): v is CategoriaPago => typeof v === "string" && CATEGORIAS_PAGO.some((c) => c.clave === v);
export const etiquetaCategoria = (c: CategoriaPago) => CATEGORIAS_PAGO.find((x) => x.clave === c)!.etiqueta;

export interface ReglaPrioridad {
  ambito: "categoria" | "contraparte";
  valor: string;
  prioridad: Prioridad;
}

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * La prioridad de un pago: la que se le puso al programarlo; si no, la regla de su proveedor; si no, la de su categoría;
 * si no, la de por defecto.
 */
export function prioridadDe(p: { categoria: CategoriaPago; contraparte: string | null; prioridad?: Prioridad | null }, reglas: ReglaPrioridad[]): Prioridad {
  if (p.prioridad) return p.prioridad;
  if (p.contraparte) {
    const c = normal(p.contraparte);
    const r = reglas.find((x) => x.ambito === "contraparte" && normal(x.valor) === c);
    if (r) return r.prioridad;
  }
  const r = reglas.find((x) => x.ambito === "categoria" && x.valor === p.categoria);
  return r?.prioridad ?? CATEGORIAS_PAGO.find((x) => x.clave === p.categoria)!.prioridad;
}

// ---------------------------------------------------------------------------------------------
// Calendario
// ---------------------------------------------------------------------------------------------

export type EstadoProgramado = "solicitado" | "aprobado" | "pagado" | "rechazado" | "anulado";

export interface PagoCalendario {
  clave: string;
  /** Día en que se ubica en el calendario (lo vencido, hoy). */
  fecha: string;
  /** Vencimiento original (lo vencido queda con su fecha). */
  vence: string | null;
  vencido: boolean;
  /** 0 a 3; la semana 1 es la de hoy (lunes a domingo). */
  semana: number;
  categoria: CategoriaPago;
  concepto: string;
  contraparte: string | null;
  monto: number;
  prioridad: Prioridad;
  /** Un monto que sale del ritmo de la proyección (no de un documento). */
  estimado: boolean;
  /** Para programarlo: de dónde sale. */
  origenRef: string | null;
  carteraId: string | null;
  programado: { id: string; estado: EstadoProgramado } | null;
}

export interface FuentesCalendario {
  hoy: string;
  /** Lunes de las semanas de la proyección (al menos 4). */
  semanas: string[];
  cxp: { id: string; contraparte: string; documento: string | null; saldo: number; vencimiento: string | null }[];
  /** Pagos ya programados vivos (solicitados o aprobados). */
  programados: { id: string; concepto: string; contraparte: string | null; categoria: CategoriaPago; monto: number; fecha: string; estado: EstadoProgramado; prioridad: Prioridad; origenRef: string | null; carteraId: string | null }[];
  deuda: { fecha: string; concepto: string; monto: number; origen: "prestamo" | "linea" | "ciclo"; ref: string }[];
  /** Partidas semanales de la proyección (nómina, impuestos, recurrentes, compras), un valor por semana. */
  proyeccion: { categoria: CategoriaPago; detalle: string; valores: number[] }[];
  /** Obligaciones del calendario fiscal sin presentar (`pagosFiscales`), con su vencimiento. */
  fiscal?: PagoFiscal[];
}

// ---------------------------------------------------------------------------------------------
// Calendario fiscal → pagos
// ---------------------------------------------------------------------------------------------

/** Los tipos del libro con que se paga cada obligación mensual (para estimar su monto y no repetirla con la proyección). */
export const TIPO_LIBRO_OBLIGACION: Record<string, RegExp> = {
  itbms: /ITBMS|IMPUESTOS? SOBRE (LAS )?VENTAS/,
  retenciones: /RETENCION/,
};

export interface PagoFiscal {
  /** «fiscal:<clave>:<AAAA-MM>»: también es el origen al programarlo. */
  ref: string;
  fecha: string;
  concepto: string;
  /** 0 = sin monto conocido. */
  monto: number;
  /** El monto sale de la última presentación o del libro (no de un documento). */
  estimado: boolean;
}

export interface FilaFiscal {
  obligacionId: string;
  clave: string;
  nombre: string;
  periodicidad: "mensual" | "anual";
  periodo: string;
  nombrePeriodo: string;
  vence: string;
  presentada: boolean;
}

/**
 * Las obligaciones fiscales por pagar hasta `hasta` (lo vencido sin presentar desde `desde`, también). El monto estimado es el de la
 * última presentación con monto de esa obligación; si no hay, en las mensuales, el pago mensual del libro de su tipo
 * (`impuestosLibro`, lo que detecta la proyección). Devuelve además los tipos del libro que quedan cubiertos por una
 * obligación activa: esas líneas de impuestos de la proyección no se repiten en el calendario.
 */
export function pagosFiscales(
  filas: FilaFiscal[],
  ultimoMonto: Map<string, number>,
  impuestosLibro: { tipo: string; monto: number }[],
  hasta: string,
  /** Lo vencido sin presentar entra desde esta fecha (más atrás es un pendiente del calendario fiscal, no un pago de caja). */
  desde: string | null = null,
): { pagos: PagoFiscal[]; tiposCubiertos: Set<string> } {
  const tiposCubiertos = new Set<string>();
  const delLibro = new Map<string, number>();
  const claves = new Set(filas.filter((f) => f.periodicidad === "mensual").map((f) => f.clave));
  for (const clave of claves) {
    const re = TIPO_LIBRO_OBLIGACION[clave];
    if (!re) continue;
    for (const g of impuestosLibro) {
      if (!re.test(normal(g.tipo))) continue;
      tiposCubiertos.add(g.tipo);
      delLibro.set(clave, r2((delLibro.get(clave) ?? 0) + g.monto));
    }
  }
  const pagos = filas
    .filter((f) => !f.presentada && f.vence <= hasta && (!desde || f.vence >= desde))
    .map((f) => {
      const previo = ultimoMonto.get(f.obligacionId);
      const libro = f.periodicidad === "mensual" ? delLibro.get(f.clave) : undefined;
      const monto = previo ?? libro ?? 0;
      return { ref: `fiscal:${f.clave}:${f.periodo.slice(0, 7)}`, fecha: f.vence, concepto: `${f.nombre} de ${f.nombrePeriodo}`, monto: r2(monto), estimado: true };
    });
  return { pagos, tiposCubiertos };
}

const finSemana = (lunes: string) => new Date(aFecha(lunes) + 6 * 86_400_000).toISOString().slice(0, 10);

function semanaDe(semanas: string[], fecha: string): number | null {
  const i = Math.floor(diasEntre(semanas[0], fecha) / 7);
  return i >= 0 && i < SEMANAS_CALENDARIO && i < semanas.length ? i : null;
}

/**
 * Los pagos de las próximas 4 semanas. Lo vencido se ubica hoy (semana 1). Un documento o una cuota ya programados se
 * muestran una sola vez, con el estado del pago programado. Las partidas de la proyección van el lunes de su semana (hoy
 * en la semana 1) y se marcan como estimadas.
 */
export function armarCalendario(f: FuentesCalendario, reglas: ReglaPrioridad[]): PagoCalendario[] {
  const semanas = f.semanas.slice(0, SEMANAS_CALENDARIO);
  const fin = finSemana(semanas[semanas.length - 1]);
  const programadoPor = new Map<string, FuentesCalendario["programados"][number]>();
  for (const p of f.programados) {
    if (p.origenRef) programadoPor.set(p.origenRef, p);
    if (p.carteraId) programadoPor.set(`cxp:${p.carteraId}`, p);
  }
  const usados = new Set<string>();
  const salida: PagoCalendario[] = [];
  const ubicar = (fecha: string | null) => {
    if (!fecha || fecha < f.hoy) return { fecha: f.hoy, vencido: !!fecha, semana: 0 };
    const s = semanaDe(semanas, fecha);
    return s === null ? null : { fecha, vencido: false, semana: s };
  };
  for (const d of f.cxp) {
    if (d.saldo <= 0.005 || (d.vencimiento && d.vencimiento > fin)) continue;
    const u = ubicar(d.vencimiento);
    if (!u) continue;
    const ref = `cxp:${d.id}`;
    const prog = programadoPor.get(ref) ?? null;
    if (prog) usados.add(prog.id);
    const base = { categoria: "cxp" as const, contraparte: d.contraparte };
    salida.push({
      clave: ref,
      fecha: prog ? (ubicar(prog.fecha)?.fecha ?? u.fecha) : u.fecha,
      vence: d.vencimiento,
      vencido: u.vencido,
      semana: prog ? (ubicar(prog.fecha)?.semana ?? u.semana) : u.semana,
      ...base,
      concepto: d.documento ? `${d.contraparte} · ${d.documento}` : d.contraparte,
      monto: r2(prog ? prog.monto : d.saldo),
      prioridad: prioridadDe({ ...base, prioridad: prog?.prioridad }, reglas),
      estimado: false,
      origenRef: ref,
      carteraId: d.id,
      programado: prog ? { id: prog.id, estado: prog.estado } : null,
    });
  }
  for (const d of f.deuda) {
    const u = ubicar(d.fecha);
    if (!u) continue;
    const prog = programadoPor.get(d.ref) ?? null;
    if (prog) usados.add(prog.id);
    const base = { categoria: (d.origen === "ciclo" ? "prestamo" : d.origen) as CategoriaPago, contraparte: null };
    salida.push({
      clave: `deuda:${d.ref}`,
      ...u,
      vence: d.fecha,
      ...base,
      concepto: d.concepto,
      monto: r2(d.monto),
      prioridad: prioridadDe({ ...base, prioridad: prog?.prioridad }, reglas),
      estimado: d.origen === "linea",
      origenRef: d.ref,
      carteraId: null,
      programado: prog ? { id: prog.id, estado: prog.estado } : null,
    });
  }
  for (const d of f.fiscal ?? []) {
    const u = ubicar(d.fecha);
    if (!u) continue;
    const prog = programadoPor.get(d.ref) ?? null;
    if (prog) usados.add(prog.id);
    const base = { categoria: "impuesto" as const, contraparte: null };
    salida.push({
      clave: d.ref,
      fecha: prog ? (ubicar(prog.fecha)?.fecha ?? u.fecha) : u.fecha,
      vence: d.fecha,
      vencido: u.vencido,
      semana: prog ? (ubicar(prog.fecha)?.semana ?? u.semana) : u.semana,
      ...base,
      concepto: d.concepto,
      monto: r2(prog ? prog.monto : d.monto),
      prioridad: prioridadDe({ ...base, prioridad: prog?.prioridad }, reglas),
      estimado: prog ? false : d.estimado,
      origenRef: d.ref,
      carteraId: null,
      programado: prog ? { id: prog.id, estado: prog.estado } : null,
    });
  }
  for (const p of f.programados) {
    if (usados.has(p.id)) continue;
    const u = ubicar(p.fecha);
    if (!u) continue;
    salida.push({
      clave: `prog:${p.id}`,
      ...u,
      vence: p.fecha,
      categoria: p.categoria,
      concepto: p.concepto,
      contraparte: p.contraparte,
      monto: r2(p.monto),
      prioridad: prioridadDe(p, reglas),
      estimado: false,
      origenRef: p.origenRef,
      carteraId: p.carteraId,
      programado: { id: p.id, estado: p.estado },
    });
  }
  for (const l of f.proyeccion) {
    l.valores.slice(0, SEMANAS_CALENDARIO).forEach((v, i) => {
      if (v <= 0.005 || i >= semanas.length) return;
      const fecha = i === 0 ? f.hoy : semanas[i];
      const base = { categoria: l.categoria, contraparte: null };
      salida.push({
        clave: `proy:${l.categoria}:${l.detalle}:${i}`,
        fecha,
        vence: null,
        vencido: false,
        semana: i,
        ...base,
        concepto: l.detalle,
        monto: r2(v),
        prioridad: prioridadDe(base, reglas),
        estimado: true,
        origenRef: null,
        carteraId: null,
        programado: null,
      });
    });
  }
  return salida.sort((a, b) => a.fecha.localeCompare(b.fecha) || RANGO[a.prioridad] - RANGO[b.prioridad] || b.monto - a.monto);
}

// ---------------------------------------------------------------------------------------------
// Qué pagar cuando la caja no alcanza
// ---------------------------------------------------------------------------------------------

export type Decision = "pagar" | "pagar_sin_caja" | "postergar" | "sin_caja";

export interface PropuestaPago {
  clave: string;
  decision: Decision;
  /** La semana en que se propone pagar (null si no alcanza en las 4). */
  semanaPago: number | null;
  /** Semanas que se corre. */
  corrimiento: number;
}

export interface ResultadoPriorizacion {
  propuestas: Map<string, PropuestaPago>;
  /** Caja al cierre de cada semana con la propuesta. */
  cajaFinal: number[];
  pagado: number;
  postergado: number;
  /** Lo crítico que se paga aunque deje la caja bajo el mínimo (o negativa). */
  deficitCritico: number;
  alcanza: boolean;
}

/**
 * Semana a semana, la caja disponible (caja de hoy + entradas esperadas − las demás salidas de la proyección) paga primero
 * lo crítico, luego lo negociable y lo postergable, por fecha. Se guarda `reserva` (la caja mínima): lo negociable y lo
 * postergable que no cabe sin tocarla se corre a la semana siguiente; lo crítico se paga igual y se cuenta como déficit
 * si la caja no alcanza.
 */
export function priorizarPagos(pagos: PagoCalendario[], caja: { inicial: number; entradas: number[]; otrasSalidas: number[]; reserva: number }): ResultadoPriorizacion {
  const propuestas = new Map<string, PropuestaPago>();
  const cajaFinal: number[] = [];
  let saldo = caja.inicial;
  let pendientes: PagoCalendario[] = [];
  let pagado = 0;
  let deficit = 0;
  const vivos = pagos.filter((p) => p.programado?.estado !== "pagado");
  for (let s = 0; s < SEMANAS_CALENDARIO; s++) {
    saldo += (caja.entradas[s] ?? 0) - (caja.otrasSalidas[s] ?? 0);
    const cola = [...pendientes, ...vivos.filter((p) => p.semana === s)].sort(
      (a, b) => RANGO[a.prioridad] - RANGO[b.prioridad] || a.fecha.localeCompare(b.fecha) || b.monto - a.monto,
    );
    pendientes = [];
    for (const p of cola) {
      if (p.prioridad === "critico") {
        const sinCaja = saldo - p.monto < caja.reserva;
        if (sinCaja) deficit += Math.min(p.monto, Math.max(p.monto - (saldo - caja.reserva), 0));
        saldo -= p.monto;
        pagado += p.monto;
        propuestas.set(p.clave, { clave: p.clave, decision: sinCaja ? "pagar_sin_caja" : "pagar", semanaPago: s, corrimiento: s - p.semana });
      } else if (saldo - p.monto >= caja.reserva) {
        saldo -= p.monto;
        pagado += p.monto;
        propuestas.set(p.clave, { clave: p.clave, decision: p.semana === s ? "pagar" : "postergar", semanaPago: s, corrimiento: s - p.semana });
      } else pendientes.push(p);
    }
    cajaFinal.push(r2(saldo));
  }
  for (const p of pendientes) propuestas.set(p.clave, { clave: p.clave, decision: "sin_caja", semanaPago: null, corrimiento: SEMANAS_CALENDARIO - p.semana });
  const postergado = r2(pagos.filter((p) => propuestas.get(p.clave)?.decision === "postergar" || propuestas.get(p.clave)?.decision === "sin_caja").reduce((a, p) => a + p.monto, 0));
  return { propuestas, cajaFinal, pagado: r2(pagado), postergado, deficitCritico: r2(deficit), alcanza: deficit <= 0.005 && pendientes.length === 0 };
}

export const ETIQUETA_DECISION: Record<Decision, string> = {
  pagar: "Pagar",
  pagar_sin_caja: "Pagar (falta caja)",
  postergar: "Correr",
  sin_caja: "Sin caja en 4 semanas",
};

// ---------------------------------------------------------------------------------------------
// Pagos programados: pasos y validación
// ---------------------------------------------------------------------------------------------

export const ESTADOS_PROGRAMADO: { clave: EstadoProgramado; etiqueta: string }[] = [
  { clave: "solicitado", etiqueta: "Solicitado" },
  { clave: "aprobado", etiqueta: "Aprobado" },
  { clave: "pagado", etiqueta: "Pagado" },
  { clave: "rechazado", etiqueta: "Rechazado" },
  { clave: "anulado", etiqueta: "Anulado" },
];
export const etiquetaEstadoProgramado = (e: EstadoProgramado) => ESTADOS_PROGRAMADO.find((x) => x.clave === e)?.etiqueta ?? e;

export type AccionProgramado = "aprobar" | "rechazar" | "pagar" | "anular";

const PASOS: Record<AccionProgramado, EstadoProgramado[]> = {
  aprobar: ["solicitado"],
  rechazar: ["solicitado", "aprobado"],
  pagar: ["aprobado"],
  anular: ["solicitado", "aprobado"],
};

/**
 * Si una persona puede dar un paso. Aprobar exige que no lo haya pedido ella misma, salvo quien administra (Usuarios y
 * roles): así un pago pasa por dos manos.
 */
export function puedeDarPaso(accion: AccionProgramado, p: { estado: EstadoProgramado; solicitadoPor: string | null }, persona: { id: string; esAdmin: boolean }): { ok: true } | { ok: false; error: string } {
  if (!PASOS[accion].includes(p.estado)) {
    const txt: Record<AccionProgramado, string> = {
      aprobar: "Solo se aprueba un pago solicitado.",
      rechazar: "Ese pago ya no se puede rechazar.",
      pagar: "Primero hay que aprobar el pago.",
      anular: "Ese pago ya no se puede anular.",
    };
    return { ok: false, error: txt[accion] };
  }
  if (accion === "aprobar" && p.solicitadoPor === persona.id && !persona.esAdmin) return { ok: false, error: "Lo aprueba otra persona: tú lo solicitaste." };
  return { ok: true };
}

export function leerMonto(v: unknown): number | null {
  const s = String(v ?? "").replace(/[$\s,]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n <= 100_000_000 ? r2(n) : null;
}

export const leerFecha = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(aFecha(s)) ? s : null;
};
