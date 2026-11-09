"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { claseAccionAF4 } from "@/components/af4/estilos-af4";
import { CampoMenciones } from "@/components/ui/campo-menciones";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { fechaHora } from "@/lib/af4/fecha";
import type { Ancla } from "@/lib/finanzas/comentarios";
import { comentarCifra, eliminarComentarioCifra, obtenerHiloCifra, type ComentarioCifra } from "@/lib/finanzas/comentarios-actions";
import { PapeleraIcon } from "@/lib/nav-icons";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * El hilo de comentarios de una cifra, en un panel a la derecha: los comentarios en orden, el campo con «@» para
 * mencionar y «Comentar». `alCambiar` avisa cuántos quedan (para el ícono de la celda).
 */
export function HiloCifra({
  ancla,
  etiqueta,
  abierto,
  alCerrar,
  alCambiar,
}: {
  ancla: Ancla | null;
  etiqueta: string;
  abierto: boolean;
  alCerrar: () => void;
  alCambiar?: (clave: string, cantidad: number) => void;
}) {
  const { mostrarToast } = useToast();
  const [comentarios, setComentarios] = useState<ComentarioCifra[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [menciones, setMenciones] = useState<string[]>([]);
  const [pendiente, startTransition] = useTransition();

  // El ancla y el aviso pueden llegar como objetos nuevos en cada render: se usan por referencia estable.
  const anclaRef = useRef(ancla);
  const avisoRef = useRef(alCambiar);
  useEffect(() => {
    anclaRef.current = ancla;
    avisoRef.current = alCambiar;
  });
  const llave = ancla ? `${ancla.pagina}|${ancla.periodo}|${ancla.clave}` : "";

  const cargar = useCallback(async () => {
    const a = anclaRef.current;
    if (!a) return;
    const r = await obtenerHiloCifra(a);
    if ("error" in r) {
      setError(r.error);
      setComentarios([]);
    } else {
      setError(null);
      setComentarios(r.comentarios);
      avisoRef.current?.(a.clave, r.comentarios.length);
    }
  }, []);

  useEffect(() => {
    if (!abierto || !llave) return;
    setComentarios(null);
    setTexto("");
    setMenciones([]);
    void cargar();
  }, [abierto, llave, cargar]);

  const enviar = () =>
    startTransition(async () => {
      if (!ancla) return;
      const r = await comentarCifra(ancla, texto, menciones, etiqueta);
      if (r.error) {
        mostrarToast(r.error, "destructive");
        return;
      }
      setTexto("");
      setMenciones([]);
      await cargar();
    });

  const eliminar = (id: string) =>
    startTransition(async () => {
      const r = await eliminarComentarioCifra(id);
      if (r.error) mostrarToast(r.error, "destructive");
      await cargar();
    });

  return (
    <Ventana abierto={abierto} alCerrar={alCerrar} lado="derecha" ancho="sm" titulo={etiqueta || "Comentarios"}>
      <div className="flex flex-col gap-4 p-5">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {comentarios === null ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : comentarios.length === 0 ? (
          !error && <p className="text-sm text-muted-foreground">Sin comentarios en esta cifra.</p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Comentarios">
            {comentarios.map((c) => (
              <li key={c.id} className="rounded-lg border border-border bg-card px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="m-0 text-xs">
                    <span className="font-semibold">{c.autor}</span> <span className="text-muted-foreground">· {fechaHora(c.creadoEn)}</span>
                  </p>
                  {c.propio && (
                    <Tooltip texto="Eliminar comentario">
                      <button
                        type="button"
                        aria-label="Eliminar comentario"
                        disabled={pendiente}
                        onClick={() => eliminar(c.id)}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
                      >
                        <PapeleraIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </Tooltip>
                  )}
                </div>
                <p className="m-0 mt-1 whitespace-pre-wrap text-sm text-pretty">{c.texto}</p>
              </li>
            ))}
          </ol>
        )}
        <div className="flex flex-col gap-2">
          <CampoMenciones ariaLabel="Nuevo comentario" filas={3} valor={texto} alCambiar={setTexto} alMencionar={setMenciones} maxLength={2000} placeholder="Escribe un comentario… usa @ para mencionar." />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={enviar}
              disabled={pendiente || !texto.trim()}
              className={`${claseAccionAF4} !border-foreground !bg-foreground !text-background disabled:opacity-50 ${anilloFoco}`}
            >
              {pendiente ? "Guardando…" : "Comentar"}
            </button>
          </div>
        </div>
      </div>
    </Ventana>
  );
}
