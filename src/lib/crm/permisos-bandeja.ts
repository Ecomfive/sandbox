// Lo afinado de la Bandeja de WhatsApp por persona (catálogo `CATALOGO_CRM`, 28 oct 2026): qué puede hacer en un chat, si ve el
// teléfono y qué chats ve dentro de sus áreas. Las áreas salen de `areas.ts`; esto se aplica encima. Lógica pura, con prueba.
import { accionPermitida, alcanceDe, campoVisible, type Afinado } from "@/lib/permisos/afinado";

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
  verTelefono: boolean;
  /** `todas` = todos los chats de sus áreas; `mias-y-libres` = los que tiene a cargo y los que nadie tomó. */
  alcance: "todas" | "mias-y-libres";
}

/** Lo que se muestra en lugar del teléfono a quien no lo puede ver. */
export const TELEFONO_OCULTO = "Teléfono oculto";

const ETIQUETA_ACCION: Record<AccionBandeja, string> = {
  responder: "responder por WhatsApp",
  archivos: "mandar fotos, videos y documentos",
  notas: "dejar notas privadas",
  "pasar-area": "pasar chats a otra área",
  tomar: "tomar o soltar chats",
  resolver: "marcar chats resueltos",
};

export function permisosBandeja(afinado: Record<string, Afinado> | undefined): PermisosBandeja {
  const a = afinado?.[MODULO_CRM];
  const responder = accionPermitida(a, "responder");
  return {
    responder,
    archivos: responder && accionPermitida(a, "archivos"),
    notas: accionPermitida(a, "notas"),
    pasarArea: accionPermitida(a, "pasar-area"),
    tomar: accionPermitida(a, "tomar"),
    resolver: accionPermitida(a, "resolver"),
    verTelefono: campoVisible(a, "telefono"),
    alcance: alcanceDe(a) === "mias-y-libres" ? "mias-y-libres" : "todas",
  };
}

/** El aviso si lo afinado de la persona no le deja hacer esa acción en la bandeja, o null. */
export function accionBandejaBloqueada(afinado: Record<string, Afinado> | undefined, accion: AccionBandeja): string | null {
  const a = afinado?.[MODULO_CRM];
  const bloqueada = !accionPermitida(a, accion) || (accion === "archivos" && !accionPermitida(a, "responder"));
  return bloqueada ? `Tu acceso no incluye ${ETIQUETA_ACCION[accion]}. Lo da quien administra, en Usuarios y roles.` : null;
}

/** Si un chat entra en lo que la persona ve: con «los suyos y los libres», el que lleva otra persona no. */
export function chatEnAlcance(alcance: PermisosBandeja["alcance"], asignadaA: string | null, miId: string | undefined): boolean {
  return alcance === "todas" || !asignadaA || asignadaA === miId;
}
