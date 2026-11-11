// Unidad económica de Rentabilidad (pestañas Productos, Pedidos, Zonas y repartidores, Marketing y Equilibrio).
// Las sumas las hace Postgres (`fin_ue_*`, migración 0934); aquí solo lo que se deriva de una fila ya sumada: tasas,
// precio mínimo, recomendaciones, simulador de precio, punto de equilibrio y ROAS de margen por campaña. Lógica pura.

export const CLAVE_SUPUESTOS_UE = "unidad_economica";

export const METODOS_PAGO = ["efectivo", "yappy", "transferencia", "tarjeta", "servientrega", "clicksi", "previo_pago", "otro"] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export const ETIQUETA_METODO: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  yappy: "Yappy",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  servientrega: "Servientrega",
  clicksi: "Clicksi",
  previo_pago: "Previo pago",
  otro: "Otro",
};

/** Los supuestos que faltan en los datos (`fin_config.unidad_economica`). Porcentajes en escala 0–100. */
export interface SupuestosUE {
  /** Envío de una orden enviada que no trae costo de envío. */
  envioPorOrden: number;
  /** La vuelta de una devolución, como fracción del envío de ida (1 = cuesta lo mismo). */
  envioVueltaFactor: number;
  /** % del costo de la mercancía que se pierde o se daña en una devolución. */
  perdidaDevolucionPct: number;
  /** Margen real objetivo, % de las ventas. */
  margenObjetivoPct: number;
  /** Comisión de cobro por método de pago, % de lo cobrado. */
  comisionPct: Record<MetodoPago, number>;
  /** Fijos por mes de cada tienda (id → monto); sin dato, la administración del libro. */
  fijosPorTienda: Record<string, number>;
}

export const SUPUESTOS_UE_PREDETERMINADOS: SupuestosUE = {
  envioPorOrden: 3.65,
  envioVueltaFactor: 1,
  perdidaDevolucionPct: 10,
  margenObjetivoPct: 15,
  comisionPct: { efectivo: 0, yappy: 2, transferencia: 0, tarjeta: 3.5, servientrega: 3, clicksi: 0, previo_pago: 0, otro: 0 },
  fijosPorTienda: {},
};

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lee los supuestos guardados (cualquier forma) y completa lo que falte con los predeterminados. */
export function leerSupuestosUE(valor: unknown): SupuestosUE {
  const v = valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
  const d = SUPUESTOS_UE_PREDETERMINADOS;
  const en = (x: unknown, def: number, min: number, max: number) => {
    const n = num(x);
    return n === null || n < min || n > max ? def : n;
  };
  const com = v.comision_pct && typeof v.comision_pct === "object" ? (v.comision_pct as Record<string, unknown>) : {};
  const fij = v.fijos_por_tienda && typeof v.fijos_por_tienda === "object" ? (v.fijos_por_tienda as Record<string, unknown>) : {};
  const fijosPorTienda: Record<string, number> = {};
  for (const [k, x] of Object.entries(fij)) {
    const n = num(x);
    if (UUID.test(k) && n !== null && n >= 0) fijosPorTienda[k] = n;
  }
  return {
    envioPorOrden: en(v.envio_por_orden, d.envioPorOrden, 0, 1000),
    envioVueltaFactor: en(v.envio_vuelta_factor, d.envioVueltaFactor, 0, 5),
    perdidaDevolucionPct: en(v.perdida_devolucion_pct, d.perdidaDevolucionPct, 0, 100),
    margenObjetivoPct: en(v.margen_objetivo_pct, d.margenObjetivoPct, 0, 90),
    comisionPct: Object.fromEntries(METODOS_PAGO.map((m) => [m, en(com[m], d.comisionPct[m], 0, 50)])) as Record<MetodoPago, number>,
    fijosPorTienda,
  };
}

