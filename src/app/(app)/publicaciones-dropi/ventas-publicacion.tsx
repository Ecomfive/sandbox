"use client";

import { Badge } from "@/components/ui/badge";
import { mesesEntre, restarDias, DIAS_REPONER, type VentasPublicacion } from "@/lib/publicaciones/ventas";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toLocaleString("es-PA", { maximumFractionDigits: 1 })} %`);
const fecha = (d: string | null) => (d ? `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "—");

function Dato({ titulo, valor, detalle, tono }: { titulo: string; valor: string; detalle?: string; tono?: "peligro" | "aviso" }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{titulo}</dt>
      <dd className={`text-lg leading-tight font-semibold tabular-nums ${tono === "peligro" ? "text-destructive" : tono === "aviso" ? "text-warning" : ""}`}>{valor}</dd>
      {detalle && <dd className="text-xs text-muted-foreground tabular-nums">{detalle}</dd>}
    </div>
  );
}

/**
 * Las ventas en Dropi de una publicación: netas de 30 días contra los 30 anteriores, stock y para
 * cuántos días alcanza, cancelaciones y devoluciones, última venta y las netas de los últimos 12 meses en barras.
 */
export function VentasEnDropi({ v, corte, enCamino = 0, llegada = null, sinFecha = 0 }: { v: VentasPublicacion; corte: string; /** Unidades del producto vinculado que vienen en camino, la llegada más próxima y las unidades sin fecha. */ enCamino?: number; llegada?: string | null; sinFecha?: number }) {
  const meses = mesesEntre(restarDias(`${corte.slice(0, 7)}-15`, 335), corte);
  const valores = meses.map((m) => ({ mes: m, netas: v.porMes[m] ?? 0 }));
  const max = Math.max(1, ...valores.map((x) => x.netas));
  const cambio = v.netas30Antes > 0 ? ((v.netas30 - v.netas30Antes) / v.netas30Antes) * 100 : null;
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted px-4 py-3 sm:grid-cols-4">
        <Dato
          titulo="Netas · 30 días"
          valor={entero(v.netas30)}
          detalle={cambio === null ? `antes: ${entero(v.netas30Antes)}` : `${cambio > 0 ? "+" : cambio < 0 ? "−" : ""}${Math.abs(cambio).toLocaleString("es-PA", { maximumFractionDigits: 0 })} % vs. ${entero(v.netas30Antes)}`}
        />
        <Dato titulo="Stock en Dropi" valor={entero(v.stock)} tono={v.stockEstado === "sin_stock_vende" ? "peligro" : undefined} detalle={v.diasInventario === null ? "no se está vendiendo" : `para ${entero(v.diasInventario)} días`} />
        <Dato titulo="Canceladas" valor={pct(v.pctCancelacion)} detalle={`de ${entero(v.pedidas)} pedidas`} />
        <Dato titulo="Devueltas o rechazadas" valor={pct(v.pctDevolucion)} tono={v.pedidas >= 30 && (v.pctDevolucion ?? 0) > 0.2 ? "aviso" : undefined} detalle={`última venta: ${fecha(v.ultimaVenta)}`} />
      </dl>
      {v.stockEstado === "sin_stock_vende" && <p className="text-sm font-medium text-destructive">Se está vendiendo y no tiene stock en Dropi.</p>}
      {v.stock <= 0 && enCamino > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-azul">
          <span>
            Viene mercancía en camino: {entero(enCamino)} {enCamino === 1 ? "unidad" : "unidades"}
            {llegada && <> · llega aprox. {fecha(llegada)}</>}
          </span>
          {sinFecha > 0 && <Badge tone="warning">{llegada ? "Parte sin fecha de llegada" : "Aún sin fecha de llegada"}</Badge>}
        </p>
      )}
      {v.stockEstado === "se_acaba" && <p className="text-sm font-medium text-warning">Al ritmo de los últimos 30 días, el stock alcanza para menos de {DIAS_REPONER} días.</p>}
      <figure className="m-0 flex flex-col gap-1.5">
        <figcaption className="text-xs text-muted-foreground">Unidades netas por mes</figcaption>
        <div className="flex h-24 items-end gap-1" role="img" aria-label={`Netas por mes: ${valores.map((x) => `${MESES[Number(x.mes.slice(5, 7)) - 1]} ${entero(x.netas)}`).join(", ")}`}>
          {valores.map((x) => (
            <div key={x.mes} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5">
              <span className="text-[10px] text-muted-foreground tabular-nums">{x.netas !== 0 ? entero(x.netas) : ""}</span>
              <span className={`w-full rounded-t-[3px] ${x.netas < 0 ? "bg-destructive" : "barra-neon"}`} style={{ height: `${Math.max(x.netas > 0 ? 4 : 2, (Math.max(x.netas, 0) / max) * 72)}px`, opacity: x.netas === 0 ? 0.25 : 1 }} />
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          {valores.map((x) => (
            <span key={x.mes} className="min-w-0 flex-1 text-center text-[10px] text-muted-foreground">
              {MESES[Number(x.mes.slice(5, 7)) - 1]}
            </span>
          ))}
        </div>
      </figure>
      <p className="text-xs text-muted-foreground">
        Datos de Dropi hasta el {fecha(corte)}
        {v.ids.length > 1 ? ` · suma los IDs ${v.ids.join(" y ")}` : ""}. El detalle está en Desempeño › Ventas Dropi.
      </p>
    </div>
  );
}
