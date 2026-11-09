import type { ReactNode } from "react";
import { claseFranjaAF4 } from "./estilos-af4";

/**
 * El marco de un bloque del Portal AF4 (una gráfica, una tabla financiera, una lista): tarjeta blanca con la franja gris
 * de título, la misma del `KpiGroup`. `accion` va a la derecha de la franja (desplegar todo, una leyenda, una descarga).
 * Sin `overflow-hidden`: una tabla adentro necesita su encabezado fijo.
 */
export function MarcoAF4({
  id,
  titulo,
  detalle,
  accion,
  children,
  className = "",
  sinRelleno = false,
}: {
  /** Id del título (el bloque se etiqueta con él). */
  id: string;
  titulo: ReactNode;
  /** Junto al título, en gris: el período o la unidad («USD · sep 25 – ago 26»). */
  detalle?: ReactNode;
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Sin el relleno interior (una tabla que va de borde a borde). */
  sinRelleno?: boolean;
}) {
  return (
    <section aria-labelledby={id} className={`min-w-0 rounded-xl border border-border bg-card ${className}`.trim()}>
      <div className={`${claseFranjaAF4} rounded-t-xl`}>
        <h2 id={id} className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs font-semibold text-foreground">
          {titulo}
          {detalle && <span className="font-normal text-muted-foreground">{detalle}</span>}
        </h2>
        {accion && <div className="flex items-center gap-1.5">{accion}</div>}
      </div>
      <div className={sinRelleno ? "" : "p-3"}>{children}</div>
    </section>
  );
}
