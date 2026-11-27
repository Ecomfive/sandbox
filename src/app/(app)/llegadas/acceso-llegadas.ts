import { EVENTO_DE_TIPO } from "@/lib/compras/llegadas-avisos";
import { destinatariosDe } from "@/lib/compras/llegadas-servidor";
import { esAdministrador } from "@/lib/permisos/acceso";
import type { createServiceClient } from "@/lib/supabase/server";
import type { UsuarioActual } from "@/lib/auth";
import { sinAccesoACompras } from "../compras/acceso-compras";

type Supabase = ReturnType<typeof createServiceClient>;

export interface AccesoAPuerto {
  /** Puede abrir la lista de llegadas a puerto. */
  ve: boolean;
  /** Recibe el aviso o tiene el módulo `llegadas` (ve todas las compras, sin el filtro de alcance de Compras). */
  esDestino: boolean;
  admin: boolean;
  /** Puede archivar lo recibido: quien recibe el aviso, un administrador o quien modifica `llegadas` o Compras (no quien solo lee). */
  puedeArchivar: boolean;
}

/**
 * Quién abre y gestiona las llegadas a puerto: quien tiene el módulo `llegadas` o recibe el aviso, un administrador o quien tiene Compras (este último, solo con el país y el alcance de sus compras).
 * Archivar lo recibido lo puede quien recibe el aviso, un administrador o quien modifica `llegadas` o Compras.
 */
export async function accesoAPuerto(supabase: Supabase, usuario: UsuarioActual): Promise<AccesoAPuerto> {
  const admin = esAdministrador(usuario);
  const conLlegadas = usuario.modulos.includes("llegadas");
  const conCompras = usuario.modulos.includes("compras");
  const recibeAviso = (await destinatariosDe(supabase, EVENTO_DE_TIPO.puerto)).includes(usuario.id);
  const esDestino = conLlegadas || recibeAviso;
  const escribe = (conLlegadas && !usuario.modulosSoloLectura.includes("llegadas")) || (conCompras && !usuario.modulosSoloLectura.includes("compras"));
  return { ve: esDestino || admin || conCompras, esDestino, admin, puedeArchivar: admin || recibeAviso || escribe };
}

/** El error en palabras si la persona no puede abrir las llegadas a puerto (o, con `compraIds`, no tiene esas compras en su alcance); null si puede. */
export async function motivoSinAccesoAPuerto(supabase: Supabase, usuario: UsuarioActual, compraIds: string[] = []): Promise<string | null> {
  const a = await accesoAPuerto(supabase, usuario);
  if (!a.ve) return "No tienes acceso a las llegadas a puerto.";
  if (!a.esDestino && !a.admin && compraIds.length > 0) return await sinAccesoACompras(compraIds, usuario);
  return null;
}
