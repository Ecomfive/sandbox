"use client";

import type { ComponentType } from "react";
import { useFiltros } from "@/components/tabla/ganchos";
import { anilloFoco } from "@/components/ui/field";
import { ACCIONES as ACCIONES_CALCULADAS, detalleAccion, type Accion as AccionCalculada } from "@/lib/publicaciones/automatico";
import type { Reglas } from "@/lib/publicaciones/reglas";
import { alternarAtajo, atajoActivo, type AtajoFiltro } from "@/lib/tabla/atajos";
import type { DefTabla } from "@/lib/tabla/motor";
import { ActualizarIcon, AnalisisCompetenciaIcon, DesconectadoIcon, DropshipperIcon, EnlaceIcon, EstadoIcon, InventarioIcon, MargenIcon, SugerenciaIcon, TiendaIcon, VentasIcon } from "@/lib/nav-icons";
import { TIPOS_RECOMENDACION, type GrupoRecomendacion } from "@/lib/publicaciones/recomendaciones";

const grupoDe = (t: string) => TIPOS_RECOMENDACION.find((x) => x.valor === t)?.grupo;
const tiposDe = (g: GrupoRecomendacion) => TIPOS_RECOMENDACION.filter((t) => t.grupo === g).map((t) => t.valor);
import { DEF_PUBLICACIONES, estadoVinculo, sinStock, type FilaPublicacion } from "./def-publicaciones";

const seleccion = (campo: string, ...valores: string[]) => ({ campo, valor: { tipo: "seleccion" as const, valores } });

/** El color de cada tarjeta: el del ícono (sobre su fondo suave), el del número y el del borde cuando está filtrando. */
export const COLORES = {
  verde: { icono: "bg-success-soft text-success", numero: "text-success", activa: "border-success ring-success/30" },
  ambar: { icono: "bg-warning-soft text-warning", numero: "text-warning", activa: "border-warning ring-warning/30" },
  rojo: { icono: "bg-destructive-soft text-destructive", numero: "text-destructive", activa: "border-destructive ring-destructive/30" },
  azul: { icono: "bg-azul-soft text-azul", numero: "text-azul", activa: "border-azul ring-azul/30" },
  violeta: { icono: "bg-primario-suave text-primario", numero: "text-primario", activa: "border-primario ring-primario/30" },
} as const;
export type Color = keyof typeof COLORES;

interface Tarjeta {
  id: string;
  titulo: string;
  icono: ComponentType<{ className?: string }>;
  color: Color;
  /** Qué publicaciones cuenta (y filtra): las abiertas, sin las archivadas. */
  cuenta: (f: FilaPublicacion) => boolean;
  atajo: AtajoFiltro;
  /** Lo que cuenta la tarjeta, en pocas palabras. */
  /** Lo que cuenta la tarjeta, con los umbrales de las reglas. */
  detalle: string | ((r: Reglas) => string);
  /** Una línea más, calculada (p. ej. cuántas están en margen crítico). */
  extra?: (abiertas: FilaPublicacion[], r: Reglas) => string | null;
  /** El color de esa línea: rojo (lo que alarma) o verde (lo que va bien, como lo que viene en camino). */
  extraColor?: "rojo" | "verde";
  /** Un segundo número junto al grande, tras una barra: «/ 300» (el total) o «/ 6 en camino». */
  junto?: (abiertas: FilaPublicacion[]) => { n: number; texto?: string; color?: "verde" };
}

