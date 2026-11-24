"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BotonBarra } from "@/components/panel/piezas-panel";
import { BOTON_ARCHIVAR, BOTON_DESARCHIVAR, BotonesListaPuerto } from "@/components/llegadas/botones-lista-puerto";
import { useToast } from "@/components/ui/toast";
import { VisorImagen } from "@/components/ui/visor-imagen";
import { agruparEnLotes, nombreDeLote, totalesDeLlegada, type FilaLlegada } from "@/lib/compras/llegadas-avisos";
import { fotoParaPdf } from "@/lib/tabla/foto-pdf";
import type { EtiquetaPedido } from "@/lib/proveedor/etiquetas-datos";
import { Dato, FilaPuerto } from "./[id]/vista-llegada";
import { archivarLlegadasPuerto } from "./actions";

const entero = (n: number) => n.toLocaleString("es-PA");
const claseVista = (activa: boolean) =>
  `inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
    activa ? "border-transparent bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted"
  }`;

/**
 * Todo lo que llegó a puerto en un periodo, en una sola lista (17 nov 2026, pedido de Logística: «una lista completa de lo que llegó», no un aviso por compra): producto, unidades, cajas y etiqueta
 * de cada compra, y los totales. Desde el 24 nov 2026 va **separada por lotes** (cada tanda de compras que pasó a Llegada a Puerto, con sus propios totales, su lista en PDF y su archivo) y lo que ya se recibió se **archiva** (casillas + «Archivar lo recibido») y pasa a «Archivadas»; y se baja en PDF la hoja de recepción
 * («Descargar lista» / «Descargar lista con fotos») con lo que sigue por recibir.
 */
