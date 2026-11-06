"use client";

import type { ComponentType } from "react";
import { Bandera } from "@/components/paises/bandera";
import { useFiltros } from "@/components/tabla/ganchos";
import { anilloFoco } from "@/components/ui/field";
import { AlertaIcon, ArchivarIcon, ComprasIcon, EnvioIcon, MundoIcon, OjoTachadoIcon, PapeleraIcon } from "@/lib/nav-icons";
import type { AccionPorPais } from "@/lib/producto/por-pais";
import { alternarAtajo, atajoActivo, type AtajoFiltro } from "@/lib/tabla/atajos";
import { DEF_POR_PAIS, ETIQUETA_ACCION_PAIS, type FilaPorPais, type PaisColumna } from "./def-por-pais";

const seleccion = (campo: string, ...valores: string[]) => ({ campo, valor: { tipo: "seleccion" as const, valores } });

/** El color de cada tarjeta (los mismos de Producto y Gestión de IDs Dropi). */
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
  detalle: string;
  icono: ComponentType<{ className?: string }>;
  color: keyof typeof COLORES;
  cuenta: (f: FilaPorPais) => boolean;
  atajo: AtajoFiltro;
  bandera?: string;
}

const porAccion = (accion: AccionPorPais, icono: Tarjeta["icono"], color: Tarjeta["color"], detalle: string): Tarjeta => ({
  id: accion,
  titulo: ETIQUETA_ACCION_PAIS[accion],
  detalle,
  icono,
  color,
  cuenta: (f) => f.acciones.includes(accion),
  atajo: { id: accion, etiqueta: ETIQUETA_ACCION_PAIS[accion], ayuda: `Filtrar la lista: ${ETIQUETA_ACCION_PAIS[accion].toLowerCase()}`, filtro: seleccion("accion", accion), suma: true },
});

const ACCIONES: Tarjeta[] = [
  porAccion("por_decidir", AlertaIcon, "ambar", "Activos que ya están en otro país y aquí no, sin decidir"),
  porAccion("por_enviar", EnvioIcon, "violeta", "Marcados «Enviar» que todavía no tienen compra"),
  porAccion("comprado_sin_publicar", ComprasIcon, "rojo", "Tienen compra en un país y no están publicados allí"),
  porAccion("un_pais", MundoIcon, "verde", "Activos que solo están en un país"),
  porAccion("ningun_pais", OjoTachadoIcon, "gris", "Activos sin publicación, compra ni stock en ningún país"),
  porAccion("solo_archivado", ArchivarIcon, "gris", "Se publicaron en un país y ya no están activos"),
  porAccion("descartado", PapeleraIcon, "gris", "Descartados en algún país"),
];

/** Una tarjeta: ícono de color, título y el número grande. Es un botón que pone o quita su filtro en la lista. */
function TarjetaPorPais({ t, valor }: { t: Tarjeta; valor: number }) {
  const [filtros, cambiarFiltros] = useFiltros(DEF_POR_PAIS);
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
        {t.bandera ? (
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Bandera codigo={t.bandera} className="h-4 w-6" />
          </span>
        ) : (
          <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.icono}`}>
            <Icono className="h-[18px] w-[18px]" />
          </span>
        )}
        <span className="min-w-0 text-xs leading-tight font-medium tracking-wide text-muted-foreground uppercase hyphens-auto">{t.titulo}</span>
      </span>
      <span className={`text-3xl leading-none font-semibold tabular-nums ${c.numero}`}>{valor.toLocaleString("es-PA")}</span>
      <span className="text-xs text-muted-foreground">
        {t.detalle}
        <span className="sr-only">. {activa ? "Filtrando la lista." : t.atajo.ayuda}</span>
      </span>
    </button>
  );
}

/**
 * El tablero de «Compras › Por país» (5 nov 2026, pedido de Alcides, como las tarjetas de Compras y Gestión de IDs Dropi): arriba lo que hay
 * que hacer y abajo, por cada país, cuántos productos activos son una oportunidad por decidir ahí. Cada tarjeta cuenta y filtra la lista;
 * pulsarla otra vez quita el filtro, y se pueden juntar varias.
 */
export function TableroPorPais({ filas, paises }: { filas: FilaPorPais[]; paises: PaisColumna[] }) {
  const porPais: Tarjeta[] = paises.map((p) => ({
    id: `decidir-${p.codigo}`,
    titulo: p.nombre,
    detalle: `Por decidir: ya están en otro país y en ${p.nombre} no`,
    icono: MundoIcon,
    color: "ambar",
    bandera: p.codigo,
    cuenta: (f) => f.porDecidir.includes(p.codigo),
    atajo: { id: `decidir-${p.codigo}`, etiqueta: `Por decidir en ${p.nombre}`, ayuda: `Filtrar la lista: por decidir en ${p.nombre}`, filtro: seleccion("decidir", p.codigo), suma: true },
  }));
  const fila = (lista: Tarjeta[], etiqueta: string) => (
    <section aria-label={etiqueta} className="flex flex-col gap-2">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{etiqueta}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
        {lista.map((t) => (
          <TarjetaPorPais key={t.id} t={t} valor={filas.filter(t.cuenta).length} />
        ))}
      </div>
    </section>
  );
  return (
    <div className="flex flex-col gap-5">
      {fila(ACCIONES, "Para hacer")}
      {fila(porPais, "Por decidir en cada país")}
    </div>
  );
}
