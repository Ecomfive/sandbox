"use client";

import { useEffect, useState } from "react";
import { obtenerVentasDropi, type VentasDropiDropshipper } from "./ventas-dropi-actions";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toLocaleString("es-PA", { maximumFractionDigits: 1 })} %` : "—");
const fecha = (d: string | null) => (d ? `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "—");
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

function Cifra({ titulo, valor, detalle, tono }: { titulo: string; valor: string; detalle?: string; tono?: "peligro" }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{titulo}</dt>
      <dd className={`text-base leading-tight font-semibold tabular-nums ${tono === "peligro" ? "text-destructive" : ""}`}>{valor}</dd>
      {detalle && <dd className="text-[11px] text-muted-foreground tabular-nums">{detalle}</dd>}
    </div>
  );
}

/**
 * Las ventas en Dropi del dropshipper (Desempeño › Ventas Dropi), por sus cuentas de Dropi vinculadas: netas de los últimos 30
 * días y de siempre, lo no efectivo (cancelado, rechazado o devuelto), sus netas por mes y qué productos vende.
 */
export function VentasDropiDropshipperBloque({ dropshipperId, tieneCuentas }: { dropshipperId: string; tieneCuentas: boolean }) {
  const [datos, setDatos] = useState<VentasDropiDropshipper | "error" | null>(null);
  const [todos, setTodos] = useState(false);

  useEffect(() => {
    if (!tieneCuentas) return;
    let vigente = true;
    obtenerVentasDropi(dropshipperId)
      .then((r) => vigente && setDatos("error" in r ? "error" : r))
      .catch(() => vigente && setDatos("error"));
    return () => {
      vigente = false;
    };
  }, [dropshipperId, tieneCuentas]);

  if (!tieneCuentas) return <p className="m-0 text-[13px] text-muted-foreground">Vincula su cuenta de Dropi (en «Cuentas») para ver sus ventas.</p>;
  if (datos === null) return <p className="m-0 text-[13px] text-muted-foreground">Cargando…</p>;
  if (datos === "error")
    return (
      <p role="alert" className="m-0 text-[13px] text-destructive">
        No se pudieron cargar las ventas en Dropi.
      </p>
    );
  if (!datos.paises.length) return <p className="m-0 text-[13px] text-muted-foreground">Sin ventas en Dropi en los datos cargados.</p>;

  return (
    <div className="flex flex-col gap-4">
      {datos.paises.map((p) => {
        const meses = p.porMes.slice(-12);
        const max = Math.max(1, ...meses.map((m) => m.netas));
        const productos = todos ? p.productos : p.productos.slice(0, 6);
        return (
          <div key={p.codigoPais} className="flex flex-col gap-3">
            {datos.paises.length > 1 && <h5 className="m-0 text-xs font-semibold">{p.codigoPais}</h5>}
            <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-muted px-3 py-2.5 sm:grid-cols-4">
              <Cifra titulo="Netas · 30 días" valor={entero(p.netas30)} />
              <Cifra titulo="Netas en total" valor={entero(p.netas)} detalle={`${entero(p.ordenes)} órdenes`} />
              <Cifra titulo="No efectivas" valor={pct(p.noEfectivas, p.pedidas)} tono={p.pedidas >= 50 && p.noEfectivas / p.pedidas > 0.3 ? "peligro" : undefined} detalle="canceladas, rechazadas o devueltas" />
              <Cifra titulo="Última orden" valor={fecha(p.ultimaOrden)} />
            </dl>
            {meses.length > 0 && (
              <figure className="m-0 flex flex-col gap-1">
                <figcaption className="text-[11px] text-muted-foreground">Unidades netas por mes</figcaption>
                <div className="flex h-20 items-end gap-1" role="img" aria-label={`Netas por mes: ${meses.map((m) => `${nombreMes(m.mes)} ${entero(m.netas)}`).join(", ")}`}>
                  {meses.map((m) => (
                    <div key={m.mes} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5">
                      <span className="text-[10px] text-muted-foreground tabular-nums">{m.netas ? entero(m.netas) : ""}</span>
                      <span className={`w-full rounded-t-[3px] ${m.netas < 0 ? "bg-destructive" : "barra-neon"}`} style={{ height: `${Math.max(m.netas > 0 ? 4 : 2, (Math.max(m.netas, 0) / max) * 56)}px` }} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-1">
                  {meses.map((m) => (
                    <span key={m.mes} className="min-w-0 flex-1 text-center text-[10px] text-muted-foreground">
                      {MESES[Number(m.mes.slice(5, 7)) - 1]}
                    </span>
                  ))}
                </div>
              </figure>
            )}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Qué vende ({p.productos.length} productos)</span>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {productos.map((x) => (
                  <li key={x.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="min-w-0 truncate">{x.nombre}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">ID {x.id}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      <b className="font-semibold text-foreground">{entero(x.netas)}</b> netas · {pct(x.noEfectivas, x.pedidas)} no efectivas
                    </span>
                  </li>
                ))}
              </ul>
              {p.productos.length > 6 && (
                <button type="button" onClick={() => setTodos((v) => !v)} className="w-fit text-xs font-medium text-primario underline-offset-2 hover:underline">
                  {todos ? "Ver menos" : `Ver los ${p.productos.length}`}
                </button>
              )}
            </div>
          </div>
        );
      })}
      <p className="m-0 text-[11px] text-muted-foreground">Del Historial de Existencia de Dropi hasta el {fecha(datos.corte)} (Desempeño › Ventas Dropi).</p>
    </div>
  );
}
