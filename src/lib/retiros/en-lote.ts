import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntradaAuditoria } from "../auditoria";
import { ESTADO_ETIQUETA } from "./estados";

/** Estados a los que se puede pasar un grupo de retiros. La columna Estado de la tabla es de solo lectura: esta
 * barra es la única forma de mover la etiqueta a mano. «cancelado» y eliminar quedan fuera a propósito (no se
 * deshacen), y conciliar pide el monto recibido y el comprobante de cada retiro. */
export const ESTADOS_EN_LOTE = ["abierto", "novedad", "cerrado"] as const;
export type EstadoEnLote = (typeof ESTADOS_EN_LOTE)[number];

/** Tope por vez: los ids viajan en la dirección de la consulta y esta debe caber en la que aceptan los servidores. */
export const MAX_LOTE = 100;

export function esEstadoEnLote(valor: string): valor is EstadoEnLote {
  return (ESTADOS_EN_LOTE as readonly string[]).includes(valor);
}

const etiqueta = (estado: string) => ESTADO_ETIQUETA[estado] ?? estado;

export interface PlanLote {
  /** Los que sí cambian. */
  cambiar: string[];
  /** Los que ya estaban en ese estado. */
  yaEstaban: number;
  /** Los cancelados: su estado no se toca desde aquí. */
  cancelados: number;
}

