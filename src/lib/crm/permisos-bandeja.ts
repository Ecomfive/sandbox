// Lo afinado de la Bandeja de WhatsApp por persona (catálogo `CATALOGO_CRM`, pedido de Hernán del 28 oct 2026, rehecho sobre main el
// 16 nov 2026): qué puede hacer en un chat y qué chats ve dentro de sus áreas. Las áreas salen de `areas.ts`; esto se aplica encima.
// Lógica pura, con prueba.
import { accionPermitida, alcanceDe, type Afinado } from "@/lib/permisos/afinado";

export const MODULO_CRM = "crm-dropshippers";

export type AccionBandeja = "responder" | "archivos" | "notas" | "pasar-area" | "tomar" | "resolver";

export interface PermisosBandeja {
  responder: boolean;
  /** Mandar fotos, videos y documentos (además de poder responder). */
  archivos: boolean;
  notas: boolean;
  pasarArea: boolean;
  tomar: boolean;
  resolver: boolean;
  /** `todas` = todos los chats de sus áreas; `mias-y-libres` = los que tiene a cargo y los que nadie tomó. */
  alcance: "todas" | "mias-y-libres";
}

/** Sin nada afinado: puede todo lo que su nivel en el módulo le deja. */
export const PERMISOS_BANDEJA_COMPLETOS: PermisosBandeja = { responder: true, archivos: true, notas: true, pasarArea: true, tomar: true, resolver: true, alcance: "todas" };

const ETIQUETA_ACCION: Record<AccionBandeja, string> = {
  responder: "responder por WhatsApp",
  archivos: "mandar fotos, videos y documentos",
  notas: "dejar notas privadas",
  "pasar-area": "pasar chats a otra área",
  tomar: "tomar, soltar o intervenir chats",
  resolver: "marcar chats resueltos, archivarlos o reabrirlos",
};

type ConAfinado = { afinado?: Record<string, Afinado> };

export function permisosBandeja(u: ConAfinado | null | undefined): PermisosBandeja {
  const a = u?.afinado?.[MODULO_CRM];
  const responder = accionPermitida(a, "responder");
  return {
    responder,
    archivos: responder && accionPermitida(a, "archivos"),
    notas: accionPermitida(a, "notas"),
    pasarArea: accionPermitida(a, "pasar-area"),
    tomar: accionPermitida(a, "tomar"),
    resolver: accionPermitida(a, "resolver"),
    alcance: alcanceDe(a) === "mias-y-libres" ? "mias-y-libres" : "todas",
  };
}

/** El aviso si lo afinado de la persona no le deja hacer esa acción en la bandeja, o null. Mandar archivos pide además poder responder. */
export function accionBandejaBloqueada(u: ConAfinado | null | undefined, accion: AccionBandeja): string | null {
  const a = u?.afinado?.[MODULO_CRM];
  const bloqueada = !accionPermitida(a, accion) || (accion === "archivos" && !accionPermitida(a, "responder"));
  return bloqueada ? `Tu acceso no incluye ${ETIQUETA_ACCION[accion]}. Lo da quien administra, en Usuarios y roles.` : null;
}

/** Si un chat entra en lo que la persona ve: con «los suyos y los libres», el que lleva otra persona no. */
export function chatEnAlcance(alcance: PermisosBandeja["alcance"], asignadaA: string | null, miId: string | undefined): boolean {
  return alcance === "todas" || !asignadaA || asignadaA === miId;
}

/** El id de quien mira si solo ve sus chats y los libres (para filtrar la consulta), o null si ve todos los de sus áreas. */
export function soloSuyosYLibres(u: (ConAfinado & { id?: string }) | null | undefined): string | null {
  if (!u?.id || !/^[0-9a-f-]{36}$/i.test(u.id)) return null;
  return permisosBandeja(u).alcance === "mias-y-libres" ? u.id : null;
}