export function ListaLlegadas({
  filas,
  etiquetas,
  periodo,
  vista,
  conteos,
  hrefVista,
  puedeArchivar,
  sinArchivo,
}: {
  /** Las de la vista elegida: por recibir o archivadas. */
  filas: FilaLlegada[];
  etiquetas: Record<string, EtiquetaPedido[]>;
  periodo: string;
  vista: "pendientes" | "archivadas";
  conteos: { pendientes: number; archivadas: number };
  hrefVista: { pendientes: string; archivadas: string };
  puedeArchivar: boolean;
  /** Falta la migración 0360: no hay dónde guardar el archivo. */
  sinArchivo: boolean;
}) {
  const router = useRouter();
  const archivadas = vista === "archivadas";
  const t = totalesDeLlegada(filas);
  const [foto, setFoto] = useState<{ src: string; alt: string } | null>(null);
  const [armando, setArmando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [pendiente, start] = useTransition();
  const { mostrarToast } = useToast();
  const visibles = new Set(filas.map((f) => f.compraId));
  const lotes = agruparEnLotes(filas);
  // Solo cuentan las marcadas que siguen en la lista (al cambiar de periodo o de vista, las demás se olvidan).
  const elegidas = [...marcadas].filter((id) => visibles.has(id));

  const alternar = (id: string) =>
    setMarcadas((antes) => {
      const nuevo = new Set(antes);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });

  function archivar(ids: string[]) {
    start(async () => {
      const r = await archivarLlegadasPuerto(ids, !archivadas);
      if (r.error) {
        mostrarToast(r.error, "destructive");
        return;
      }
      const n = r.cambiadas ?? ids.length;
      mostrarToast(archivadas ? `${n === 1 ? "Una compra volvió" : `${n} compras volvieron`} a «Por recibir».` : `${n === 1 ? "Una compra archivada" : `${n} compras archivadas`}.`);
      setMarcadas(new Set());
      router.refresh();
    });
  }

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
          <h2 className="m-0 text-base font-semibold tracking-tight">{archivadas ? "Archivadas: ya recibidas" : "Llegó a puerto: por recibir"}</h2>
          <div className="flex flex-wrap gap-2">
            {!archivadas && <BotonesListaPuerto filas={filas} todos />}
            <BotonBarra onClick={descargarPdf} disabled={armando || filas.length === 0}>
              {armando ? "Armando el PDF…" : "PDF con etiquetas"}
            </BotonBarra>
          </div>
        </div>
        <p className="m-0 text-sm text-muted-foreground">{periodo}</p>
        <dl className="m-0 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <Dato nombre="Compras" valor={entero(t.compras)} />
          <Dato nombre="Unidades" valor={entero(t.unidades)} />
          <Dato nombre="Cajas" valor={t.sinCajas ? `${entero(t.cajas)} (${entero(t.sinCajas)} sin anotar)` : entero(t.cajas)} />
        </dl>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Por recibir o archivadas" className="flex flex-wrap gap-2">
          <Link href={hrefVista.pendientes} aria-current={archivadas ? undefined : "page"} className={claseVista(!archivadas)}>
            Por recibir <span className="tabular-nums">({entero(conteos.pendientes)})</span>
          </Link>
          <Link href={hrefVista.archivadas} aria-current={archivadas ? "page" : undefined} className={claseVista(archivadas)}>
            Archivadas <span className="tabular-nums">({entero(conteos.archivadas)})</span>
          </Link>
        </nav>
        {puedeArchivar && !sinArchivo && filas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setMarcadas(elegidas.length === filas.length ? new Set() : new Set(filas.map((f) => f.compraId)))} className="min-h-9 rounded-md px-2 text-sm font-medium text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {elegidas.length === filas.length ? "Quitar la selección" : "Marcar todas"}
            </button>
            <button type="button" disabled={pendiente || elegidas.length === 0} onClick={() => archivar(elegidas)} className={archivadas ? BOTON_DESARCHIVAR : BOTON_ARCHIVAR}>
              {pendiente ? "Guardando…" : archivadas ? `Sacar del archivo${elegidas.length ? ` (${elegidas.length})` : ""}` : `Archivar lo recibido${elegidas.length ? ` (${elegidas.length})` : ""}`}
            </button>
          </div>
        )}
      </div>
      {sinArchivo && puedeArchivar && <p className="m-0 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">Para archivar falta correr la migración 0360.</p>}

      {filas.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          {archivadas ? "No hay llegadas archivadas en este periodo." : conteos.archivadas > 0 ? "No queda nada por recibir en este periodo: todo está archivado." : "No hay llegadas en este periodo."}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {lotes.map((lote) => {
            const tl = totalesDeLlegada(lote.filas);
            const idsLote = lote.filas.map((f) => f.compraId);
            return (
              <section key={lote.clave} aria-labelledby={`lote-${lote.clave}`} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-muted px-4 py-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <h3 id={`lote-${lote.clave}`} className="m-0 text-sm font-semibold tracking-tight">
                      Llegada del {nombreDeLote(lote.desde, lote.hasta)}
                    </h3>
                    <p className="m-0 text-xs text-muted-foreground">
                      {entero(tl.compras)} {tl.compras === 1 ? "compra" : "compras"} · {entero(tl.unidades)} unidades · {entero(tl.cajas)} cajas{tl.sinCajas ? ` (${entero(tl.sinCajas)} sin anotar)` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!archivadas && <BotonesListaPuerto filas={lote.filas} desdeLote={lote.desde} />}
                    {puedeArchivar && !sinArchivo && (
                      <button type="button" disabled={pendiente} onClick={() => archivar(idsLote)} className={archivadas ? BOTON_DESARCHIVAR : BOTON_ARCHIVAR}>
                        {archivadas ? "Sacar este lote del archivo" : "Archivar este lote"}
                      </button>
                    )}
                  </div>
                </div>
                <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card p-0">
                  {lote.filas.map((f) => (
                    <FilaPuerto
                      key={f.compraId}
                      fila={f}
                      etiquetas={etiquetas[f.compraId] ?? []}
                      abrir={(e, alt) => setFoto({ src: e.url, alt })}
                      antes={
                        puedeArchivar && !sinArchivo ? (
                          <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                            <input type="checkbox" checked={marcadas.has(f.compraId)} onChange={() => alternar(f.compraId)} className="h-5 w-5 cursor-pointer accent-[var(--primario)]" />
                            <span className="sr-only">{archivadas ? "Elegir para sacar del archivo" : "Elegir para archivar"}: {f.orden}</span>
                          </label>
                        ) : undefined
                      }
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <VisorImagen src={foto?.src ?? null} alt={foto?.alt} onClose={() => setFoto(null)} />
    </div>
  );
}