/** Lo que manda el formulario de supuestos, validado; el error dice qué campo está mal. */
export function validarSupuestosUE(entrada: unknown, tiendasValidas: string[]): { error: string } | { valor: Record<string, unknown>; supuestos: SupuestosUE } {
  const e = entrada && typeof entrada === "object" ? (entrada as Record<string, unknown>) : {};
  const rango = (x: unknown, nombre: string, min: number, max: number): number | string => {
    const n = num(x);
    if (n === null || n < min || n > max) return `${nombre}: entre ${min} y ${max}.`;
    return Math.round(n * 10_000) / 10_000;
  };
  const campos: [string, unknown, string, number, number][] = [
    ["envio_por_orden", e.envioPorOrden, "Envío por orden", 0, 1000],
    ["envio_vuelta_factor", e.envioVueltaFactor, "Vuelta de una devolución", 0, 5],
    ["perdida_devolucion_pct", e.perdidaDevolucionPct, "Producto perdido en una devolución", 0, 100],
    ["margen_objetivo_pct", e.margenObjetivoPct, "Margen objetivo", 0, 90],
  ];
  const valor: Record<string, unknown> = {};
  for (const [clave, x, nombre, min, max] of campos) {
    const r = rango(x, nombre, min, max);
    if (typeof r === "string") return { error: r };
    valor[clave] = r;
  }
  const com = e.comisionPct && typeof e.comisionPct === "object" ? (e.comisionPct as Record<string, unknown>) : {};
  const comision: Record<string, number> = {};
  for (const m of METODOS_PAGO) {
    const r = rango(com[m] ?? 0, `Comisión ${ETIQUETA_METODO[m]}`, 0, 50);
    if (typeof r === "string") return { error: r };
    comision[m] = r;
  }
  valor.comision_pct = comision;
  const fij = e.fijosPorTienda && typeof e.fijosPorTienda === "object" ? (e.fijosPorTienda as Record<string, unknown>) : {};
  const validas = new Set(tiendasValidas);
  const fijos: Record<string, number> = {};
  for (const [k, x] of Object.entries(fij)) {
    if (x === null || x === undefined || (typeof x === "string" && x.trim() === "")) continue;
    if (!validas.has(k)) return { error: "Tienda desconocida en los fijos." };
    const r = rango(x, "Fijos por mes", 0, 10_000_000);
    if (typeof r === "string") return { error: r };
    fijos[k] = r;
  }
  valor.fijos_por_tienda = fijos;
  return { valor, supuestos: leerSupuestosUE(valor) };
}

// ---------------------------------------------------------------------------------------------
// Filas sumadas (fin_ue_agrupado)
// ---------------------------------------------------------------------------------------------

export interface FilaUE {
  clave: string;
  etiqueta: string;
  ordenes: number;
  enviadas: number;
  entregadas: number;
  devueltas: number;
  /** Órdenes con margen real negativo. */
  pierden: number;
  /** Órdenes que usan el envío supuesto. */
  envioSupuesto: number;
  unidadesEntregadas: number;
  unidadesDevueltas: number;
  ventas: number;
  mercancia: number;
  envio: number;
  /** El envío de ida de las devueltas (ya dentro de `envio`). */
  envioDevueltas: number;
  /** Vuelta + producto perdido de las devueltas. */
  devolucion: number;
  comision: number;
  marketing: number;
  margen: number;
  meses: number;
  /** Margen de las órdenes que pierden plata (negativo). */
  perdida: number;
}

const n0 = (v: unknown) => num(v) ?? 0;

export function filaUE(r: Record<string, unknown>): FilaUE {
  return {
    clave: String(r.clave ?? ""),
    etiqueta: String(r.etiqueta ?? r.clave ?? ""),
    ordenes: n0(r.ordenes),
    enviadas: n0(r.enviadas),
    entregadas: n0(r.entregadas),
    devueltas: n0(r.devueltas),
    pierden: n0(r.pierden),
    envioSupuesto: n0(r.envio_supuesto),
    unidadesEntregadas: n0(r.unidades_entregadas),
    unidadesDevueltas: n0(r.unidades_devueltas),
    ventas: n0(r.ventas),
    mercancia: n0(r.mercancia),
    envio: n0(r.envio),
    envioDevueltas: n0(r.envio_devueltas),
    devolucion: n0(r.devolucion),
    comision: n0(r.comision),
    marketing: n0(r.marketing),
    margen: n0(r.margen),
    meses: n0(r.meses),
    perdida: n0(r.perdida),
  };
}