/** Una tarjeta por cada acción calculada (21 oct 2026): cuenta y filtra por el campo «Acción». */
const porAccion = (valor: AccionCalculada, icono: Tarjeta["icono"], color: Color): Tarjeta => {
  const a = ACCIONES_CALCULADAS.find((x) => x.valor === valor)!;
  return {
    id: valor,
    titulo: a.etiqueta,
    icono,
    color,
    detalle: (r) => detalleAccion(valor, r),
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
    junto: (abiertas) => ({ n: abiertas.length }),
    atajo: { id: "activas", etiqueta: "Activas en Dropi", ayuda: "Filtrar la lista: activas en Dropi", filtro: seleccion("publicacion", "activo") },
  },
  { ...porAccion("margen_bajo", MargenIcon, "rojo"), extra: (abiertas, r) => {
      const n = abiertas.filter((f) => f.nivelMargen === "critico").length;
      return n ? `${n} en crítico (menos de ${Math.round(r.margen_critico * 100)} %)` : null;
    } },
  porAccion("ventas_caida", VentasIcon, "ambar"),
  porAccion("bajar_precio", AnalisisCompetenciaIcon, "rojo"),
  porAccion("verificar_dropshipper", DropshipperIcon, "azul"),
  porAccion("republicar", ActualizarIcon, "azul"),
  {
    id: "recomendaciones",
    titulo: "Recomendaciones",
    icono: SugerenciaIcon,
    color: "violeta",
    detalle: "De precio o combo, sin decidir",
    cuenta: (f) => f.recomendaciones.some((r) => grupoDe(r.tipo) === "precio"),
    atajo: { id: "recomendaciones", etiqueta: "Recomendaciones", ayuda: "Filtrar la lista: con recomendaciones de precio o combo", filtro: seleccion("recomendacion", ...tiposDe("precio")), suma: true },
  },
  {
    id: "por-optimizar",
    titulo: "Por optimizar",
    icono: EstadoIcon,
    color: "azul",
    detalle: "Título, fotos, video o precio sugerido por mejorar en Dropi",
    cuenta: (f) => f.recomendaciones.some((r) => grupoDe(r.tipo) === "optimizacion"),
    atajo: { id: "por-optimizar", etiqueta: "Por optimizar", ayuda: "Filtrar la lista: con algo por optimizar en Dropi", filtro: seleccion("recomendacion", ...tiposDe("optimizacion")), suma: true },
  },
  {
    id: "sin-id",
    titulo: "Sin ID de Dropi",
    icono: DesconectadoIcon,
    color: "rojo",
    detalle: "Publicaciones sin su ID de Dropi anotado",
    cuenta: (f) => !f.dropiId.trim(),
    atajo: { id: "sin-id", etiqueta: "Sin ID de Dropi", ayuda: "Filtrar la lista: sin ID de Dropi", filtro: seleccion("idDropi", "sin_id") },
  },
  {
    id: "sin-vincular",
    titulo: "Sin vincular producto",
    icono: EnlaceIcon,
    color: "violeta",
    detalle: "Sin su producto de Producto",
    cuenta: (f) => estadoVinculo(f) !== "vinculado",
    atajo: { id: "sin-vincular", etiqueta: "Sin vincular producto", ayuda: "Filtrar la lista: sin vincular a Producto", filtro: seleccion("vinculo", ...VINCULOS_SIN_VINCULAR) },
  },
  {
    id: "sin-stock",
    // Toda publicación activa en Dropi sin unidades, venda o no (25 oct 2026: antes solo las que además vendieron en 30 días).
    titulo: "Sin stock",
    icono: InventarioIcon,
    color: "rojo",
    detalle: "Activas en Dropi con 0 unidades",
    cuenta: (f) => sinStock(f),
    // De las que no tienen stock, cuántas ya tienen mercancía en camino: va junto al número, «9 / 6 en camino».
    junto: (abiertas) => ({ n: abiertas.filter((f) => sinStock(f) && f.enCamino > 0).length, texto: "en camino", color: "verde" }),
    atajo: { id: "sin-stock", etiqueta: "Sin stock", ayuda: "Filtrar la lista: activas en Dropi sin stock", filtro: seleccion("sinStock", "si") },
  },
];

/** Una tarjeta del tablero: ícono de color, título y el número grande. Es un botón que pone o quita su filtro en la lista. */
function TarjetaAccion({ t, valor, junto, extra, detalle, def }: { t: Tarjeta; valor: number; junto: { n: number; texto?: string; color?: "verde" } | null; extra: string | null; detalle: string; def: DefTabla<FilaPublicacion> }) {
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
        <span className="min-w-0 text-xs leading-tight font-medium tracking-wide text-muted-foreground uppercase hyphens-auto">{t.titulo}</span>
      </span>
      <span className="flex items-baseline gap-1">
        <span className={`text-3xl leading-none font-semibold tabular-nums ${c.numero}`}>{valor.toLocaleString("es-PA")}</span>
        {junto && (
          <span className={`text-sm tabular-nums ${junto.color === "verde" ? "font-medium text-success" : "text-muted-foreground"}`}>
            / {junto.n.toLocaleString("es-PA")}
            {junto.texto && ` ${junto.texto}`}
          </span>
        )}
      </span>
      <span className="text-xs text-muted-foreground">
        {detalle}
        {extra && <span className={`mt-0.5 block font-medium ${t.extraColor === "verde" ? "text-success" : "text-destructive"}`}>{extra}</span>}
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
export function TableroAcciones({ publicaciones, reglas, def = DEF_PUBLICACIONES }: { publicaciones: FilaPublicacion[]; reglas: Reglas; def?: DefTabla<FilaPublicacion> }) {
  const abiertas = publicaciones.filter((f) => !f.archivada);
  return (
    <section aria-label="Tablero de acciones" className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
      {TARJETAS.map((t) => (
        <TarjetaAccion key={t.id} t={t} valor={abiertas.filter(t.cuenta).length} junto={t.junto ? t.junto(abiertas) : null} extra={t.extra ? t.extra(abiertas, reglas) : null} detalle={typeof t.detalle === "function" ? t.detalle(reglas) : t.detalle} def={def} />
      ))}
    </section>
  );
}
