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

/**
 * La tabla de cuentas de retiro con la barra de herramientas común. Toda la fila se puede pulsar: abre la ficha de la
 * cuenta (panel a la derecha), donde se modifica, se desactiva o se elimina; el interruptor de estado de la fila sigue
 * funcionando por sí solo. El botón «Agregar» (ficha de «Nueva cuenta destino») va en la misma fila de botones de la
 * barra, junto a Descargar. Lo comparten Cuentas destino y Configuración: solo cambian las columnas.
 */
function TablaDeCuentas({
  def,
  columnas,
  ariaLabel,
  anchoMinimo,
  cuentas,
  paisId,
  paisNombre,
  puedeEscribir,
}: {
  def: typeof DEF_CUENTAS;
  columnas: ColumnaTabla<FilaCuenta, unknown>[];
  ariaLabel: string;
  anchoMinimo: string;
  cuentas: FilaCuenta[];
  paisId: string;
  paisNombre: string;
  puedeEscribir: boolean;
}) {
  // Qué cuenta está abierta y en qué orden se veían las filas al abrirla (para las flechas de anterior y siguiente).
  // Se guarda el id y no la fila: al guardar, la ficha muestra los datos nuevos de la lista.
  const [abierta, setAbierta] = useState<{ id: string; orden: string[] } | null>(null);
  const cuenta = abierta ? cuentas.find((c) => c.id === abierta.id) : undefined;

  return (
    <>
      <TablaDatos
        def={def}
        filas={cuentas}
        columnas={columnas}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(c) => c.id}
        anchoMinimo={anchoMinimo}
        abrirFila={{
          etiqueta: (c) => `Abrir la ficha de la cuenta ${c.nombre}`,
          alAbrir: (c, orden) => setAbierta({ id: c.id, orden }),
        }}
        accionPrincipal={puedeEscribir ? <VentanaCuentaRetiro paisId={paisId} paisNombre={paisNombre} /> : undefined}
        ariaLabel={ariaLabel}
        vacio="Todavía no hay cuentas de retiro registradas."
      />
      <FichaCuenta
        cuenta={cuenta}
        orden={abierta?.orden ?? []}
        paisId={paisId}
        paisNombre={paisNombre}
        puedeEscribir={puedeEscribir}
        alIr={(id) => setAbierta((a) => (a ? { ...a, id } : a))}
        alCerrar={() => setAbierta(null)}
      />
    </>
  );
}

type PropsTablaCuentas = { cuentas: FilaCuenta[]; paisId: string; paisNombre: string; puedeEscribir: boolean };

/** Cuentas destino de Retiros. */
export function TablaCuentas(props: PropsTablaCuentas) {
  return <TablaDeCuentas def={DEF_CUENTAS} columnas={COLUMNAS_DESTINO} ariaLabel="Cuentas destino de retiros" anchoMinimo="44rem" {...props} />;
}

/** Las mismas cuentas en Configuración, con las columnas esenciales y la misma ficha y el mismo «Agregar». */
export function TablaCuentasConfiguracion(props: PropsTablaCuentas) {
  return (
    <TablaDeCuentas
      def={DEF_CUENTAS_CONFIGURACION}
      columnas={COLUMNAS_CONFIGURACION}
      ariaLabel="Cuentas de retiro"
      anchoMinimo="36rem"
      {...props}
    />
  );
}
