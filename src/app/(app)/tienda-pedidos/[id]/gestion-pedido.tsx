"use client";

import { useState, useTransition } from "react";
import { Pastilla } from "@/components/panel/piezas-panel";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { ETIQUETA_ACREDITADO, MOTIVOS_ANULACION, TRANSPORTADORAS, ZONAS_ATC, conNovedad, enlaceRastreo, motivoAtc, porConfirmar, zonaAtc, type AccionAtc, type PasoAtc } from "@/lib/tienda/gestion-atc";
import { gestionarPedidoAtc, pasoPedidoAtc, type ResultadoGestion } from "../gestion-actions";

type Abierto = AccionAtc | PasoAtc;

/**
 * Gestión del pedido con el manual ATC (24 nov 2026): el estado en palabras y los botones de cada rol, en el orden del recorrido.
 *  - Asesora: Confirmar (elige la zona), Novedad (el cliente pidió esperar), Anular (un solo motivo del árbol), Cargar guía (interior: Servientrega, con el
 *    enlace de rastreo armado con el número y el correo al cliente) y Entregado (también la coordinadora).
 *  - Finanzas: Acreditado y pagado, con el dinero en el banco.
 * Cada botón escribe en Shopify y deja su línea en la cronología (Notas del equipo). El sistema no deja anular sin motivo, borrar la zona al anular, poner
 * dos motivos ni inventar etiquetas.
 */
