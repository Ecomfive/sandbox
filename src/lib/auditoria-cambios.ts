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
  marcar_consolidacion: "Cambió la consolidación de un retiro",
  configurar_plataforma_retiro: "Configuró una plataforma para crear retiros",
  crear_plataforma: "Creó una plataforma",
  activar_cuenta_retiro: "Cambió el estado de una cuenta de retiro",
};
