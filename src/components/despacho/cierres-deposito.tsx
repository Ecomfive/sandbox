"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { revisarCierre } from "@/app/(app)/despacho-ciudad/repartidores-actions";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { plata } from "@/lib/despacho/panel-repartidor";

export interface CierreDeposito {
  /** El cierre que mandó el repartidor (null si todavía no lo manda). */
  id: string | null;
  nombre: string;
  prueba: boolean;
  estado: "enviado" | "validado" | "devuelto" | null;
  nota: string | null;
  revisadoPor: string | null;
  tiendas: { tienda: string; pedidos: number; debe: number; declarado: number | null; foto: string | null }[];
}

const CHIPS = {
  enviado: ["Por validar", "bg-warning-soft text-warning"],
  validado: ["Validado", "bg-success-soft text-success"],
  devuelto: ["Devuelto", "bg-destructive-soft text-destructive"],
  ninguno: ["Todavía no envía su cierre", "bg-primario-suave text-primario"],
} as const;

/** Un repartidor: por tienda, lo que debe depositar y el comprobante; «Validar depósitos» o «Devolver con nota» (pantalla 1 del prototipo aprobado). */
function Tarjeta({ c, puedeEscribir }: { c: CierreDeposito; puedeEscribir: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [devolver, setDevolver] = useState(false);
  const [nota, setNota] = useState("");
  const [chip, claseChip] = CHIPS[c.estado ?? "ninguno"];
  const total = c.tiendas.reduce((s, t) => s + t.debe, 0);

  const revisar = (validar: boolean) =>
    empezar(async () => {
      if (!c.id) return;
      const res = await revisarCierre(c.id, validar, nota);
      if (res.error) return mostrarToast(res.error, "destructive");
      mostrarToast(validar ? `Depósitos de ${c.nombre} validados.` : "Cierre devuelto con tu nota.");
      setDevolver(false);
      setNota("");
      router.refresh();
    });

  return (
    <article className="flex min-w-[18rem] flex-1 basis-[24rem] flex-col gap-2 rounded-xl border border-border bg-card px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <b className="text-[15px]">
          {c.nombre}
          {c.prueba && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(prueba)</span>}
        </b>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${claseChip}`}>{chip}</span>
      </div>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="py-1 text-left font-semibold">
              Tienda
            </th>
            <th scope="col" className="py-1 text-right font-semibold">
              Debe depositar
            </th>
            <th scope="col" className="py-1 pl-4 text-left font-semibold">
              Comprobante de depósito
            </th>
          </tr>
        </thead>
        <tbody>
          {c.tiendas.map((t) => {
            const difiere = t.declarado !== null && Math.abs(t.declarado - t.debe) > 0.005;
            return (
              <tr key={t.tienda} className="border-t border-border/60">
                <td className="py-1.5">
                  {t.tienda}
                  {t.pedidos > 0 && <span className="ml-1 text-xs text-muted-foreground">· {t.pedidos}</span>}
                </td>
                <td className="py-1.5 text-right font-semibold">{plata(t.debe)}</td>
                <td className="py-1.5 pl-4">
                  {t.foto ? (
                    <a href={t.foto} target="_blank" rel="noreferrer" className="font-semibold text-primario">
                      Ver foto{t.declarado !== null ? ` · ${plata(t.declarado)}` : ""}
                    </a>
                  ) : (
                    <span className="text-warning">{c.id ? "Sin foto" : "Sin subir"}</span>
                  )}
                  {difiere && <span className="ml-1.5 text-xs font-semibold text-destructive">difiere {plata(Math.abs((t.declarado ?? 0) - t.debe))}</span>}
                </td>
              </tr>
            );
          })}
          <tr className="border-t border-border font-semibold">
            <td className="py-1.5">Total</td>
            <td className="py-1.5 text-right">{plata(total)}</td>
            <td />
          </tr>
        </tbody>
      </table>
      {c.estado === "devuelto" && c.nota && <p className="m-0 rounded-lg bg-destructive-soft px-2.5 py-1.5 text-xs text-destructive">Devuelto: {c.nota}</p>}
      {c.estado === "validado" && <p className="m-0 text-xs text-muted-foreground">Validado{c.revisadoPor ? ` por ${c.revisadoPor}` : ""}.</p>}
      {puedeEscribir && c.estado === "enviado" && !devolver && (
        <div className="flex gap-2">
          <button type="button" disabled={pendiente} onClick={() => revisar(true)} className={`min-h-10 flex-1 rounded-lg bg-primario text-[13px] font-bold text-white disabled:opacity-60 ${anilloFoco}`}>
            Validar depósitos
          </button>
          <button type="button" disabled={pendiente} onClick={() => setDevolver(true)} className={`min-h-10 flex-1 rounded-lg border border-border bg-card text-[13px] font-semibold text-foreground-soft ${anilloFoco}`}>
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
            <button type="button" disabled={pendiente || !nota.trim()} onClick={() => revisar(false)} className={`min-h-10 flex-1 rounded-lg bg-primario text-sm font-semibold text-white disabled:opacity-60 ${anilloFoco}`}>
              Devolver
            </button>
            <button type="button" onClick={() => setDevolver(false)} className={`min-h-10 flex-1 rounded-lg border border-border bg-card text-sm font-medium ${anilloFoco}`}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {c.id && (
        <Link href={`/despacho-ciudad/cierre/${c.id}`} className="text-xs font-medium text-primario">
          Ver el cierre completo
        </Link>
      )}
    </article>
  );
}

/** Envíos Delivery › Cierres: una tarjeta por repartidor con efectivo ese día (o que mandó su cierre). */
export function CierresDeposito({ tarjetas, puedeEscribir }: { tarjetas: CierreDeposito[]; puedeEscribir: boolean }) {
  return (
    <div className="flex flex-wrap gap-3">
      {tarjetas.map((c) => (
        <Tarjeta key={c.id ?? c.nombre} c={c} puedeEscribir={puedeEscribir} />
      ))}
    </div>
  );
}
