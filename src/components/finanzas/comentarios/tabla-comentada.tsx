"use client";

import { useCallback, useState, type ComponentProps } from "react";
import { claseAccionAF4 } from "@/components/af4/estilos-af4";
import { TablaFinanciera } from "@/components/af4/tabla-financiera";
import { anilloFoco } from "@/components/ui/field";
import type { FilaAF4 } from "@/lib/af4/tabla-financiera";
import { claveCelda, type Ancla, type PaginaComentarios } from "@/lib/finanzas/comentarios";
import { HiloCifra } from "./hilo-cifra";
import { IconoComentario } from "./icono-comentario";

/**
 * Una `TablaFinanciera` con comentarios en sus cifras (mejora 92). Las celdas con hilo llevan un ícono discreto que lo
 * abre; «Comentar» vuelve botón cada cifra para empezar un hilo nuevo (así la tabla no carga cientos de botones siempre).
 */
export function TablaFinancieraComentada({
  pagina,
  periodo,
  ambito,
  periodoTotal,
  hilos: hilosIniciales,
  ...tabla
}: Omit<ComponentProps<typeof TablaFinanciera>, "celdaPropia"> & {
  pagina: PaginaComentarios;
  /** El período del ancla ('' = el hilo de una celda de mes vale para cualquier período elegido). */
  periodo: string;
  /** Lo que distingue la vista (la tienda o la entidad): va al principio de la clave. */
  ambito: string;
  /** El período que suma la columna Total (su hilo es de ese período). */
  periodoTotal: string;
  hilos: Record<string, number>;
}) {
  const [hilos, setHilos] = useState(hilosIniciales);
  const [comentando, setComentando] = useState(false);
  const [abierto, setAbierto] = useState<{ ancla: Ancla; etiqueta: string } | null>(null);
  const alCambiar = useCallback((clave: string, n: number) => setHilos((h) => (h[clave] === n ? h : { ...h, [clave]: n })), []);

  const celda = (fila: FilaAF4, columna: number | null, texto: string) => {
    const col = columna === null ? { clave: `total-${periodoTotal}`, etiqueta: tabla.etiquetaTotal ?? "Total" } : tabla.columnas[columna];
    const clave = `${ambito}:${claveCelda(fila.clave, col.clave)}`;
    const n = hilos[clave] ?? 0;
    if (!n && !comentando) return undefined;
    const etiqueta = `${fila.etiqueta} · ${col.etiqueta}`;
    return (
      <button
        type="button"
        onClick={() => setAbierto({ ancla: { pagina, periodo, clave }, etiqueta })}
        aria-label={n ? `${etiqueta}: ${texto || "vacío"}, ${n} ${n === 1 ? "comentario" : "comentarios"}` : `Comentar ${etiqueta}`}
        className={`inline-flex items-center justify-end gap-1 rounded-sm tabular-nums ${comentando ? "underline decoration-dotted underline-offset-4 hover:bg-muted" : ""} ${anilloFoco}`}
      >
        {texto}
        {n > 0 && <IconoComentario className="h-3 w-3 shrink-0 text-warning" />}
      </button>
    );
  };

  return (
    <>
      <TablaFinanciera
        {...tabla}
        celdaPropia={celda}
        accion={
          <>
            <button type="button" aria-pressed={comentando} onClick={() => setComentando((x) => !x)} className={`${claseAccionAF4} h-7 ${anilloFoco} ${comentando ? "!border-foreground !bg-foreground !text-background" : ""}`}>
              <IconoComentario className="h-3.5 w-3.5" />
              Comentar
            </button>
            {tabla.accion}
          </>
        }
      />
      <HiloCifra ancla={abierto?.ancla ?? null} etiqueta={abierto?.etiqueta ?? ""} abierto={abierto !== null} alCerrar={() => setAbierto(null)} alCambiar={alCambiar} />
    </>
  );
}
