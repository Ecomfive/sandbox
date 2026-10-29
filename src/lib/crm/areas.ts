/**
 * Áreas del CRM de dropshippers. Es un solo CRM; lo que cambia es quién ve qué:
 *  - Atención (módulo `crm-dropshippers`): casos, pedidos y sus propias notas.
 *  - Comercial (módulo `crm-comercial`): además sus notas privadas, sus seguimientos y la captación. Ve también lo de
 *    Atención.
 *  - Dirección (módulo `crm-direccion`, el CEO, 27 oct 2026): sus propios chats, que nadie más ve, y además todo lo de
 *    Comercial y Atención, más los KPIs de la bandeja.
 * Sin dependencias de servidor a propósito: se usa en acciones, páginas y en las pruebas.
 */

import { puedeVerTelefonos } from "@/lib/whatsapp/telefono-oculto";

export type AreaCrm = "direccion" | "comercial" | "atencion";

export const MODULO_COMERCIAL = "crm-comercial";
export const MODULO_ATENCION = "crm-dropshippers";
export const MODULO_DIRECCION = "crm-direccion";

export interface PermisosCrm {
  modulos: string[];
  modulosSoloLectura: string[];
}

export interface AccesoCrm {
  /** Puede abrir el CRM (Atención). */
  atencion: boolean;
  /** Puede crear y editar en Atención. */
  escribeAtencion: boolean;
  /** Ve lo comercial: notas privadas, seguimientos, captación. */
  comercial: boolean;
  /** Puede crear y editar en Comercial. */
  escribeComercial: boolean;
  /** El CEO: ve todas las áreas, sus chats privados y los KPIs. */
  direccion: boolean;
  /** Puede escribir en los chats de Dirección. */
  escribeDireccion: boolean;
  /** Puede usar «Mostrar número» (por ahora, solo administradores): los números de los dropshippers no salen escritos en ninguna pantalla. */
  verTelefonos: boolean;
}

export function accesoCrm(u: PermisosCrm): AccesoCrm {
  const atencion = u.modulos.includes(MODULO_ATENCION);
  const comercial = u.modulos.includes(MODULO_COMERCIAL);
  const direccion = u.modulos.includes(MODULO_DIRECCION);
  return {
    atencion,
    escribeAtencion: atencion && !u.modulosSoloLectura.includes(MODULO_ATENCION),
    comercial,
    escribeComercial: comercial && !u.modulosSoloLectura.includes(MODULO_COMERCIAL),
    direccion,
    escribeDireccion: direccion && !u.modulosSoloLectura.includes(MODULO_DIRECCION),
    verTelefonos: puedeVerTelefonos(u),
  };
}

/** Áreas cuyo contenido puede ver esta persona: Dirección ve las tres; Comercial, la suya y Atención; Atención, solo la suya. */
export function areasVisibles(acceso: AccesoCrm): AreaCrm[] {
  if (acceso.direccion) return ["direccion", "comercial", "atencion"];
  return acceso.comercial ? ["comercial", "atencion"] : ["atencion"];
}

/** Los números de WhatsApp de la empresa que esta persona puede ver o elegir: los de sus áreas (Atención no ve el número de Comercial; Comercial ve los dos). */
export function numerosDeAreas<T extends { area: AreaCrm }>(numeros: readonly T[], areas: readonly AreaCrm[]): T[] {
  return numeros.filter((n) => areas.includes(n.area));
}

/**
 * En qué área se guarda una nota nueva. Quien pide «comercial» sin poder escribir en Comercial no la puede crear
 * (devuelve null); sin pedir nada, cada quien escribe en su área (Comercial si la tiene, si no Atención).
 */
export function areaParaNota(acceso: AccesoCrm, pedida: string | null | undefined): AreaCrm | null {
  if (pedida === "comercial") return acceso.escribeComercial ? "comercial" : null;
  if (pedida === "atencion") return acceso.escribeAtencion || acceso.escribeComercial ? "atencion" : null;
  if (acceso.escribeComercial) return "comercial";
  return acceso.escribeAtencion ? "atencion" : null;
}

/**
 * Si se puede escribir (mandar, anotar, resolver, tomar) en una conversación de esa área: Comercial pide poder escribir en Comercial;
 * Atención, en cualquiera de las dos (como `areaParaNota`). Auditoría del 27 oct 2026: antes bastaba escribir en alguna área.
 */
export function escribeEnArea(acceso: AccesoCrm, area: AreaCrm): boolean {
  if (area === "direccion") return acceso.escribeDireccion;
  return area === "comercial" ? acceso.escribeComercial : acceso.escribeAtencion || acceso.escribeComercial;
}

/**
 * El área propia de cada quien en la bandeja (pedido de Hernán, 29 oct 2026): la de más arriba que tiene. Es su panel; los de las áreas de
 * abajo los supervisa (Comercial mira Atención; Dirección mira Comercial y Atención).
 */
export function areaPropia(acceso: AccesoCrm): AreaCrm {
  if (acceso.direccion) return "direccion";
  return acceso.comercial ? "comercial" : "atencion";
}

/**
 * Si mira esa área como supervisor (no es la suya): al abrir sus chats **no los marca leídos** —quien la atiende no se entera— y para
 * responderle al dropshipper primero tiene que «Intervenir» (el chat queda a su cargo). Las notas privadas sí las puede dejar.
 */
export const supervisaArea = (acceso: AccesoCrm, area: AreaCrm) => area !== areaPropia(acceso);

/** Acciones de la auditoría que son del trabajo comercial y no se muestran a Atención. */
export const ACCIONES_COMERCIALES = [
  "crear_seguimiento_dropshipper",
  "completar_seguimiento_dropshipper",
  "transferir_dropshipper",
  "escalar_caso_dropshipper",
];

export const FASES = [
  { valor: "captado", etiqueta: "Captado" },
  { valor: "onboarding", etiqueta: "En onboarding" },
  { valor: "activo", etiqueta: "Activo" },
] as const;

export const etiquetaFase = (valor: string) => FASES.find((f) => f.valor === valor)?.etiqueta ?? valor;
