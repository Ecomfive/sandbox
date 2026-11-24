"use client";

import { useState, useTransition } from "react";
import { Pastilla } from "@/components/panel/piezas-panel";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { MOTIVOS_ANULACION, ZONAS_ATC, conNovedad, motivoAtc, porConfirmar, zonaAtc, type AccionAtc } from "@/lib/tienda/gestion-atc";
import { gestionarPedidoAtc, type ResultadoGestion } from "../gestion-actions";

/**
 * Gestión del pedido con el manual ATC (24 nov 2026): el estado en palabras y los tres botones de la asesora. Confirmar (elige la zona), Novedad (el
 * cliente pidió esperar) y Anular (un solo motivo del árbol del manual). Cada uno escribe en Shopify y deja su línea en la cronología (Notas del equipo).
 * El sistema no deja anular sin motivo, borrar la zona al anular, poner dos motivos ni inventar etiquetas.
 */
export function GestionPedido({
  ordenId,
  etiquetas,
  codigoPais,
  estadoEntrega,
  alHecho,
}: {
  ordenId: string;
  etiquetas: string[];
  codigoPais: string;
  estadoEntrega: string | null;
  alHecho: (r: Extract<ResultadoGestion, { ok: true }>) => void;
}) {
  const [abierta, setAbierta] = useState<AccionAtc | null>(null);
  const [zona, setZona] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const zonas = ZONAS_ATC[codigoPais] ?? ZONAS_ATC.PA;
  const zonaActual = zonaAtc(etiquetas);
  const motivoActual = motivoAtc(etiquetas);
  const entregado = estadoEntrega === "entregada";
  const anulado = !!motivoActual || estadoEntrega === "cancelada";
  const estado = entregado
    ? { texto: "Entregado", tono: "exito" as const }
    : anulado
      ? { texto: `Anulado${motivoActual ? ` · ${motivoActual}` : " · falta el motivo"}`, tono: "peligro" as const }
      : conNovedad(etiquetas)
        ? { texto: "Novedad: el cliente pidió esperar", tono: "aviso" as const }
        : porConfirmar(etiquetas) || !zonaActual
          ? { texto: "Por confirmar datos", tono: "aviso" as const }
          : { texto: `Confirmado · ${zonaActual}`, tono: "neutro" as const };

  function abrir(a: AccionAtc) {
    setError(null);
    setNota("");
    setMotivo("");
    setZona(zonaActual ?? "");
    setAbierta((x) => (x === a ? null : a));
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!abierta) return;
    setError(null);
    iniciar(async () => {
      const r = await gestionarPedidoAtc(ordenId, abierta, { zona, motivo, nota });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setAbierta(null);
      alHecho(r);
    });
  }

  const boton = (a: AccionAtc, texto: string, deshabilitado: boolean) => (
    <button
      type="button"
      onClick={() => abrir(a)}
      disabled={deshabilitado || pendiente}
      aria-expanded={abierta === a}
      className={`inline-flex min-h-7 items-center rounded-md border px-2.5 text-xs font-semibold disabled:opacity-40 ${
        abierta === a ? "border-primario bg-primario text-white" : "border-primario/40 bg-card text-primario hover:bg-primario-suave"
      } ${anilloFoco}`}
    >
      {texto}
    </button>
  );

  // El árbol del manual: se baja por las preguntas y se detiene en el primer sí.
  const grupos = MOTIVOS_ANULACION.reduce<{ pregunta: string; motivos: typeof MOTIVOS_ANULACION }[]>((acc, m) => {
    const g = acc.find((x) => x.pregunta === m.pregunta);
    if (g) g.motivos.push(m);
    else acc.push({ pregunta: m.pregunta, motivos: [m] });
    return acc;
  }, []);

  return (
    <section aria-label="Gestión del pedido" className="flex flex-col gap-2 border-b border-border bg-primario-suave/40 px-5 py-3" aria-busy={pendiente}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Gestión</span>
        <Pastilla tono={estado.tono}>{estado.texto}</Pastilla>
        {!entregado && (
          <span className="ml-auto flex flex-wrap gap-1.5">
            {boton("confirmar", zonaActual && !porConfirmar(etiquetas) && !conNovedad(etiquetas) ? "Cambiar zona" : "Confirmar", anulado)}
            {boton("novedad", "Novedad", anulado || conNovedad(etiquetas))}
            {boton("anular", motivoActual ? "Cambiar motivo" : "Anular", false)}
          </span>
        )}
      </div>

      {abierta && (
        <form onSubmit={enviar} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
          {abierta === "confirmar" && (
            <fieldset className="flex flex-wrap items-center gap-2">
              <legend className="mb-1 text-xs font-medium text-muted-foreground">Zona del pedido (el cliente confirmó nombre, dirección, referencias y teléfono)</legend>
              {zonas.map((z) => (
                <label key={z.etiqueta} className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${zona === z.etiqueta ? "border-primario bg-primario-suave font-semibold" : "border-border"}`}>
                  <input type="radio" name={`zona-${ordenId}`} value={z.etiqueta} checked={zona === z.etiqueta} onChange={() => setZona(z.etiqueta)} className="accent-[var(--primario)]" />
                  {z.etiqueta}
                  <span className="font-normal text-muted-foreground">· {z.envio}</span>
                </label>
              ))}
            </fieldset>
          )}

          {abierta === "anular" && (
            <>
              {!zonaActual && (
                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                  Zona (al anular se deja la zona: sin ella no se sabe si el flete de vuelta se paga)
                  <select value={zona} onChange={(e) => setZona(e.target.value)} className={`${fieldClassSm} w-60`} required>
                    <option value="">Elige la zona…</option>
                    {zonas.map((z) => (
                      <option key={z.etiqueta} value={z.etiqueta}>
                        {z.etiqueta}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Motivo (uno solo: baja por las preguntas y detente en el primer sí)
                <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={`${fieldClassSm} max-w-full`} required>
                  <option value="">Elige el motivo…</option>
                  {grupos.map((g) => (
                    <optgroup key={g.pregunta} label={g.pregunta}>
                      {g.motivos.map((m) => (
                        <option key={m.etiqueta} value={m.etiqueta}>
                          {m.etiqueta} — {m.cuando}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <p className="m-0 text-xs text-muted-foreground">Se anula en Shopify sin avisar al cliente. Si ya había salido a ruta, Shopify lo cuenta como devolución.</p>
            </>
          )}

          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {abierta === "confirmar" ? "Nota para la cronología (opcional)" : abierta === "novedad" ? "Qué pidió el cliente (queda en la cronología)" : "Por qué se anula (queda en la cronología)"}
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              maxLength={500}
              required={abierta !== "confirmar"}
              placeholder={abierta === "novedad" ? "Ej.: consulta con su esposo, responde mañana" : abierta === "anular" ? "Ej.: no contestó 3 mensajes ni 2 llamadas" : "Ej.: entrega el jueves en la tarde"}
              className={`${fieldClassSm} h-auto py-1.5`}
            />
          </label>

          {error && (
            <p role="alert" className="m-0 text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={pendiente} className="inline-flex min-h-8 items-center rounded-md bg-primario px-3 text-xs font-semibold text-white disabled:opacity-50">
              {pendiente ? "Guardando en Shopify…" : abierta === "confirmar" ? "Confirmar en Shopify" : abierta === "novedad" ? "Poner en novedad" : "Anular en Shopify"}
            </button>
            <button type="button" onClick={() => setAbierta(null)} disabled={pendiente} className={`text-xs text-muted-foreground hover:text-foreground ${anilloFoco}`}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
