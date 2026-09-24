/** Sin dependencias de servidor a propósito: se usa tanto en páginas de servidor
 * como en componentes cliente (el Centro de notificaciones filtra en el navegador). */

export function calcularCambios(
  antes: Record<string, string> | null,
  despues: Record<string, string> | null
): { campo: string; antes: string; despues: string }[] {
  if (!antes && !despues) return [];
  const campos = new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})]);
  return [...campos]
    .map((campo) => ({
      campo,
      antes: antes?.[campo] ?? "—",
      despues: despues?.[campo] ?? "—",
    }))
    .filter((c) => c.antes !== c.despues);
}

export const ETIQUETA_ACCION: Record<string, string> = {
  actualizar_margen: "Actualizó margen",
  actualizar_margen_masivo: "Actualizó margen (en lote)",
  registrar_saldo: "Registró saldo de wallet",
  crear_retiro: "Creó un retiro",
  cerrar_retiro: "Cerró un retiro",
  cerrar_retiro_con_novedad: "Cerró un retiro con novedad",
  cancelar_retiro: "Canceló un retiro",
  cambiar_estado_retiro: "Cambió el estado de un retiro",
  editar_retiro: "Modificó un retiro",
  eliminar_retiro: "Eliminó un retiro",
  conciliar_retiro: "Concilió un retiro",
  marcar_consolidacion: "Cambió la consolidación de un retiro",
  configurar_plataforma_retiro: "Configuró una plataforma para crear retiros",
  crear_plataforma: "Creó una plataforma",
  activar_cuenta_retiro: "Cambió el estado de una cuenta de retiro",
  eliminar_cuenta_retiro: "Eliminó una cuenta de retiro",
  crear_usuario: "Creó un usuario",
  editar_usuario: "Modificó un usuario",
  suspender_usuario: "Cambió el estado de un usuario",
  eliminar_usuario: "Eliminó un usuario",
  generar_contrasena_temporal: "Generó una contraseña temporal",
  crear_dropshipper: "Agregó el dropshipper",
  cambiar_estado_dropshipper: "Cambió el estado",
  crear_sku: "Propuso el SKU",
  cambiar_estado_sku: "Cambió el estado",
  vincular_producto_sku: "Vinculó un producto",
  crear_producto_wms: "Creó el producto",
  editar_producto_wms: "Modificó el producto",
  duplicar_producto_wms: "Duplicó el producto",
  eliminar_producto_wms: "Eliminó el producto",
  crear_producto_dropi: "Creó el producto",
  editar_producto_dropi: "Modificó el producto",
  duplicar_producto_dropi: "Duplicó el producto",
  eliminar_producto_dropi: "Eliminó el producto",
  crear_bodega_wms: "Creó la bodega",
  editar_bodega_wms: "Modificó la bodega",
  cambiar_estado_bodega_wms: "Cambió el estado de la bodega",
  archivar_producto_dropi: "Cambió el estado del producto",
  ajustar_stock_dropi: "Ajustó el stock",
  generar_alerta: "Generó la alerta",
  cambiar_estado_alerta: "Cambió el estado",
};

/** Una línea del historial a partir de una fila de `historial_auditoria`: quién, qué acción y, si cambió algún
 * campo puntual (`antes`/`despues`), "Campo: antes → después"; si no, el `detalle` libre. La comparten las fichas
 * de detalle que muestran la actividad de un registro (dropshipper, SKU, alerta...). */
export function formatearEventoAuditoria(entrada: {
  accion: string;
  usuario_nombre: string | null;
  detalle: string | null;
  antes: Record<string, string> | null;
  despues: Record<string, string> | null;
}): string {
  const etiqueta = ETIQUETA_ACCION[entrada.accion] ?? entrada.accion;
  const cambios = calcularCambios(entrada.antes, entrada.despues);
  const detalle = cambios.length > 0 ? cambios.map((c) => `${c.campo} ${c.antes} → ${c.despues}`).join(", ") : entrada.detalle;
  const quien = entrada.usuario_nombre ? `${entrada.usuario_nombre}: ` : "";
  return detalle ? `${quien}${etiqueta}: ${detalle}` : `${quien}${etiqueta}`;
}
