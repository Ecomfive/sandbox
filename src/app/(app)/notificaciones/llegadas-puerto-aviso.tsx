"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { BotonesListaPuerto } from "@/components/llegadas/botones-lista-puerto";
import { anilloFoco } from "@/components/ui/field";
import { RUTA_LISTA_PUERTO, textoProductos, totalesDeLlegada, type FilaLlegada } from "@/lib/compras/llegadas-avisos";
import { marcarAvisoLeido } from "@/lib/menciones-actions";

/** Las llegadas a puerto que se juntan en una sola tarjeta de «Para ti» (24 nov 2026, pedido de Logística: un aviso por producto era imposible de leer). */
export interface LlegadasEnAvisos {
  /** Los avisos «Llega a puerto» que esta tarjeta reemplaza. */
  avisoIds: string[];
  sinLeer: number;
  /** Cuándo cayó el más reciente. */
  creadoEn: string;
  /** Lo que sigue por recibir (sin archivar), sin montos. */
  filas: FilaLlegada[];
  /** Cuántas compras de esos avisos ya se archivaron. */
  archivadas: number;
}

const entero = (n: number) => n.toLocaleString("es-PA");
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });

/**
 * Una sola tarjeta con la lista completa y numerada de lo que llegó a puerto y sigue por recibir: producto, unidades y cajas, los totales, las dos descargas en PDF
 * («Descargar lista» y «Descargar lista con fotos») y el paso a «Llegadas a puerto» para archivar lo recibido.
 */
export function LlegadasPuertoAviso({ datos }: { datos: LlegadasEnAvisos }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const t = totalesDeLlegada(datos.filas);
  const sinLeer = datos.sinLeer > 0;

  const marcarLeidos = () =>
    start(async () => {
      await Promise.all(datos.avisoIds.map((id) => marcarAvisoLeido(id)));
      router.refresh();
    });

  return (
    <article aria-labelledby="titulo-llegadas-puerto" className={`flex flex-col gap-3 rounded-lg border border-border p-3 ${sinLeer ? "bg-primario-suave" : "bg-card"}`}>
      <div className="flex flex-col gap-0.5">
        <h3 id="titulo-llegadas-puerto" className="m-0 flex items-start gap-2 text-sm font-semibold">
          {sinLeer && <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primario" />}
          <span>
            Llegadas a puerto: {entero(t.compras)} {t.compras === 1 ? "compra" : "compras"} · {entero(t.unidades)} unidades · {entero(t.cajas)} cajas{t.sinCajas ? ` (${entero(t.sinCajas)} sin anotar)` : ""}
          </span>
          {sinLeer && <span className="sr-only">(sin leer)</span>}
        </h3>
        <p className="m-0 text-xs text-muted-foreground">
          Prepárense: la lista completa, de la llegada más reciente a la más antigua · último aviso {fechaHora(datos.creadoEn)}
          {datos.archivadas > 0 ? ` · ${entero(datos.archivadas)} ya archivadas` : ""}
        </p>
      </div>

      {datos.filas.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">Todo lo que llegó a puerto ya está recibido y archivado.</p>
      ) : (
        <ol aria-label="Lista de llegadas a puerto por recibir" tabIndex={0} className={`m-0 flex max-h-80 list-none flex-col overflow-y-auto rounded-md border border-border bg-card p-0 ${anilloFoco}`}>
          <li aria-hidden="true" className="sticky top-0 z-10 grid grid-cols-[2rem_1fr_4.5rem_3.5rem] gap-2 border-b border-border bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
            <span>#</span>
            <span>Producto</span>
            <span className="text-right">Unidades</span>
            <span className="text-right">Cajas</span>
          </li>
          {datos.filas.map((f, i) => (
            <li key={f.compraId} className="grid grid-cols-[2rem_1fr_4.5rem_3.5rem] items-baseline gap-2 border-b border-border px-2 py-1.5 text-sm last:border-b-0">
              <span className="text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 break-words">{textoProductos(f)}</span>
              <span className="text-right tabular-nums">
                <span className="sr-only">Unidades: </span>
                {f.unidades == null ? "—" : entero(f.unidades)}
              </span>
              <span className="text-right tabular-nums">
                <span className="sr-only">Cajas: </span>
                {f.cajas == null ? "—" : entero(f.cajas)}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <BotonesListaPuerto filas={datos.filas} />
        <Link
          href={RUTA_LISTA_PUERTO}
          onClick={() => void Promise.all(datos.avisoIds.map((id) => marcarAvisoLeido(id)))}
          className={`inline-flex min-h-9 items-center rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted ${anilloFoco}`}
        >
          Ver y archivar lo recibido
        </Link>
        {sinLeer && (
          <button type="button" disabled={pendiente} onClick={marcarLeidos} className={`min-h-9 rounded-md px-2 text-sm font-medium text-muted-foreground underline-offset-2 hover:underline ${anilloFoco}`}>
            Marcar como leídos
          </button>
        )}
      </div>
    </article>
  );
}