export function sumarFilasUE(filas: FilaUE[], clave = "total", etiqueta = "Total"): FilaUE {
  const t: FilaUE = { ...filaUE({}), clave, etiqueta };
  const campos = [
    "ordenes", "enviadas", "entregadas", "devueltas", "pierden", "envioSupuesto", "unidadesEntregadas", "unidadesDevueltas", "ventas",
    "mercancia", "envio", "envioDevueltas", "devolucion", "comision", "marketing", "margen", "perdida",
  ] as const;
  for (const f of filas) for (const c of campos) t[c] += f[c];
  t.meses = Math.max(0, ...filas.map((f) => f.meses));
  return t;
}

const div = (a: number, b: number): number | null => (b ? a / b : null);

export interface DerivadosUE {
  /** Entregadas ÷ enviadas (0–1). */
  tasaEntrega: number | null;
  /** Margen ÷ ventas, en % (0–100). */
  margenPct: number | null;
  /** Margen antes de marketing. */
  contribucion: number;
  margenPorOrden: number | null;
  margenPorEntregada: number | null;
  ticket: number | null;
  /** Precio de venta por unidad entregada. */
  precioUnidad: number | null;
  /** Envío de ida + vuelta + producto perdido, por devuelta. */
  costoPorDevolucion: number | null;
  costoDevoluciones: number;
  /** Comisión ÷ ventas (0–1). */
  tasaComision: number | null;
}

export function derivados(f: FilaUE): DerivadosUE {
  const costoDevoluciones = f.envioDevueltas + f.devolucion;
  const margenPct = div(f.margen, f.ventas);
  return {
    tasaEntrega: div(f.entregadas, f.enviadas),
    margenPct: margenPct === null ? null : margenPct * 100,
    contribucion: f.margen + f.marketing,
    margenPorOrden: div(f.margen, f.ordenes),
    margenPorEntregada: div(f.margen, f.entregadas),
    ticket: div(f.ventas, f.entregadas),
    precioUnidad: div(f.ventas, f.unidadesEntregadas),
    costoPorDevolucion: div(costoDevoluciones, f.devueltas),
    costoDevoluciones,
    tasaComision: div(f.comision, f.ventas),
  };
}

/**
 * Cuánto cambiaría el margen si la tasa de entrega llegara a `tasaReferencia` con las mismas enviadas: cada devuelta que
 * pasa a entregada aporta lo que deja una entregada (ventas − mercancía − comisión; el envío ya se pagó) y ahorra la
 * vuelta y el producto perdido. Positivo = lo que se gana; negativo si la referencia es más baja.
 */
export function efectoTasa(f: FilaUE, tasaReferencia: number | null): number | null {
  const tasa = div(f.entregadas, f.enviadas);
  if (tasa === null || tasaReferencia === null || !f.entregadas) return null;
  const porEntregada = (f.ventas - f.mercancia - f.comision) / f.entregadas;
  const porDevuelta = f.devueltas ? f.devolucion / f.devueltas : 0;
  return (tasaReferencia - tasa) * f.enviadas * (porEntregada + porDevuelta);
}

/**
 * Precio mínimo por unidad para dejar el margen objetivo: todo lo que cuesta llevar una unidad entregada (mercancía, envío
 * de todas las enviadas, devoluciones y marketing, ÷ unidades entregadas) = C; con comisión c y objetivo m (fracciones),
 * p = C ÷ (1 − c − m). null sin unidades entregadas o si c + m ≥ 1.
 */
export function precioMinimo(f: FilaUE, margenObjetivoPct: number, tasaComisionRef = 0): number | null {
  if (!f.unidadesEntregadas) return null;
  const costo = (f.mercancia + f.envio + f.devolucion + f.marketing) / f.unidadesEntregadas;
  const c = div(f.comision, f.ventas) ?? tasaComisionRef;
  const m = margenObjetivoPct / 100;
  if (c + m >= 1) return null;
  return costo / (1 - c - m);
}