/** Qué pasaría con cada retiro si se pasan todos a `nuevo`. Sirve igual para avisar antes y para actuar. */
export function planearCambioEstado(filas: { id: string; estado: string }[], nuevo: EstadoEnLote): PlanLote {
  const plan: PlanLote = { cambiar: [], yaEstaban: 0, cancelados: 0 };
  for (const fila of filas) {
    if (fila.estado === "cancelado") plan.cancelados++;
    else if (fila.estado === nuevo) plan.yaEstaban++;
    else plan.cambiar.push(fila.id);
  }
  return plan;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Lo que queda sin cambiar, en una frase: «2 ya están en Cerrado, 1 cancelado no se toca». */
function frasesOmitidos(nuevo: EstadoEnLote, r: { yaEstaban: number; cancelados: number; noEncontrados?: number }): string[] {
  const frases: string[] = [];
  if (r.yaEstaban > 0) frases.push(`${r.yaEstaban} ${r.yaEstaban === 1 ? "ya está" : "ya están"} en ${etiqueta(nuevo)}`);
  if (r.cancelados > 0) frases.push(`${plural(r.cancelados, "cancelado no se toca", "cancelados no se tocan")}`);
  if (r.noEncontrados) frases.push(`${plural(r.noEncontrados, "ya no existe", "ya no existen")}`);
  return frases;
}

/** Texto de la confirmación, antes de cambiar nada. */
export function textoConfirmacion(nuevo: EstadoEnLote, seleccionados: number, plan: PlanLote): string {
  if (plan.cambiar.length === 0) {
    const porQue = frasesOmitidos(nuevo, plan).join(" y ");
    return `No hay nada que cambiar: ${porQue || "ninguno aplica"}.`;
  }
  const omitidos = frasesOmitidos(nuevo, plan);
  const base = `¿Pasar ${plural(plan.cambiar.length, "retiro", "retiros")} a ${etiqueta(nuevo)}?`;
  return omitidos.length > 0 && seleccionados > plan.cambiar.length ? `${base} (${omitidos.join(", ")}.)` : base;
}

export interface ResultadoLote {
  cambiados: number;
  yaEstaban: number;
  cancelados: number;
  noEncontrados: number;
  error?: string;
}

const SIN_RESULTADO: ResultadoLote = { cambiados: 0, yaEstaban: 0, cancelados: 0, noEncontrados: 0 };

/** El aviso que ve la persona al terminar. */
export function mensajeResultadoLote(
  nuevo: EstadoEnLote,
  r: ResultadoLote
): { mensaje: string; tono: "success" | "info" | "destructive" } {
  if (r.error) return { mensaje: r.error, tono: "destructive" };
  const omitidos = frasesOmitidos(nuevo, r);
  if (r.cambiados === 0) {
    return { mensaje: `No cambió ningún retiro${omitidos.length ? `: ${omitidos.join(", ")}` : ""}.`, tono: "info" };
  }
  const base = `${plural(r.cambiados, "retiro pasó", "retiros pasaron")} a ${etiqueta(nuevo)}`;
  return { mensaje: omitidos.length > 0 ? `${base} (${omitidos.join(", ")})` : base, tono: "success" };
}

/**
 * Pasa varios retiros a `nuevoEstado` de una vez: lee sus estados, decide cuáles cambian (`planearCambioEstado`),
 * los actualiza con una sola instrucción y deja, por cada retiro que cambió, su evento y su fila de auditoría
 * (acción `cambiar_estado_retiro`, con «En lote» en el detalle). No comprueba permisos: eso lo hace
 * quien la llama. Devuelve el error como valor (en producción Next.js oculta el mensaje de una excepción).
 */
export async function cambiarEstadoEnLote(
  supabase: SupabaseClient,
  ids: unknown,
  nuevoEstado: unknown,
  registrarAuditorias: (entradas: EntradaAuditoria[]) => Promise<void>
): Promise<ResultadoLote> {
  if (typeof nuevoEstado !== "string" || !esEstadoEnLote(nuevoEstado)) {
    return { ...SIN_RESULTADO, error: `Estado inválido: ${String(nuevoEstado)}` };
  }
  const unicos = Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === "string" && id !== ""))] : [];
  if (unicos.length === 0) return { ...SIN_RESULTADO, error: "No hay retiros seleccionados." };
  if (unicos.length > MAX_LOTE) {
    return { ...SIN_RESULTADO, error: `Máximo ${MAX_LOTE} retiros por vez (elegiste ${unicos.length}).` };
  }

  const { data, error: errorLectura } = await supabase.from("retiros").select("id, estado").in("id", unicos);
  if (errorLectura) return { ...SIN_RESULTADO, error: errorLectura.message };
  const encontrados = (data ?? []) as { id: string; estado: string }[];

  const plan = planearCambioEstado(encontrados, nuevoEstado);
  const omitidos = { yaEstaban: plan.yaEstaban, cancelados: plan.cancelados, noEncontrados: unicos.length - encontrados.length };
  if (plan.cambiar.length === 0) return { ...SIN_RESULTADO, ...omitidos };

  // Los filtros repiten lo leído: si otra persona canceló o cambió uno en el medio, ese no se pisa.
  const { data: actualizados, error } = await supabase
    .from("retiros")
    .update({ estado: nuevoEstado })
    .in("id", plan.cambiar)
    .neq("estado", "cancelado")
    .neq("estado", nuevoEstado)
    .select("id");
  if (error) return { ...SIN_RESULTADO, ...omitidos, error: error.message };

  const idsCambiados = new Set(((actualizados ?? []) as { id: string }[]).map((r) => r.id));
  const cambiados = encontrados.filter((f) => idsCambiados.has(f.id));
  if (cambiados.length > 0) {
    await supabase.from("retiro_eventos").insert(
      cambiados.map((f) => ({
        retiro_id: f.id,
        evento: `Estado cambiado a mano (en lote): ${etiqueta(f.estado)} → ${etiqueta(nuevoEstado)}`,
      }))
    );
    await registrarAuditorias(
      cambiados.map((f) => ({
        accion: "cambiar_estado_retiro",
        entidad: "retiros",
        entidadId: f.id,
        detalle: `En lote (${plural(cambiados.length, "retiro", "retiros")})`,
        antes: { Estado: etiqueta(f.estado) },
        despues: { Estado: etiqueta(nuevoEstado) },
      }))
    );
  }
  return { ...SIN_RESULTADO, ...omitidos, cambiados: cambiados.length };
}
