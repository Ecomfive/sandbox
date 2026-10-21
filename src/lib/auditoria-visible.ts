import { ACCIONES_COMERCIALES } from "@/lib/crm/areas";
import { puedeVerPais } from "@/lib/paises-permitidos";

/**
 * De qué módulo es cada `entidad` de `historial_auditoria`: un evento solo se muestra en la bitácora del Centro de
 * notificaciones a quien puede abrir ese módulo (antes la bitácora mostraba los 200 últimos de todos los módulos a
 * cualquiera con «notificaciones»). Una entidad que no esté aquí solo la ve quien tiene Usuarios y roles, que ya tiene el
 * historial completo en /usuarios/auditoria.
 */
export const MODULO_DE_ENTIDAD: Record<string, string> = {
  puestos: "puestos",
  skus_maestros: "producto",
  dropshippers: "crm-dropshippers",
  wms_compras: "compras",
  wms_rutas_envio: "compras",
  retiros: "retiros",
  cuentas_retiro: "retiros",
  saldos_wallet: "retiros",
  perfiles: "usuarios",
  manuales_proceso: "usuarios",
  wms_productos: "wms-productos",
  wms_dropi_productos: "wms-productos-dropi",
  wms_ubicaciones: "wms-ubicaciones",
  wms_bodegas: "wms-bodegas",
  wms_productos_test: "productos-test",
  wms_filtro_productos: "filtro-productos",
  scraping_proveedores: "scraping-proveedores",
  wms_seleccion_productos: "seleccion-productos",
  landings: "generador-landings",
  dropi_publicaciones: "publicaciones-dropi",
  instagram_capturas: "instagram",
  alertas_inventario_no_retornado: "alertas",
  productos: "productos",
  paises: "configuracion",
  plataformas: "configuracion",
  pais_plataformas: "configuracion",
};

const COMERCIALES = new Set<string>(ACCIONES_COMERCIALES);

/**
 * Acciones de un producto (`skus_maestros`, que no tiene país) que sí son de un país: la orden de compra creada al pasarlo a
 * Activo y un movimiento de inventario. Su país va al final del detalle («… · Panamá») y se lee con `paisEnDetalle`.
 */
export const ACCIONES_PRODUCTO_CON_PAIS = new Set(["crear_compra", "movimiento_inventario"]);

/** El código del país nombrado en el detalle como « · <Nombre>», o undefined si no nombra ninguno. */
export function paisEnDetalle(detalle: string | null | undefined, paises: { codigo: string; nombre: string }[]): string | undefined {
  if (!detalle) return undefined;
  // Solo cuenta el último « · »: antes puede haber texto libre (referencia, lote) que nombre otro país a propósito.
  const i = detalle.lastIndexOf(" · ");
  if (i < 0) return undefined;
  const final = detalle.slice(i + 3);
  // «Panamá» (movimiento) o «Panamá (al pasar a Activo)» (orden de compra), nada más.
  return paises.find((p) => final === p.nombre || final === `${p.nombre} (al pasar a Activo)`)?.codigo;
}

/**
 * Si un evento de la auditoría se puede mostrar a esta persona: necesita el módulo de su entidad; las acciones del CRM
 * Comercial piden además «crm-comercial»; y una compra (o ruta de envío) de un país que la persona no puede ver queda fuera
 * (`paisDe` da el código de país de la compra o ruta, o `null` si es de Importadora; `undefined` si no se sabe).
 */
export function eventoVisible(
  evento: { accion: string; entidad: string; entidad_id: string | null; detalle?: string | null },
  usuario: { modulos: string[]; paisesPermitidos: string[] | null },
  paisDe: (entidad: string, id: string | null) => string | null | undefined,
  paises: { codigo: string; nombre: string }[] = [],
): boolean {
  const modulo = MODULO_DE_ENTIDAD[evento.entidad] ?? "usuarios";
  if (!usuario.modulos.includes(modulo)) return false;
  if (COMERCIALES.has(evento.accion) && !usuario.modulos.includes("crm-comercial")) return false;
  if (usuario.paisesPermitidos !== null && (evento.entidad === "wms_compras" || evento.entidad === "wms_rutas_envio")) {
    const pais = paisDe(evento.entidad, evento.entidad_id);
    // Sin saber el país (la compra se borró, por ejemplo) no se arriesga: se oculta.
    if (pais === undefined || !puedeVerPais(usuario.paisesPermitidos, pais)) return false;
  }
  if (usuario.paisesPermitidos !== null && evento.entidad === "skus_maestros" && ACCIONES_PRODUCTO_CON_PAIS.has(evento.accion)) {
    const pais = paisEnDetalle(evento.detalle, paises);
    if (pais === undefined || !puedeVerPais(usuario.paisesPermitidos, pais)) return false;
  }
  return true;
}
