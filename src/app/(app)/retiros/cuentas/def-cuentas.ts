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
}

/** Filtros y agrupación de las cuentas de retiro; «Inactivas» es lo cerrado, pero por defecto se ven todas. */
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
    etiqueta: "Inactivas",
    esCerrado: (c) => !c.activa,
    campoEstado: "estado",
    valoresCerrados: ["inactiva"],
    ocultosPorDefecto: false,
  },
};

/** La misma lista vista desde Configuración: guarda sus propios filtros y vista. */
export const DEF_CUENTAS_CONFIGURACION: DefTabla<FilaCuenta> = { ...DEF_CUENTAS, clave: "configuracion-cuentas" };
