export interface Modulo {
  clave: string;
  etiqueta: string;
}

export const MODULOS: Modulo[] = [
  { clave: "dashboard", etiqueta: "Dashboard operativo" },
  { clave: "inventario", etiqueta: "Inventario" },
  { clave: "alertas", etiqueta: "Alertas de inventario" },
  { clave: "pedidos-dropi", etiqueta: "Pedidos Dropi" },
  { clave: "extractos", etiqueta: "Extractos bancarios" },
  { clave: "conciliaciones", etiqueta: "Conciliación" },
  { clave: "productos", etiqueta: "Productos y márgenes" },
  { clave: "retiros", etiqueta: "Conciliación de Retiros" },
  { clave: "gastos", etiqueta: "Nómina y gastos" },
  { clave: "crm-dropshippers", etiqueta: "CRM Dropshippers" },
  { clave: "crm-comercial", etiqueta: "CRM: área comercial" },
  { clave: "inteligencia-competitiva", etiqueta: "Inteligencia competitiva" },
  { clave: "producto", etiqueta: "Producto" },
  { clave: "wms-bodegas", etiqueta: "Bodegas (WMS)" },
  { clave: "wms-ubicaciones", etiqueta: "Ubicaciones (WMS)" },
  { clave: "wms-productos", etiqueta: "Ficha producto Shopify (WMS)" },
  { clave: "wms-productos-dropi", etiqueta: "Ficha producto Dropi (WMS)" },
  { clave: "compras", etiqueta: "Compras (WMS)" },
  { clave: "filtro-productos", etiqueta: "Filtro de productos" },
  { clave: "productos-test", etiqueta: "Productos Test (WMS)" },
  { clave: "usuarios", etiqueta: "Usuarios y roles" },
  { clave: "configuracion", etiqueta: "Configuración del sistema" },
  { clave: "notificaciones", etiqueta: "Centro de notificaciones" },
];

export const MODULO_ADMIN_POR_DEFECTO = "Admin";
