"use client";

import type { ComponentType } from "react";
import { COLORES, type Color } from "@/components/panel/colores-tablero";
import { useFiltros } from "@/components/tabla/ganchos";
import { anilloFoco } from "@/components/ui/field";
import { EnlaceIcon, InventarioIcon, MargenIcon, TiendaIcon } from "@/lib/nav-icons";
import { MARGEN_BAJO } from "@/lib/publicaciones/publicacion";
import { alternarAtajo, atajoActivo, type AtajoFiltro } from "@/lib/tabla/atajos";
import { DEF_PUBLICACIONES_DUNAMIXFY, POCO_STOCK_DUNAMIXFY, estadoVinculoDunamixfy, margenBajoDunamixfy, pocoStockDunamixfy, sinStockDunamixfy, type FilaPublicacionDunamixfy } from "./def-publicaciones-dunamixfy";

const seleccion = (campo: string, ...valores: string[]) => ({ campo, valor: { tipo: "seleccion" as const, valores } });

interface Tarjeta {
  id: string;
  titulo: string;
  detalle: string;
  icono: ComponentType<{ className?: string }>;
  color: Color;
  cuenta: (f: FilaPublicacionDunamixfy) => boolean;
  atajo: AtajoFiltro;
}

/** Solo las tarjetas que Dunamixfy puede llenar: lo que la plataforma no usa no se dibuja. */
const TARJETAS: Tarjeta[] = [
  {
    id: "en-dunamixfy",
    titulo: "En Dunamixfy",
    detalle: "Productos conectados",
    icono: TiendaIcon,
    color: "verde",
    cuenta: (f) => f.conectado,
    atajo: { id: "en-dunamixfy", etiqueta: "En Dunamixfy", ayuda: "Filtrar la lista: conectados con Dunamixfy", filtro: seleccion("conexion", "conectado", "inactivo") },
  },
  {
    id: "sin-vincular",
    titulo: "Sin vincular producto",
    detalle: "Su ID de Dunamixfy sin vincular a un producto",
    icono: EnlaceIcon,
    color: "violeta",
    cuenta: (f) => estadoVinculoDunamixfy(f) !== "vinculado",
    atajo: { id: "sin-vincular", etiqueta: "Sin vincular producto", ayuda: "Filtrar la lista: sin vincular a Producto", filtro: seleccion("vinculo", "sugerido", "sin_vincular") },
  },
  {
    id: "margen-bajo",
    titulo: "Margen bajo",
    detalle: `Utilidad por debajo del ${Math.round(MARGEN_BAJO * 100)} %`,
    icono: MargenIcon,
    color: "rojo",
    cuenta: margenBajoDunamixfy,
    atajo: { id: "margen-bajo", etiqueta: "Margen bajo", ayuda: "Filtrar la lista: margen bajo", filtro: seleccion("margenNivel", "bajo") },
  },
  {
    id: "sin-stock",
    titulo: "Sin stock",
    detalle: "Con 0 unidades en Dunamixfy",
    icono: InventarioIcon,
    color: "rojo",
    cuenta: sinStockDunamixfy,
    atajo: { id: "sin-stock", etiqueta: "Sin stock", ayuda: "Filtrar la lista: sin stock en Dunamixfy", filtro: seleccion("stockNivel", "sin_stock") },
  },
  {
    id: "poco-stock",
    titulo: "Poco stock",
    detalle: `Menos de ${POCO_STOCK_DUNAMIXFY} unidades en Dunamixfy`,
    icono: InventarioIcon,
    color: "ambar",
    cuenta: pocoStockDunamixfy,
    atajo: { id: "poco-stock", etiqueta: "Poco stock", ayuda: `Filtrar la lista: menos de ${POCO_STOCK_DUNAMIXFY} unidades`, filtro: seleccion("stockNivel", "poco") },
  },
];

/** El tablero de Gestión de IDs Dunamixfy: cada tarjeta cuenta y, al pulsarla, filtra la lista; pulsarla otra vez quita el filtro. */
export function TableroDunamixfy({ publicaciones }: { publicaciones: FilaPublicacionDunamixfy[] }) {
  const [filtros, cambiarFiltros] = useFiltros(DEF_PUBLICACIONES_DUNAMIXFY);
  return (
    <section aria-label="Tablero de acciones" className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
      {TARJETAS.map((t) => {
        const c = COLORES[t.color];
        const Icono = t.icono;
        const activa = atajoActivo(filtros, t.atajo);
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={activa}
            onClick={() => cambiarFiltros(alternarAtajo(filtros, t.atajo))}
            className={`group flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${anilloFoco} ${
              activa ? `ring-2 ${c.activa}` : "border-border"
            }`}
          >
            <span className="flex items-center gap-3">
              <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.icono}`}>
                <Icono className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 text-xs leading-tight font-medium tracking-wide text-muted-foreground uppercase hyphens-auto">{t.titulo}</span>
            </span>
            <span className={`text-3xl leading-none font-semibold tabular-nums ${c.numero}`}>{publicaciones.filter(t.cuenta).length.toLocaleString("es-PA")}</span>
            <span className="text-xs text-muted-foreground">
              {t.detalle}
              <span className="sr-only">. {activa ? "Filtrando la lista." : t.atajo.ayuda}</span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
