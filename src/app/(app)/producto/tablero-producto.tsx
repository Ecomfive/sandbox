"use client";

import type { ComponentType } from "react";
import { useFiltros } from "@/components/tabla/ganchos";
import { anilloFoco } from "@/components/ui/field";
import { ComprasIcon, DesconectadoIcon, EtiquetaIcon, InventarioIcon, OjoTachadoIcon, ProductoIcon, SinFotoIcon, TestIcon, TuWinnerIcon } from "@/lib/nav-icons";
import { puntosParaDecidir, STOCK_BAJO, type PuntoDecidir } from "@/lib/producto/para-decidir";
import { alternarAtajo, atajoActivo, type AtajoFiltro } from "@/lib/tabla/atajos";
import { DEF_PRODUCTO, type FilaProducto } from "./def-producto";

const seleccion = (campo: string, ...valores: string[]) => ({ campo, valor: { tipo: "seleccion" as const, valores } });

/** El color de cada tarjeta (como en Gestión de IDs Dropi): el del ícono sobre su fondo suave, el del número y el del borde al filtrar. */
const COLORES = {
  verde: { icono: "bg-success-soft text-success", numero: "text-success", activa: "border-success ring-success/30" },
  ambar: { icono: "bg-warning-soft text-warning", numero: "text-warning", activa: "border-warning ring-warning/30" },
  rojo: { icono: "bg-destructive-soft text-destructive", numero: "text-destructive", activa: "border-destructive ring-destructive/30" },
  violeta: { icono: "bg-primario-suave text-primario", numero: "text-primario", activa: "border-primario ring-primario/30" },
  gris: { icono: "bg-muted text-muted-foreground", numero: "text-foreground", activa: "border-foreground ring-foreground/20" },
} as const;

interface Tarjeta {
  id: string;
  titulo: string;
  icono: ComponentType<{ className?: string }>;
  color: keyof typeof COLORES;
  detalle: string;
  cuenta: (p: FilaProducto, puntos: PuntoDecidir[]) => boolean;
  atajo: AtajoFiltro;
  /** Una línea más, calculada (p. ej. cuántos están conectados). */
  extra?: (filas: { p: FilaProducto; puntos: PuntoDecidir[] }[]) => string | null;
}

/** Las tarjetas de estado: filtran por «Estado» y se pueden juntar (activos o en test). */
const porClase = (clases: string[], titulo: string, icono: Tarjeta["icono"], color: Tarjeta["color"], detalle: string): Tarjeta => ({
  id: `clase-${clases[0]}`,
  titulo,
  icono,
  color,
  detalle,
  cuenta: (p) => clases.includes(p.clase),
  atajo: { id: `clase-${clases[0]}`, etiqueta: titulo, ayuda: `Filtrar la lista: ${titulo.toLowerCase()}`, filtro: seleccion("clase", ...clases), suma: true },
});

/** Las tarjetas «Para decidir»: filtran por ese campo; un producto puede estar en varias. */
const porPunto = (punto: PuntoDecidir, titulo: string, icono: Tarjeta["icono"], color: Tarjeta["color"], detalle: string, extra?: Tarjeta["extra"]): Tarjeta => ({
  id: punto,
  titulo,
  icono,
  color,
  detalle,
  cuenta: (_, puntos) => puntos.includes(punto),
  atajo: { id: punto, etiqueta: titulo, ayuda: `Filtrar la lista: ${titulo.toLowerCase()}`, filtro: seleccion("decidir", punto), suma: true },
  extra,
});

const ESTADO: Tarjeta[] = [
  porClase(["fisico"], "Activos", ProductoIcon, "verde", "Se compran y se venden"),
  porClase(["test"], "En test", TestIcon, "violeta", "Probándose, todavía no se compran"),
  { ...porClase(["inactivo", "descontinuado"], "Inactivos", OjoTachadoIcon, "gris", "Pausados o descontinuados"), extra: (filas) => {
      const n = filas.filter(({ p }) => p.clase === "descontinuado").length;
      return n ? `${n} ${n === 1 ? "descontinuado" : "descontinuados"}` : null;
    } },
];

const DECIDIR: Tarjeta[] = [
  porPunto("sin_foto", "Sin foto", SinFotoIcon, "rojo", "Activos sin foto comercial"),
  porPunto("sin_conectar", "Sin conectar", DesconectadoIcon, "ambar", "Activos sin publicación en Dropi ni tienda", (filas) => {
    const n = filas.filter(({ p }) => p.clase === "fisico" && (p.asociaciones.length > 0 || p.nombresDropi.length > 0)).length;
    return n ? `${n} conectados` : null;
  }),
  porPunto("sin_stock", "Sin stock en Dropi", InventarioIcon, "rojo", "Conectados y con 0 unidades en Dropi", (filas) => {
    const n = filas.filter(({ puntos }) => puntos.includes("stock_bajo")).length;
    return n ? `${n} con menos de ${STOCK_BAJO} unidades` : null;
  }),
  porPunto("nunca_comprado", "Nunca comprados", ComprasIcon, "ambar", "Activos sin ninguna orden de compra"),
  porPunto("winner_sin_comprar", "Winners sin comprar", TuWinnerIcon, "verde", "Ganaron el test y no tienen orden de compra"),
  porPunto("categoria_revisar", "Categoría a revisar", EtiquetaIcon, "violeta", "Sin categoría o por confirmar"),
];

/** Una tarjeta: ícono de color, título y el número grande. Es un botón que pone o quita su filtro en la lista. */
function TarjetaProducto({ t, valor, total, extra }: { t: Tarjeta; valor: number; total: number | null; extra: string | null }) {
  const [filtros, cambiarFiltros] = useFiltros(DEF_PRODUCTO);
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
        {total !== null && <span className="text-sm text-muted-foreground tabular-nums">/ {total.toLocaleString("es-PA")}</span>}
      </span>
      <span className="text-xs text-muted-foreground">
        {t.detalle}
        {extra && <span className="mt-0.5 block font-medium text-foreground">{extra}</span>}
        <span className="sr-only">. {activa ? "Filtrando la lista." : t.atajo.ayuda}</span>
      </span>
    </button>
  );
}

/**
 * El tablero de Producto (23 oct 2026, al estilo de Gestión de IDs Dropi): arriba el estado (activos, en test, inactivos) y abajo
 * «Para decidir», lo que le falta a los activos (foto, conexión, stock, compras, categoría) y los winners sin comprar. Cada
 * tarjeta cuenta y, al pulsarla, filtra la lista de abajo; pulsarla otra vez quita el filtro. Se pueden juntar varias.
 */
export function TableroProducto({ productos }: { productos: FilaProducto[] }) {
  const filas = productos.map((p) => ({ p, puntos: puntosParaDecidir(p) }));
  const fila = (lista: Tarjeta[], etiqueta: string) => (
    <section aria-label={etiqueta} className="flex flex-col gap-2">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{etiqueta}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
        {lista.map((t) => (
          <TarjetaProducto
            key={t.id}
            t={t}
            valor={filas.filter(({ p, puntos }) => t.cuenta(p, puntos)).length}
            total={t.id === "clase-fisico" ? productos.length : null}
            extra={t.extra ? t.extra(filas) : null}
          />
        ))}
      </div>
    </section>
  );
  return (
    <div className="flex flex-col gap-5">
      {fila(ESTADO, "Estado")}
      {fila(DECIDIR, "Para decidir")}
    </div>
  );
}
