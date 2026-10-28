"use client";

import { useState, useTransition } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatearFechaHora } from "@/lib/formato";
import type { EstadoSolicitud } from "@/lib/whatsapp/borrado";
import { cancelarSolicitudBorrado, recuperarOculto, resolverSolicitudBorrado } from "./actions";
import type { OcultoVista, SolicitudVista } from "./datos-borrados";

const ESTADO: Record<EstadoSolicitud, { etiqueta: string; tono: Tone }> = {
  pendiente: { etiqueta: "Esperando autorización", tono: "azul" },
  autorizada: { etiqueta: "Autorizada: oculto", tono: "success" },
  rechazada: { etiqueta: "Rechazada", tono: "destructive" },
  cancelada: { etiqueta: "Cancelada", tono: "neutral" },
};

const boton = `inline-flex min-h-9 items-center rounded-md border border-border-control bg-card px-3 text-xs font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;
const botonOscuro = `inline-flex min-h-9 items-center rounded-md bg-foreground px-3.5 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-50 ${anilloFoco}`;

/** Qué se quiere borrar: el chat (con quién) o un mensaje (con su texto). */
function Que({ s }: { s: SolicitudVista }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{s.tipo === "chat" ? "Chat completo" : "Un mensaje"}</Badge>
        <span className="text-sm font-semibold [overflow-wrap:anywhere]">{s.chat}</span>
      </span>
      {s.tipo === "mensaje" && <p className="m-0 rounded-md bg-muted px-3 py-2 text-sm [overflow-wrap:anywhere]">{s.vista}</p>}
      <p className="m-0 text-sm">
        <span className="text-muted-foreground">Motivo: </span>
        <span className="[overflow-wrap:anywhere]">{s.motivo}</span>
      </p>
    </div>
  );
}

/**
 * CRM › Borrados (28 oct 2026): lo que hay que autorizar, las peticiones propias y, para administradores, lo que está oculto y se puede recuperar. Un chat o un
 * mensaje no se borra por su cuenta: quien lo pide da el motivo y lo autoriza la persona por encima; al autorizarse **se oculta**, no se pierde.
 */
export function Borrados({ inicial, esAdmin }: { inicial: { solicitudes: SolicitudVista[]; ocultos: OcultoVista[] }; esAdmin: boolean }) {
  const { solicitudes, ocultos } = inicial;
  const { mostrarToast } = useToast();
  const [ocupado, empezar] = useTransition();
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [notas, setNotas] = useState<Record<string, string>>({});

  const porAutorizar = solicitudes.filter((s) => s.puedeResolver);
  const resto = solicitudes.filter((s) => !s.puedeResolver);

  function accion(clave: string, hacer: () => Promise<{ ok: true } | { error: string }>, ok: string) {
    setEnCurso(clave);
    empezar(async () => {
      const r = await hacer().catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      setEnCurso(null);
      mostrarToast("error" in r ? r.error : ok, "error" in r ? "destructive" : undefined);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="por-autorizar" className="flex flex-col gap-3">
        <h2 id="por-autorizar" className="m-0 text-base font-semibold">
          Por autorizar
        </h2>
        {porAutorizar.length === 0 ? (
          <p className="m-0 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No tienes peticiones esperando tu autorización.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {porAutorizar.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                <Que s={s} />
                <p className="m-0 text-xs text-muted-foreground">
                  Lo pidió {s.solicitante} · {formatearFechaHora(s.creadoEn)}. Si lo autorizas, se oculta de la bandeja para todos; no se pierde y un administrador lo puede recuperar.
                </p>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Nota para quien lo pidió (opcional)</span>
                  <input value={notas[s.id] ?? ""} onChange={(e) => setNotas((n) => ({ ...n, [s.id]: e.target.value }))} maxLength={300} className={`${fieldClass} w-full`} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={ocupado} onClick={() => accion(`si-${s.id}`, () => resolverSolicitudBorrado(s.id, true, notas[s.id]), "Autorizado: ya no se ve en la bandeja.")} className={botonOscuro}>
                    {enCurso === `si-${s.id}` ? "Autorizando…" : "Autorizar"}
                  </button>
                  <button type="button" disabled={ocupado} onClick={() => accion(`no-${s.id}`, () => resolverSolicitudBorrado(s.id, false, notas[s.id]), "Rechazado: se queda como está.")} className={boton}>
                    {enCurso === `no-${s.id}` ? "Rechazando…" : "Rechazar"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="peticiones" className="flex flex-col gap-3">
        <h2 id="peticiones" className="m-0 text-base font-semibold">
          {esAdmin ? "Todas las peticiones" : "Mis peticiones"}
        </h2>
        {resto.length === 0 ? (
          <p className="m-0 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Todavía no hay peticiones.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card p-0">
            {resto.map((s) => {
              const e = ESTADO[s.estado];
              return (
                <li key={s.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={e.tono}>{e.etiqueta}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">{formatearFechaHora(s.creadoEn)}</span>
                  </div>
                  <Que s={s} />
                  <p className="m-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {s.estado === "pendiente"
                      ? `Lo pidió ${s.solicitante}. Lo autoriza: ${s.autorizan.join(", ") || "—"}.`
                      : `Lo pidió ${s.solicitante}. ${s.resueltaPor ? `${s.estado === "autorizada" ? "Lo autorizó" : s.estado === "rechazada" ? "Lo rechazó" : "Lo canceló"} ${s.resueltaPor}${s.resueltaEn ? ` · ${formatearFechaHora(s.resueltaEn)}` : ""}.` : ""}${s.nota ? ` Nota: ${s.nota}` : ""}`}
                  </p>
                  {s.puedeCancelar && (
                    <button type="button" disabled={ocupado} onClick={() => accion(`c-${s.id}`, () => cancelarSolicitudBorrado(s.id), "Petición cancelada.")} className={`${boton} self-start`}>
                      {enCurso === `c-${s.id}` ? "Cancelando…" : "Cancelar la petición"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {esAdmin && (
        <section aria-labelledby="ocultos" className="flex flex-col gap-3">
          <h2 id="ocultos" className="m-0 text-base font-semibold">
            Ocultos
          </h2>
          <p className="m-0 text-xs text-muted-foreground">Lo que se autorizó borrar. No se perdió: aquí se puede recuperar.</p>
          {ocultos.length === 0 ? (
            <p className="m-0 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No hay nada oculto.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card p-0">
              {ocultos.map((o) => (
                <li key={`${o.tipo}-${o.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{o.tipo === "chat" ? "Chat completo" : "Un mensaje"}</Badge>
                      <span className="text-sm font-semibold [overflow-wrap:anywhere]">{o.chat}</span>
                    </span>
                    {o.vista && <span className="text-sm [overflow-wrap:anywhere]">{o.vista}</span>}
                    <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {o.por ?? "Ocultado"} · {formatearFechaHora(o.en)}
                    </span>
                  </div>
                  <button type="button" disabled={ocupado} onClick={() => accion(`r-${o.id}`, () => recuperarOculto(o.tipo, o.id), "Recuperado: vuelve a verse en la bandeja.")} className={boton}>
                    {enCurso === `r-${o.id}` ? "Recuperando…" : "Recuperar"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
