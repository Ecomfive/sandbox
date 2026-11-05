"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { fieldClassSm } from "@/components/ui/field";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { MiniaturaFoto } from "@/components/ui/miniatura-foto";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { InventarioIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { sumaSinCompuestos } from "@/lib/wms/total-stock";
import { DEF_STOCK, ETIQUETA_CLASE_SKU, ETIQUETA_TIPO_SKU, type FilaStock } from "./def-stock";
import { DESCRIPCION_CUBETA } from "./descripciones-stock";
import { FichaStock } from "./ficha-stock";
import type { BodegaOpcion, UbicacionOpcion } from "./panel-movimiento";

const NOMBRE: NombreFilas = { singular: "SKU", plural: "SKUs" };
const ICONOS: Record<string, IconoComp> = { sku: ProductoIcon, existencia: InventarioIcon, tipo: ProductoIcon, clase: ProductoIcon, fisico: InventarioIcon, disponible: InventarioIcon, vencido: InventarioIcon };

/** Una cifra de la tabla: alineada a la derecha, y en rojo si el saldo es negativo. */
function celda(n: number) {
  return <span className={`block text-right tabular-nums ${n < 0 ? "font-medium text-destructive" : n === 0 ? "text-muted-foreground" : ""}`}>{n}</span>;
}

/** El total de una cifra sobre las filas que deja ver la tabla (bodega, búsqueda y filtros), sin los compuestos. */
const total = (valor: (f: FilaStock) => number) => (filas: FilaStock[]) => <span className="block text-right font-semibold tabular-nums">{sumaSinCompuestos(filas, valor).toLocaleString("es-PA")}</span>;

const COLUMNAS: ColumnaTabla<FilaStock>[] = [
  { id: "codigo", label: "Código", ocultable: false, clase: "font-medium", render: (f) => f.codigo, total: () => "Total sin compuestos" },
  { id: "foto", label: "Foto", ocultable: true, render: (f) => <MiniaturaFoto url={f.foto} nombre={f.nombre} /> },
  { id: "nombre", label: "Producto", ocultable: true, render: (f) => f.nombre },
  {
    id: "tipo",
    label: "Tipo",
    ocultable: true,
    clase: "text-muted-foreground",
    render: (f) => (f.tipo === "combo" ? <Badge tone="neutral">{ETIQUETA_TIPO_SKU[f.tipo]}</Badge> : (ETIQUETA_TIPO_SKU[f.tipo] ?? f.tipo)),
  },
  {
    id: "clase",
    label: "Estado",
    ocultable: true,
    render: (f) =>
      f.clase === "test" ? (
        <Badge tone="azul">{ETIQUETA_CLASE_SKU.test}</Badge>
      ) : f.clase === "inactivo" ? (
        <Badge tone="destructive">{ETIQUETA_CLASE_SKU.inactivo}</Badge>
      ) : f.clase === "descontinuado" ? (
        <Badge tone="neutral">{ETIQUETA_CLASE_SKU.descontinuado}</Badge>
      ) : (
        <span className="text-muted-foreground">{ETIQUETA_CLASE_SKU.fisico}</span>
      ),
  },
  { id: "fisico", label: "Físico", descripcion: DESCRIPCION_CUBETA.fisico, ocultable: false, render: (f) => celda(f.fisico), total: total((f) => f.fisico) },
  { id: "reservado", label: "Reservado", descripcion: DESCRIPCION_CUBETA.reservado, ocultable: true, render: (f) => celda(f.reservado), total: total((f) => f.reservado) },
  { id: "disponible", label: "Disponible", descripcion: DESCRIPCION_CUBETA.disponible, ocultable: false, render: (f) => celda(f.disponible), total: total((f) => f.disponible) },
  { id: "danado", label: "Dañado", descripcion: DESCRIPCION_CUBETA.danado, ocultable: true, render: (f) => celda(f.danado), total: total((f) => f.danado) },
  { id: "inspeccion", label: "En inspección", descripcion: DESCRIPCION_CUBETA.inspeccion, ocultable: true, render: (f) => celda(f.inspeccion), total: total((f) => f.inspeccion) },
  { id: "retenido", label: "Retenido", descripcion: DESCRIPCION_CUBETA.retenido, ocultable: true, render: (f) => celda(f.retenido), total: total((f) => f.retenido) },
  { id: "vencido", label: "Vencido", descripcion: DESCRIPCION_CUBETA.vencido, ocultable: true, render: (f) => celda(f.vencido), total: total((f) => f.vencido) },
  { id: "enCamino", label: "En camino", descripcion: DESCRIPCION_CUBETA.enCamino, ocultable: true, render: (f) => celda(f.enCamino), total: total((f) => f.enCamino) },
];

/** Los totales arriba de la tabla, a la vista sin bajar ni descargar: cambian con la bodega, la búsqueda y los filtros. */
function ResumenStock({ filas }: { filas: FilaStock[] }) {
  const num = (n: number) => n.toLocaleString("es-PA");
  const conStock = filas.filter((f) => f.tipo !== "combo" && f.fisico !== 0).length;
  return (
    <KpiGrid compacta>
      <KpiCard compacta titulo="Unidades físicas" valor={num(sumaSinCompuestos(filas, (f) => f.fisico))} subtexto="Sin contar compuestos" />
      <KpiCard compacta titulo="Disponibles" valor={num(sumaSinCompuestos(filas, (f) => f.disponible))} subtexto="Las que se pueden vender" />
      <KpiCard compacta titulo="Productos con stock" valor={num(conStock)} subtexto="Sin contar compuestos" />
    </KpiGrid>
  );
}

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
  codigoPais,
  bodegasExternas,
}: {
  filas: FilaStock[];
  bodegas: { id: string; nombre: string; externa: boolean }[];
  bodegaElegida: string;
  bodegasPropias: BodegaOpcion[];
  ubicaciones: UbicacionOpcion[];
  puedeEscribir: boolean;
  /** El país de la barra de arriba: la ficha muestra las compras de ese país (el stock también es de ese país). */
  codigoPais: string;
  bodegasExternas: BodegaOpcion[];
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
        resumen={(visibles) => <ResumenStock filas={visibles} />}
        abrirFila={{ etiqueta: (f) => `Abrir el inventario del SKU ${f.codigo}`, alAbrir: (f) => setAbierto(f.id) }}
        ariaLabel="Inventario por SKU"
        vacio="Todavía no hay SKUs maestros."
      />
      <FichaStock
        sku={sku}
        bodegasPropias={bodegasPropias}
        ubicaciones={ubicaciones}
        puedeEscribir={puedeEscribir}
        codigoPais={codigoPais}
        bodegasExternas={bodegasExternas}
        alCerrar={() => setAbierto(null)}
        alCambiar={() => router.refresh()}
      />
    </>
  );
}
