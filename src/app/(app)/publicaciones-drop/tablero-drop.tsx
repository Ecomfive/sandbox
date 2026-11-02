"use client";

import type { ComponentType } from "react";
import { COLORES, type Color } from "@/components/panel/colores-tablero";
import { useFiltros } from "@/components/tabla/ganchos";
import { anilloFoco } from "@/components/ui/field";
import { alternarAtajo, atajoActivo, type AtajoFiltro } from "@/lib/tabla/atajos";
import { AnalisisCompetenciaIcon, DesconectadoIcon, DropshipperIcon, EnlaceIcon, EstadoIcon, InventarioIcon, MargenIcon, SugerenciaIcon, TiendaIcon, VentasIcon } from "@/lib/nav-icons";
import { MARGEN_BAJO } from "@/lib/publicaciones/publicacion";
import { DEF_PUBLICACIONES_DROP, POCO_STOCK_DROP, estadoVinculoDrop, margenBajoDrop, pocoStockDrop, sinStockDrop, type FilaPublicacionDrop } from "./def-publicaciones-drop";

const seleccion = (campo: string, ...valores: string[]) => ({ campo, valor: { tipo: "seleccion" as const, valores } });

interface Tarjeta {
  id: string;
  titulo: string;
  detalle: string;
  icono: ComponentType<{ className?: string }>;
  color: Color;
  /** Qué publicaciones cuenta y filtra. Sin él, la tarjeta espera datos que Drop todavía no da (ventas, competencia…) y no filtra. */
  cuenta?: (f: FilaPublicacionDrop) => boolean;
  atajo?: AtajoFiltro;
  /** Un segundo número junto al grande: «/ 89» (el total). */
  junto?: (todas: FilaPublicacionDrop[]) => string;
}

/** Las tarjetas de Gestión de IDs Dropi que valen para Drop (sin «Republicar»: Drop no republica). Las que tienen datos cuentan y filtran la lista. */
const TARJETAS: Tarjeta[] = [
  {
    id: "activas",
    titulo: "Activas en Drop",
    detalle: "Publicadas y activas según Drop",
    icono: TiendaIcon,
    color: "verde",
    cuenta: (f) => f.estado === "activo",
    junto: (todas) => todas.length.toLocaleString("es-PA"),
    atajo: { id: "activas", etiqueta: "Activas en Drop", ayuda: "Filtrar la lista: activas en Drop", filtro: seleccion("estado", "activo") },
  },
  {
    id: "margen-bajo",
    titulo: "Margen bajo",
    detalle: `Utilidad por debajo del ${Math.round(MARGEN_BAJO * 100)} % (con el costo de su producto en Dropi)`,
    icono: MargenIcon,
    color: "rojo",
    cuenta: margenBajoDrop,
    atajo: { id: "margen-bajo", etiqueta: "Margen bajo", ayuda: "Filtrar la lista: margen bajo", filtro: seleccion("margen", "bajo") },
  },
  { id: "ventas-caida", titulo: "Ventas en caída", detalle: "Todavía sin las ventas de Drop", icono: VentasIcon, color: "ambar" },
  { id: "bajar-precio", titulo: "Bajar precio", detalle: "Todavía sin la competencia en Drop", icono: AnalisisCompetenciaIcon, color: "rojo" },
  { id: "verificar-dropshipper", titulo: "Verificar dropshipper", detalle: "Todavía sin los privatizados de Drop", icono: DropshipperIcon, color: "azul" },
  { id: "recomendaciones", titulo: "Recomendaciones", detalle: "Todavía sin datos de Drop", icono: SugerenciaIcon, color: "violeta" },
  { id: "por-optimizar", titulo: "Por optimizar", detalle: "Todavía sin datos de Drop", icono: EstadoIcon, color: "azul" },
  {
    id: "sin-id",
    titulo: "Sin ID de Drop",
    detalle: "Publicaciones sin su ID de Drop",
    icono: DesconectadoIcon,
    color: "rojo",
    cuenta: (f) => !f.idDrop.trim(),
    atajo: { id: "sin-id", etiqueta: "Sin ID de Drop", ayuda: "Filtrar la lista: sin ID de Drop", filtro: seleccion("idDrop", "sin_id") },
  },
  {
    id: "sin-vincular",
    titulo: "Sin vincular producto",
    detalle: "Su SKU de Drop sin vincular a un producto",
    icono: EnlaceIcon,
    color: "violeta",
    cuenta: (f) => estadoVinculoDrop(f) !== "vinculado",
    atajo: { id: "sin-vincular", etiqueta: "Sin vincular producto", ayuda: "Filtrar la lista: sin vincular a Producto", filtro: seleccion("vinculo", "sugerido", "sin_vincular") },
  },
  {
    id: "sin-stock",
    titulo: "Sin stock",
    detalle: "Activas en Drop con 0 unidades",
    icono: InventarioIcon,
    color: "rojo",
    cuenta: sinStockDrop,
    atajo: { id: "sin-stock", etiqueta: "Sin stock", ayuda: "Filtrar la lista: activas en Drop sin stock", filtro: seleccion("stock", "sin_stock") },
  },
  {
    id: "poco-stock",
    titulo: "Poco stock",
    detalle: `Activas con menos de ${POCO_STOCK_DROP} unidades`,
    icono: InventarioIcon,
    color: "ambar",
    cuenta: pocoStockDrop,
    atajo: { id: "poco-stock", etiqueta: "Poco stock", ayuda: `Filtrar la lista: menos de ${POCO_STOCK_DROP} unidades`, filtro: seleccion("stock", "poco") },
  },
];

