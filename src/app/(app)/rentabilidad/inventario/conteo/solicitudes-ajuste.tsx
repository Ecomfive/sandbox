"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { entero } from "@/lib/af4/formato";
import { fechaHora } from "@/lib/af4/fecha";
import { resolverAjusteInventario } from "../actions";

export interface SolicitudAjuste {
  id: string;
  archivo: string;
  soporte: string;
  diferencias: { codigo: string; bodega: string; lote: string | null; actual: number; contado: number; diferencia: number }[];
  estado: "pendiente" | "aprobado" | "rechazado";
  solicitadoPor: string;
  solicitadoEn: string;
  resueltoPor: string | null;
  motivoRechazo: string | null;
  propia: boolean;
}

const ESTADO = { pendiente: "bg-warning", aprobado: "bg-success", rechazado: "bg-destructive" } as const;
const TEXTO = { pendiente: "Pendiente", aprobado: "Aprobado", rechazado: "Rechazado" } as const;

function Solicitud({ s, puedeResolver }: { s: SolicitudAjuste; puedeResolver: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [abierta, setAbierta] = useState(false);
  const [pendiente, empezar] = useTransition();
  const resolver = (aprobar: boolean) =>
    empezar(async () => {
      const r = await resolverAjusteInventario(s.id, aprobar, motivo).catch(() => ({ error: "Se cortó la conexión." }) as { error?: string; ajustados?: number });
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast(aprobar ? `${entero(r.ajustados ?? 0)} ajustes aplicados` : "Solicitud rechazada");
      router.refresh();
    });
  const suma = s.diferencias.reduce((a, d) => a + d.diferencia, 0);
  return (
    <li className="flex flex-col gap-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${ESTADO[s.estado]}`} />
        <span className="font-medium">{s.archivo}</span>
        <span className="sr-only">{TEXTO[s.estado]}</span>
        <span className={`text-muted-foreground ${claseCifra}`}>
          {entero(s.diferencias.length)} ajustes · {suma > 0 ? "+" : ""}
          {entero(suma)} unidades
        </span>
        <span className="text-xs text-muted-foreground">
          {s.solicitadoPor} · {fechaHora(s.solicitadoEn)}
          {s.resueltoPor ? ` · ${TEXTO[s.estado].toLowerCase()} por ${s.resueltoPor}` : ""}
        </span>
      </div>
      <p className="text-muted-foreground">
        <span className="text-xs">Soporte: </span>
        {s.soporte}
      </p>
      {s.motivoRechazo && <p className="text-xs text-muted-foreground">Motivo del rechazo: {s.motivoRechazo}</p>}
      <button type="button" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta} className={`self-start text-xs font-medium underline-offset-2 hover:underline ${anilloFoco} rounded`}>
        {abierta ? "Ocultar los ajustes" : "Ver los ajustes"}
      </button>
      {abierta && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Producto</th>
              <th className="py-1 pr-2 font-medium">Bodega</th>
              <th className="py-1 pr-2 text-right font-medium">WMS</th>
              <th className="py-1 pr-2 text-right font-medium">Contado</th>
              <th className="py-1 text-right font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {s.diferencias.slice(0, 300).map((d, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className="py-1 pr-2">
                  {d.codigo}
                  {d.lote ? ` · lote ${d.lote}` : ""}
                </td>
                <td className="py-1 pr-2">{d.bodega}</td>
                <td className={`py-1 pr-2 text-right ${claseCifra}`}>{entero(d.actual)}</td>
                <td className={`py-1 pr-2 text-right ${claseCifra}`}>{entero(d.contado)}</td>
                <td className={`py-1 text-right ${claseCifra}`}>
                  {d.diferencia > 0 ? "+" : ""}
                  {entero(d.diferencia)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {s.estado === "pendiente" && puedeResolver && (
        <div className="flex flex-wrap items-center gap-2">
          {rechazando ? (
            <>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                aria-label={`Motivo del rechazo de ${s.archivo}`}
                placeholder="Por qué se rechaza"
                maxLength={500}
                className={`${fieldClassSm} w-64`}
              />
              <button type="button" disabled={pendiente || motivo.trim().length < 3} onClick={() => resolver(false)} className={`h-8 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
                Rechazar
              </button>
              <button type="button" onClick={() => setRechazando(false)} className={`h-8 rounded-md px-2 text-xs ${anilloFoco}`}>
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={pendiente} onClick={() => resolver(true)} className={`h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}>
                {pendiente ? "Aplicando…" : "Aprobar y ajustar"}
              </button>
              <button type="button" disabled={pendiente} onClick={() => setRechazando(true)} className={`h-8 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted ${anilloFoco}`}>
                Rechazar
              </button>
            </>
          )}
        </div>
      )}
      {s.estado === "pendiente" && !puedeResolver && s.propia && <p className="text-xs text-muted-foreground">La aprueba otra persona que pueda modificar Inventario.</p>}
    </li>
  );
}

/** Las solicitudes de ajuste de los conteos (mejora 79): las pendientes primero y las últimas resueltas. */
export function SolicitudesAjuste({ solicitudes, esAdmin, puedeEscribir }: { solicitudes: SolicitudAjuste[]; esAdmin: boolean; puedeEscribir: boolean }) {
  return (
    <MarcoAF4 id="titulo-solicitudes-ajuste" titulo="Ajustes por aprobar" detalle="Un conteo no cambia el stock hasta que otra persona lo aprueba" sinRelleno>
      {solicitudes.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No hay solicitudes de ajuste.</p>
      ) : (
        <ul className="divide-y divide-border">
          {solicitudes.map((s) => (
            <Solicitud key={s.id} s={s} puedeResolver={puedeEscribir && (!s.propia || esAdmin)} />
          ))}
        </ul>
      )}
    </MarcoAF4>
  );
}
