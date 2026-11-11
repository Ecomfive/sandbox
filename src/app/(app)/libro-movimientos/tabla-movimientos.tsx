"use client";

import { useState } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { claseCifra } from "@/components/af4/estilos-af4";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero, SIN_DATO } from "@/lib/af4/formato";
import { CalendarioIcon, ExtractoIcon, GastoIcon, PedidoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import type { Opcion } from "@/lib/finanzas/cargar-pendientes";
import { BarraClasificar } from "./barra-clasificar";
import { CrearMovimientoPanel } from "./crear-movimiento-panel";
import { FichaMovimiento } from "./ficha-movimiento";
import { LeerFacturaPanel } from "./leer-factura-panel";
import { PegarExcel } from "./pegar-excel";
import { DEF_MOVIMIENTOS, type FilaMovimiento } from "./def-movimientos";

const NOMBRE: NombreFilas = { singular: "movimiento", plural: "movimientos" };
const ICONOS: Record<string, IconoComp> = {
  estado: PedidoIcon,
  tienda: TiendaIcon,
  proveedor: TiendaIcon,
  revision: GastoIcon,
  seccion: GastoIcon,
  tipo: GastoIcon,
  cuenta: ExtractoIcon,
  eerr: GastoIcon,
  flujo: ExtractoIcon,
  descripcion: GastoIcon,
  monto: GastoIcon,
  fecha: CalendarioIcon,
  origen: ExtractoIcon,
};

const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

const PUNTO: Record<FilaMovimiento["estado"], string> = {
  Clasificado: "",
  "Sin tienda": "bg-warning",
  "Sin tipo": "bg-warning",
  Anulado: "bg-destructive",
};

const COLUMNAS: ColumnaTabla<FilaMovimiento, null>[] = [
  { id: "fecha", label: "Pago", ocultable: false, clase: `whitespace-nowrap ${claseCifra}`, render: (m) => (m.fecha ? fechaCorta(m.fecha) : SIN_DATO) },
  {
    id: "tienda",
    label: "Tienda",
    ocultable: true,
    render: (m) => (
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        {m.estado !== "Clasificado" && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${PUNTO[m.estado]}`} />}
        {m.tienda}
        {m.estado !== "Clasificado" && <span className="sr-only"> ({m.estado})</span>}
      </span>
    ),
  },
  { id: "tipo", label: "Tipo", ocultable: true, render: (m) => m.tipo },
  { id: "proveedor", label: "Proveedor", ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: (m) => (m.proveedor === "Sin proveedor" ? SIN_DATO : m.proveedor) },
  { id: "descripcion", label: "Descripción", ocultable: true, clase: "max-w-md truncate", render: (m) => m.descripcion },
  { id: "cuenta", label: "Forma de pago", ocultable: true, clase: "text-muted-foreground whitespace-nowrap", render: (m) => m.cuenta },
  { id: "eerr", label: "EERR", ocultable: true, clase: "text-muted-foreground", render: (m) => m.eerr },
  {
    id: "monto",
    label: "Monto",
    ocultable: false,
    clase: `text-right whitespace-nowrap ${claseCifra}`,
    render: (m) => (
      <span className={`inline-flex items-center gap-1.5 ${m.anulado ? "text-muted-foreground line-through" : ""}`}>
        {m.atipico && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />}
        {usd(m.monto)}
        {m.atipico && <span className="sr-only"> (atípico: {m.atipico.veces} veces la mediana de su tipo)</span>}
      </span>
    ),
  },
];

/**
 * Los movimientos de un mes, con la barra de herramientas común (agrupar, filtros, columnas, descargar), «Pegar desde
 * Excel» y «Agregar». Toda la fila abre la ficha del movimiento, que ya es el formulario.
 */
export function TablaMovimientos({
  filas,
  tiendas,
  tipos,
  cuentas,
  mes,
  abrirInicial = null,
  puedeEscribir,
  iaDisponible = false,
}: {
  filas: FilaMovimiento[];
  tiendas: Opcion[];
  tipos: Opcion[];
  cuentas: Opcion[];
  mes: string;
  /** Un movimiento que se abre al entrar (`?mov=` desde el desglose del EERR). */
  abrirInicial?: string | null;
  puedeEscribir: boolean;
  iaDisponible?: boolean;
}) {
  const [abierta, setAbierta] = useState<{ id: string; orden: string[] } | null>(() =>
    abrirInicial && filas.some((f) => f.id === abrirInicial) ? { id: abrirInicial, orden: filas.map((f) => f.id) } : null,
  );
  return (
    <>
      <TablaDatos
        def={DEF_MOVIMIENTOS}
        filas={filas}
        columnas={COLUMNAS}
        contexto={null}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(m) => m.id}
        formatearTotal={usd}
        accionPrincipal={
          puedeEscribir ? (
            <>
              <LeerFacturaPanel disponible={iaDisponible} tiendas={tiendas} tipos={tipos} cuentas={cuentas} mes={mes} />
              <PegarExcel tiendas={tiendas} tipos={tipos} cuentas={cuentas} />
              <CrearMovimientoPanel tiendas={tiendas} tipos={tipos} cuentas={cuentas} mes={mes} />
            </>
          ) : undefined
        }
        abrirFila={{
          etiqueta: (m) => `Abrir el movimiento «${m.descripcion.slice(0, 40)}» de ${usd(m.monto)}`,
          alAbrir: (m, orden) => setAbierta({ id: m.id, orden }),
        }}
        seleccion={
          puedeEscribir
            ? {
                etiqueta: (m) => `Seleccionar «${m.descripcion.slice(0, 40)}» de ${usd(m.monto)}`,
                barra: (marcadas, quitar) => <BarraClasificar marcadas={marcadas} quitar={quitar} tiendas={tiendas} tipos={tipos} />,
              }
            : undefined
        }
        ariaLabel="Movimientos del mes"
        vacio="No hay movimientos en este mes."
      />
      <FichaMovimiento
        movimiento={abierta ? filas.find((f) => f.id === abierta.id) : undefined}
        orden={abierta?.orden ?? []}
        irA={(id) => setAbierta((a) => (a ? { ...a, id } : a))}
        tiendas={tiendas}
        tipos={tipos}
        cuentas={cuentas}
        puedeEscribir={puedeEscribir}
        alCerrar={() => setAbierta(null)}
      />
    </>
  );
}
