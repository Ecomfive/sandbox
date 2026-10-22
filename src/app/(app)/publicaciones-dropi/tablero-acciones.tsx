"use client";

import type { ComponentType } from "react";
import { useFiltros } from "@/components/tabla/ganchos";
import { anilloFoco } from "@/components/ui/field";
import { ACCIONES as ACCIONES_CALCULADAS, type Accion as AccionCalculada } from "@/lib/publicaciones/automatico";
import { alternarAtajo, atajoActivo, type AtajoFiltro } from "@/lib/tabla/atajos";
import type { DefTabla } from "@/lib/tabla/motor";
import { AnalisisCompetenciaIcon, DropshipperIcon, EnlaceIcon, InventarioIcon, MargenIcon, TiendaIcon } from "@/lib/nav-icons";
import { DEF_PUBLICACIONES, estadoVinculo, type FilaPublicacion } from "./def-publicaciones";

const seleccion = (campo: string, ...valores: string[]) => ({ campo, valor: { tipo: "seleccion" as const, valores } });

/** El color de cada tarjeta: el del ícono (sobre su fondo suave), el del número y el del borde cuando está filtrando. */
const COLORES = {
  verde: { icono: "bg-success-soft text-success", numero: "text-success", activa: "border-success ring-success/30" },
  ambar: { icono: "bg-warning-soft text-warning", numero: "text-warning", activa: "border-warning ring-warning/30" },
  rojo: { icono: "bg-destructive-soft text-destructive", numero: "text-destructive", activa: "border-destructive ring-destructive/30" },
  azul: { icono: "bg-azul-soft text-azul", numero: "text-azul", activa: "border-azul ring-azul/30" },
  violeta: { icono: "bg-primario-suave text-primario", numero: "text-primario", activa: "border-primario ring-primario/30" },
} as const;
type Color = keyof typeof COLORES;

interface Tarjeta {
  id: string;
  titulo: string;
  icono: ComponentType<{ className?: string }>;
  color: Color;
  /** Qué publicaciones cuenta (y filtra): las abiertas, sin las archivadas. */
  cuenta: (f: FilaPublicacion) => boolean;
  atajo: AtajoFiltro;
  /** Lo que cuenta la tarjeta, en pocas palabras. */
  detalle: string;
}

/** Una tarjeta por cada acción calculada (21 oct 2026): cuenta y filtra por el campo «Acción». */
const porAccion = (valor: AccionCalculada, icono: Tarjeta["icono"], color: Color): Tarjeta => {
  const a = ACCIONES_CALCULADAS.find((x) => x.valor === valor)!;
  return {
    id: valor,
    titulo: a.etiqueta,
    icono,
    color,
    detalle: a.detalle,
    cuenta: (f) => f.acciones.includes(valor),
    atajo: { id: valor, etiqueta: a.etiqueta, ayuda: `Filtrar la lista: ${a.etiqueta.toLowerCase()}`, filtro: seleccion("accion", valor), suma: true },
  };
};

const VINCULOS_SIN_VINCULAR = ["seguro", "sugerido", "varios", "falta_compuesto", "ninguno"];

/** Lo que hay que mirar hoy (calculado de Dropi, el margen y la competencia): cada tarjeta cuenta y filtra la lista de abajo. */
const TARJETAS: Tarjeta[] = [
  {
    id: "activas",
    titulo: "Activas en Dropi",
    icono: TiendaIcon,
    color: "verde",
    detalle: "Publicadas y activas según Dropi",
    cuenta: (f) => f.enDropi === "activo",
    atajo: { id: "activas", etiqueta: "Activas en Dropi", ayuda: "Filtrar la lista: activas en Dropi", filtro: seleccion("publicacion", "activo") },
  },
  porAccion("revisar_precio", MargenIcon, "ambar"),
  porAccion("bajar_precio", AnalisisCompetenciaIcon, "rojo"),
  porAccion("verificar_dropshipper", DropshipperIcon, "azul"),
  {
    id: "sin-vincular",
    titulo: "Sin vincular",
    icono: EnlaceIcon,
    color: "violeta",
    detalle: "Sin su producto de Producto",
    cuenta: (f) => estadoVinculo(f) !== "vinculado",
    atajo: { id: "sin-vincular", etiqueta: "Sin vincular", ayuda: "Filtrar la lista: sin vincular a Producto", filtro: seleccion("vinculo", ...VINCULOS_SIN_VINCULAR) },
  },
  {
    id: "sin-stock",
    // Según el stock que reporta Dropi: sin stock y con ventas en los últimos 30 días.
    titulo: "Sin stock",
    icono: InventarioIcon,
    color: "rojo",
    detalle: "Se vende y no tiene stock en Dropi",
    cuenta: (f) => f.ventas?.stockEstado === "sin_stock_vende",
    atajo: { id: "sin-stock", etiqueta: "Sin stock", ayuda: "Filtrar la lista: sin stock en Dropi y con ventas", filtro: seleccion("stockDropi", "sin_stock_vende") },
  },
];

/** Una tarjeta del tablero: ícono de color, título y el número grande. Es un botón que pone o quita su filtro en la lista. */
function TarjetaAccion({ t, valor, total, def }: { t: Tarjeta; valor: number; total: number; def: DefTabla<FilaPublicacion> }) {
  const [filtros, cambiarFiltros] = useFiltros(def);
  const activa = atajoActivo(filtros, t.atajo);
  const c = COLORES[t.color];
  const Icono = t.icono;
  return (
    <button
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
        <span className="min-w-0 text-xs leading-tight font-medium tracking-wide text-muted-foreground uppercase">{t.titulo}</span>
      </span>
      <span className="flex items-baseline gap-1">
        <span className={`text-3xl leading-none font-semibold tabular-nums ${c.numero}`}>{valor.toLocaleString("es-PA")}</span>
        {t.id === "activas" && <span className="text-sm text-muted-foreground tabular-nums">/ {total.toLocaleString("es-PA")}</span>}
      </span>
      <span className="text-xs text-muted-foreground">
        {t.detalle}
        <span className="sr-only">. {activa ? "Filtrando la lista." : t.atajo.ayuda}</span>
      </span>
    </button>
  );
}

/**
 * El tablero de acciones de arriba, al estilo de los paneles de Mercado Libre: lo activo en Dropi y lo que espera una decisión
 * (las acciones calculadas, lo que falta vincular y lo que no tiene stock). Cada tarjeta cuenta las publicaciones abiertas y, al
 * pulsarla, filtra la lista de abajo; pulsarla otra vez quita el filtro.
 */
export function TableroAcciones({ publicaciones, def = DEF_PUBLICACIONES }: { publicaciones: FilaPublicacion[]; def?: DefTabla<FilaPublicacion> }) {
  const abiertas = publicaciones.filter((f) => !f.archivada);
  return (
    <section aria-label="Tablero de acciones" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {TARJETAS.map((t) => (
        <TarjetaAccion key={t.id} t={t} valor={abiertas.filter(t.cuenta).length} total={abiertas.length} def={def} />
      ))}
    </section>
  );
}
