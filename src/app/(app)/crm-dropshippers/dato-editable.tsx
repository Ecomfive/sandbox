"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import { LapizIcon } from "@/lib/nav-icons";
import { CAMPOS_DATO, type CampoDato } from "@/lib/crm/dato-dropshipper";
import { cambiarDatoDropshipper } from "./dato-actions";

const botonMini = `flex h-6 w-6 flex-none items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 ${anilloFoco}`;
const TIPO: Record<CampoDato, string> = { ciudad: "text", ingreso: "date", correo: "email" };
const EJEMPLO: Record<CampoDato, string> = { ciudad: "Ej: Ciudad de Panamá", ingreso: "", correo: "Ej: nombre@correo.com" };

const mostrar = (campo: CampoDato, valor: string | null) => (valor ? (campo === "ingreso" ? formatearFecha(valor) : valor) : "—");

/**
 * Un dato del bloque «Datos» que se cambia ahí mismo: el lápiz lo vuelve un campo; Enter o la palomita guardan, Escape o la X lo
 * dejan como estaba, y vaciarlo quita el dato. No es un `<form>` porque el bloque puede ir dentro de otro formulario. Sin permiso de
 * escritura solo se lee. El valor guardado se queda en la ficha aunque la fila no se vuelva a pedir (la ficha del chat).
 */
export function DatoEditable({ dropshipperId, campo, inicial, puede }: { dropshipperId: string; campo: CampoDato; inicial: string | null; puede: boolean }) {
  const [valor, setValor] = useState(inicial);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();
  const lapiz = useRef<HTMLButtonElement>(null);
  const idError = useId();
  const nombre = CAMPOS_DATO[campo].etiqueta.toLowerCase();

  if (!puede) return <span className="break-words">{mostrar(campo, valor)}</span>;

  function abrir() {
    setBorrador(valor ?? "");
    setError(null);
    setEditando(true);
  }
  function cerrar() {
    setEditando(false);
    setError(null);
    requestAnimationFrame(() => lapiz.current?.focus());
  }
  function guardar() {
    if (ocupado) return;
    if (borrador.trim() === (valor ?? "")) return cerrar();
    setError(null);
    empezar(async () => {
      const r = await cambiarDatoDropshipper(dropshipperId, campo, borrador).catch(() => ({ error: "No se pudo guardar." }));
      if ("error" in r) return setError(r.error);
      setValor(r.valor);
      cerrar();
    });
  }

  if (!editando)
    return (
      <span className="inline-flex max-w-full items-start gap-1">
        <span className="min-w-0 break-words">{mostrar(campo, valor)}</span>
        <Tooltip texto={`Editar ${nombre}`}>
          <button ref={lapiz} type="button" onClick={abrir} aria-label={`Editar ${nombre}`} className={`${botonMini} -my-0.5`}>
            <LapizIcon width={13} height={13} aria-hidden="true" />
          </button>
        </Tooltip>
      </span>
    );

  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-1">
        <label className="flex min-w-0 flex-1">
          <span className="sr-only">{CAMPOS_DATO[campo].etiqueta}</span>
          <input
            type={TIPO[campo]}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            placeholder={EJEMPLO[campo] || undefined}
            autoFocus
            disabled={ocupado}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? idError : undefined}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                guardar();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                cerrar();
              }
            }}
            className={`${fieldClassSm} w-full min-w-0 text-[13px]`}
          />
        </label>
        <Tooltip texto="Guardar">
          <button type="button" onClick={guardar} disabled={ocupado} aria-label={`Guardar ${nombre}`} className={botonMini}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m5 12 5 5L20 7" />
            </svg>
          </button>
        </Tooltip>
        <Tooltip texto="Cancelar">
          <button type="button" onClick={cerrar} disabled={ocupado} aria-label={`Cancelar el cambio de ${nombre}`} className={botonMini}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </Tooltip>
      </span>
      {error && (
        <span id={idError} role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
