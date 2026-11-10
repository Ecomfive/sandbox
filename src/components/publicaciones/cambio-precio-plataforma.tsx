"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatearFechaHora } from "@/lib/formato";
import type { PlataformaPrecios } from "@/lib/publicaciones/marcador-aplicar-precios";
import { formatoEnDolares, formatoMonto, type MonedaPublicaciones } from "@/lib/publicaciones/moneda";
import { cambiarPrecioPlataforma, descartarCambioPrecio, type CambioPrecioEsperando } from "@/lib/publicaciones/precios-plataforma-actions";

const NOMBRE: Record<PlataformaPrecios, string> = { drop: "Drop", dunamixfy: "Dunamixfy" };
const simboloDe = (moneda: MonedaPublicaciones) => (moneda.moneda === "CRC" ? "₡" : moneda.moneda === "MXN" ? "MX$" : "$");
const texto = (n: number | null) => (n === null ? "" : String(n));

function Campo({ etiqueta, ayuda, valor, alCambiar, moneda }: { etiqueta: string; ayuda?: string; valor: string; alCambiar: (v: string) => void; moneda: MonedaPublicaciones }) {
  const n = valor.trim() === "" ? null : Number(valor);
  const usd = n === null || !Number.isFinite(n) ? null : formatoEnDolares(n, moneda);
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className={labelClassSm}>{etiqueta}</span>
      <span className={`flex items-center gap-1.5 ${fieldClass} w-full focus-within:border-foreground focus-within:ring-2 focus-within:ring-foreground`}>
        <span aria-hidden="true" className="shrink-0 text-sm text-muted-foreground">
          {simboloDe(moneda)}
        </span>
        <input type="number" min={0} step="0.01" inputMode="decimal" value={valor} onChange={(e) => alCambiar(e.target.value)} className="w-full min-w-0 bg-transparent tabular-nums outline-none" />
      </span>
      {(usd || ayuda) && <span className="text-xs text-muted-foreground">{[usd && `≈ ${usd}`, ayuda].filter(Boolean).join(" · ")}</span>}
    </label>
  );
}

/**
 * Cambiar el precio de una publicación de Drop o de Dunamixfy (10 nov 2026, pedido de Hernán: que las personas de Gestión de IDs lo hagan desde el sistema).
 * No se cambia al instante: queda esperando y se aplica con el favorito «Aplicar precios» desde la pestaña de la plataforma (no hay API para el servidor).
 * Solo para quien puede escribir en el módulo; los demás ven los precios sin poder cambiarlos (`puedeEscribir`).
 */
export function CambioPrecioPlataforma({
  plataforma,
  publicacionId,
  etiquetaPrecio,
  ayudaPrecio,
  precio,
  sugerido,
  moneda,
  esperando: inicial,
  puedeEscribir,
  bloqueo,
}: {
  plataforma: PlataformaPrecios;
  publicacionId: string;
  etiquetaPrecio: string;
  ayudaPrecio?: string;
  /** Lo último leído de la plataforma. */
  precio: number | null;
  sugerido: number | null;
  moneda: MonedaPublicaciones;
  esperando: CambioPrecioEsperando | null;
  puedeEscribir: boolean;
  /** Por qué no se puede cambiar aquí (sin conexión, con variantes…); null si se puede. */
  bloqueo: string | null;
}) {
  const { mostrarToast } = useToast();
  const [guardando, empezar] = useTransition();
  const [esperando, setEsperando] = useState(inicial);
  const base = { precio: esperando?.precio ?? precio, sugerido: esperando?.sugerido ?? sugerido };
  const [valores, setValores] = useState({ precio: texto(base.precio), sugerido: texto(base.sugerido) });
  const cambio = (["precio", "sugerido"] as const).some((k) => valores[k].trim() !== "" && Number(valores[k]) !== base[k]);
  const nombre = NOMBRE[plataforma];

  if (!puedeEscribir || bloqueo)
    return bloqueo && puedeEscribir ? <p className="m-0 text-xs text-muted-foreground">{bloqueo}</p> : null;

  const guardar = () =>
    empezar(async () => {
      const r = await cambiarPrecioPlataforma(plataforma, publicacionId, { precio: valores.precio, precioSugerido: valores.sugerido }).catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      if ("error" in r) return mostrarToast(r.error, "destructive");
      setEsperando(r.esperando);
      if (!r.esperando) setValores({ precio: texto(precio), sugerido: texto(sugerido) });
      mostrarToast(r.esperando ? `Queda esperando: pulsa «Aplicar precios» con ${nombre} abierto.` : "Cambio quitado: quedan los precios de antes.");
    });
  const quitar = () =>
    empezar(async () => {
      if (!esperando) return;
      const r = await descartarCambioPrecio(plataforma, esperando.id).catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      if (r.error) return mostrarToast(r.error, "destructive");
      setEsperando(null);
      setValores({ precio: texto(precio), sugerido: texto(sugerido) });
      mostrarToast("Cambio quitado: no se aplicará.");
    });

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border px-4 py-3">
      <p className="m-0 text-sm font-medium">Cambiar precio en {nombre}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta={etiquetaPrecio} ayuda={ayudaPrecio} valor={valores.precio} alCambiar={(v) => setValores((x) => ({ ...x, precio: v }))} moneda={moneda} />
        <Campo etiqueta="Precio sugerido" valor={valores.sugerido} alCambiar={(v) => setValores((x) => ({ ...x, sugerido: v }))} moneda={moneda} />
      </div>
      {esperando && (
        <p role="status" className={`m-0 flex items-start gap-2 text-xs ${esperando.estado === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          <span aria-hidden="true" className={`mt-1 h-2 w-2 shrink-0 rounded-full ${esperando.estado === "error" ? "bg-destructive" : "bg-warning"}`} />
          <span>
            {esperando.estado === "error" ? `No se pudo aplicar: ${esperando.error ?? "error desconocido"}. Se reintenta con el próximo «Aplicar precios».` : `Espera «Aplicar precios» en ${nombre}`}
            {": "}
            {[
              esperando.precio !== null && `precio ${formatoMonto(esperando.precio, moneda)} (antes ${formatoMonto(esperando.precioAntes, moneda)})`,
              esperando.sugerido !== null && `sugerido ${formatoMonto(esperando.sugerido, moneda)} (antes ${formatoMonto(esperando.sugeridoAntes, moneda)})`,
            ]
              .filter(Boolean)
              .join(" · ")}
            {esperando.creadoPor ? ` · lo pidió ${esperando.creadoPor}, ${formatearFechaHora(esperando.creadoEn)}` : ""}
          </span>
        </p>
      )}
      {(cambio || esperando) && (
        <div className="flex flex-wrap items-center gap-2">
          {cambio && (
            <Button type="button" disabled={guardando} onClick={guardar}>
              {guardando ? "Guardando…" : `Guardar para ${nombre}`}
            </Button>
          )}
          {esperando && (
            <Button type="button" variant="ghost" disabled={guardando} onClick={quitar}>
              Quitar el cambio
            </Button>
          )}
          {cambio && <span className="text-xs text-muted-foreground">Se aplica en {nombre} con el favorito «Aplicar precios».</span>}
        </div>
      )}
    </div>
  );
}
