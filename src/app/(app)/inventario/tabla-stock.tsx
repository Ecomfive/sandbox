"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { fieldClassSm } from "@/components/ui/field";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { InventarioIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { DEF_STOCK, ETIQUETA_TIPO_SKU, type FilaStock } from "./def-stock";
import { FichaStock } from "./ficha-stock";
import type { BodegaOpcion, UbicacionOpcion } from "./panel-movimiento";

const NOMBRE: NombreFilas = { singular: "SKU", plural: "SKUs" };
const ICONOS: Record<string, IconoComp> = { sku: ProductoIcon, existencia: InventarioIcon, tipo: ProductoIcon, fisico: InventarioIcon, disponible: InventarioIcon };

/** Una cifra de la tabla: alineada a la derecha, y en rojo si el saldo es negativo. */
function celda(n: number) {
  return <span className={`block text-right tabular-nums ${n < 0 ? "font-medium text-destructive" : n === 0 ? "text-muted-foreground" : ""}`}>{n}</span>;
}

const COLUMNAS: ColumnaTabla<FilaStock>[] = [
  { id: "codigo", label: "Código", ocultable: false, clase: "font-medium", render: (f) => f.codigo },
  { id: "nombre", label: "Producto", ocultable: true, render: (f) => f.nombre },
  {
    id: "tipo",
    label: "Tipo",
    ocultable: true,
    clase: "text-muted-foreground",
    render: (f) => (f.tipo === "combo" ? <Badge tone="neutral">{ETIQUETA_TIPO_SKU[f.tipo]}</Badge> : (ETIQUETA_TIPO_SKU[f.tipo] ?? f.tipo)),
  },
  { id: "fisico", label: "Físico", ocultable: false, render: (f) => celda(f.fisico) },
  { id: "reservado", label: "Reservado", ocultable: true, render: (f) => celda(f.reservado) },
  { id: "disponible", label: "Disponible", ocultable: false, render: (f) => celda(f.disponible) },
  { id: "danado", label: "Dañado", ocultable: true, render: (f) => celda(f.danado) },
  { id: "inspeccion", label: "En inspección", ocultable: true, render: (f) => celda(f.inspeccion) },
  { id: "retenido", label: "Retenido", ocultable: true, render: (f) => celda(f.retenido) },
  { id: "enCamino", label: "En camino", ocultable: true, render: (f) => celda(f.enCamino) },
];

/** Elige de qué bodega se ve el stock (todas las del país, o una): se guarda en la dirección, `?bodega=`. */
function SelectorBodega({ bodegas, elegida }: { bodegas: { id: string; nombre: string; externa: boolean }[]; elegida: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select
      aria-label="Bodega"
      value={elegida}
      onChange={(e) => router.replace(e.target.value ? `${pathname}?bodega=${e.target.value}` : pathname)}
      className={fieldClassSm}
    >
      <option value="">Todas las bodegas</option>
      {bodegas.map((b) => (
        <option key={b.id} value={b.id}>
          {b.nombre}
          {b.externa ? " (externa)" : ""}
        </option>
      ))}
    </select>
  );
}

/**
 * Inventario por SKU maestro: lo que hay en las bodegas del país (o en una), en cubetas. Empieza en cero y un saldo puede
 * quedar negativo (se ve en rojo) hasta que se registren las entradas o se conecten las fuentes. **La tabla no tiene
 * columna de acciones**: toda la fila abre la ficha del SKU con su stock por bodega, sus movimientos y los botones de
 * entrada, salida y ajuste.
 */
export function TablaStock({
  filas,
  bodegas,
  bodegaElegida,
  bodegasPropias,
  ubicaciones,
  puedeEscribir,
}: {
  filas: FilaStock[];
  bodegas: { id: string; nombre: string; externa: boolean }[];
  bodegaElegida: string;
  bodegasPropias: BodegaOpcion[];
  ubicaciones: UbicacionOpcion[];
  puedeEscribir: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<string | null>(null);
  const sku = abierto ? filas.find((f) => f.id === abierto) : undefined;

  return (
    <>
      <TablaDatos
        def={DEF_STOCK}
        filas={filas}
        columnas={COLUMNAS}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        anchoMinimo="60rem"
        accionPrincipal={<SelectorBodega bodegas={bodegas} elegida={bodegaElegida} />}
        abrirFila={{ etiqueta: (f) => `Abrir el inventario del SKU ${f.codigo}`, alAbrir: (f) => setAbierto(f.id) }}
        ariaLabel="Inventario por SKU"
        vacio="Todavía no hay SKUs maestros."
      />
      <FichaStock
        sku={sku}
        bodegasPropias={bodegasPropias}
        ubicaciones={ubicaciones}
        puedeEscribir={puedeEscribir}
        alCerrar={() => setAbierto(null)}
        alCambiar={() => router.refresh()}
      />
    </>
  );
}
