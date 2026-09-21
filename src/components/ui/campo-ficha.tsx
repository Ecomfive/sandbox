import type { ReactNode } from "react";
import { AvisoFaltante } from "@/components/ui/boton-crear";
import { labelClassSm } from "@/components/ui/field";

/**
 * Un campo de una ficha: su etiqueta (ligada al campo con `htmlFor`), el campo y, si es obligatorio, el asterisco rojo y
 * el aviso «Falta este dato» que sale debajo cuando se pulsó «Crear» sin llenarlo (ver `useFaltantes`). El campo lleva el
 * mismo `id` que se pasa aquí, `required` y `aria-invalid={faltante === id || undefined}`.
 */
export function Campo({
  etiqueta,
  id,
  obligatorio,
  faltante,
  mensaje,
  className = "",
  children,
}: {
  etiqueta: string;
  id: string;
  obligatorio?: boolean;
  /** El `id` del dato obligatorio que se está señalando: si es este, se avisa debajo. */
  faltante?: string | null;
  /** Otro aviso en vez de «Falta este dato» (p. ej. «Debe ser mayor a cero»). */
  mensaje?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`.trim()}>
      <label className={labelClassSm} htmlFor={id}>
        {etiqueta}
        {obligatorio && (
          <span aria-hidden="true" className="text-destructive">
            {" "}
            *
          </span>
        )}
      </label>
      {children}
      {obligatorio && <AvisoFaltante id={id} faltante={faltante ?? null} mensaje={mensaje} />}
    </div>
  );
}