export function GestionPedido({
  ordenId,
  etiquetas,
  codigoPais,
  estadoEntrega,
  estadoPago,
  guia,
  finanzas,
  soloFinanzas,
  alHecho,
}: {
  ordenId: string;
  etiquetas: string[];
  codigoPais: string;
  estadoEntrega: string | null;
  estadoPago: string | null;
  guia: string | null;
  /** Puede acreditar y pasar a «Pagado». */
  finanzas: boolean;
  /** Solo lo de Finanzas (no edita Pedidos de tienda). */
  soloFinanzas: boolean;
  alHecho: (r: Extract<ResultadoGestion, { ok: true }>) => void;
}) {
  const [abierta, setAbierta] = useState<Abierto | null>(null);
  const [zona, setZona] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("");
  const [nota, setNota] = useState("");
  const [numeroGuia, setNumeroGuia] = useState("");
  const numeroLimpio = numeroGuia.replace(/\s+/g, "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const zonas = ZONAS_ATC[codigoPais] ?? ZONAS_ATC.PA;
  const zonaActual = zonaAtc(etiquetas);
  const motivoActual = motivoAtc(etiquetas);
  const entregado = estadoEntrega === "entregada";
  const anulado = !!motivoActual || estadoEntrega === "cancelada";
  const pagado = /^paid$/i.test(estadoPago ?? "") || etiquetas.some((e) => e.toLowerCase() === ETIQUETA_ACREDITADO);
  const confirmado = !!zonaActual && !porConfirmar(etiquetas) && !conNovedad(etiquetas);
  const interior = !!zonaActual && /^interior/i.test(zonaActual);
  const estado = anulado
    ? { texto: `Anulado${motivoActual ? ` · ${motivoActual}` : " · falta el motivo"}`, tono: "peligro" as const }
    : pagado
      ? { texto: "Cerrado: pagado y acreditado", tono: "exito" as const }
      : entregado
        ? { texto: "Entregado · falta acreditar", tono: "exito" as const }
        : conNovedad(etiquetas)
          ? { texto: "Novedad: el cliente pidió esperar", tono: "aviso" as const }
          : !confirmado
            ? { texto: "Por confirmar datos", tono: "aviso" as const }
            : { texto: `Confirmado · ${zonaActual}${guia ? ` · guía ${guia}` : ""}`, tono: "neutro" as const };

  function abrir(a: Abierto) {
    setError(null);
    setNota("");
    setMotivo("");
    setNumeroGuia(guia ?? "");
    setZona(zonaActual ?? "");
    setAbierta((x) => (x === a ? null : a));
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!abierta) return;
    setError(null);
    iniciar(async () => {
      const r =
        abierta === "confirmar" || abierta === "novedad" || abierta === "anular"
          ? await gestionarPedidoAtc(ordenId, abierta, { zona, motivo, nota })
          : await pasoPedidoAtc(ordenId, abierta, { guia: numeroGuia, nota });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setAbierta(null);
      alHecho(r);
    });
  }

  const boton = (a: Abierto, texto: string) => (
    <button
      key={a}
      type="button"
      onClick={() => abrir(a)}
      disabled={pendiente}
      aria-expanded={abierta === a}
      className={`inline-flex min-h-7 items-center rounded-md border px-2.5 text-xs font-semibold disabled:opacity-40 ${
        abierta === a ? "border-primario bg-primario text-white" : "border-primario/40 bg-card text-primario hover:bg-primario-suave"
      } ${anilloFoco}`}
    >
      {texto}
    </button>
  );

  // Los botones que tocan, en el orden del recorrido del manual.
  const botones: React.ReactNode[] = [];
  if (!soloFinanzas && !anulado && !entregado && !pagado) {
    botones.push(boton("confirmar", confirmado ? "Cambiar zona" : "Confirmar"));
    if (!conNovedad(etiquetas)) botones.push(boton("novedad", "Novedad"));
  }
  if (!soloFinanzas && !entregado && !pagado) botones.push(boton("anular", motivoActual ? "Cambiar motivo" : "Anular"));
  if (!soloFinanzas && confirmado && interior && !anulado && !pagado) botones.push(boton("guia", guia ? "Cambiar guía" : "Cargar guía"));
  if (!soloFinanzas && confirmado && !anulado && !pagado) botones.push(boton("entregado", "Entregado"));
  if (finanzas && confirmado && !anulado && !pagado) botones.push(boton("acreditar", "Acreditado y pagado"));

  // El árbol del manual: se baja por las preguntas y se detiene en el primer sí.
  const grupos = MOTIVOS_ANULACION.reduce<{ pregunta: string; motivos: typeof MOTIVOS_ANULACION }[]>((acc, m) => {
    const g = acc.find((x) => x.pregunta === m.pregunta);
    if (g) g.motivos.push(m);
    else acc.push({ pregunta: m.pregunta, motivos: [m] });
    return acc;
  }, []);

  const textoNota: Record<Abierto, string> = {
    confirmar: "Nota para la cronología (opcional)",
    novedad: "Qué pidió el cliente (queda en la cronología)",
    anular: "Por qué se anula (queda en la cronología)",
    guia: "Nota para la cronología (opcional)",
    entregado: "Evidencia de la entrega (opcional): qué reportó Servientrega o el repartidor",
    acreditar: "Referencia del depósito (opcional)",
  };
  const textoBoton: Record<Abierto, string> = {
    confirmar: "Confirmar en Shopify",
    novedad: "Poner en novedad",
    anular: "Anular en Shopify",
    guia: "Cargar guía en Shopify",
    entregado: "Marcar entregado en Shopify",
    acreditar: "Acreditar y pasar a «Pagado»",
  };

  return (
    <section aria-label="Gestión del pedido" className="flex flex-col gap-2 border-b border-border bg-primario-suave/40 px-5 py-3" aria-busy={pendiente}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Gestión</span>
        <Pastilla tono={estado.tono}>{estado.texto}</Pastilla>
        {botones.length > 0 && <span className="ml-auto flex flex-wrap gap-1.5">{botones}</span>}
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

          {abierta === "guia" && (
            <>
              <div className="flex flex-wrap gap-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                  Número de guía ({TRANSPORTADORAS[0].nombre})
                  <input value={numeroGuia} onChange={(e) => setNumeroGuia(e.target.value)} required maxLength={40} inputMode="text" className={`${fieldClassSm} w-48`} placeholder="Ej.: 7224147076" />
                </label>
              </div>
              <p className="m-0 text-xs text-muted-foreground">
                El enlace de rastreo se arma solo con el número
                {numeroLimpio.length >= 5 && (
                  <>
                    {": "}
                    <a href={enlaceRastreo(numeroLimpio)} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">
                      {enlaceRastreo(numeroLimpio)}
                    </a>{" "}
                    (ábrelo para revisar que la guía sea la correcta)
                  </>
                )}
                . Shopify le manda al cliente el correo con el seguimiento; envíale también la guía por WhatsApp.
              </p>
            </>
          )}

          {abierta === "entregado" && <p className="m-0 text-xs text-muted-foreground">Cuando Servientrega lo reporta entregado en su portal (o el reparto local confirma la entrega en CIUDAD). Después, avisa a Finanzas para que lo acredite.</p>}
          {abierta === "acreditar" && <p className="m-0 text-xs text-muted-foreground">Solo con el dinero ya en el banco: pone «acreditado» y pasa el pago de «Pendiente» a «Pagado» en Shopify. El pedido queda cerrado.</p>}

          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {textoNota[abierta]}
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              maxLength={500}
              required={abierta === "novedad" || abierta === "anular"}
              placeholder={abierta === "novedad" ? "Ej.: consulta con su esposo, responde mañana" : abierta === "anular" ? "Ej.: no contestó 3 mensajes ni 2 llamadas" : ""}
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
              {pendiente ? "Guardando en Shopify…" : textoBoton[abierta]}
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
