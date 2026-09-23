"use client";

import { useEffect, useId, useRef, useState } from "react";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { sanitizarHtml } from "@/lib/wms/producto";

type Formato = { id: string; etiqueta: string; comando: string; valor?: string; simbolo: string; clase?: string };

const FORMATOS: Formato[] = [
  { id: "negrita", etiqueta: "Negrita", comando: "bold", simbolo: "B", clase: "font-bold" },
  { id: "cursiva", etiqueta: "Cursiva", comando: "italic", simbolo: "I", clase: "italic" },
  { id: "subrayado", etiqueta: "Subrayado", comando: "underline", simbolo: "U", clase: "underline" },
  { id: "izquierda", etiqueta: "Alinear a la izquierda", comando: "justifyLeft", simbolo: "⇤" },
  { id: "centro", etiqueta: "Centrar", comando: "justifyCenter", simbolo: "↔" },
  { id: "derecha", etiqueta: "Alinear a la derecha", comando: "justifyRight", simbolo: "⇥" },
  { id: "lista", etiqueta: "Lista con viñetas", comando: "insertUnorderedList", simbolo: "•≡" },
  { id: "numerada", etiqueta: "Lista numerada", comando: "insertOrderedList", simbolo: "1." },
  { id: "cita", etiqueta: "Cita", comando: "formatBlock", valor: "blockquote", simbolo: "❝" },
];

const BLOQUES = [
  { valor: "p", etiqueta: "Párrafo" },
  { valor: "h2", etiqueta: "Encabezado 2" },
  { valor: "h3", etiqueta: "Encabezado 3" },
  { valor: "h4", etiqueta: "Encabezado 4" },
];

/**
 * Editor de texto enriquecido de la descripción (la barra de Shopify): tipo de bloque, negrita, cursiva, subrayado,
 * alineación, listas, cita, enlace, quitar formato y una vista de código HTML. Guarda HTML; el servidor lo limpia
 * otra vez (`sanitizarHtml`) antes de guardarlo. La zona editable es un `contentEditable` que solo se reescribe
 * desde afuera cuando el valor cambia por otra vía (p. ej. al descartar los cambios).
 */
export function EditorDescripcion({
  valor,
  alCambiar,
  etiqueta = "Descripción",
  invalido,
}: {
  valor: string;
  alCambiar: (html: string) => void;
  /** El nombre del campo (la ficha de Dropi tiene dos descripciones). */
  etiqueta?: string;
  invalido?: boolean;
}) {
  const idEtiqueta = useId();
  const zona = useRef<HTMLDivElement>(null);
  const [verCodigo, setVerCodigo] = useState(false);
  const ultimo = useRef(valor);

  useEffect(() => {
    if (verCodigo || !zona.current) return;
    if (valor !== ultimo.current || zona.current.innerHTML !== valor) {
      zona.current.innerHTML = sanitizarHtml(valor);
      ultimo.current = valor;
    }
  }, [valor, verCodigo]);

  function emitir() {
    const html = zona.current?.innerHTML ?? "";
    ultimo.current = html;
    alCambiar(html);
  }

  function ejecutar(comando: string, arg?: string) {
    zona.current?.focus();
    document.execCommand(comando, false, arg);
    emitir();
  }

  function enlace() {
    const url = window.prompt("Dirección del enlace (https://…)");
    if (!url) return;
    if (!/^(https?:\/\/|mailto:|\/)/i.test(url.trim())) {
      window.alert("El enlace debe empezar por https://, http://, mailto: o /.");
      return;
    }
    ejecutar("createLink", url.trim());
  }

  const botonBarra = `flex h-8 min-w-8 items-center justify-center rounded px-1.5 text-sm hover:bg-muted ${anilloFoco}`;

  return (
    <div className="flex flex-col gap-1">
      <span className={labelClass} id={idEtiqueta}>
        {etiqueta}
      </span>
      <div
        aria-invalid={invalido || undefined}
        className="overflow-hidden rounded-md border border-border-control bg-card focus-within:ring-2 focus-within:ring-foreground aria-invalid:border-destructive"
      >
        <div role="toolbar" aria-label="Formato de la descripción" className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted px-1.5 py-1">
          <select
            aria-label="Tipo de bloque"
            defaultValue="p"
            disabled={verCodigo}
            onChange={(e) => ejecutar("formatBlock", e.target.value)}
            className="h-8 rounded border border-border-control bg-card px-1.5 text-sm"
          >
            {BLOQUES.map((b) => (
              <option key={b.valor} value={b.valor}>
                {b.etiqueta}
              </option>
            ))}
          </select>
          {FORMATOS.map((f) => (
            <Tooltip key={f.id} texto={f.etiqueta}>
              <button
                type="button"
                disabled={verCodigo}
                aria-label={f.etiqueta}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => ejecutar(f.comando, f.valor)}
                className={`${botonBarra} ${f.clase ?? ""} disabled:opacity-40`}
              >
                {f.simbolo}
              </button>
            </Tooltip>
          ))}
          <Tooltip texto="Insertar enlace">
            <button type="button" disabled={verCodigo} aria-label="Insertar enlace" onMouseDown={(e) => e.preventDefault()} onClick={enlace} className={`${botonBarra} disabled:opacity-40`}>
              ⛓
            </button>
          </Tooltip>
          <Tooltip texto="Quitar formato">
            <button type="button" disabled={verCodigo} aria-label="Quitar formato" onMouseDown={(e) => e.preventDefault()} onClick={() => ejecutar("removeFormat")} className={`${botonBarra} disabled:opacity-40`}>
              Tx
            </button>
          </Tooltip>
          <span className="flex-1" />
          <Tooltip texto="Ver código HTML">
            <button
              type="button"
              aria-pressed={verCodigo}
              aria-label="Ver código HTML"
              onClick={() => setVerCodigo((v) => !v)}
              className={`${botonBarra} font-mono ${verCodigo ? "bg-accent" : ""}`}
            >
              {"</>"}
            </button>
          </Tooltip>
        </div>
        {verCodigo ? (
          <textarea
            aria-labelledby={idEtiqueta}
            value={valor}
            onChange={(e) => {
              ultimo.current = e.target.value;
              alCambiar(e.target.value);
            }}
            rows={10}
            spellCheck={false}
            className={`${fieldClass} block w-full resize-y rounded-none border-0 font-mono text-xs focus:ring-0`}
          />
        ) : (
          <div
            ref={zona}
            role="textbox"
            aria-multiline="true"
            aria-labelledby={idEtiqueta}
            contentEditable
            suppressContentEditableWarning
            onInput={emitir}
            onBlur={emitir}
            className="min-h-40 max-h-[28rem] overflow-y-auto px-3 py-2 text-sm leading-relaxed focus:outline-none [&_a]:font-medium [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border-control [&_blockquote]:pl-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_h4]:font-semibold [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
          />
        )}
      </div>
    </div>
  );
}
