"use client";

import { useId, useState, type ReactNode } from "react";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { CerrarIcon } from "@/lib/nav-icons";

/** Una tarjeta de la ficha (como las de Shopify): título opcional arriba y su contenido, sobre superficie blanca. */
export function Tarjeta({ titulo, accion, children, id }: { titulo?: string; accion?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-lg border border-border bg-card p-4">
      {(titulo || accion) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {titulo && <h2 className="text-sm font-semibold">{titulo}</h2>}
          {accion}
        </div>
      )}
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function CampoTexto({
  etiqueta,
  valor,
  alCambiar,
  placeholder,
  requerido,
  invalido,
  maxLength,
  lista,
  disabled,
  className = "",
  contador,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  placeholder?: string;
  requerido?: boolean;
  invalido?: boolean;
  maxLength?: number;
  /** Id de un `<datalist>` con sugerencias. */
  lista?: string;
  disabled?: boolean;
  className?: string;
  contador?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className={`${labelClassSm} flex items-center justify-between`}>
        <span>
          {etiqueta}
          {requerido && <span aria-hidden="true" className="text-destructive"> *</span>}
        </span>
        {contador && maxLength && (
          <span className="tabular-nums">
            {valor.length} de {maxLength} caracteres
          </span>
        )}
      </span>
      <input
        type="text"
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        placeholder={placeholder}
        required={requerido}
        aria-invalid={invalido || undefined}
        maxLength={maxLength}
        list={lista}
        disabled={disabled}
        className={`${fieldClass} w-full min-w-0`}
      />
    </label>
  );
}

/** Un número (o vacío = null); con `prefijo` se dibuja pegado a la izquierda, p. ej. «$». */
export function CampoNumero({
  etiqueta,
  valor,
  alCambiar,
  prefijo,
  sufijo,
  placeholder,
  paso = "0.01",
  entero,
  soloLectura,
  disabled,
  className = "",
  ariaLabel,
  min = 0,
}: {
  etiqueta?: string;
  valor: number | null;
  alCambiar: (v: number | null) => void;
  prefijo?: string;
  sufijo?: ReactNode;
  placeholder?: string;
  paso?: string;
  entero?: boolean;
  soloLectura?: boolean;
  disabled?: boolean;
  className?: string;
  /** Para un campo sin etiqueta visible (una celda de tabla). */
  ariaLabel?: string;
  min?: number;
}) {
  const idCampo = useId();
  const campo = (
    <span className="flex items-center gap-1">
      {prefijo && <span className="text-sm text-muted-foreground">{prefijo}</span>}
      <input
        id={idCampo}
        type="number"
        inputMode={entero ? "numeric" : "decimal"}
        step={entero ? "1" : paso}
        min={min}
        value={valor ?? ""}
        onChange={(e) => alCambiar(e.target.value === "" ? null : Number(e.target.value))}
        placeholder={placeholder}
        readOnly={soloLectura}
        disabled={disabled}
        aria-label={etiqueta ? undefined : ariaLabel}
        className={`${fieldClass} w-full min-w-0 tabular-nums ${soloLectura ? "bg-muted" : ""}`}
      />
      {sufijo}
    </span>
  );
  if (!etiqueta) return <div className={className}>{campo}</div>;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={idCampo} className={labelClassSm}>
        {etiqueta}
      </label>
      {campo}
    </div>
  );
}

/** Casilla con su texto (la etiqueta envuelve a la casilla, así que pulsar el texto la marca). */
export function Casilla({
  texto,
  marcada,
  alCambiar,
  disabled,
}: {
  texto: ReactNode;
  marcada: boolean;
  alCambiar: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={marcada}
        onChange={(e) => alCambiar(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 accent-[var(--foreground)]"
      />
      <span>{texto}</span>
    </label>
  );
}

/** Interruptor (Producto físico): un botón con `role="switch"`. */
export function Interruptor({ etiqueta, activo, alCambiar }: { etiqueta: string; activo: boolean; alCambiar: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={() => alCambiar(!activo)}
      className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${anilloFoco} ${activo ? "border-foreground bg-foreground" : "border-border-control bg-muted"}`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${activo ? "left-[1.1rem] bg-background" : "left-0.5 bg-muted-foreground"}`}
      />
    </button>
  );
}

/** Un campo de etiquetas/colecciones: se escribe y con Enter o coma se agrega un chip; cada chip se quita con su ×. */
export function CampoChips({
  etiqueta,
  valores,
  alCambiar,
  placeholder,
  sugerencias,
}: {
  etiqueta: string;
  valores: string[];
  alCambiar: (v: string[]) => void;
  placeholder?: string;
  sugerencias?: readonly string[];
}) {
  const [texto, setTexto] = useState("");
  const idLista = useId();

  function agregar(bruto: string) {
    const nuevos = bruto
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t && !valores.some((v) => v.toLowerCase() === t.toLowerCase()));
    if (nuevos.length > 0) alCambiar([...valores, ...nuevos]);
    setTexto("");
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>{etiqueta}</span>
        <input
          type="text"
          value={texto}
          list={sugerencias ? idLista : undefined}
          onChange={(e) => (e.target.value.endsWith(",") ? agregar(e.target.value) : setTexto(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              agregar(texto);
            } else if (e.key === "Backspace" && texto === "" && valores.length > 0) {
              alCambiar(valores.slice(0, -1));
            }
          }}
          onBlur={() => texto.trim() && agregar(texto)}
          placeholder={placeholder}
          className={`${fieldClass} w-full min-w-0`}
        />
      </label>
      {sugerencias && (
        <datalist id={idLista}>
          {sugerencias.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {valores.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${etiqueta} agregadas`}>
          {valores.map((v) => (
            <li key={v} className="flex items-center gap-1 rounded-full border border-border bg-muted py-0.5 pl-2.5 pr-1 text-xs">
              {v}
              <button
                type="button"
                onClick={() => alCambiar(valores.filter((x) => x !== v))}
                aria-label={`Quitar ${v}`}
                className={`flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground ${anilloFoco}`}
              >
                <CerrarIcon className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
