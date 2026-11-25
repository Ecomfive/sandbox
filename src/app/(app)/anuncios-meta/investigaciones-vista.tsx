"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dolares } from "@/lib/meta-ads/metricas";
import { NOMBRE_DIMENSION, NOMBRE_RAZON, NOMBRE_RAZON_CHAT, type InvestigacionProducto } from "@/lib/meta-ads/investigacion-entrega";
import { investigarEntregaMeta } from "./actions";
import { BarraProgreso } from "./graficas";
import { SeccionPlegable } from "./plegable";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" });

function Subtitulo({ children }: { children: React.ReactNode }) {
  return <h4 className="m-0 text-xs font-semibold text-muted-foreground">{children}</h4>;
}

function Investigacion({ inv, escribe }: { inv: InvestigacionProducto; escribe: boolean }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const promedio = inv.resumen.resueltos ? inv.resumen.devueltos / inv.resumen.resueltos : 0;
  const factores = inv.grupos.filter((g) => g.factor).slice(0, 6);
  const maxRazon = Math.max(1, ...inv.razones.map((r) => r.devoluciones));
  const conv = inv.conversaciones;
  const aFondo = () =>
    empezar(async () => {
      setMensaje(null);
      const r = await investigarEntregaMeta(inv.clave);
      setMensaje(r.error ?? r.aviso ?? "Listo: ya se leyeron las conversaciones.");
      if (!r.error) router.refresh();
    });
  return (
    <li className="rounded-lg border border-border bg-card">
      <details className="group" open={false}>
        <summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium leading-snug">{inv.producto}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="rounded-full bg-destructive-soft px-2 py-0.5 font-medium text-destructive">Entrega {pct(inv.resumen.tasaEntrega)}</span>
              {inv.tiendaEntrega !== null && <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Toda la tienda {pct(inv.tiendaEntrega)}</span>}
              {inv.costo?.costoPorEntrega != null && <span className="text-muted-foreground tabular-nums">{dolares(inv.costo.costoPorEntrega)} por compra entregada</span>}
              {inv.costo?.cpaObjetivo != null && <span className="font-medium tabular-nums">CPA objetivo {dolares(inv.costo.cpaObjetivo)}</span>}
            </span>
            {inv.hallazgos[0] && <span className="mt-1.5 block text-sm text-muted-foreground">{inv.hallazgos[0].titulo}</span>}
          </span>
          <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" className="mt-1 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
        </summary>
        <div className="flex flex-col gap-4 border-t border-border px-3 py-3">
          <div className="flex flex-col gap-2">
            <Subtitulo>Causas encontradas, de la que más explica a la que menos</Subtitulo>
            {inv.hallazgos.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">No se encontró una causa clara en los pedidos, Servientrega ni Monday. {inv.sinMotivo > 0 ? `${inv.sinMotivo} devoluciones no tienen ningún motivo escrito: pedir a los asesores que lo anoten en Monday ayudaría. ` : ""}Pruébalo a fondo para leer las conversaciones.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {inv.hallazgos.map((h) => (
                  <li key={h.titulo} className="rounded-md border border-border p-2.5 text-sm">
                    <p className="m-0 font-medium leading-snug">{h.titulo}</p>
                    {h.detalle && <p className="m-0 mt-1 text-xs text-muted-foreground">{h.detalle}</p>}
                    <p className="m-0 mt-1.5 flex gap-2 rounded-md bg-success-soft px-2.5 py-1.5 text-xs">
                      <span className="shrink-0 font-semibold text-success">Qué hacer</span>
                      <span>{h.accion}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {factores.length > 0 && (
            <div className="flex flex-col gap-2">
              <Subtitulo>Dónde se devuelve más (promedio del producto: {pct(promedio)})</Subtitulo>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {factores.map((g) => (
                  <li key={`${g.dimension}:${g.nombre}`} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-xs">
                    <span className="truncate" title={`${NOMBRE_DIMENSION[g.dimension]}: ${g.nombre}`}>
                      <span className="text-muted-foreground">{NOMBRE_DIMENSION[g.dimension]} · </span>
                      <span className="font-medium">{g.nombre}</span>
                    </span>
                    <span className="relative block">
                      <BarraProgreso valor={g.tasaDevolucion * 100} maximo={100} color="var(--destructive)" alto={9} />
                      <span aria-hidden="true" className="absolute -top-0.5 h-3 w-0.5 rounded bg-foreground/60" style={{ left: `${promedio * 100}%` }} />
                    </span>
                    <span className="whitespace-nowrap text-right tabular-nums">
                      <span className="font-semibold text-destructive">{pct(g.tasaDevolucion)}</span> · {g.devueltos}/{g.resueltos}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {inv.razones.length > 0 && (
            <div className="flex flex-col gap-2">
              <Subtitulo>Lo que dicen Servientrega, Monday y los asesores ({inv.conMotivo} devoluciones con motivo · {inv.sinMotivo} sin motivo)</Subtitulo>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {inv.razones.slice(0, 6).map((r) => (
                  <li key={r.razon} className="text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{NOMBRE_RAZON[r.razon]}</span>
                      <span className="tabular-nums text-muted-foreground">{r.devoluciones}</span>
                    </div>
                    <BarraProgreso valor={r.devoluciones} maximo={maxRazon} color="var(--meta-2)" alto={6} />
                    {r.ejemplos.length > 0 && <p className="m-0 mt-0.5 text-muted-foreground">«{r.ejemplos[0]}»</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Subtitulo>Lo que dicen las conversaciones de WhatsApp de los pedidos devueltos</Subtitulo>
            {conv ? (
              <>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-xs">
                  {conv.razones.map((r) => (
                    <li key={r.razon} className="flex items-center justify-between gap-3">
                      <span className="font-medium">{NOMBRE_RAZON_CHAT[r.razon]}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {r.cuantas} de {conv.leidas}
                      </span>
                    </li>
                  ))}
                </ul>
                {conv.ejemplos.slice(0, 3).map((e) => (
                  <p key={e.numero} className="m-0 rounded-md bg-muted px-2.5 py-1.5 text-xs">
                    «{e.evidencia}» <span className="text-muted-foreground">· {NOMBRE_RAZON_CHAT[e.razon]}</span>
                  </p>
                ))}
                <p className="m-0 text-[11px] text-muted-foreground">Leídas el {fecha(conv.generadaEn)} (la IA las lee sin teléfonos ni correos).</p>
              </>
            ) : (
              <p className="m-0 text-xs text-muted-foreground">Todavía no se han leído.</p>
            )}
            {escribe && (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={aFondo} disabled={pendiente} className="min-h-9 rounded-md bg-foreground px-3 text-xs font-semibold text-background disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2">
                  {pendiente ? "Leyendo conversaciones…" : conv ? "Volver a leerlas" : "Investigar a fondo (leer conversaciones)"}
                </button>
                {pendiente && <span className="text-xs text-muted-foreground">Tarda un minuto: lee hasta 12 conversaciones y las analiza con IA.</span>}
              </div>
            )}
            {mensaje && (
              <p className="m-0 text-xs text-muted-foreground" role="status">
                {mensaje}
              </p>
            )}
          </div>

          <p className="m-0 text-[11px] text-muted-foreground">
            Con {inv.resumen.pedidos} pedidos de los últimos {inv.dias} días de {inv.tiendas.join(", ")} ({inv.resumen.entregados} entregados, {inv.resumen.devueltos} devueltos). Hecho el {fecha(inv.generadaEn)}; el sistema lo renueva cada día.
          </p>
        </div>
      </details>
    </li>
  );
}

/**
 * «Por qué no se entrega» (24 nov 2026, pedido de Alcides: «no solo plantear las preguntas, también el por qué, con datos de todo el sistema»): por cada producto que vende pero devuelve, lo que se encontró cruzando sus pedidos con la zona, la
 * transportadora, la confirmación, Servientrega, Monday y, a fondo, las conversaciones; con la acción concreta y los números.
 */
export function InvestigacionesDeEntrega({ investigaciones, escribe, abierta = true }: { investigaciones: InvestigacionProducto[]; escribe: boolean; abierta?: boolean }) {
  if (investigaciones.length === 0) return null;
  return (
    <SeccionPlegable titulo="Por qué no se entrega" abierta={abierta} resumen={`${investigaciones.length} ${investigaciones.length === 1 ? "producto investigado" : "productos investigados"}`} derecha="Cruzando pedidos, Servientrega, Monday y conversaciones">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {investigaciones.map((i) => (
          <Investigacion key={i.clave} inv={i} escribe={escribe} />
        ))}
      </ul>
    </SeccionPlegable>
  );
}
