"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import type { FilaLlegada } from "@/lib/compras/llegadas-avisos";
import { fotoParaPdf } from "@/lib/tabla/foto-pdf";

const BOTON = "inline-flex min-h-9 items-center justify-center rounded-md px-3 text-sm font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";
// Los botones de «Llegadas a puerto» llevan cada uno su color para no confundirse (24 nov 2026, pedido de Logística): descargar la lista = azul, con fotos = verde, archivar = violeta, sacar del archivo = ámbar.
export const BOTON_LISTA = `${BOTON} border border-azul/30 bg-azul-soft text-azul hover:brightness-95`;
export const BOTON_LISTA_FOTOS = `${BOTON} border border-success/30 bg-success-soft text-success hover:brightness-95`;
export const BOTON_ARCHIVAR = `${BOTON} border border-primario/30 bg-primario-suave text-primario hover:brightness-95`;
export const BOTON_DESARCHIVAR = `${BOTON} border border-warning/30 bg-warning-soft text-warning hover:brightness-95`;

/**
 * «Descargar lista» y «Descargar lista con fotos»: el PDF en la hoja de recepción de Logística (nombre del producto, unidades y cajas, con las casillas para anotar al recibir).
 * Las dos versiones se arman en el navegador con las filas que recibe (las pendientes de recibir). Lo usan la lista de Llegadas a puerto y el Centro de notificaciones.
 */
export function BotonesListaPuerto({ filas }: { filas: FilaLlegada[] }) {
  const [armando, setArmando] = useState<"lista" | "fotos" | null>(null);
  const { mostrarToast } = useToast();

  async function descargar(conFotos: boolean) {
    setArmando(conFotos ? "fotos" : "lista");
    try {
      const { listaLlegadasAPdf, nombreArchivoLista } = await import("@/lib/compras/llegadas-lista-pdf");
      const ahora = new Date();
      const bytes = await listaLlegadasAPdf(filas, { conFotos, cargar: conFotos ? (u) => fotoParaPdf(u, 200) : undefined });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombreArchivoLista(ahora, conFotos);
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      mostrarToast("PDF descargado");
    } catch {
      mostrarToast("No se pudo armar el PDF. Inténtalo de nuevo.", "destructive");
    } finally {
      setArmando(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => descargar(false)} disabled={armando !== null || filas.length === 0} className={BOTON_LISTA}>
        {armando === "lista" ? "Armando la lista…" : "Descargar lista"}
      </button>
      <button type="button" onClick={() => descargar(true)} disabled={armando !== null || filas.length === 0} className={BOTON_LISTA_FOTOS}>
        {armando === "fotos" ? "Armando la lista…" : "Descargar lista con fotos"}
      </button>
    </div>
  );
}
