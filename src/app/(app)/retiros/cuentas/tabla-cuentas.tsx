"use client";

import { useState } from "react";
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
import { FichaCuenta } from "./ficha-cuenta";

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

/**
 * Cuentas destino de Retiros, con la barra de herramientas común. Toda la fila se puede pulsar: abre la ficha de la
 * cuenta (panel a la derecha), donde se modifica, se desactiva o se elimina. El interruptor de estado de la fila sigue
 * funcionando por sí solo.
 */
export function TablaCuentas({
  cuentas,
  paisId,
  paisNombre,
  codigoPais,
  puedeEscribir,
}: {
  cuentas: FilaCuenta[];
  paisId: string;
  paisNombre: string;
  codigoPais: string;
  puedeEscribir: boolean;
}) {
  // Qué cuenta está abierta y en qué orden se veían las filas al abrirla (para las flechas de anterior y siguiente).
  // Se guarda el id y no la fila: al guardar, la ficha muestra los datos nuevos de la lista.
  const [abierta, setAbierta] = useState<{ id: string; orden: string[] } | null>(null);
  const cuenta = abierta ? cuentas.find((c) => c.id === abierta.id) : undefined;

  return (
    <>
      <TablaDatos
        def={DEF_CUENTAS}
        filas={cuentas}
        columnas={COLUMNAS_DESTINO}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(c) => c.id}
        anchoMinimo="44rem"
        abrirFila={{
          etiqueta: (c) => `Abrir la ficha de la cuenta ${c.nombre}`,
          alAbrir: (c, orden) => setAbierta({ id: c.id, orden }),
        }}
        ariaLabel="Cuentas destino de retiros"
        vacio="Todavía no hay cuentas de retiro registradas."
      />
      <FichaCuenta
        cuenta={cuenta}
        orden={abierta?.orden ?? []}
        paisId={paisId}
        paisNombre={paisNombre}
        codigoPais={codigoPais}
        puedeEscribir={puedeEscribir}
        alIr={(id) => setAbierta((a) => (a ? { ...a, id } : a))}
        alCerrar={() => setAbierta(null)}
      />
    </>
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