export type AccionProducto = "mantener" | "subir_precio" | "revisar_envio" | "revisar_marketing" | "retirar";

export const ETIQUETA_ACCION_PRODUCTO: Record<AccionProducto, string> = {
  mantener: "Mantener",
  subir_precio: "Subir precio",
  revisar_envio: "Revisar envío",
  revisar_marketing: "Revisar marketing",
  retirar: "Retirar",
};

export interface Recomendacion {
  accion: AccionProducto;
  /** Lo que hay que cambiar, en dólares (subir el precio $X; con la tasa de referencia ganaría $X). */
  monto: number | null;
  /** El precio mínimo por unidad, si se pudo calcular. */
  precioMinimo: number | null;
}

/** Subir el precio más que esto ya no es «ajustar»: es otro producto. */
export const SUBIDA_MAXIMA = 0.25;
/** Una tasa de entrega 10 pp por debajo de la de su tienda es un problema de envío o de zona. */
export const BRECHA_TASA = 0.1;
/** Marketing por encima del 35 % de las ventas: la publicidad se come el margen. */
export const MARKETING_ALTO = 0.35;

/**
 * Qué hacer con un producto. Con el margen objetivo alcanzado, mantener. Si la tasa de entrega está muy por debajo de la de
 * referencia y llegando a ella deja de perder, revisar el envío. Si el precio mínimo está a menos de un 25 % del actual,
 * subir el precio. Si antes de marketing gana y el marketing pasa del 35 % de las ventas, revisar el marketing. Si no,
 * retirar.
 */
export function recomendar(f: FilaUE, s: Pick<SupuestosUE, "margenObjetivoPct">, tasaReferencia: number | null): Recomendacion {
  const d = derivados(f);
  const pmin = precioMinimo(f, s.margenObjetivoPct);
  if (d.margenPct !== null && d.margenPct >= s.margenObjetivoPct) return { accion: "mantener", monto: null, precioMinimo: pmin };
  const efecto = efectoTasa(f, tasaReferencia);
  if (d.tasaEntrega !== null && tasaReferencia !== null && d.tasaEntrega < tasaReferencia - BRECHA_TASA && efecto !== null && f.margen + efecto >= 0) {
    return { accion: "revisar_envio", monto: efecto, precioMinimo: pmin };
  }
  if (pmin !== null && d.precioUnidad !== null && d.precioUnidad > 0 && (pmin - d.precioUnidad) / d.precioUnidad <= SUBIDA_MAXIMA) {
    return { accion: "subir_precio", monto: Math.max(0, pmin - d.precioUnidad), precioMinimo: pmin };
  }
  if (d.contribucion > 0 && f.ventas > 0 && f.marketing / f.ventas > MARKETING_ALTO) {
    // Lo que habría que bajar el marketing para llegar al margen objetivo.
    return { accion: "revisar_marketing", monto: Math.max(0, (s.margenObjetivoPct / 100) * f.ventas - f.margen), precioMinimo: pmin };
  }
  return { accion: "retirar", monto: f.margen < 0 ? -f.margen : null, precioMinimo: pmin };
}

/** Los productos que destruyen margen (pierden plata o quedan bajo el objetivo), del que más pierde. */
export function rankingDestruyen(filas: FilaUE[], margenObjetivoPct: number): FilaUE[] {
  return filas
    .filter((f) => f.enviadas > 0 && (f.margen < 0 || (f.ventas > 0 && (100 * f.margen) / f.ventas < margenObjetivoPct)))
    .sort((a, b) => a.margen - b.margen || b.ordenes - a.ordenes);
}

/**
 * «Destruyen margen» en dos grupos que no se leen igual: los que se enviaron y no se entregó ninguno (solo costo de envío
 * y devolución, sin ventas) y los que pierden o quedan bajo el objetivo con entregas (precio, costo o marketing).
 */
