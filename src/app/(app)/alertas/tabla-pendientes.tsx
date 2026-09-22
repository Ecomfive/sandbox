"use client";

import { Button } from "@/components/ui/button";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { InventarioIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { generarAlerta } from "./actions";
import { DEF_PENDIENTES, type FilaPendiente } from "./def-pendientes";

const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };
const ICONOS: Record<string, IconoComp> = { sku: ProductoIcon, producto: ProductoIcon, pendiente: InventarioIcon };

const COLUMNAS: ColumnaTabla<FilaPendiente>[] = [
  { id: "sku", label: "SKU", ocultable: false, clase: "font-medium", render: (p) => p.sku },
  { id: "producto", label: "Producto", ocultable: true, clase: "text-muted-foreground", render: (p) => p.nombre },
  { id: "pendiente", label: "Pendiente", ocultable: true, clase: "tabular-nums", render: (p) => p.pendiente },
];

/** Inventario pendiente de retorno con la barra de herramientas común (filtros, columnas y descarga). */
export function TablaPendientes({ pendientes, puedeEscribir }: { pendientes: FilaPendiente[]; puedeEscribir: boolean }) {
  return (
    <TablaDatos
      def={DEF_PENDIENTES}
      filas={pendientes}
      columnas={COLUMNAS}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(p) => p.productoId}
      anchoMinimo="32rem"
      accion={
        puedeEscribir
          ? {
              etiqueta: "Acción",
              render: (p) => (
                <form action={generarAlerta} className="text-right">
                  <input type="hidden" name="pais_id" value={p.paisId} />
                  <input type="hidden" name="producto_id" value={p.productoId} />
                  <input type="hidden" name="cantidad" value={p.pendiente} />
                  <Button type="submit" variant="secondary" className="px-3 py-1 text-xs">
                    Generar alerta
                  </Button>
                </form>
              ),
            }
          : undefined
      }
      ariaLabel="Inventario pendiente de retorno"
      vacio="No hay inventario pendiente por ahora."
    />
  );
}
