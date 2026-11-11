"use client";

import type { ComponentType } from "react";
import { anilloFoco } from "@/components/ui/field";
import { AlertaIcon, ComprasIcon, EnlaceIcon, EnvioIcon, ProveedorIcon } from "@/lib/nav-icons";
import { COLORES, type Color } from "@/components/panel/colores-tablero";
import type { Grupo } from "./calculos-compras";

/** Una tarjeta del tablero de Compras: lo que cuenta, cómo se ve y lo que dice debajo. */
export interface TarjetaCompras {
  id: Grupo | "sin_productos";
  titulo: string;
  icono: ComponentType<{ className?: string }>;
  color: Color;
  detalle: string;
}

/**
 * Las etapas que se miran todos los días (30 oct 2026, pedido de Hernán: «como el tablero de Gestión de IDs»): por cotizar y cotizado (separadas el 7 nov 2026), en producción, en
 * tránsito, atrasadas y las compras de país que todavía no tienen sus productos. Los mismos filtros de un toque de antes, ahora como tarjetas.
 * 11 nov 2026 (reunión con Alcides): «Enviado a cotización» y «Fuera de plazo» (cualquier etapa que pasó su plazo; reemplaza a «Atrasadas»,
 * que solo miraba el tránsito), y cada tarjeta dice cuántas de las suyas pasan del plazo.
 */
export const TARJETAS_COMPRAS: TarjetaCompras[] = [
  { id: "por_cotizar", titulo: "Por cotizar", icono: ComprasIcon, color: "azul", detalle: "Falta enviarlas a cotizar (48 h)" },
  { id: "enviado_cotizacion", titulo: "Enviado a cotización", icono: ProveedorIcon, color: "azul", detalle: "El proveedor las tiene para cotizar (máx. 5 días)" },
  { id: "cotizado", titulo: "Cotizado", icono: ComprasIcon, color: "azul", detalle: "Ya cotizadas: decidir en 2 días" },
  { id: "produccion", titulo: "En producción", icono: ProveedorIcon, color: "violeta", detalle: "Confirmadas: máx. 15 días en producción" },
  { id: "transito", titulo: "En tránsito", icono: EnvioIcon, color: "ambar", detalle: "Enviadas y todavía sin llegar a la bodega" },
  { id: "fuera_plazo", titulo: "Fuera de plazo", icono: AlertaIcon, color: "rojo", detalle: "Pasaron el plazo de su etapa" },
  { id: "sin_productos", titulo: "Sin productos", icono: EnlaceIcon, color: "ambar", detalle: "Compras de país sin sus productos vinculados" },
];

/** Una tarjeta: botón que pone o quita su filtro en la lista de abajo, con el número grande y, si hay, las unidades y el monto. */
function Tarjeta({
  t,
  valor,
  unidades,
  monto,
  fuera,
  activa,
  alPulsar,
}: {
  t: TarjetaCompras;
  valor: number;
  unidades: number | null;
  monto: string | null;
  /** Cuántas de la tarjeta pasan del plazo de su etapa (null: no se dice). */
  fuera: number | null;
  activa: boolean;
  alPulsar: () => void;
}) {
  // Lo que avisa (fuera de plazo, sin productos) en 0 se ve en verde: está todo bien.
  const c = COLORES[valor === 0 && (t.id === "fuera_plazo" || t.id === "atrasadas" || t.id === "sin_productos") ? "verde" : t.color];
  const Icono = t.icono;
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={alPulsar}
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
      <span className="flex flex-wrap items-baseline gap-x-1">
        <span className={`text-3xl leading-none font-semibold tabular-nums ${c.numero}`}>{valor.toLocaleString("es-PA")}</span>
        <span className="text-sm text-muted-foreground">compra{valor === 1 ? "" : "s"}</span>
      </span>
      <span className="text-xs text-muted-foreground">
        {t.detalle}
        {(unidades !== null || monto) && (
          <span className="mt-0.5 block font-medium text-foreground-soft tabular-nums">
            {unidades !== null && `${unidades.toLocaleString("es-PA")} unidades`}
            {unidades !== null && monto && " · "}
            {monto}
          </span>
        )}
        {fuera !== null && fuera > 0 && (
          <span className="mt-0.5 block font-semibold text-destructive tabular-nums">
            {fuera} {fuera === 1 ? "pasa" : "pasan"} del plazo
          </span>
        )}
        <span className="sr-only">. {activa ? "Filtrando la lista: pulsa para quitar el filtro." : `Pulsa para ver solo: ${t.titulo.toLowerCase()}.`}</span>
      </span>
    </button>
  );
}

/**
 * El tablero de arriba de la lista de Compras. Cada tarjeta cuenta las compras abiertas de su grupo (con sus unidades y su monto, si se
 * ven) y, al pulsarla, filtra la lista; pulsarla otra vez quita el filtro.
 */
export function TableroCompras({
  tarjetas,
  activa,
  alPulsar,
}: {
  tarjetas: { t: TarjetaCompras; valor: number; unidades: number | null; monto: string | null; fuera?: number | null }[];
  activa: (id: TarjetaCompras["id"]) => boolean;
  alPulsar: (id: TarjetaCompras["id"]) => void;
}) {
  return (
    <section aria-label="Tablero de compras" className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
      {tarjetas.map(({ t, valor, unidades, monto, fuera }) => (
        <Tarjeta key={t.id} t={t} valor={valor} unidades={unidades} monto={monto} fuera={fuera ?? null} activa={activa(t.id)} alPulsar={() => alPulsar(t.id)} />
      ))}
    </section>
  );
}
