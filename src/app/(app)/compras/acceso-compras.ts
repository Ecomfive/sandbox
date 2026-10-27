// Compras › quién puede ver o tocar una compra por su id: su país (si la persona lo tiene limitado) y lo que su rol alcanza
// («Qué compras ve»: todas, asignadas o creadas). Lo usan las acciones de Compras y las otras pantallas que leen las mismas compras
// («Pagos a Shen Zhen», Tablero de Shen Zhen). La pantalla ya esconde lo que no se puede ver; esto es la barrera real. Solo servidor.

import { getUsuarioActual, type UsuarioActual } from "@/lib/auth";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { pestanaVisible } from "@/lib/permisos/afinado";
import { createServiceClient } from "@/lib/supabase/server";
import { dentroDelAlcance, ES_ALCANCE_LIMITADO, restriccionesDe } from "./permisos-compras";

export const SIN_ACCESO_PAIS = "No tienes acceso a las compras de ese país.";
export const SIN_ACCESO_COMPRA = "No tienes acceso a esta compra.";
export type CompraPais = { id: string; tipo: string; paises: { codigo: string } | { codigo: string }[] | null };
export const codigoDe = (c: CompraPais) => (c.tipo === "importacion" ? null : ((Array.isArray(c.paises) ? c.paises[0] : c.paises)?.codigo ?? null));

/**
 * El error si la persona no puede ver alguna de esas compras: por su país (si lo tiene limitado) o porque su rol solo le deja las que
 * tiene asignadas o creó; null si puede.
 */
export async function sinAccesoACompras(ids: string[], usuarioDado?: UsuarioActual | null): Promise<string | null> {
  const usuario = usuarioDado === undefined ? await getUsuarioActual() : usuarioDado;
  const permitidos = usuario?.paisesPermitidos ?? null;
  const alcance = restriccionesDe(usuario?.afinado.compras).alcance;
  if ((permitidos === null && !ES_ALCANCE_LIMITADO(alcance)) || ids.length === 0) return null;
  const { data } = await createServiceClient().from("wms_compras").select("id, tipo, paises(codigo), asignado_a, creado_por, responsable_nombre, creador_nombre").in("id", ids);
  const filas = (data ?? []) as unknown as (CompraPais & { asignado_a: string | null; creado_por: string | null; responsable_nombre: string | null; creador_nombre: string | null })[];
  if (filas.length !== new Set(ids).size) return "Compra no válida.";
  if (permitidos !== null && !filas.every((c) => puedeVerPais(permitidos, codigoDe(c)))) return SIN_ACCESO_PAIS;
  if (usuario && ES_ALCANCE_LIMITADO(alcance)) {
    const dentro = filas.every((c) => dentroDelAlcance(alcance, { asignadoId: c.asignado_a, creadoPorId: c.creado_por, responsableNombre: c.responsable_nombre, creadorNombre: c.creador_nombre }, usuario));
    if (!dentro) return SIN_ACCESO_COMPRA;
  }
  return null;
}

/**
 * Lo mismo, para una línea de producto de una compra. También cuando la persona ve todos los países: su alcance puede estar limitado
 * (auditoría del 27 oct 2026: antes, con todos los países, no se revisaba el alcance y se podían cambiar líneas de compras ajenas).
 */
export async function sinAccesoALinea(itemId: string): Promise<string | null> {
  const usuario = await getUsuarioActual();
  if (usuario?.paisesPermitidos == null && !ES_ALCANCE_LIMITADO(restriccionesDe(usuario?.afinado.compras).alcance)) return null;
  const { data } = await createServiceClient().from("wms_compra_items").select("compra_id").eq("id", itemId).maybeSingle();
  return data ? sinAccesoACompras([data.compra_id as string], usuario) : "Producto no válido.";
}

/**
 * El Tablero de Shen Zhen muestra todos los pedidos de Shen Zhen (es el espejo de su portal): no es para quien tiene la pestaña oculta
 * ni para quien solo ve las compras que tiene asignadas o creó (auditoría del 27 oct 2026). El aviso, o null si puede.
 */
export function sinAccesoAlTablero(usuario: UsuarioActual): string | null {
  if (!pestanaVisible(usuario.afinado.compras, "tablero-chin")) return "El Tablero de Shen Zhen no está disponible para tu rol.";
  if (ES_ALCANCE_LIMITADO(restriccionesDe(usuario.afinado.compras).alcance)) return "El Tablero de Shen Zhen muestra todas las compras de Shen Zhen y tu rol solo ve las tuyas.";
  return null;
}
