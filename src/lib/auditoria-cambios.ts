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
  cambiar_categoria_producto: "Cambió la categoría",
  confirmar_categoria_producto: "Confirmó la categoría",
  clasificar_categorias: "Clasificó por categoría",
  crear_puesto: "Creó el puesto",
  editar_puesto: "Editó el puesto",
  cambiar_estado_puesto: "Cambió el estado del puesto",
  asignar_puesto: "Asignó a una persona",
  quitar_puesto: "Quitó a una persona",
  puesto_principal: "Cambió el puesto principal",
  enlazar_sop_puesto: "Enlazó un procedimiento",
  quitar_sop_puesto: "Quitó un procedimiento",
  enlazar_curso_puesto: "Enlazó un curso",
  quitar_curso_puesto: "Quitó un curso",
  cambiar_exclusividad: "Cambió la exclusividad",
  enviar_a_test: "Envió a Test",
  crear_sugerencia: "Registró la sugerencia",
  recomendar_producto: "Recomendó un producto",
  cambiar_estado_sugerencia: "Cambió el estado",
  crear_seleccion: "Agregó a Selección de productos",
  actualizar_seleccion: "Modificó la fila",
  cambiar_estado_seleccion: "Cambió el estado",
  crear_oferta_seleccion: "Creó una oferta",
  crear_landing: "Creó la landing",
  generar_imagen_landing: "Generó una imagen con Gemini",
  crear_landing_shopify: "Creó el borrador en Shopify",
  actualizar_landing_shopify: "Actualizó el producto en Shopify",
  publicar_landing_shopify: "Publicó la landing en Shopify",
  estado_landing: "Cambió el estado de la landing",
  eliminar_landing: "Eliminó la landing",
  eliminar_oferta_seleccion: "Quitó una oferta",
  actualizar_captura_instagram: "Modificó la captura de Instagram",
  leer_enlace_captura_instagram: "Leyó el enlace de la captura de Instagram",
  compartir_captura_instagram: "Compartió un reel o publicación de Instagram desde el celular",
  unir_capturas_instagram: "Unió dos capturas de Instagram",
  vincular_biblioteca_captura_instagram: "Vinculó a mano anuncios de la Biblioteca a la captura de Instagram",
  leer_biblioteca_captura_instagram: "Leyó la Biblioteca de anuncios de la captura de Instagram",
  fusionar_capturas_instagram: "Fusionó capturas repetidas de Instagram",
  eliminar_captura_instagram: "Eliminó la captura de Instagram",
  quitar_envio_captura_instagram: "Quitó un envío de la captura de Instagram",
  actualizar_margen: "Actualizó margen",
  agregar_proveedor_scraping: "Agregó un proveedor a Scraping de proveedores",
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
  editar_dropshipper: "Editó los datos",
  movimiento_inventario: "Registró un movimiento de inventario",
  crear_producto: "Creó el producto",
  guardar_codigo_barras: "Cambió el código de barras",
  configurar_vencimiento: "Cambió el control de vencimiento",
  guardar_envio: "Cambió los datos de envío",
  cambiar_foto_producto: "Cambió la foto",
  cambiar_paises_usuario: "Cambió los países que ve",
  crear_rol: "Creó un rol",
  editar_rol: "Editó un rol",
  duplicar_rol: "Duplicó un rol",
  eliminar_rol: "Eliminó un rol",
  cambiar_permiso_rol: "Cambió el acceso de un rol",
  copiar_permisos_rol: "Copió los permisos de un rol",
  afinar_rol: "Afinó lo que ve un rol dentro de un módulo",
  cambiar_permiso_persona: "Cambió el acceso propio de una persona",
  afinar_persona: "Afinó lo que ve una persona dentro de un módulo",
  quitar_ajustes_persona: "Quitó los ajustes propios de una persona",
  crear_manual: "Creó un manual de proceso",
  editar_manual: "Editó un manual de proceso",
  eliminar_manual: "Borró un manual de proceso",
  crear_pais: "Agregó un país",
  renombrar_tienda: "Cambió el nombre de una tienda",
  anular_compra: "Anuló una compra",
  restaurar_compra: "Restauró una compra",
  eliminar_comentario_compra: "Eliminó un comentario de una compra",
  crear_ruta_envio: "Creó una ruta de envío",
  editar_ruta_envio: "Editó una ruta de envío",
  activar_ruta_envio: "Activó una ruta de envío",
  desactivar_ruta_envio: "Desactivó una ruta de envío",
  eliminar_ruta_envio: "Eliminó una ruta de envío",
  tarifa_ruta_envio: "Agregó una tarifa de envío",
  eliminar_tarifa_envio: "Eliminó una tarifa de envío",
  generar_codigo_barras: "Generó un código de barras interno",
  cambiar_clase_producto: "Cambió el estado del producto",
  renombrar_producto: "Cambió el nombre",
  cambiar_sku_producto: "Cambió el SKU",
  crear_caso_dropshipper: "Abrió un caso",
  crear_pedido_dropshipper: "Registró un pedido",
  vincular_cuenta_dropshipper: "Vinculó una cuenta",
  desvincular_cuenta_dropshipper: "Desvinculó una cuenta",
  crear_seguimiento_dropshipper: "Creó un seguimiento",
  completar_seguimiento_dropshipper: "Completó un seguimiento",
  escalar_caso_dropshipper: "Pasó un caso a Comercial",
  transferir_dropshipper: "Cambió la fase o el líder comercial",
  editar_campo_compra: "Editó un dato de la compra",
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
  crear_ubicacion_wms: "Creó la ubicación",
  editar_ubicacion_wms: "Modificó la ubicación",
  cambiar_estado_ubicacion_wms: "Cambió el estado de la ubicación",
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
