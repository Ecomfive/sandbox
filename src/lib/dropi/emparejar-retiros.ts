// Concilia los retiros que reporta Dropi con los que creó el equipo.
// Dropi nunca crea retiros: solo se vincula al retiro cuyo correlativo (#0007)
// aparece en el concepto que Dropi devuelve.

export type EstadoDropi = "pendiente" | "aprobado" | "rechazado" | "cancelado";

export const ETIQUETA_ESTADO_DROPI: Record<EstadoDropi, string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
};

export const TONO_ESTADO_DROPI: Record<EstadoDropi, "info" | "success" | "destructive"> = {
  pendiente: "info",
  aprobado: "success",
  rechazado: "destructive",
  cancelado: "destructive",
};

export type MotivoSinVincular = "sin_correlativo" | "no_existe" | "duplicado";

export const ETIQUETA_MOTIVO: Record<MotivoSinVincular, string> = {
  sin_correlativo: "El concepto no trae un correlativo (#0007)",
  no_existe: "No hay un retiro con ese correlativo",
  duplicado: "Ese retiro ya está vinculado a otro retiro de Dropi",
};

export interface RetiroDropi {
  dropiId: number;
  monto: number;
  fecha: string;
  banco: string | null;
  estado: EstadoDropi;
  concepto: string | null;
}

export interface RetiroLocal {
  id: string;
  correlativo: number;
  dropiId: number | null;
  estadoDropi: EstadoDropi | null;
  monto: number;
  /** Estado interno actual del retiro (abierto/novedad/cerrado/cancelado). */
  estado: string;
}

export interface Actualizacion {
  retiroId: string;
  correlativo: number;
  dropiId: number;
  banco: string | null;
  estadoDropi: EstadoDropi;
  vinculadoAhora: boolean;
  cambioEstado: boolean;
  /** Dropi rechazó (o canceló) el retiro y seguía abierto acá: se marca como novedad para
   * revisarlo a mano. Nunca se cancela solo — cancelar sigue siendo una acción manual. */
  marcarNovedad: boolean;
  montoDropi: number;
  montoRetiro: number;
}

export interface SinVincular {
  retiro: RetiroDropi;
  motivo: MotivoSinVincular;
  correlativo: number | null;
}

export interface ResultadoEmparejar {
  actualizaciones: Actualizacion[];
  sinVincular: SinVincular[];
}

export function mapearEstadoDropi(status: string): EstadoDropi {
  const normalizado = status.trim().toUpperCase();
  if (normalizado === "APROBADO") return "aprobado";
  if (normalizado === "RECHAZADO") return "rechazado";
  if (normalizado === "CANCELADO") return "cancelado";
  return "pendiente";
}

/** "Retiro #0007 semanal" -> 7. Solo cuenta un número precedido por #. */
export function extraerCorrelativo(concepto: string | null): number | null {
  if (!concepto) return null;
  const coincidencia = /#\s*(\d{1,9})(?!\d)/.exec(concepto);
  if (!coincidencia) return null;
  const numero = Number(coincidencia[1]);
  return numero >= 1 ? numero : null;
}

/**
 * Cada retiro de Dropi se vincula al retiro creado con el mismo correlativo. Si el concepto no
 * trae correlativo, el retiro no existe, o ya está vinculado a otro retiro de Dropi, no se toca
 * nada y queda en "sin vincular". Los retiros ya vinculados solo se refrescan.
 */
export function emparejarRetiros(dropi: RetiroDropi[], locales: RetiroLocal[]): ResultadoEmparejar {
  const porCorrelativo = new Map(locales.map((local) => [local.correlativo, local]));
  const reclamados = new Set<string>();
  const resultado: ResultadoEmparejar = { actualizaciones: [], sinVincular: [] };
  const ordenados = [...dropi].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.dropiId - b.dropiId);

  for (const retiro of ordenados) {
    const correlativo = extraerCorrelativo(retiro.concepto);
    if (correlativo === null) {
      resultado.sinVincular.push({ retiro, motivo: "sin_correlativo", correlativo });
      continue;
    }
    const local = porCorrelativo.get(correlativo);
    if (!local) {
      resultado.sinVincular.push({ retiro, motivo: "no_existe", correlativo });
      continue;
    }
    const tomadoPorOtro = local.dropiId !== null && local.dropiId !== retiro.dropiId;
    if (tomadoPorOtro || reclamados.has(local.id)) {
      resultado.sinVincular.push({ retiro, motivo: "duplicado", correlativo });
      continue;
    }

    reclamados.add(local.id);
    resultado.actualizaciones.push({
      retiroId: local.id,
      correlativo,
      dropiId: retiro.dropiId,
      banco: retiro.banco,
      estadoDropi: retiro.estado,
      vinculadoAhora: local.dropiId === null,
      cambioEstado: local.estadoDropi !== retiro.estado,
      marcarNovedad: (retiro.estado === "rechazado" || retiro.estado === "cancelado") && local.estado === "abierto",
      montoDropi: retiro.monto,
      montoRetiro: local.monto,
    });
  }
  return resultado;
}