export function separarDestruyen(filas: FilaUE[], margenObjetivoPct: number): { sinEntregas: FilaUE[]; conEntregas: FilaUE[] } {
  const todos = rankingDestruyen(filas, margenObjetivoPct);
  return {
    sinEntregas: todos.filter((f) => f.entregadas <= 0 && f.unidadesEntregadas <= 0),
    conEntregas: todos.filter((f) => f.entregadas > 0 || f.unidadesEntregadas > 0),
  };
}

// ---------------------------------------------------------------------------------------------
// Simulador de precio
// ---------------------------------------------------------------------------------------------

export interface BaseSimulador {
  /** Precio actual por unidad. */
  precio: number;
  /** Unidades entregadas en el período. */
  unidades: number;
  /** Costo variable por unidad entregada (mercancía, envío y devoluciones), sin la comisión ni el marketing. */
  costoUnidad: number;
  /** Comisión de cobro (fracción del precio). */
  tasaComision: number;
  /** Marketing del período: se toma como fijo (la misma pauta). */
  marketing: number;
}

export function baseSimulador(f: FilaUE): BaseSimulador | null {
  if (!f.unidadesEntregadas || f.ventas <= 0) return null;
  return {
    precio: f.ventas / f.unidadesEntregadas,
    unidades: f.unidadesEntregadas,
    costoUnidad: (f.mercancia + f.envio + f.devolucion) / f.unidadesEntregadas,
    tasaComision: f.comision / f.ventas,
    marketing: f.marketing,
  };
}

export interface Simulacion {
  precio: number;
  unidades: number;
  utilidad: number;
  /** Utilidad nueva − actual. */
  diferencia: number;
}

/**
 * La utilidad con el precio cambiado en `delta` dólares. Con elasticidad e (≤ 0 lo normal: −1,5 = si el precio sube 10 %, las
 * unidades bajan 15 %), unidades' = unidades × (1 + e × Δp/p), nunca menos de cero. Sin elasticidad, las mismas unidades.
 */
export function simularPrecio(b: BaseSimulador, delta: number, elasticidad = 0): Simulacion {
  const utilidad = (precio: number, unidades: number) => unidades * (precio * (1 - b.tasaComision) - b.costoUnidad) - b.marketing;
  const actual = utilidad(b.precio, b.unidades);
  const precio = Math.max(0, b.precio + delta);
  const unidades = Math.max(0, b.unidades * (1 + (elasticidad * (precio - b.precio)) / b.precio));
  const nueva = utilidad(precio, unidades);
  return { precio, unidades, utilidad: nueva, diferencia: nueva - actual };
}

/** La curva del simulador: la utilidad para cambios de precio de −rango a +rango en `pasos` saltos. */
export function curvaPrecio(b: BaseSimulador, rango: number, elasticidad = 0, pasos = 10): Simulacion[] {
  const paso = (2 * rango) / pasos;
  return Array.from({ length: pasos + 1 }, (_, i) => simularPrecio(b, -rango + i * paso, elasticidad));
}

// ---------------------------------------------------------------------------------------------
// Equilibrio y contribución por tienda
// ---------------------------------------------------------------------------------------------

export type AccionTienda = "cerrar" | "mantener" | "escalar";

export const ETIQUETA_ACCION_TIENDA: Record<AccionTienda, string> = { cerrar: "Cerrar", mantener: "Mantener", escalar: "Escalar" };

export interface EquilibrioTienda {
  ordenesMes: number;
  margenPorOrden: number | null;
  /** Margen real del mes (después de marketing, antes de fijos). */
  contribucionMes: number;
  fijosMes: number;
  /** De dónde salen los fijos. */
  fijosOrigen: "supuesto" | "libro";
  /** Órdenes por mes para cubrir los fijos (null: cada orden pierde plata, no se alcanza). */
  ordenesEquilibrio: number | null;
  despuesDeFijos: number;
  accion: AccionTienda;
}

/**
 * Por tienda, con todo en promedio mensual: órdenes para cubrir sus fijos = fijos ÷ margen por orden. Cerrar si cada orden
 * pierde plata; escalar si después de los fijos gana y su margen llega al objetivo; si no, mantener (y ajustar).
 */
