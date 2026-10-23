"use client";

/* eslint-disable @next/next/no-img-element -- fotos de Storage */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { conteoTareas, ETIQUETA_TAREA, type Tarea, type TipoTarea } from "@/lib/proveedor/tareas";
import { marcarVistoChin } from "./que-hacer-actions";

/** El color de cada tipo: la etiqueta de la tarjeta y su contador arriba. */
const COLOR: Record<TipoTarea, string> = {
  decidir: "bg-primario-suave text-primario",
  pagar_anticipo: "bg-destructive-soft text-destructive",
  pagar_saldo: "bg-destructive-soft text-destructive",
  confirmar_llegada: "bg-azul-soft text-azul",
  falta_costo: "bg-warning-soft text-warning",
  esperando: "bg-muted text-muted-foreground",
};

/** Cuántas se ven antes de «Ver todas». */
const A_LA_VISTA = 6;

const destino = (t: Tarea) => (t.destino === "pagos" || !t.compraId ? "/compras/tablero-chin?ver=pagos" : `/compras/lista?ver=todos&abrir=${t.compraId}`);

function TarjetaTarea({ t, alAbrir }: { t: Tarea; alAbrir: () => void }) {
  return (
    <Link
      href={destino(t)}
      onClick={alAbrir}
      className={`flex min-w-0 gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-muted/50 sm:border-r ${anilloFoco}`}
    >
      {t.foto ? (
        <img src={t.foto} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" />
      ) : (
        <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded-md border border-dashed border-border-control" />
      )}
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${COLOR[t.tipo]}`}>{ETIQUETA_TAREA[t.tipo]}</span>
          {t.nuevo && <span className="text-[11px] font-semibold text-azul">Nuevo</span>}
        </span>
        <span className="truncate text-sm font-semibold uppercase">{t.producto}</span>
        <span className="text-xs text-muted-foreground">{t.texto}</span>
      </span>
    </Link>
  );
}

/**
 * «Qué hacer con Shen Zhen» (23 oct 2026, arriba del Tablero de Shen Zhen; solo ahí, decisión de Hernán): lo que nos toca para cerrar el ciclo con el proveedor,
 * con lo que él hizo en su tablero marcado «Nuevo». Primero lo nuevo y lo urgente; cada tarjeta lleva a la compra (o a los pagos a
 * Shen Zhen) y se va sola cuando el ciclo avanza.
 */
export function QueHacerChin({ proveedor, tareas }: { proveedor: string; tareas: Tarea[] }) {
  const [todas, setTodas] = useState(false);
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const conteo = conteoTareas(tareas);
  const nuevos = [...new Set(tareas.filter((t) => t.nuevo && t.pedidoId).map((t) => t.pedidoId!))];
  const visibles = todas ? tareas : tareas.slice(0, A_LA_VISTA);

  function marcarTodo() {
    empezar(async () => {
      await marcarVistoChin(nuevos);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="que-hacer-chin" className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 id="que-hacer-chin" className="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Qué hacer con {proveedor} · {tareas.length}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {conteo.map((c) => (
            <span key={c.tipo} className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${COLOR[c.tipo]}`}>
              {ETIQUETA_TAREA[c.tipo]} {c.n}
            </span>
          ))}
          {nuevos.length > 0 && (
            <button type="button" onClick={marcarTodo} disabled={pendiente} className={`ml-1 rounded-md px-2 py-0.5 text-xs font-medium text-azul hover:underline disabled:opacity-50 ${anilloFoco}`}>
              {pendiente ? "Marcando..." : "Marcar todo como visto"}
            </button>
          )}
        </div>
      </header>
      {tareas.length === 0 ? (
        <p className="m-0 px-4 py-4 text-sm text-muted-foreground">Nada pendiente con {proveedor}: todas las compras siguen su curso.</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3">
            {visibles.map((t) => (
              <TarjetaTarea key={t.id} t={t} alAbrir={() => t.nuevo && t.pedidoId && void marcarVistoChin([t.pedidoId])} />
            ))}
          </div>
          {tareas.length > A_LA_VISTA && (
            <button type="button" onClick={() => setTodas((v) => !v)} aria-expanded={todas} className={`w-full px-4 py-2.5 text-left text-xs font-medium text-azul hover:bg-muted/50 ${anilloFoco}`}>
              {todas ? "Ver menos" : `Ver las ${tareas.length} tareas`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
