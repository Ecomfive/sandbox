"use client";

import { useState } from "react";
import { BotonBarra } from "@/components/panel/piezas-panel";
import { useToast } from "@/components/ui/toast";
import { VisorImagen } from "@/components/ui/visor-imagen";
import { totalesDeLlegada, type FilaLlegada } from "@/lib/compras/llegadas-avisos";
import { fotoParaPdf } from "@/lib/tabla/foto-pdf";
import type { EtiquetaPedido } from "@/lib/proveedor/etiquetas-datos";
import { Dato, FilaPuerto } from "./[id]/vista-llegada";

const entero = (n: number) => n.toLocaleString("es-PA");

/**
 * Todo lo que llegó a puerto en un periodo, en una sola lista (17 nov 2026, pedido de Logística: «una lista completa de lo que llegó», no un aviso por compra): producto, unidades, cajas y etiqueta
 * de cada compra, y los totales. Solo se mira.
 */
export function ListaLlegadas({ filas, etiquetas, periodo }: { filas: FilaLlegada[]; etiquetas: Record<string, EtiquetaPedido[]>; periodo: string }) {
  const t = totalesDeLlegada(filas);
  const [foto, setFoto] = useState<{ src: string; alt: string } | null>(null);
  const [armando, setArmando] = useState(false);
  const { mostrarToast } = useToast();

  async function descargarPdf() {
    setArmando(true);
    try {
      const { llegadasAPdf, nombreArchivoLlegadas } = await import("@/lib/compras/llegadas-pdf");
      const ahora = new Date();
      // Más grande que en las tablas: la etiqueta lleva un código de barras.
      const bytes = await llegadasAPdf(filas, etiquetas, periodo, ahora, (u) => fotoParaPdf(u, 320));
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombreArchivoLlegadas(ahora);
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      mostrarToast("PDF descargado");
    } catch {
      mostrarToast("No se pudo armar el PDF. Inténtalo de nuevo.", "destructive");
    } finally {
      setArmando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-base font-semibold tracking-tight">Llegó a puerto</h2>
          <BotonBarra onClick={descargarPdf} disabled={armando || filas.length === 0}>
            {armando ? "Armando el PDF…" : "Descargar PDF"}
          </BotonBarra>
        </div>
        <p className="m-0 text-sm text-muted-foreground">{periodo}</p>
        <dl className="m-0 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <Dato nombre="Compras" valor={entero(t.compras)} />
          <Dato nombre="Unidades" valor={entero(t.unidades)} />
          <Dato nombre="Cajas" valor={t.sinCajas ? `${entero(t.cajas)} (${entero(t.sinCajas)} sin anotar)` : entero(t.cajas)} />
        </dl>
      </header>

      {filas.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">No hay llegadas en este periodo.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card p-0">
          {filas.map((f) => (
            <FilaPuerto key={f.compraId} fila={f} etiquetas={etiquetas[f.compraId] ?? []} abrir={(e, alt) => setFoto({ src: e.url, alt })} />
          ))}
        </ul>
      )}
      <VisorImagen src={foto?.src ?? null} alt={foto?.alt} onClose={() => setFoto(null)} />
    </div>
  );
}
