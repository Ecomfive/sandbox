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
  { clave: "retiros", etiqueta: "Retiros y wallet" },
  { clave: "gastos", etiqueta: "Nómina y gastos" },
  { clave: "crm-dropshippers", etiqueta: "CRM Dropshippers" },
  { clave: "inteligencia-competitiva", etiqueta: "Inteligencia competitiva" },
  { clave: "catalogo-maestro", etiqueta: "Catálogo maestro de SKU" },
  { clave: "usuarios", etiqueta: "Usuarios y roles" },
];

export const MODULO_ADMIN_POR_DEFECTO = "Admin";
