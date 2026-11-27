// Quién puede anular una línea de remisión que sigue en camino sin pedir autorización (20 nov 2026, pedido de Hernán: la persona encargada de las remisiones no podía
// anular la que quedó mal porque la petición esperaba a otra). Es el módulo `anular-remision`, que se da **por persona** (`permisos_persona`, en Usuarios y roles ›
// Permisos propios, o con la migración 0344), no por rol. Solo vale para anular lo que sigue en camino: corregir lo recibido sigue pidiendo autorización. Para usarlo hay
// que poder además modificar Inventario, que lo comprueba la acción.

export const MODULO_ANULAR_REMISION = "anular-remision";

type Acceso = { modulos: readonly string[]; modulosSoloLectura: readonly string[] };

/**
 * Corregir lo recibido en una remisión sin pedir autorización (27 nov 2026, pedido de Hernán: Yanixia en Costa Rica). Módulo `corregir-remision`, también **por persona**
 * (migración 0993). La corrección queda guardada y resuelta al instante, con su motivo y su nombre.
 */
export const MODULO_CORREGIR_REMISION = "corregir-remision";

/** Puede corregir lo recibido sin autorización: tiene el módulo «Corregir remisión» con edición. */
export const puedeCorregirSinAutorizacion = (u: Acceso): boolean => u.modulos.includes(MODULO_CORREGIR_REMISION) && !u.modulosSoloLectura.includes(MODULO_CORREGIR_REMISION);

/** Puede anular sin autorización: tiene el módulo «Anular remisión» con edición. */
export const puedeAnularSinAutorizacion = (u: Acceso): boolean => u.modulos.includes(MODULO_ANULAR_REMISION) && !u.modulosSoloLectura.includes(MODULO_ANULAR_REMISION);
