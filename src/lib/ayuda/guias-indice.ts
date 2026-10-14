// Qué módulos tienen guía en el Centro de ayuda (la clave es la ruta del módulo). Va aparte del contenido para que la barra
// de migas pueda mostrar el «?» de la página sin cargar todas las guías.
export const MODULOS_CON_GUIA: Record<string, string> = {
  "/": "dashboard",
  "/compras": "compras",
  "/producto": "producto",
  "/inventario": "inventario",
  "/wms-bodegas": "wms-bodegas",
  "/wms-ubicaciones": "wms-ubicaciones",
  "/alertas": "alertas",
  "/pedidos-dropi": "pedidos-dropi",
  "/retiros": "retiros",
  "/extractos": "extractos",
  "/gastos": "gastos",
  "/productos": "productos",
  "/productos-test": "productos-test",
  "/filtro-productos": "filtro-productos",
  "/crm-dropshippers": "crm-dropshippers",
  "/inteligencia-competitiva": "inteligencia-competitiva",
  "/usuarios": "usuarios",
  "/notificaciones": "notificaciones",
};
