"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { EstadoIcon, WalletIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { ActivaToggle } from "./activa-toggle";
import {
  DEF_CUENTAS,
  DEF_CUENTAS_CONFIGURACION,
  etiquetaComision,
  etiquetaTipoCuenta,
  type FilaCuenta,
} from "./def-cuentas";
import { EliminarCuentaBoton } from "./eliminar-cuenta-boton";
import { VentanaCuentaRetiro } from "./ventana-cuenta-retiro";

const NOMBRE: NombreFilas = { singular: "cuenta", plural: "cuentas" };
const ICONOS: Record<string, IconoComp> = {
  tipo: WalletIcon,
  estado: EstadoIcon,
  nombre: WalletIcon,
  detalle: WalletIcon,
};

const COLUMNA_NUMERO: ColumnaTabla<FilaCuenta, unknown> = {
  id: "numero",
  label: "#",
  ocultable: false,
  clase: "font-semibold text-muted-foreground",
  render: (c) => (c.numero != null ? `#${c.numero}` : "—"),
};
const COLUMNA_TIPO: ColumnaTabla<FilaCuenta, unknown> = { id: "tipo", label: "Tipo", ocultable: true, render: (c) => etiquetaTipoCuenta(c.tipo) };
const COLUMNA_NOMBRE: ColumnaTabla<FilaCuenta, unknown> = { id: "nombre", label: "Nombre", ocultable: true, clase: "font-medium", render: (c) => c.nombre };
const COLUMNA_DETALLE: ColumnaTabla<FilaCuenta, unknown> = {
  id: "detalle",
  label: "Cuenta",
  ocultable: true,
  clase: "text-muted-foreground",
  render: (c) => c.detalle || "—",
};
const COLUMNA_ESTADO: ColumnaTabla<FilaCuenta, unknown> = {
  id: "estado",
  label: "Estado",
  ocultable: true,
  render: (c) => <ActivaToggle id={c.id} activa={c.activa} />,
};

const COLUMNAS_DESTINO: ColumnaTabla<FilaCuenta, unknown>[] = [
  COLUMNA_NUMERO,
  COLUMNA_TIPO,
  COLUMNA_NOMBRE,
  COLUMNA_DETALLE,
  {
    id: "comision",
    label: "Comisión sugerida",
    ocultable: true,
    clase: "text-muted-foreground",
    render: (c) => etiquetaComision(c.comision_tipo, c.comision_porcentaje, c.comision_monto_fijo),
  },
  COLUMNA_ESTADO,
];

const COLUMNAS_CONFIGURACION: ColumnaTabla<FilaCuenta, unknown>[] = [
  { ...COLUMNA_TIPO, ocultable: false },
  COLUMNA_NOMBRE,
  COLUMNA_DETALLE,
  COLUMNA_ESTADO,
];

/** Cuentas destino de Retiros, con la barra de herramientas común y las acciones fijas a la derecha. */
export function TablaCuentas({ cuentas, paisId }: { cuentas: FilaCuenta[]; paisId: string }) {
  return (
    <TablaDatos
      def={DEF_CUENTAS}
      filas={cuentas}
      columnas={COLUMNAS_DESTINO}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(c) => c.id}
      anchoMinimo="50rem"
      accion={{
        etiqueta: "Acciones",
        fija: true,
        render: (c) => (
          <div className="flex items-center justify-center gap-1">
            <VentanaCuentaRetiro paisId={paisId} cuenta={c} />
            <EliminarCuentaBoton id={c.id} nombre={c.nombre} />
          </div>
        ),
      }}
      ariaLabel="Cuentas destino de retiros"
      vacio="Todavía no hay cuentas de retiro registradas."
    />
  );
}

/** Las mismas cuentas en Configuración (solo lectura y activar o desactivar), con la barra común. */
export function TablaCuentasConfiguracion({ cuentas }: { cuentas: FilaCuenta[] }) {
  return (
    <TablaDatos
      def={DEF_CUENTAS_CONFIGURACION}
      filas={cuentas}
      columnas={COLUMNAS_CONFIGURACION}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(c) => c.id}
      anchoMinimo="36rem"
      ariaLabel="Cuentas de retiro"
      vacio="Todavía no hay cuentas de retiro registradas."
    />
  );
}
