// Lo que se puede crear desde el botón «Crear» de la barra de arriba, sin ir antes a la página. Sin React, para
// poder probarlo.

export interface AccionCrear {
  id: string;
  etiqueta: string;
  /** Una línea que dice qué se hace ahí. */
  detalle: string;
  /** A dónde lleva. Con `?nuevo=1` la página abre directo su formulario de creación. */
  href: string;
  /** Módulo que hay que poder abrir (y modificar) para ver esta opción. */
  modulo: string;
  /** Alternativa a `modulo`: basta poder abrir y modificar uno de estos. */
  modulosAlguno?: string[];
}

export const ACCIONES_CREAR: AccionCrear[] = [
  { id: "retiro", etiqueta: "Nuevo retiro", detalle: "Registrar un retiro de una plataforma", href: "/retiros?nuevo=1", modulo: "retiros" },
  { id: "gasto", etiqueta: "Registrar gasto", detalle: "Nómina y gastos operativos", href: "/gastos?nuevo=1", modulo: "gastos" },
  { id: "extracto", etiqueta: "Cargar extracto bancario", detalle: "Subir el extracto del banco", href: "/extractos", modulo: "extractos" },
  {
    id: "inventario",
    etiqueta: "Cargar movimientos de inventario",
    detalle: "Entradas y salidas por pistoleo",
    href: "/inventario",
    modulo: "inventario",
  },
  {
    id: "importar",
    etiqueta: "Importar Excel",
    detalle: "Libro, carteras, costos, nómina, ventas, deliverys y bancos",
    href: "/importar",
    modulo: "libro-movimientos",
    modulosAlguno: ["libro-movimientos", "bienes-de-uso", "cuentas-por-cobrar", "cuentas-por-pagar", "costos-mercancia", "nomina", "ventas-tiendas", "deliverys", "conciliacion-bancaria"],
  },
];

/** Las opciones para esta persona: solo las de módulos que puede abrir Y modificar (con solo lectura no se crea nada). */
export function accionesCrearPermitidas(modulos: string[], modulosSoloLectura: string[]): AccionCrear[] {
  const puede = (m: string) => modulos.includes(m) && !modulosSoloLectura.includes(m);
  return ACCIONES_CREAR.filter((a) => (a.modulosAlguno ? a.modulosAlguno.some(puede) : puede(a.modulo)));
}

/** ¿La dirección pide abrir directo el formulario de creación (`?nuevo=1`)? */
export function pideCrear(valor: string | string[] | null | undefined): boolean {
  return (Array.isArray(valor) ? valor[0] : valor) === "1";
}
