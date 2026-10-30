"use client";

import { useId, useRef, useState, useTransition } from "react";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import { LapizIcon } from "@/lib/nav-icons";
import { Tooltip } from "@/components/ui/tooltip";
import { CAMPOS_DATO, type CampoDato } from "@/lib/crm/dato-dropshipper";
import { cambiarDatoDropshipper } from "./dato-actions";

const TIPO: Record<CampoDato, string> = { ciudad: "text", ingreso: "date", correo: "email" };
const EJEMPLO: Record<CampoDato, string> = { ciudad: "Ej: Ciudad de Panamá", ingreso: "", correo: "Ej: nombre@correo.com" };

const mostrar = (campo: CampoDato, valor: string | null) => (valor ? (campo === "ingreso" ? formatearFecha(valor) : valor) : "—");

/**
 * Un dato del bloque «Datos» que se cambia ahí mismo, como una celda de Compras (29 oct 2026, pedido de Alcides): se ve como texto, al pasar el
 * cursor se marca y sale el lápiz, y un clic lo vuelve un campo. Enter o pulsar fuera guardan, Escape lo deja como estaba, y vaciarlo quita el
 * dato. No es un `<form>` porque el bloque puede ir dentro de otro formulario. Sin permiso de escritura solo se lee. El valor guardado se queda
 * en la ficha aunque la fila no se vuelva a pedir (la ficha del chat).
 */
export function DatoEditable({ dropshipperId, campo, inicial, puede }: { dropshipperId: string; campo: CampoDato; inicial: string | null; puede: boolean }) {
  const [valor, setValor] = useState(inicial);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();
  const boton = useRef<HTMLButtonElement>(null);
  // Ya se cerró (Escape, o ya se guardó): el blur que llega al quitar el campo no debe guardar otra vez.
  const descartar = useRef(false);
  const idError = useId();
  const nombre = CAMPOS_DATO[campo].etiqueta.toLowerCase();

  if (!puede) return <span className="break-words">{mostrar(campo, valor)}</span>;

  function abrir() {
    setBorrador(valor ?? "");
    setError(null);
    descartar.current = false;
    setEditando(true);
  }
  function cerrar(enfocar: boolean) {
    descartar.current = true;
    setEditando(false);
    setError(null);
    if (enfocar) requestAnimationFrame(() => boton.current?.focus());
  }
  function guardar(enfocar: boolean) {
    if (ocupado || descartar.current) return;
    if (borrador.trim() === (valor ?? "")) return cerrar(enfocar);
    setError(null);
    empezar(async () => {
      const r = await cambiarDatoDropshipper(dropshipperId, campo, borrador).catch(() => ({ error: "No se pudo guardar." }));
      if ("error" in r) return setError(r.error);
      setValor(r.valor);
      cerrar(enfocar);
    });
  }

  if (!editando)
    return (
      <Tooltip texto={`Editar ${nombre}`}>
        <button
          ref={boton}
          type="button"
          onClick={abrir}
          className={`group -mx-1.5 -my-0.5 inline-flex max-w-full items-start gap-1 rounded px-1.5 py-0.5 text-left hover:bg-muted ${anilloFoco}`}
        >
          <span className={`min-w-0 break-words ${valor ? "" : "text-muted-foreground"}`}>{mostrar(campo, valor)}</span>
          <LapizIcon width={12} height={12} aria-hidden="true" className="mt-[3px] flex-none text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
        </button>
      </Tooltip>
    );

  return (
    <span className="flex flex-col gap-1">
      <label className="flex min-w-0">
        <span className="sr-only">{CAMPOS_DATO[campo].etiqueta}</span>
        <input
          type={TIPO[campo]}
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          onBlur={() => guardar(false)}
          placeholder={EJEMPLO[campo] || undefined}
          autoFocus
          readOnly={ocupado}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? idError : undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              guardar(true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              cerrar(true);
            }
          }}
          className={`${fieldClassSm} -my-1 w-full min-w-0 text-[13px]`}
        />
      </label>
      {error && (
        <span id={idError} role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
