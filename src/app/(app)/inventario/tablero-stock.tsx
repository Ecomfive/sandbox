"use client";

import type { ComponentType } from "react";
import { COLORES, type Color } from "@/components/panel/colores-tablero";
import { useFiltros } from "@/components/tabla/ganchos";
import { anilloFoco } from "@/components/ui/field";
import { AlertaIcon, CalendarioIcon, CheckIcon, EnvioIcon, InventarioIcon } from "@/lib/nav-icons";
import { alternarAtajo, atajoActivo, type AtajoFiltro } from "@/lib/tabla/atajos";
import type { DefTabla } from "@/lib/tabla/motor";
import { textoPlataformas, type StockPlataformas } from "@/lib/wms/stock-plataformas";
import { sumaSinCompuestos } from "@/lib/wms/total-stock";
import { DEF_STOCK, existenciaDe, type FilaStock } from "./def-stock";

const num = (n: number) => n.toLocaleString("es-PA");
const conExistencia = (e: ReturnType<typeof existenciaDe>) => ({ campo: "existencia", valor: { tipo: "seleccion" as const, valores: [e] } });
const soloActivos = { campo: "clase", valor: { tipo: "seleccion" as const, valores: ["fisico"] } };
const desdeUna = (campo: string) => ({ campo, valor: { tipo: "numero" as const, min: "1", max: "" } });

interface Tarjeta {
  id: string;
  titulo: string;
  numero: number;
  detalle: string;
  icono: ComponentType<{ className?: string }>;
  color: Color;
  /** Sin atajo la tarjeta solo informa: el total de lo que se ve no filtra nada. */
  atajo?: AtajoFiltro;
}

/** Las tarjetas de lo que se está viendo: cambian con la bodega, la búsqueda y los filtros. Un compuesto no suma unidades, porque ya están en sus componentes. */
function tarjetas(filas: FilaStock[], conPlataformas: boolean): Tarjeta[] {
  const conStock = filas.filter((f) => existenciaDe(f) === "con_stock");
  const compuestos = conStock.filter((f) => f.tipo === "combo").length;
  // Aquí los compuestos sí suman: en una plataforma un compuesto es una publicación con su propio stock.
  const enPlataforma = (valor: (p: StockPlataformas) => number) => filas.reduce((t, f) => t + (f.plataformas ? valor(f.plataformas) : 0), 0);
  const enPlataformas: Tarjeta = {
    id: "plataformas",
    titulo: "En plataformas",
    numero: enPlataforma((p) => p.total),
    detalle: textoPlataformas({ dropi: enPlataforma((p) => p.dropi), effi: enPlataforma((p) => p.effi), drop: enPlataforma((p) => p.drop) }) || "Sin unidades",
    icono: EnvioIcon,
    color: "azul",
    atajo: { id: "plataformas", etiqueta: "En plataformas", ayuda: "Filtrar la lista: con unidades en plataformas", filtro: desdeUna("plataformas") },
  };
  return [
    { id: "fisicas", titulo: "Unidades físicas", numero: sumaSinCompuestos(filas, (f) => f.fisico), detalle: "Sin contar compuestos", icono: InventarioIcon, color: "violeta" },
    ...(conPlataformas ? [enPlataformas] : []),
    { id: "disponibles", titulo: "Disponibles", numero: sumaSinCompuestos(filas, (f) => f.disponible), detalle: "Las que se pueden vender", icono: CheckIcon, color: "verde" },
    {
      id: "con-stock",
      titulo: "Con stock",
      numero: conStock.length,
      detalle: `${num(conStock.length - compuestos)} productos y ${num(compuestos)} compuestos`,
      icono: InventarioIcon,
      color: "verde",
      atajo: { id: "con-stock", etiqueta: "Con stock", ayuda: "Filtrar la lista: con stock", filtro: conExistencia("con_stock") },
    },
    {
      id: "sin-stock",
      titulo: "Sin stock",
      // Solo lo Activo (7 nov 2026, pedido de Hernán): el catálogo es único para todos los países y los inactivos y de prueba inflaban la cifra. Siguen en la lista.
      numero: filas.filter((f) => f.clase === "fisico" && existenciaDe(f) === "sin_stock").length,
      detalle: conPlataformas ? "Activos, ni en bodegas ni en plataformas" : "Activos en cero",
      icono: InventarioIcon,
      color: "ambar",
      atajo: { id: "sin-stock", etiqueta: "Sin stock", ayuda: "Filtrar la lista: activos sin stock", filtro: conExistencia("sin_stock"), ademas: [soloActivos] },
    },
    {
      id: "negativo",
      titulo: "Saldo negativo",
      numero: filas.filter((f) => existenciaDe(f) === "negativo").length,
      detalle: "Salió más de lo que entró",
      icono: AlertaIcon,
      color: "rojo",
      atajo: { id: "negativo", etiqueta: "Saldo negativo", ayuda: "Filtrar la lista: saldo negativo", filtro: conExistencia("negativo") },
    },
    {
      id: "en-camino",
      titulo: "En camino",
      numero: sumaSinCompuestos(filas, (f) => f.enCamino),
      detalle: "Compradas, sin llegar",
      icono: EnvioIcon,
      color: "azul",
      atajo: { id: "en-camino", etiqueta: "En camino", ayuda: "Filtrar la lista: con unidades en camino", filtro: desdeUna("enCamino") },
    },
    {
      id: "vencidas",
      titulo: "Vencidas",
      numero: sumaSinCompuestos(filas, (f) => f.vencido),
      detalle: "Lotes con la fecha pasada",
      icono: CalendarioIcon,
      color: "rojo",
      atajo: { id: "vencidas", etiqueta: "Vencidas", ayuda: "Filtrar la lista: con unidades vencidas", filtro: desdeUna("vencido") },
    },
  ];
}

/** El tablero de Inventario, a la vista sin bajar ni descargar. Una tarjeta con atajo filtra la lista al pulsarla; pulsarla otra vez quita el filtro. */
export function TableroStock({ filas, def = DEF_STOCK, conPlataformas = false }: { filas: FilaStock[]; def?: DefTabla<FilaStock>; conPlataformas?: boolean }) {
  const [filtros, cambiarFiltros] = useFiltros(def);
  return (
    <section aria-label="Tablero de inventario" className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]">
      {tarjetas(filas, conPlataformas).map((t) => {
        const c = COLORES[t.color];
        const Icono = t.icono;
        const atajo = t.atajo;
        const activa = atajo ? atajoActivo(filtros, atajo) : false;
        const contenido = (
          <>
            <span className="flex items-center gap-3">
              <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.icono}`}>
                <Icono className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 text-xs leading-tight font-medium tracking-wide text-muted-foreground uppercase hyphens-auto">{t.titulo}</span>
            </span>
            <span className={`text-2xl leading-none font-semibold tabular-nums 2xl:text-3xl ${c.numero}`}>{num(t.numero)}</span>
            <span className="text-xs text-muted-foreground">
              {t.detalle}
              {atajo && <span className="sr-only">. {activa ? "Filtrando la lista." : atajo.ayuda}</span>}
            </span>
          </>
        );
        if (!atajo)
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
            onClick={() => cambiarFiltros(alternarAtajo(filtros, atajo))}
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
