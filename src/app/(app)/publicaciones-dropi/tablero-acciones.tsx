"use client";

import { KpiFiltro } from "@/components/ui/kpi-filtro";
import { KpiGrid, KpiGroup, type Tono } from "@/components/ui/kpi-card";
import type { AtajoFiltro } from "@/lib/tabla/atajos";
import { MARGEN_BAJO } from "@/lib/publicaciones/publicacion";
import { DEF_PUBLICACIONES, estadoVinculo, type FilaPublicacion } from "./def-publicaciones";

const seleccion = (campo: string, ...valores: string[]) => ({ campo, valor: { tipo: "seleccion" as const, valores } });

interface Accion {
  id: string;
  titulo: string;
  /** Qué publicaciones cuenta (y filtra): las abiertas, sin las archivadas. */
  cuenta: (f: FilaPublicacion) => boolean;
  atajo: AtajoFiltro;
  tono: Tono;
  subtexto?: string;
}

const porEstado = (valor: string, titulo: string, tono: Tono): Accion => ({
  id: valor,
  titulo,
  cuenta: (f) => f.estado === valor,
  atajo: { id: valor, etiqueta: titulo, ayuda: `Filtrar la lista: ${titulo.toLowerCase()}`, filtro: seleccion("estado", valor), suma: true },
  tono,
});

const VINCULOS_SIN_VINCULAR = ["seguro", "sugerido", "varios", "falta_compuesto", "ninguno"];

/** Lo que hay que hacer hoy, en el orden del flujo de trabajo: cada tarjeta cuenta y filtra la lista de abajo. */
const ACCIONES: Accion[] = [
  porEstado("revisar_precio", "Revisar precio y venta", "warning"),
  porEstado("verificar_dropshipper", "Verificar con dropshipper", "destructive"),
  porEstado("validar_bajar_precio", "Validar bajar precio", "warning"),
  porEstado("bajar_precio", "Bajar precio", "info"),
  {
    id: "revision-vencida",
    titulo: "Revisión vencida",
    cuenta: (f) => f.revisionVencida,
    atajo: { id: "revision-vencida", etiqueta: "Revisión vencida", ayuda: "Filtrar la lista: revisión vencida", filtro: seleccion("revision", "vencida") },
    tono: "warning",
  },
  {
    id: "margen-bajo",
    titulo: "Margen bajo",
    subtexto: `menos de ${Math.round(MARGEN_BAJO * 100)} %`,
    cuenta: (f) => f.margen !== null && f.margen < MARGEN_BAJO,
    atajo: { id: "margen-bajo", etiqueta: "Margen bajo", ayuda: "Filtrar la lista: margen bajo", filtro: seleccion("margenBajo", "bajo") },
    tono: "destructive",
  },
  {
    id: "sin-vincular",
    titulo: "Sin vincular a Producto",
    cuenta: (f) => estadoVinculo(f) !== "vinculado",
    atajo: { id: "sin-vincular", etiqueta: "Sin vincular", ayuda: "Filtrar la lista: sin vincular a Producto", filtro: seleccion("vinculo", ...VINCULOS_SIN_VINCULAR) },
    tono: "warning",
  },
  {
    id: "sin-stock",
    titulo: "Sin stock",
    cuenta: (f) => f.estadoVenta === "sin_stock",
    atajo: { id: "sin-stock", etiqueta: "Sin stock", ayuda: "Filtrar la lista: sin stock", filtro: seleccion("venta", "sin_stock") },
    tono: "destructive",
  },
];

/**
 * El tablero de acciones de arriba: lo que está esperando una decisión (los estados del flujo de trabajo, las revisiones
 * vencidas, el margen bajo, lo que falta vincular y lo que no tiene stock). Cada tarjeta cuenta las publicaciones abiertas y,
 * al pulsarla, filtra la lista de abajo; pulsarla otra vez quita el filtro. Los estados del flujo se pueden juntar (uno u otro).
 */
export function TableroAcciones({ publicaciones }: { publicaciones: FilaPublicacion[] }) {
  const abiertas = publicaciones.filter((f) => f.estado !== "archivado");
  return (
    <KpiGroup titulo="Tablero de acciones" accion={<span className="tabular-nums">{abiertas.length} publicaciones abiertas</span>}>
      <KpiGrid compacta>
        {ACCIONES.map((a) => {
          const n = abiertas.filter(a.cuenta).length;
          return <KpiFiltro key={a.id} def={DEF_PUBLICACIONES} atajo={a.atajo} titulo={a.titulo} valor={n} subtexto={a.subtexto} tono={n > 0 ? a.tono : "neutral"} compacta />;
        })}
      </KpiGrid>
    </KpiGroup>
  );
}