/**
 * El tablero de acciones de Gestión de IDs Drop, igual al de Dropi. Las tarjetas con datos de Drop (activas, margen, ID, vínculo y stock) cuentan las
 * publicaciones y, al pulsarlas, filtran la lista de abajo; pulsarlas otra vez quita el filtro. Las que esperan datos que Drop todavía no da (ventas,
 * competencia, privatizados) se ven con «—» y no filtran.
 */
export function TableroDrop({ publicaciones }: { publicaciones: FilaPublicacionDrop[] }) {
  const [filtros, cambiarFiltros] = useFiltros(DEF_PUBLICACIONES_DROP);
  return (
    <section aria-label="Tablero de acciones" className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
      {TARJETAS.map((t) => {
        const c = COLORES[t.color];
        const Icono = t.icono;
        const valor = t.cuenta ? publicaciones.filter(t.cuenta).length : null;
        const activa = !!t.atajo && atajoActivo(filtros, t.atajo);
        const contenido = (
          <>
            <span className="flex items-center gap-3">
              <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.icono}`}>
                <Icono className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 text-xs leading-tight font-medium tracking-wide text-muted-foreground uppercase hyphens-auto">{t.titulo}</span>
            </span>
            <span className="flex items-baseline gap-1">
              <span className={`text-3xl leading-none font-semibold tabular-nums ${valor === null ? "text-muted-foreground" : c.numero}`}>{valor === null ? "—" : valor.toLocaleString("es-PA")}</span>
              {t.junto && valor !== null && <span className="text-sm text-muted-foreground tabular-nums">/ {t.junto(publicaciones)}</span>}
            </span>
            <span className="text-xs text-muted-foreground">
              {t.detalle}
              {t.atajo && <span className="sr-only">. {activa ? "Filtrando la lista." : t.atajo.ayuda}</span>}
            </span>
          </>
        );
        if (!t.atajo)
          return (
            <div key={t.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
              {contenido}
            </div>
          );
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={activa}
            onClick={() => cambiarFiltros(alternarAtajo(filtros, t.atajo!))}
            className={`group flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${anilloFoco} ${
              activa ? `ring-2 ${c.activa}` : "border-border"
            }`}
          >
            {contenido}
          </button>
        );
      })}
    </section>
  );
}