export function equilibrioTienda(f: FilaUE, administracionMes: number, s: Pick<SupuestosUE, "fijosPorTienda" | "margenObjetivoPct">): EquilibrioTienda {
  const meses = Math.max(1, f.meses);
  const manual = s.fijosPorTienda[f.clave];
  const fijosMes = manual ?? administracionMes;
  const ordenesMes = f.ordenes / meses;
  const contribucionMes = f.margen / meses;
  const margenPorOrden = div(f.margen, f.ordenes);
  const despuesDeFijos = contribucionMes - fijosMes;
  const margenPct = div(f.margen, f.ventas);
  const accion: AccionTienda =
    f.margen < 0 ? "cerrar" : despuesDeFijos > 0 && margenPct !== null && margenPct * 100 >= s.margenObjetivoPct ? "escalar" : "mantener";
  return {
    ordenesMes,
    margenPorOrden,
    contribucionMes,
    fijosMes,
    fijosOrigen: manual === undefined ? "libro" : "supuesto",
    ordenesEquilibrio: margenPorOrden !== null && margenPorOrden > 0 ? fijosMes / margenPorOrden : null,
    despuesDeFijos,
    accion,
  };
}

// ---------------------------------------------------------------------------------------------
// Marketing: CAC y ROAS de margen por campaña
// ---------------------------------------------------------------------------------------------

export interface ObjetivoCampana {
  /** Entregadas ÷ enviadas del producto o la tienda. */
  tasaEntrega: number | null;
  /** Margen antes de marketing por orden entregada del producto o la tienda. */
  contribucionPorEntregada: number | null;
}

/**
 * ROAS de margen de una campaña: lo que dejan sus compras ÷ su gasto. Las compras que reporta Meta no son todas
 * entregadas: se multiplican por la tasa de entrega y por el margen antes de marketing de una entregada de su producto (o,
 * si la campaña es de toda la tienda, de la tienda). null sin gasto o sin margen de referencia.
 */
export function roasMargenCampana(gasto: number, compras: number, o: ObjetivoCampana): number | null {
  if (gasto <= 0 || o.tasaEntrega === null || o.contribucionPorEntregada === null) return null;
  return (compras * o.tasaEntrega * o.contribucionPorEntregada) / gasto;
}

export function objetivoDe(f: FilaUE | undefined): ObjetivoCampana {
  if (!f) return { tasaEntrega: null, contribucionPorEntregada: null };
  return { tasaEntrega: div(f.entregadas, f.enviadas), contribucionPorEntregada: div(f.margen + f.marketing, f.entregadas) };
}

/** Costo por orden y por entregada de un gasto (CAC operativo). */
export const cacPor = (gasto: number, cuantas: number): number | null => (gasto > 0 && cuantas > 0 ? gasto / cuantas : null);

// ---------------------------------------------------------------------------------------------
// Filas listas para las tablas (serializables: cruzan de la página al cliente)
// ---------------------------------------------------------------------------------------------

export interface FilaVistaUE extends FilaUE, DerivadosUE {
  id: string;
  /** Margen que cambiaría con la tasa de entrega de referencia. */
  efectoTasa: number | null;
  precioMinimo: number | null;
  accion: AccionProducto;
  /** Subir el precio $X, ganaría $X con la tasa de referencia, bajar el marketing $X, pierde $X. */
  montoAccion: number | null;
}

export function filaVista(f: FilaUE, s: Pick<SupuestosUE, "margenObjetivoPct">, tasaReferencia: number | null, etiqueta?: string): FilaVistaUE {
  const r = recomendar(f, s, tasaReferencia);
  return {
    ...f,
    ...derivados(f),
    id: f.clave,
    etiqueta: etiqueta ?? f.etiqueta,
    efectoTasa: efectoTasa(f, tasaReferencia),
    precioMinimo: r.precioMinimo,
    accion: r.accion,
    montoAccion: r.monto,
  };
}
