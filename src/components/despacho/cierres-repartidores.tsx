"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { revisarCierre } from "@/app/(app)/despacho-ciudad/repartidores-actions";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { CierreRepartidor } from "@/lib/despacho/cierres";
import { plata } from "@/lib/despacho/panel-repartidor";

/** «JULY CALLE» → «July Calle». */
const nombreBonito = (t: string) => t.toLowerCase().replace(/(^|\s)\p{L}/gu, (l) => l.toUpperCase());
const diaCorto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Un cierre, como el recuadro de la pantalla 6 del prototipo aprobado: lo que mandó el repartidor y «Validar cierre» o «Devolver con nota». */
function TarjetaCierre({ c, puedeEscribir }: { c: CierreRepartidor; puedeEscribir: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [devolver, setDevolver] = useState(false);
  const [nota, setNota] = useState("");
  const r = c.resumen;
  const [chip, claseChip] =
    c.estado === "validado" ? ["Validado", "bg-success-soft text-success"] : c.estado === "devuelto" ? ["Devuelto", "bg-destructive-soft text-destructive"] : ["Por validar", "bg-warning-soft text-warning"];

  const revisar = (validar: boolean) =>
    empezar(async () => {
      const res = await revisarCierre(c.id, validar, nota);
      if (res.error) return mostrarToast(res.error, "destructive");
      mostrarToast(validar ? `Cierre de ${nombreBonito(c.courier)} validado.` : "Cierre devuelto con tu nota.");
      setDevolver(false);
      setNota("");
      router.refresh();
    });

  return (
    <article className="flex min-w-[17rem] flex-1 basis-[19rem] flex-col gap-2.5 rounded-xl border border-border bg-card px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <b className="text-[15px]">
          Cierre de {nombreBonito(c.courier)} · {diaCorto(c.dia)}
        </b>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${claseChip}`}>{chip}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-[13px]">
        <span className="text-muted-foreground">Entregados</span>
        <b className="text-right">
          {r.entregados} de {r.pedidos}
        </b>
        {c.depositos.map((d) => (
          <span key={d.tienda} className="contents">
            <span className="text-muted-foreground">
              Efectivo {d.tienda}{" "}
              {d.foto ? (
                <a href={d.foto} target="_blank" rel="noreferrer" className="text-xs font-medium text-primario">
                  ver depósito
                </a>
              ) : (
                <span className="text-xs text-warning">sin foto</span>
              )}
            </span>
            <b className="text-right">{plata(d.monto)}</b>
          </span>
        ))}
        <span className="text-muted-foreground">Yappy · MiPOS · transf.</span>
        <b className="text-right">{plata(r.digitalesTotal)}</b>
        <span className="text-muted-foreground">Comprobantes</span>
        <b className="text-right">
          {r.digitalesConComprobante} de {r.digitalesPedidos}
        </b>
        <span className="text-muted-foreground">
          Pago de envíos ({r.entregados} + {r.fallidosConEvidencia} fallidos)
        </span>
        <b className="text-right">{plata(r.pago.monto)}</b>
      </div>
      {c.estado === "devuelto" && c.nota && <p className="m-0 rounded-lg bg-destructive-soft px-2.5 py-1.5 text-xs text-destructive">Devuelto: {c.nota}</p>}
      {c.estado === "validado" && <p className="m-0 text-xs text-muted-foreground">Validado{c.revisadoPor ? ` por ${c.revisadoPor}` : ""}.</p>}
      {puedeEscribir && c.estado === "enviado" && !devolver && (
        <div className="flex gap-2">
          <button type="button" disabled={pendiente} onClick={() => revisar(true)} className={`min-h-11 flex-1 rounded-[10px] bg-primario text-sm font-bold text-white disabled:opacity-60 ${anilloFoco}`}>
            Validar cierre
          </button>
          <button type="button" disabled={pendiente} onClick={() => setDevolver(true)} className={`min-h-11 flex-1 rounded-[10px] border border-border bg-card text-sm font-semibold text-foreground-soft ${anilloFoco}`}>
            Devolver con nota
          </button>
        </div>
      )}
      {devolver && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Qué tiene que corregir
            <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={1000} className="resize-none rounded-md border border-border-control px-2 py-1.5 text-sm font-normal" />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={pendiente || !nota.trim()} onClick={() => revisar(false)} className={`min-h-10 flex-1 rounded-[10px] bg-primario text-sm font-semibold text-white disabled:opacity-60 ${anilloFoco}`}>
              Devolver
            </button>
            <button type="button" onClick={() => setDevolver(false)} className={`min-h-10 flex-1 rounded-[10px] border border-border bg-card text-sm font-medium ${anilloFoco}`}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      <span className="text-xs text-muted-foreground">
        {c.estado === "validado" ? "El reporte de pago del mensajero: " : "Al validar sale el reporte de pago del mensajero: "}
        <Link href={`/despacho-ciudad/cierre/${c.id}`} className="font-medium text-primario">
          Reporte de pago
        </Link>
      </span>
    </article>
  );
}

/** Los cierres que mandaron los repartidores desde su panel (24 nov 2026), arriba del tablero: primero los que esperan validación. */
export function CierresRepartidores({ cierres, puedeEscribir }: { cierres: CierreRepartidor[]; puedeEscribir: boolean }) {
  if (!cierres.length) return null;
  const porValidar = cierres.filter((c) => c.estado === "enviado").length;
  return (
    <section aria-labelledby="t-cierres" className="flex flex-col gap-2">
      <h2 id="t-cierres" className="m-0 text-[15px] font-semibold">
        Cierres de los repartidores {porValidar > 0 && <span className="ml-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">{porValidar} por validar</span>}
      </h2>
      <div className="flex flex-wrap gap-3">
        {cierres.map((c) => (
          <TarjetaCierre key={c.id} c={c} puedeEscribir={puedeEscribir} />
        ))}
      </div>
    </section>
  );
}
