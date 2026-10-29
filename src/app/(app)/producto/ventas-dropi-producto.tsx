"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePuedeAbrir } from "@/components/modulos-contexto";
import { anilloFoco } from "@/components/ui/field";
import { obtenerVentasDropiProducto, type VentasDropiPais } from "./ventas-dropi-actions";

const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const fecha = (d: string | null) => (d ? `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "—");
const ejes = { tick: { fontSize: 11, fill: "var(--muted-foreground)" }, axisLine: false, tickLine: false } as const;
const estiloTooltip = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 };

/** Un dato corto del resumen: la cifra grande y su detalle debajo. */
function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-muted-foreground">{titulo}</dt>
      <dd className="m-0 text-lg font-semibold tabular-nums">{valor}</dd>
      {detalle && <dd className="m-0 text-xs text-muted-foreground">{detalle}</dd>}
    </div>
  );
}

function VentasDePais({ v, conPais }: { v: VentasDropiPais; conPais: boolean }) {
  const datos = v.meses.map((m) => ({ mes: nombreMes(m.mes) + (m.mes === v.corte.slice(0, 7) ? "*" : ""), netas: m.netas }));
  const cambio = v.netas30Antes ? Math.round(((v.netas30 - v.netas30Antes) / v.netas30Antes) * 100) : null;
  return (
    <div className="flex flex-col gap-3">
      {conPais && <h4 className="m-0 text-xs font-medium text-muted-foreground">{v.pais}</h4>}
      <dl className="m-0 grid grid-cols-3 gap-3">
        <Cifra titulo="Netas · 30 días" valor={entero(v.netas30)} detalle={cambio === null ? undefined : `${cambio > 0 ? "+" : ""}${cambio} % vs. 30 anteriores`} />
        <Cifra titulo="Netas en total" valor={entero(v.netasTotal)} detalle={v.primeraVenta ? `desde ${fecha(v.primeraVenta)}` : undefined} />
        <Cifra titulo="Stock en Dropi" valor={entero(v.stock)} detalle={v.diasInventario === null ? undefined : `para ${entero(v.diasInventario)} días`} />
      </dl>
      {datos.length > 0 && (
        <figure className="m-0">
          <figcaption className="sr-only">Unidades netas por mes en Dropi{conPais ? ` en ${v.pais}` : ""}</figcaption>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datos} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="mes" {...ejes} interval="preserveStartEnd" />
                <YAxis {...ejes} allowDecimals={false} width={44} tickFormatter={(n) => entero(Number(n))} />
                <Tooltip contentStyle={estiloTooltip} cursor={{ fill: "var(--muted)" }} formatter={(n) => [entero(Number(n)), "Netas"]} />
                <Bar dataKey="netas" radius={[3, 3, 0, 0]}>
                  {datos.map((d) => (
                    <Cell key={d.mes} fill={d.netas < 0 ? "var(--destructive)" : "var(--primario)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="m-0 text-xs text-muted-foreground">* mes en curso · datos hasta el {fecha(v.corte)}</p>
        </figure>
      )}
      {/* Cada ID con su stock en Dropi (27 oct 2026, pedido de Hernán) y lo que vendió en total. Sin stock, en rojo. */}
      <div className="flex flex-col gap-1 text-sm">
        <div aria-hidden="true" className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
          <span>ID de Dropi</span>
          <span className="flex shrink-0 gap-4">
            <span className="w-16 text-right">Stock</span>
            <span className="w-16 text-right">Netas</span>
          </span>
        </div>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {v.ids.map((i) => (
            <li key={i.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">
                <span className="tabular-nums text-muted-foreground">ID {i.id}</span> {i.nombre}
                {(i.archivado || i.privado) && <span className="text-xs text-muted-foreground"> · {[i.privado && "privado", i.archivado && "archivado"].filter(Boolean).join(", ")}</span>}
              </span>
              <span className="flex shrink-0 gap-4 tabular-nums">
                <span className={`w-16 text-right ${i.stock > 0 ? "" : i.archivado ? "text-muted-foreground" : "font-medium text-destructive"}`}>
                  <span className="sr-only">Stock: </span>
                  {i.stock > 0 ? entero(i.stock) : i.archivado ? "0" : "Sin stock"}
                </span>
                <span className="w-16 text-right">
                  <span className="sr-only">Netas en total: </span>
                  {entero(i.netasTotal)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Bloque «Ventas en Dropi» de la ficha de un producto: lo que vendió en Dropi sumando todos los IDs de sus publicaciones (activas y
 * archivadas, públicas, privadas, de la B280…), con las netas por mes y lo que aportó cada ID. Se pide al abrir la ficha.
 */
export function VentasDropiProducto({ id, pais }: { id: string; /** Solo ese país (su código), como en Gestión de IDs Dropi; sin él, todos los que la persona ve. */ pais?: string }) {
  const [datos, setDatos] = useState<VentasDropiPais[] | "error" | null>(null);
  const puedeVerVentas = usePuedeAbrir("ventas-dropi");

  useEffect(() => {
    let vigente = true;
    obtenerVentasDropiProducto(id, pais)
      .then((r) => vigente && setDatos("paises" in r ? r.paises : "error"))
      .catch(() => vigente && setDatos("error"));
    return () => {
      vigente = false;
    };
  }, [id, pais]);

  if (datos === null) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (datos === "error")
    return (
      <p role="alert" className="text-sm text-destructive">
        No se pudieron cargar las ventas.
      </p>
    );
  if (!datos.length) return <p className="text-sm text-muted-foreground">Sin ventas en Dropi.</p>;
  return (
    <div className="flex flex-col gap-5">
      {datos.map((v) => (
        <VentasDePais key={v.pais} v={v} conPais={datos.length > 1} />
      ))}
      {puedeVerVentas && (
        <Link href="/ventas-dropi" className={`inline-flex w-fit items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent ${anilloFoco}`}>
          Ver en Ventas Dropi
        </Link>
      )}
    </div>
  );
}
