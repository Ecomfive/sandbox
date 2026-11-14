// Quién puede hacer una salida a mano donde toda salida va con remisión (Costa Rica) (14 nov 2026, pedido de Hernán: que Yanixia, que lleva el inventario de
// Costa Rica, la pueda hacer sin ser administradora). Antes era solo de un administrador. Ahora también quien tenga el módulo `salida-manual`, que se da **por persona**
// (`permisos_persona`, en Usuarios y roles › Permisos propios, o con la migración 0291), no por rol. Solo autoriza la salida (y «Restar» del Levantamiento): para hacerla
// hay que poder además modificar Inventario, que lo comprueba cada acción.

export const MODULO_SALIDA_MANUAL = "salida-manual";

type Acceso = { modulos: readonly string[]; modulosSoloLectura: readonly string[] };

/** Administra el sistema: puede modificar Usuarios y roles (la misma regla de `esAdministrador` en `permisos/acceso.ts`). */
const administra = (u: Acceso): boolean => u.modulos.includes("usuarios") && !u.modulosSoloLectura.includes("usuarios");

/** Está autorizada para una salida a mano en un país con remisión: un administrador, o quien tenga el módulo «Salida a mano» con edición. */
export function autorizadaParaSalidaManual(u: Acceso): boolean {
  if (administra(u)) return true;
  return u.modulos.includes(MODULO_SALIDA_MANUAL) && !u.modulosSoloLectura.includes(MODULO_SALIDA_MANUAL);
}
