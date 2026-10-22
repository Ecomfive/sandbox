"use client";

import { KpiFiltro } from "@/components/ui/kpi-filtro";
import { KpiGroup, type Tono } from "@/components/ui/kpi-card";
import type { AtajoFiltro } from "@/lib/tabla/atajos";
import { ACCIONES as ACCIONES_CALCULADAS, type Accion as AccionCalculada } from "@/lib/publicaciones/automatico";
import type { DefTabla } from "@/lib/tabla/motor";
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

/** Una tarjeta por cada acción calculada (21 oct 2026): cuenta y filtra por el campo «Acción». */
const porAccion = (valor: AccionCalculada, tono: Tono): Accion => {
  const a = ACCIONES_CALCULADAS.find((x) => x.valor === valor)!;
  return {
    id: valor,
    titulo: a.etiqueta,
    subtexto: a.detalle.toLowerCase(),
    cuenta: (f) => f.acciones.includes(valor),
    atajo: { id: valor, etiqueta: a.etiqueta, ayuda: `Filtrar la lista: ${a.etiqueta.toLowerCase()}`, filtro: seleccion("accion", valor), suma: true },
    tono,
  };
};

const VINCULOS_SIN_VINCULAR = ["seguro", "sugerido", "varios", "falta_compuesto", "ninguno"];

/** Lo que hay que hacer hoy (calculado de Dropi, el margen y la competencia): cada tarjeta cuenta y filtra la lista de abajo. */
const ACCIONES: Accion[] = [
  porAccion("nuevo", "info"),
  porAccion("revisar_precio", "warning"),
  porAccion("bajar_precio", "warning"),
  porAccion("verificar_dropshipper", "destructive"),
  {
    id: "sin-vincular",
    titulo: "Sin vincular a Producto",
    cuenta: (f) => estadoVinculo(f) !== "vinculado",
    atajo: { id: "sin-vincular", etiqueta: "Sin vincular", ayuda: "Filtrar la lista: sin vincular a Producto", filtro: seleccion("vinculo", ...VINCULOS_SIN_VINCULAR) },
    tono: "warning",
  },
  {
    id: "sin-stock",
    // Según el stock que reporta Dropi (antes, el «Estado de venta» manual): sin stock y con ventas en los últimos 30 días.
    titulo: "Sin stock",
    cuenta: (f) => f.ventas?.stockEstado === "sin_stock_vende",
    atajo: { id: "sin-stock", etiqueta: "Sin stock", ayuda: "Filtrar la lista: sin stock en Dropi y con ventas", filtro: seleccion("stockDropi", "sin_stock_vende") },
    tono: "destructive",
  },
];

/**
 * El tablero de acciones de arriba: lo que está esperando una decisión (las acciones calculadas, lo que falta vincular y lo
 * que no tiene stock). Cada tarjeta cuenta las publicaciones abiertas y, al pulsarla, filtra la lista de abajo; pulsarla otra
 * vez quita el filtro. Las acciones se pueden juntar (una u otra).
 */
export function TableroAcciones({ publicaciones, def = DEF_PUBLICACIONES }: { publicaciones: FilaPublicacion[]; def?: DefTabla<FilaPublicacion> }) {
  const abiertas = publicaciones.filter((f) => !f.archivada);
  return (
    <KpiGroup titulo="Tablero de acciones" accion={<span className="tabular-nums">{abiertas.length} publicaciones abiertas</span>}>
      {/* Seis tarjetas: 2 por fila en el celular, 3 en tablet y las seis juntas en una pantalla ancha. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6 [&>*]:min-w-0">
        {ACCIONES.map((a) => {
          const n = abiertas.filter(a.cuenta).length;
          return <KpiFiltro key={a.id} def={def} atajo={a.atajo} titulo={a.titulo} valor={n} subtexto={a.subtexto} tono={n > 0 ? a.tono : "neutral"} compacta />;
        })}
      </div>
    </KpiGroup>
  );
}
