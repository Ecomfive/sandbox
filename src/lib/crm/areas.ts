/**
 * Áreas del CRM de dropshippers. Es un solo CRM; lo que cambia es quién ve qué:
 *  - Atención (módulo `crm-dropshippers`): casos, pedidos y sus propias notas.
 *  - Comercial (módulo `crm-comercial`): además sus notas privadas, sus seguimientos y la captación. Ve también lo de
 *    Atención.
 * Sin dependencias de servidor a propósito: se usa en acciones, páginas y en las pruebas.
 */

export type AreaCrm = "comercial" | "atencion";

export const MODULO_COMERCIAL = "crm-comercial";
export const MODULO_ATENCION = "crm-dropshippers";

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
}

export function accesoCrm(u: PermisosCrm): AccesoCrm {
  const atencion = u.modulos.includes(MODULO_ATENCION);
  const comercial = u.modulos.includes(MODULO_COMERCIAL);
  return {
    atencion,
    escribeAtencion: atencion && !u.modulosSoloLectura.includes(MODULO_ATENCION),
    comercial,
    escribeComercial: comercial && !u.modulosSoloLectura.includes(MODULO_COMERCIAL),
  };
}

/** Áreas cuyo contenido puede ver esta persona. */
export function areasVisibles(acceso: AccesoCrm): AreaCrm[] {
  return acceso.comercial ? ["comercial", "atencion"] : ["atencion"];
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
