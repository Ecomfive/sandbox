// «Registrar este cobro como ingreso de <tienda> en <cuenta>» (migración 0916). Lógica pura; prueba en `ingreso.test.ts`.
//
// El libro trae los ingresos por tienda y mes sin forma de pago (cuenta vacía, FLUJO = SI): el banco nunca cuadra con el
// libro. Cuando una línea de crédito del banco queda conciliada contra cobros, órdenes o deliverys, su monto se pasa de
// «sin forma de pago» (los cobros por depositar) a la cuenta del banco con DOS movimientos del tipo Ingresos, los dos con
// EERR = NO y FLUJO = SI: +monto en la cuenta y −monto sin cuenta (un reverso). El EERR y la caja total no cambian; el
// saldo del banco según el libro, sí. Ver el comentario de la migración 0916.

/** Lo que cubre la línea, con la tienda de cada parte (texto de la fuente o nombre de la unidad). */
export interface ParteIngreso {
  monto: number;
  /** El id de la unidad si ya se sabe (órdenes de las tiendas, deliverys por tienda). */
  unidadId?: string | null;
  /** Si no, el texto con que la fuente nombra la tienda («NUVO», «OFERFY/KENKU»). */
  tienda?: string | null;
}

export interface UnidadIngreso {
  id: string;
  nombre: string;
  /** Otros nombres de la tienda (los de la hoja de deliverys: OFERFY, NUVO…). */
  etiquetas?: string[];
}

const limpio = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");

/** La unidad del libro que nombra un texto («NUVO» → NUVO PAN). Ambiguo («OFERFY/KENKU») o desconocido: null. */
export function unidadDeTexto(texto: string | null | undefined, unidades: UnidadIngreso[]): UnidadIngreso | null {
  const t = limpio(texto ?? "");
  if (!t) return null;
  const nombres = (u: UnidadIngreso) => [u.nombre, u.nombre.replace(/ PAN$/i, ""), ...(u.etiquetas ?? [])].map(limpio).filter(Boolean);
  const exactas = unidades.filter((u) => nombres(u).includes(t));
  if (exactas.length === 1) return exactas[0];
  // «CALZADOS» → «CALZADOS O.»: el texto es el comienzo de un solo nombre.
  const empiezan = unidades.filter((u) => t.length >= 4 && nombres(u).some((n) => n.startsWith(t)));
  return empiezan.length === 1 ? empiezan[0] : null;
}

export interface Reparto {
  unidadId: string;
  monto: number;
}

const cent = (v: number) => Math.round(v * 100);

/**
 * Cuánto del depósito va a cada tienda: la suma de sus partes. Lo que no tiene tienda clara va a `sinAsignarId`. El total
 * es siempre el monto de la línea (lo que de verdad entró al banco): la diferencia de redondeo o de comisión la absorbe
 * la tienda con más monto.
 */
export function repartirIngreso(montoLinea: number, partes: ParteIngreso[], unidades: UnidadIngreso[], sinAsignarId: string): Reparto[] {
  if (montoLinea <= 0) return [];
  const porUnidad = new Map<string, number>();
  for (const p of partes) {
    const id = p.unidadId ?? unidadDeTexto(p.tienda, unidades)?.id ?? sinAsignarId;
    porUnidad.set(id, (porUnidad.get(id) ?? 0) + cent(Math.abs(p.monto)));
  }
  if (!porUnidad.size) porUnidad.set(sinAsignarId, 0);
  const lista = [...porUnidad].map(([unidadId, c]) => ({ unidadId, c })).sort((a, b) => b.c - a.c || a.unidadId.localeCompare(b.unidadId));
  const diferencia = cent(montoLinea) - lista.reduce((a, x) => a + x.c, 0);
  lista[0].c += diferencia;
  return lista.filter((x) => x.c > 0).map((x) => ({ unidadId: x.unidadId, monto: x.c / 100 }));
}

export const PREFIJO_INGRESO = "conc-ing:";
export const claveIngreso = (huellaLinea: string, unidadId: string, reverso: boolean) => `${PREFIJO_INGRESO}${huellaLinea}:${unidadId}${reverso ? ":rev" : ""}`;

export interface LineaIngreso {
  huella: string;
  fecha: string;
  cuentaId: string;
  cuenta: string;
  descripcion: string;
}

/** Los dos movimientos del libro por tienda: +monto en la cuenta del banco y −monto sin cuenta. */
export function movimientosIngreso(
  l: LineaIngreso,
  reparto: Reparto[],
  datos: { tipoIngresosId: string; usuarioId: string | null; hoy: string; ahora: string; origen: string },
) {
  const base = {
    periodo: `${l.fecha.slice(0, 7)}-01`,
    fecha_registro: datos.hoy,
    fecha_pago: l.fecha,
    tipo_id: datos.tipoIngresosId,
    en_eerr: false,
    en_flujo: true,
    origen: datos.origen,
    editado_a_mano: true,
    editado_por: datos.usuarioId,
    editado_en: datos.ahora,
    creado_por: datos.usuarioId,
  };
  const texto = `Cobro depositado en ${l.cuenta}: ${l.descripcion}`.slice(0, 480);
  return reparto.flatMap((r) => [
    { ...base, unidad_id: r.unidadId, descripcion: texto, monto: r.monto, cuenta_id: l.cuentaId, origen_clave: claveIngreso(l.huella, r.unidadId, false) },
    {
      ...base,
      unidad_id: r.unidadId,
      descripcion: `${texto} (sale de cobros por depositar)`.slice(0, 500),
      monto: -r.monto,
      cuenta_id: null,
      origen_clave: claveIngreso(l.huella, r.unidadId, true),
    },
  ]);
}

/** Las clases de pareja que son cobros de las tiendas (lo del libro ya tiene su cuenta). */
export const CLASES_INGRESO = new Set(["cobro", "orden", "delivery"]);

/** Si una línea se puede registrar como ingreso: crédito, conciliada, sin registrar y cubierta solo por cobros de tiendas. */
export function puedeRegistrarIngreso(l: { monto: number; estado: string; ingresoEn: string | null }, clasesConfirmadas: string[]): boolean {
  return l.monto > 0 && l.estado === "conciliada" && !l.ingresoEn && clasesConfirmadas.length > 0 && clasesConfirmadas.every((c) => CLASES_INGRESO.has(c));
}
