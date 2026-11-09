import type { DefTabla } from "@/lib/tabla/motor";

export interface FilaMovimiento {
  id: string;
  fecha: string | null;
  tienda: string;
  tipo: string;
  seccion: string;
  descripcion: string;
  cuenta: string;
  eerr: "Sí" | "No";
  flujo: "Sí" | "No";
  monto: number;
  estado: "Clasificado" | "Sin tienda" | "Sin tipo" | "Anulado";
  /** El proveedor canónico (catálogo de proveedores) o «Sin proveedor». */
  proveedor: string;
  /** «Atípico» si el monto pasa de 3 veces la mediana de su tipo; si no, «Normal». */
  revision: "Atípico" | "Normal";
  origen: string;
  /** Para la ficha (no son columnas). */
  periodo: string;
  fechaPago: string | null;
  fechaServicio: string | null;
  unidadId: string;
  tipoId: string | null;
  cuentaId: string | null;
  editado: boolean;
  facturaNumero: string | null;
  ruc: string | null;
  anulado: boolean;
  anuladoMotivo: string | null;
  atipico: { veces: number; mediana: number } | null;
}

const seleccion = <K extends keyof FilaMovimiento>(id: K, etiqueta: string, agrupable = true) => ({
  id,
  etiqueta,
  tipo: "seleccion" as const,
  valores: (m: FilaMovimiento) => [String(m[id])],
  agrupable,
});

/** Movimientos de un mes del libro: se filtran y agrupan por tienda, tipo, cuenta y estado; por grupo se suma el monto. */
export const DEF_MOVIMIENTOS: DefTabla<FilaMovimiento> = {
  clave: "libro-movimientos",
  campos: [
    seleccion("estado", "Estado"),
    seleccion("tienda", "Tienda"),
    seleccion("proveedor", "Proveedor"),
    seleccion("revision", "Monto"),
    seleccion("seccion", "Sección del EERR"),
    seleccion("tipo", "Tipo"),
    seleccion("cuenta", "Forma de pago"),
    seleccion("eerr", "Entra al EERR"),
    seleccion("flujo", "Entra al flujo"),
    { id: "descripcion", etiqueta: "Descripción", tipo: "texto", valor: (m) => m.descripcion },
    { id: "monto", etiqueta: "Monto", tipo: "numero", valor: (m) => m.monto },
    { id: "fecha", etiqueta: "Fecha de pago", tipo: "fecha", valor: (m) => m.fecha ?? "" },
    seleccion("origen", "Archivo", false),
  ],
  total: (m) => m.monto,
};

export const ETIQUETA_SECCION: Record<string, string> = {
  ingresos: "Ingresos",
  costo_ventas: "Costo de ventas",
  administracion: "Administración",
  marketing: "Marketing",
  depreciacion: "Depreciación",
  finanzas: "Finanzas",
  otros: "Otros",
  impuesto_ganancias: "Impuesto a las ganancias",
  informacion: "Información",
  patrimonial: "Patrimonial",
  pago_tdc: "Pago de tarjeta",
  sin_clasificar: "Sin clasificar",
};
