"use client";

import type { ComponentType, ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { COLORES, type Color } from "@/components/panel/colores-tablero";
import { porcentajeSistema, type Conteo } from "@/lib/publicaciones/origen";

/** Las dos series, siempre con el mismo color (validados en claro y en oscuro; el tono de cada tema está en `--serie-*`). */
const SISTEMA = "var(--serie-sistema)";
const DROPI = "var(--serie-dropi)";

const textoPct = (c: Conteo) => {
  const p = porcentajeSistema(c);
  return p === null ? "—" : `${p} %`;
};

/** Una tarjeta del panel: título, subtítulo y lo que lleve. */
export function TarjetaUso({ titulo, detalle, neon = false, children }: { titulo: string; detalle?: string; neon?: boolean; children: ReactNode }) {
  return (
    <section className={`flex min-w-0 flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm ${neon ? "marco-neon" : ""}`}>
      <header className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight">{titulo}</h2>
        {detalle && <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>}
      </header>
      {children}
    </section>
  );
}

/** Una cifra del panel, con la misma forma que las tarjetas de Gestión de IDs Dropi. */
export function CifraUso({ titulo, valor, detalle, icono: Icono, color }: { titulo: string; valor: ReactNode; detalle: ReactNode; icono: ComponentType<{ className?: string }>; color: Color }) {
  const c = COLORES[color];
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <span className="flex items-center gap-3">
        <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.icono}`}>
          <Icono className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 text-xs leading-tight font-medium tracking-wide text-muted-foreground uppercase">{titulo}</span>
      </span>
      <span className={`text-3xl leading-none font-semibold tabular-nums ${c.numero}`}>{valor}</span>
      <span className="text-xs text-muted-foreground">{detalle}</span>
    </div>
  );
}

function Clave({ color, texto, n }: { color: string; texto: string; n?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {texto}
      {n !== undefined && <b className="font-semibold text-foreground tabular-nums">{n.toLocaleString("es-PA")}</b>}
    </span>
  );
}

/** Qué color es cada lado. */
export const LeyendaUso = () => (
  <div className="flex flex-wrap gap-x-4 gap-y-1">
    <Clave color={SISTEMA} texto="En el sistema" />
    <Clave color={DROPI} texto="En Dropi" />
  </div>
);

/** El total: cuánto salió del sistema, con el porcentaje en el centro del anillo. */
export function AnilloUso({ total }: { total: Conteo }) {
  const hay = total.sistema + total.dropi > 0;
  const datos = hay
    ? [
        { nombre: "En el sistema", valor: total.sistema, color: SISTEMA },
        { nombre: "En Dropi", valor: total.dropi, color: DROPI },
      ]
    : [{ nombre: "Sin datos", valor: 1, color: "var(--border)" }];
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-48 w-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={datos} dataKey="valor" nameKey="nombre" innerRadius="74%" outerRadius="100%" startAngle={90} endAngle={-270} paddingAngle={hay && total.sistema && total.dropi ? 2 : 0} cornerRadius={4} stroke="none">
              {datos.map((d) => (
                <Cell key={d.nombre} fill={d.color} />
              ))}
            </Pie>
            {hay && <Tooltip content={<AyudaAnillo />} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl leading-none font-semibold tabular-nums">{textoPct(total)}</span>
          <span className="mt-1 text-xs text-muted-foreground">en el sistema</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        <Clave color={SISTEMA} texto="En el sistema" n={total.sistema} />
        <Clave color={DROPI} texto="En Dropi" n={total.dropi} />
      </div>
    </div>
  );
}

const claseAyuda = "rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg";

function AyudaAnillo({ active, payload }: { active?: boolean; payload?: { name?: string; value?: number }[] }) {
  const p = payload?.[0];
  if (!active || !p) return null;
  return (
    <div className={claseAyuda}>
      {p.name}: <b className="tabular-nums">{p.value}</b>
    </div>
  );
}

function AyudaSemana({ active, payload }: { active?: boolean; payload?: { payload: SemanaGrafica }[] }) {
  const s = payload?.[0]?.payload;
  if (!active || !s) return null;
  return (
    <div className={`${claseAyuda} flex flex-col gap-1`}>
      <b className="font-semibold">Semana del {s.etiqueta}</b>
      <Clave color={SISTEMA} texto="En el sistema" n={s.sistema} />
      <Clave color={DROPI} texto="En Dropi" n={s.dropi} />
      <span className="text-muted-foreground">{s.pct} en el sistema</span>
    </div>
  );
}

interface SemanaGrafica {
  etiqueta: string;
  sistema: number;
  dropi: number;
  pct: string;
}

/** El porcentaje arriba de la columna, en una sola línea (el de Recharts se parte al ancho de la barra). */
function EtiquetaPct({ x, y, width, value }: { x?: number | string; y?: number | string; width?: number | string; value?: unknown }) {
  return (
    <text x={Number(x) + Number(width) / 2} y={Number(y) - 7} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--foreground)">
      {String(value)}
    </text>
  );
}

/** Cada semana, lo creado en el sistema y en Dropi, con el porcentaje arriba: se ve si el equipo va pasando al sistema. */
export function GraficaSemanas({ semanas }: { semanas: (Conteo & { etiqueta: string })[] }) {
  const datos: SemanaGrafica[] = semanas.map((s) => ({ etiqueta: s.etiqueta, sistema: s.sistema, dropi: s.dropi, pct: textoPct(s) }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 22, right: 4, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <Tooltip content={<AyudaSemana />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
          <Bar dataKey="sistema" name="En el sistema" stackId="u" fill={SISTEMA} stroke="var(--card)" strokeWidth={2} maxBarSize={36} />
          <Bar dataKey="dropi" name="En Dropi" stackId="u" fill={DROPI} stroke="var(--card)" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={36}>
            <LabelList dataKey="pct" content={EtiquetaPct} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Una fila con su barra partida en sistema y Dropi, el porcentaje y las cantidades a la vista (no hace falta pasar el cursor). */
export function FilaProporcion({ etiqueta, conteo }: { etiqueta: string; conteo: Conteo }) {
  const total = conteo.sistema + conteo.dropi;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm">{etiqueta}</span>
        <span className="text-sm font-semibold tabular-nums">{textoPct(conteo)}</span>
      </div>
      <div className="flex h-2.5 gap-0.5" role="img" aria-label={`${etiqueta}: ${conteo.sistema} en el sistema y ${conteo.dropi} en Dropi`}>
        {total === 0 && <span className="flex-1 rounded-full bg-muted" />}
        {conteo.sistema > 0 && <span className="min-w-1 rounded-l-full last:rounded-r-full" style={{ flexGrow: conteo.sistema, background: SISTEMA }} />}
        {conteo.dropi > 0 && <span className="min-w-1 rounded-r-full first:rounded-l-full" style={{ flexGrow: conteo.dropi, background: DROPI }} />}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {conteo.sistema} en el sistema · {conteo.dropi} en Dropi
      </span>
    </div>
  );
}

/** Una fila de una sola serie (los motivos): la barra es proporcional al más repetido. */
export function FilaMotivo({ etiqueta, n, maximo }: { etiqueta: string; n: number; maximo: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm">{etiqueta}</span>
        <span className="text-sm font-semibold tabular-nums">{n}</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${maximo ? (n / maximo) * 100 : 0}%`, background: DROPI }} />
      </div>
    </div>
  );
}

/** Cuántos de lo hecho en Dropi ya tienen motivo. */
export function AvanceMotivos({ hechos, total }: { hechos: number; total: number }) {
  return (
    <div className="flex flex-col gap-1.5" role="img" aria-label={`${hechos} de ${total} con motivo anotado`}>
      <div className="h-2.5 rounded-full bg-muted">
        <div className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${total ? (hechos / total) * 100 : 0}%`, backgroundImage: "var(--neon)" }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {hechos} de {total} con motivo anotado
      </span>
    </div>
  );
}
