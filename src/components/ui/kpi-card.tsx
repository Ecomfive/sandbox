import type { ReactNode } from "react";

type Tono = "neutral" | "destructive";

const tonos: Record<Tono, string> = {
  neutral: "border-border bg-card",
  destructive: "border-destructive/30 bg-destructive-soft",
};

/** Fila que se parte en varias para tarjetas de indicadores — nunca se cortan ni desbordan, a cualquier ancho.
 * `min-w-0` es necesario porque esto suele vivir dentro de un contenedor flex-col: sin eso, un hijo flex
 * no se encoge por debajo del ancho "natural" de su contenido y la página se corta.
 * Cada tarjeta mide entre 12rem y 20rem: en una página ancha, dos o tres tarjetas no se estiran a media
 * pantalla cada una. (No es un grid con `minmax(12rem, 20rem)`: ahí el navegador cuenta las columnas con
 * el máximo y, en un ancho intermedio, deja apiladas tarjetas que sí caben en fila.) */
export function KpiGrid({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-3 [&>*]:max-w-80 [&>*]:min-w-0 [&>*]:flex-[1_1_12rem]">{children}</div>
  );
}

/** Agrupa un KpiGrid bajo una barra de título — la tarjeta contenedora queda con su propio
 * borde/esquinas y una franja superior que nombra el grupo, en vez de un <h2> suelto al lado.
 * `accion` va a la derecha de la franja (una fecha de actualización, un botón pequeño), para no
 * gastar una fila aparte. */
export function KpiGroup({
  titulo,
  accion,
  className = "",
  children,
}: {
  titulo: ReactNode;
  accion?: ReactNode;
  /** Para repartir el ancho entre varios grupos en una fila (`flex-[3_1_39rem]`). */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`min-w-0 overflow-hidden rounded-xl border border-border bg-card ${className}`.trim()}>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 border-b border-border bg-muted px-4 py-1 text-xs font-medium text-muted-foreground">
        <span>{titulo}</span>
        {accion}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

export function KpiCard({
  titulo,
  valor,
  subtexto,
  tono = "neutral",
  children,
}: {
  titulo?: ReactNode;
  valor: ReactNode;
  subtexto?: ReactNode;
  tono?: Tono;
  children?: ReactNode;
}) {
  return (
    <div className={`min-w-0 rounded-xl border p-4 ${tonos[tono]}`}>
      {titulo && (
        <p className={`text-xs font-medium ${tono === "destructive" ? "text-destructive" : ""}`}>{titulo}</p>
      )}
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tono === "destructive" ? "text-destructive" : ""}`}>
        {valor}
      </p>
      {subtexto && <p className="mt-0.5 text-xs text-muted-foreground">{subtexto}</p>}
      {children}
    </div>
  );
}
