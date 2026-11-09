// Portal AF4 360° › Cierre de mes › Asientos de ajuste (migración 0927, `fin_ajustes_cierre`). Lógica pura: qué clases
// hay, cómo se valida un ajuste escrito a mano y qué líneas deja en `fin_movimientos` (origen «ajuste_cierre», EERR = SI,
// flujo = NO). Una reclasificación son dos líneas: sale del tipo y tienda de origen (monto negativo, un reverso) y entra
// al de destino. El efecto en el resultado lo calcula quien guarda con el signo de cada tipo. Prueba en
// `ajustes-cierre.test.ts`.

export const ORIGEN_AJUSTE_CIERRE = "ajuste_cierre";

export const CLASES_AJUSTE = ["provision", "devengo", "reclasificacion", "otro"] as const;
export type ClaseAjuste = (typeof CLASES_AJUSTE)[number];

export const ETIQUETA_CLASE_AJUSTE: Record<ClaseAjuste, string> = {
  provision: "Provisión",
  devengo: "Devengo",
  reclasificacion: "Reclasificación",
  otro: "Otro ajuste",
};

export const esClaseAjuste = (v: unknown): v is ClaseAjuste => typeof v === "string" && (CLASES_AJUSTE as readonly string[]).includes(v);

export type OrigenAjuste = "manual" | "provision_nomina" | "devengo";
export const ETIQUETA_ORIGEN_AJUSTE: Record<OrigenAjuste, string> = { manual: "A mano", provision_nomina: "Desde la nómina", devengo: "Gasto prepagado" };

export interface EntradaAjuste {
  clase: ClaseAjuste;
  concepto: string;
  unidadId: string;
  tipoId: string;
  /** Con signo: negativo = reverso (resta en su tipo). En una reclasificación, positivo. */
  monto: number;
  unidadDestinoId: string | null;
  tipoDestinoId: string | null;
  notas: string | null;
}

export interface LineaAjuste {
  unidadId: string;
  tipoId: string;
  monto: number;
  descripcion: string;
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Lee un monto escrito («1,250.50», «−300», «$ 40»). */
export function leerMonto(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[−–]/g, "-").replace(/[$\s,]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100) / 100;
}

/** Valida lo que llega del formulario de «Nuevo ajuste». */
export function validarAjuste(d: Record<string, unknown>): { error: string } | EntradaAjuste {
  const clase = d.clase;
  if (!esClaseAjuste(clase)) return { error: "Elige la clase de ajuste." };
  const concepto = texto(d.concepto, 200);
  if (!concepto) return { error: "Escribe el concepto del ajuste." };
  const unidadId = texto(d.unidad_id, 40);
  const tipoId = texto(d.tipo_id, 40);
  if (!ES_UUID.test(unidadId)) return { error: "Elige la tienda." };
  if (!ES_UUID.test(tipoId)) return { error: "Elige el tipo." };
  const monto = leerMonto(d.monto);
  if (monto === null || monto === 0) return { error: "Escribe un monto distinto de cero." };
  if (Math.abs(monto) > 10_000_000) return { error: "El monto es demasiado grande." };
  let unidadDestinoId: string | null = null;
  let tipoDestinoId: string | null = null;
  if (clase === "reclasificacion") {
    if (monto < 0) return { error: "En una reclasificación el monto va en positivo: es lo que pasa del origen al destino." };
    unidadDestinoId = texto(d.unidad_destino_id, 40) || unidadId;
    tipoDestinoId = texto(d.tipo_destino_id, 40) || tipoId;
    if (!ES_UUID.test(unidadDestinoId) || !ES_UUID.test(tipoDestinoId)) return { error: "Elige el destino de la reclasificación." };
    if (unidadDestinoId === unidadId && tipoDestinoId === tipoId) return { error: "El destino debe ser otro tipo u otra tienda." };
  }
  return { clase, concepto, unidadId, tipoId, monto, unidadDestinoId, tipoDestinoId, notas: texto(d.notas, 1000) || null };
}

/** Las líneas que el ajuste deja en el libro. */
export function lineasDeAjuste(e: EntradaAjuste): LineaAjuste[] {
  if (e.clase === "reclasificacion" && e.unidadDestinoId && e.tipoDestinoId) {
    return [
      { unidadId: e.unidadId, tipoId: e.tipoId, monto: -Math.abs(e.monto), descripcion: `Reclasificación (sale): ${e.concepto}` },
      { unidadId: e.unidadDestinoId, tipoId: e.tipoDestinoId, monto: Math.abs(e.monto), descripcion: `Reclasificación (entra): ${e.concepto}` },
    ];
  }
  return [{ unidadId: e.unidadId, tipoId: e.tipoId, monto: e.monto, descripcion: `${ETIQUETA_CLASE_AJUSTE[e.clase]}: ${e.concepto}` }];
}

/** Efecto en el resultado de unas líneas (monto × signo del tipo; un tipo desconocido cuenta como gasto). */
export function efectoLineas(lineas: Pick<LineaAjuste, "tipoId" | "monto">[], signos: Map<string, number>): number {
  return Math.round(lineas.reduce((a, l) => a + l.monto * (signos.get(l.tipoId) ?? -1), 0) * 100) / 100;
}

/** La fila de `fin_movimientos` de una línea (la huella `origen_clave` la hace única por ajuste). */
export function filaMovimiento(l: LineaAjuste, i: number, ajusteId: string, periodo: string, usuarioId: string | null, hoy: string) {
  return {
    periodo,
    fecha_registro: hoy,
    unidad_id: l.unidadId,
    tipo_id: l.tipoId,
    descripcion: l.descripcion.slice(0, 300),
    monto: l.monto,
    en_eerr: true,
    en_flujo: false,
    origen: ORIGEN_AJUSTE_CIERRE,
    origen_clave: `ajuste:${ajusteId}:${i + 1}`,
    ajuste_id: ajusteId,
    creado_por: usuarioId,
  };
}
