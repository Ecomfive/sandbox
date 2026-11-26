// Lo que pone en rojo el menú (26 nov 2026, pedido de Dirección: «Avisos» pasaba desapercibido): un pedido de inventario o mercancía que llegó a puerto, mientras la persona no lo haya visto.
// Se deja de ver en rojo al marcar el aviso leído o al entrar a la pantalla donde se atiende. Con prueba.

import type { SupabaseClient } from "@supabase/supabase-js";
import { esAvisoDePuerto } from "./compras/llegadas-avisos";

/** Cuántos avisos sin leer hay de cada cosa. */
export interface Urgentes {
  /** Pedidos que le llegan a inventario (se atienden en «Comunicación despacho»). */
  pedidos: number;
  /** Respuestas sobre sus pedidos a quien los hizo (se ven en «Inventario despacho › Solicitud de inventario»). */
  solicitudes: number;
  /** Mercancía que llegó a puerto («Llegadas a puerto»). */
  llegadas: number;
}

export type SeccionUrgente = keyof Urgentes;

export const SIN_URGENTES: Urgentes = { pedidos: 0, solicitudes: 0, llegadas: 0 };

/** Las direcciones que llevan los avisos de pedidos (la de despacho cambió de nombre el 25 nov 2026: los avisos guardados conservan la vieja). */
export const HREFS_DE_PEDIDOS: Record<Exclude<SeccionUrgente, "llegadas">, readonly string[]> = {
  pedidos: ["/inventario-pedidos-despacho"],
  solicitudes: ["/inventario-despacho/solicitudes", "/despacho-ciudad/pedir-inventario"],
};

/** La entrada del menú que se pone en rojo por cada cosa. */
export const MENU_DE_SECCION: Record<SeccionUrgente, string> = {
  pedidos: "/inventario-pedidos-despacho",
  solicitudes: "/inventario-despacho",
  llegadas: "/llegadas",
};

export const esSeccionUrgente = (v: unknown): v is SeccionUrgente => typeof v === "string" && Object.prototype.hasOwnProperty.call(MENU_DE_SECCION, v);

/** De qué es un aviso, o null si no pone nada en rojo. */
export function seccionDeAviso(a: { titulo: string; href: string }): SeccionUrgente | null {
  if (esAvisoDePuerto(a.titulo)) return "llegadas";
  if (HREFS_DE_PEDIDOS.pedidos.includes(a.href)) return "pedidos";
  if (HREFS_DE_PEDIDOS.solicitudes.includes(a.href)) return "solicitudes";
  return null;
}

export function contarUrgentes(avisos: readonly { titulo: string; href: string }[]): Urgentes {
  const u = { ...SIN_URGENTES };
  for (const a of avisos) {
    const s = seccionDeAviso(a);
    if (s) u[s] += 1;
  }
  return u;
}

export const hayUrgentes = (u: Urgentes): boolean => u.pedidos + u.solicitudes + u.llegadas > 0;

/** Cuántos hay en la entrada del menú de esa dirección (0 si esa entrada no se pone en rojo). */
export function urgentesDeMenu(u: Urgentes, href: string): number {
  const s = (Object.keys(MENU_DE_SECCION) as SeccionUrgente[]).find((k) => MENU_DE_SECCION[k] === href);
  return s ? u[s] : 0;
}

/** Lo que dice un lector de pantalla del botón en rojo: «Hay un pedido nuevo y llegó mercancía a puerto». */
export function textoDeUrgentes(u: Urgentes): string {
  const pedidos = u.pedidos + u.solicitudes;
  const partes = [pedidos === 1 ? "hay un aviso de pedido sin ver" : pedidos > 1 ? `hay ${pedidos} avisos de pedidos sin ver` : "", u.llegadas ? "llegó mercancía a puerto" : ""].filter(Boolean);
  if (!partes.length) return "";
  const t = partes.join(" y ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Los urgentes de una persona, de sus avisos «Para ti» sin leer. */
export async function leerUrgentes(supabase: SupabaseClient, usuarioId: string): Promise<Urgentes> {
  const { data } = await supabase
    .from("notificaciones_usuario")
    .select("titulo, href")
    .eq("usuario_id", usuarioId)
    .is("leida_en", null)
    .in("tipo", ["tarea", "llegada"])
    .order("creado_en", { ascending: false })
    .limit(500);
  return contarUrgentes((data ?? []) as { titulo: string; href: string }[]);
}
