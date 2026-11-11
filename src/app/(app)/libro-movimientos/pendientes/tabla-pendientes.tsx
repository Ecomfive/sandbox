"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { claseCifra } from "@/components/af4/estilos-af4";
import { fechaCorta, mesCorto } from "@/lib/af4/fecha";
import { dinero, porcentaje, SIN_DATO } from "@/lib/af4/formato";
import { CalendarioIcon, ExtractoIcon, GastoIcon, PedidoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import type { FilaPendiente, Opcion } from "@/lib/finanzas/cargar-pendientes";
import { BarraClasificar } from "../barra-clasificar";
import { DEF_PENDIENTES } from "./def-pendientes";
import { AceptarSugerencia } from "./aceptar-sugerencia";

const NOMBRE: NombreFilas = { singular: "movimiento", plural: "movimientos" };
const ICONOS: Record<string, IconoComp> = {
  sugOrigen: PedidoIcon,
  nivel: PedidoIcon,
  falta: PedidoIcon,
  periodo: CalendarioIcon,
  cuenta: ExtractoIcon,
  tienda: TiendaIcon,
  descripcion: GastoIcon,
  monto: GastoIcon,
};
const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

const PUNTO_NIVEL: Record<FilaPendiente["nivel"], string> = { Alta: "bg-success", Media: "bg-warning", Baja: "bg-muted-foreground", "Sin sugerencia": "" };

interface Contexto {
  puedeEscribir: boolean;
}

const COLUMNAS: ColumnaTabla<FilaPendiente, Contexto>[] = [
  { id: "periodo", label: "Mes", ocultable: false, clase: "whitespace-nowrap", render: (f) => mesCorto(f.periodo) },
  { id: "descripcion", label: "Descripción", ocultable: false, clase: "max-w-md", render: (f) => (
    <span className="flex flex-col">
      <span className="truncate">{f.descripcion || SIN_DATO}</span>
      <span className="text-xs text-muted-foreground">{[f.fecha ? fechaCorta(f.fecha) : "", f.cuenta].filter(Boolean).join(" · ")}</span>
    </span>
  ) },
  { id: "tienda", label: "Tienda", ocultable: true, clase: "whitespace-nowrap", render: (f) => f.tienda },
  { id: "tipo", label: "Tipo", ocultable: true, render: (f) => f.tipo },
  {
    id: "sugerencia",
    label: "Sugerencia",
    ocultable: true,
    render: (f, ctx) =>
      f.sugOrigen === "Sin sugerencia" ? (
        <span className="text-muted-foreground">{SIN_DATO}</span>
      ) : (
        <span className="flex items-start gap-2">
          <span className="flex min-w-0 flex-col">
            <span>{[f.sugTienda, f.sugTipo].filter(Boolean).join(" · ")}</span>
            <span className="text-xs text-muted-foreground">{f.sugDetalle}</span>
          </span>
          {ctx?.puedeEscribir && <AceptarSugerencia fila={f} />}
        </span>
      ),
  },
  {
    id: "confianza",
    label: "Confianza",
    ocultable: true,
    clase: `whitespace-nowrap text-right ${claseCifra}`,
    render: (f) =>
      f.confianza === null ? (
        <span className="text-muted-foreground">{SIN_DATO}</span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${PUNTO_NIVEL[f.nivel]}`} />
          {porcentaje(f.confianza, { decimales: 0 })}
          <span className="sr-only"> ({f.nivel})</span>
        </span>
      ),
  },
  { id: "monto", label: "Monto", ocultable: false, clase: `text-right whitespace-nowrap ${claseCifra}`, render: (f) => usd(f.monto) },
];

/**
 * La bandeja de lo que falta clasificar. Se marcan filas y la barra de abajo deja aceptar sus sugerencias o ponerles a
 * todas la misma tienda y/o tipo. Lo clasificado sale de la bandeja y entra al EERR.
 */
export function TablaPendientes({ filas, tiendas, tipos, puedeEscribir }: { filas: FilaPendiente[]; tiendas: Opcion[]; tipos: Opcion[]; puedeEscribir: boolean }) {
  return (
    <TablaDatos
      def={DEF_PENDIENTES}
      filas={filas}
      // Agrupada desde el principio: sin esto se veían todas las filas de una vez (cientos).
      paginarSiempre
      columnas={COLUMNAS}
      contexto={{ puedeEscribir }}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(f) => f.id}
      formatearTotal={usd}
      ariaLabel="Movimientos por clasificar"
      vacio="No hay nada por clasificar: todo el libro tiene tienda y tipo."
      seleccion={
        puedeEscribir
          ? {
              etiqueta: (f) => `Seleccionar «${f.descripcion.slice(0, 40)}» de ${usd(f.monto)}`,
              barra: (marcadas, quitar) => <BarraClasificar marcadas={marcadas} quitar={quitar} tiendas={tiendas} tipos={tipos} />,
            }
          : undefined
      }
    />
  );
}

