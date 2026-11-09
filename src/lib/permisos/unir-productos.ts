// Quién puede unir productos duplicados desde la ficha de Producto (9 nov 2026, pedido de Hernán: darle ese permiso a Dinora sin hacerla
// administradora). Antes lo podía hacer solo un administrador. Ahora también quien tenga el módulo `unir-productos`, que se da **por
// persona** (`permisos_persona`, en Usuarios y roles › Permisos propios, o con la migración 0257), no por rol. Unir es destructivo (el
// producto sobrante se borra), así que el permiso es solo para esto: no da «Eliminar» producto, que sigue siendo del administrador.

export const MODULO_UNIR_PRODUCTOS = "unir-productos";

type Acceso = { modulos: readonly string[]; modulosSoloLectura: readonly string[] };

/** Administra el sistema: puede modificar Usuarios y roles (la misma regla de `esAdministrador` en `permisos/acceso.ts`). */
const administra = (u: Acceso): boolean => u.modulos.includes("usuarios") && !u.modulosSoloLectura.includes("usuarios");

/** Puede unir productos: un administrador, o quien tenga el módulo «Unir productos duplicados» con edición. Hay que poder abrir Producto. */
export function puedeUnirProductos(u: Acceso): boolean {
  if (!u.modulos.includes("producto")) return false;
  if (administra(u)) return !u.modulosSoloLectura.includes("producto");
  return u.modulos.includes(MODULO_UNIR_PRODUCTOS) && !u.modulosSoloLectura.includes(MODULO_UNIR_PRODUCTOS);
}
