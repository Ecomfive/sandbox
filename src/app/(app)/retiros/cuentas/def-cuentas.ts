import type { DefTabla } from "@/lib/tabla/motor";

export const TIPOS_CUENTA = [
  { valor: "banco", etiqueta: "Banco" },
  { valor: "binance", etiqueta: "Binance" },
  { valor: "tarjeta", etiqueta: "Tarjeta" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

export const etiquetaTipoCuenta = (valor: string) => TIPOS_CUENTA.find((t) => t.valor === valor)?.etiqueta ?? valor;

/** Solo lectura: la comisión sugerida se edita desde "Modificar" (o desde Configuración al crearla). */
export function etiquetaComision(tipo: string | null, porcentaje: number | null, montoFijo: number | null) {
  if (tipo === "porcentaje" && porcentaje != null) return `${porcentaje}%`;
  if (tipo === "monto_fijo" && montoFijo != null) return `$${montoFijo.toFixed(2)}`;
  if (tipo === "ambos" && porcentaje != null && montoFijo != null) return `${porcentaje}% + $${montoFijo.toFixed(2)}`;
  return "—";
}

export interface FilaCuenta {
  id: string;
  numero: number | null;
  tipo: string;
  nombre: string;
  detalle: string | null;
  activa: boolean;
  comision_tipo: string | null;
  comision_porcentaje: number | null;
  comision_monto_fijo: number | null;
  /** Solo las cuentas Binance: los datos en el formato de Dropi (migración 0039). */
  datos_binance?: unknown;
  /** Cuándo se creó la cuenta (timestamptz). */
  creado_en?: string | null;
  /** Cuándo se eliminó (se desactivó), sacado del historial de auditoría; solo si está eliminada y hay registro. */
  eliminada_en?: string | null;
}

/** Filtros y agrupación de las cuentas de retiro; por defecto se ven solo las activas, y «Eliminadas» aísla las inactivas (nunca mezcladas). */
export const DEF_CUENTAS: DefTabla<FilaCuenta> = {
  clave: "cuentas-destino",
  campos: [
    {
      id: "tipo",
      etiqueta: "Tipo",
      tipo: "seleccion",
      valores: (c) => [c.tipo],
      opciones: () => TIPOS_CUENTA.map((t) => ({ valor: t.valor, etiqueta: t.etiqueta })),
      agrupable: true,
    },
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (c) => [c.activa ? "activa" : "inactiva"],
      opciones: () => [
        { valor: "activa", etiqueta: "Activa" },
        { valor: "inactiva", etiqueta: "Inactiva" },
      ],
      agrupable: true,
      ordenGrupos: ["activa", "inactiva"],
    },
    { id: "nombre", etiqueta: "Nombre", tipo: "texto", valor: (c) => c.nombre },
    { id: "detalle", etiqueta: "Cuenta", tipo: "texto", valor: (c) => c.detalle ?? "" },
  ],
  cerrados: {
    etiqueta: "Eliminadas",
    esCerrado: (c) => !c.activa,
    campoEstado: "estado",
    valoresCerrados: ["inactiva"],
    ocultosPorDefecto: true,
    // Aisladas: apagado solo activas, encendido solo eliminadas — nunca mezcladas. "Eliminar" una
    // cuenta la desactiva (no la borra de verdad, ver actions.ts), así que cae en el mismo balde
    // que desactivarla a mano: no hay una tercera categoría distinta que rastrear.
    exclusivo: true,
  },
};

/** La misma lista vista desde Configuración: guarda sus propios filtros y vista. */
export const DEF_CUENTAS_CONFIGURACION: DefTabla<FilaCuenta> = { ...DEF_CUENTAS, clave: "configuracion-cuentas" };
