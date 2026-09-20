"use client";

import { Button } from "@/components/ui/button";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import { CalendarioIcon, GastoIcon, PedidoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { eliminarGasto } from "./actions";
import { DEF_GASTOS, etiquetaCategoria, type FilaGasto } from "./def-gastos";

const NOMBRE: NombreFilas = { singular: "gasto", plural: "gastos" };
const ICONOS: Record<string, IconoComp> = {
  categoria: PedidoIcon,
  descripcion: GastoIcon,
  monto: GastoIcon,
  fecha: CalendarioIcon,
};

const COLUMNAS: ColumnaTabla<FilaGasto, string>[] = [
  { id: "fecha", label: "Fecha", ocultable: false, render: (g) => formatearFecha(g.fecha) },
  { id: "categoria", label: "Categoría", ocultable: true, clase: "text-muted-foreground", render: (g) => etiquetaCategoria(g.categoria) },
  { id: "descripcion", label: "Descripción", ocultable: true, render: (g) => g.descripcion },
  { id: "monto", label: "Monto", ocultable: true, clase: "tabular-nums", render: (g, codigoPais) => formatearMoneda(g.monto, codigoPais) },
];

/** Tabla de gastos recientes con la barra de herramientas común (agrupar por categoría, filtros y columnas). */
export function TablaGastos({ gastos, codigoPais }: { gastos: FilaGasto[]; codigoPais: string }) {
  return (
    <TablaDatos
      def={DEF_GASTOS}
      filas={gastos}
      columnas={COLUMNAS}
      contexto={codigoPais}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(g) => g.id}
      formatearTotal={(total) => formatearMoneda(total, codigoPais)}
      accion={{
        etiqueta: "Acciones",
        render: (g) => (
          <form action={eliminarGasto}>
            <input type="hidden" name="id" value={g.id} />
            <Button type="submit" variant="ghost" className="text-xs">
              Eliminar
            </Button>
          </form>
        ),
      }}
      ariaLabel="Tabla de gastos recientes"
      vacio="Todavía no hay gastos registrados."
    />
  );
}
