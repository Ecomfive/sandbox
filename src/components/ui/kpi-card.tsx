import Link from "next/link";
import type { ReactNode } from "react";

export type Tono = "neutral" | "info" | "success" | "warning" | "destructive";

/** Color del puntito junto al título — la tarjeta en sí siempre queda neutral (fondo y borde
 * iguales para todas); lo que cambia según la sección es solo ese punto, no toda la tarjeta. */
const puntos: Record<Tono, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-accent-foreground",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

/** Lo que agrega una tarjeta que se puede pulsar: mano, resalte al pasar y anillo de foco. */
const INTERACTIVA =
  "block w-full cursor-pointer text-left transition-colors hover:border-border-control hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none";
/** La tarjeta que está filtrando ahora: borde y anillo del color del texto, para que se vea cuál es. */
const SELECCIONADA = "!border-foreground ring-1 ring-foreground";

/** Clases de una tarjeta; las comparte `KpiFiltro`, que es un botón y no un enlace. La tarjeta
 * siempre es neutral (borde y fondo iguales) — el tono solo colorea el puntito del título. */
export function claseKpi(tono: Tono, interactiva: boolean, seleccionada = false, compacta = false): string {
  return `min-w-0 rounded-xl border border-border bg-card ${compacta ? "px-3 py-2.5" : "p-4"} ${
    interactiva ? INTERACTIVA : ""
  } ${seleccionada ? SELECCIONADA : ""}`.trim();
}

/** Fila que se parte en varias para tarjetas de indicadores — nunca se cortan ni desbordan, a cualquier ancho.
 * `min-w-0` es necesario porque esto suele vivir dentro de un contenedor flex-col: sin eso, un hijo flex
 * no se encoge por debajo del ancho "natural" de su contenido y la página se corta.
 * Cada tarjeta mide entre 12rem y 20rem: en una página ancha, dos o tres tarjetas no se estiran a media
 * pantalla cada una. (No es un grid con `minmax(12rem, 20rem)`: ahí el navegador cuenta las columnas con
 * el máximo y, en un ancho intermedio, deja apiladas tarjetas que sí caben en fila.)
 * `compacta` (con las tarjetas también `compacta`): tarjetas desde 9rem, para que un grupo de tres o cuatro
 * quepa en una sola línea junto a otro grupo; sigue envolviendo si no caben, nunca recorta. */
export function KpiGrid({ children, compacta = false }: { children: ReactNode; compacta?: boolean }) {
  return (
    <div
      className={`flex min-w-0 flex-wrap gap-3 [&>*]:max-w-80 [&>*]:min-w-0 ${
        compacta ? "[&>*]:flex-[1_1_9rem]" : "[&>*]:flex-[1_1_12rem]"
      }`}
    >
      {children}
    </div>
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

/** El contenido de una tarjeta: título, valor y subtexto. Lo comparten `KpiCard` y `KpiFiltro`. */
export function ContenidoKpi({
  titulo,
  valor,
  subtexto,
  tono = "neutral",
  ayuda,
  ayudaLectores,
  children,
}: {
  titulo?: ReactNode;
  valor: ReactNode;
  subtexto?: ReactNode;
  tono?: Tono;
  /** Un botón de ayuda («?») junto al título. */
  ayuda?: ReactNode;
  /** Texto solo para lectores de pantalla: qué pasa al pulsar la tarjeta. */
  ayudaLectores?: string;
  children?: ReactNode;
}) {
  return (
    <>
      {titulo && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${puntos[tono]}`} />
          <span>{titulo}</span>
          {ayuda}
        </p>
      )}
      <p className="mt-1 text-lg font-semibold tabular-nums">{valor}</p>
      {subtexto && <p className="mt-0.5 text-xs text-muted-foreground">{subtexto}</p>}
      {children}
      {ayudaLectores && <span className="sr-only">. {ayudaLectores}</span>}
    </>
  );
}

/**
 * Una tarjeta de indicador. Con `href` es un enlace (a otra página, o a esta misma con un filtro puesto en la
 * dirección) con resalte al pasar y anillo de foco; `activa` marca la que está filtrando ahora
 * (`aria-current`). Para filtrar la tabla de la misma página sin recargarla, ver `KpiFiltro`.
 */
export function KpiCard({
  titulo,
  valor,
  subtexto,
  tono = "neutral",
  href,
  activa = false,
  ayuda,
  ayudaLectores,
  compacta = false,
  children,
}: {
  titulo?: ReactNode;
  valor: ReactNode;
  subtexto?: ReactNode;
  tono?: Tono;
  href?: string;
  activa?: boolean;
  /** Menos relleno: para tarjetas dentro de un `KpiGrid compacta`. */
  compacta?: boolean;
  /** Un botón de ayuda («?») junto al título. Con `href`, la tarjeta se vuelve un enlace extendido: un botón no puede ir dentro de un enlace. */
  ayuda?: ReactNode;
  ayudaLectores?: string;
  children?: ReactNode;
}) {
  const contenido = (
    <ContenidoKpi
      titulo={titulo}
      valor={valor}
      subtexto={subtexto}
      tono={tono}
      ayuda={href && ayuda ? undefined : ayuda}
      ayudaLectores={href ? ayudaLectores : undefined}
    >
      {children}
    </ContenidoKpi>
  );
  if (!href) return <div className={claseKpi(tono, false, false, compacta)}>{contenido}</div>;
  if (ayuda) {
    // Enlace extendido: el enlace es el título y cubre toda la tarjeta con su ::after; la ayuda va encima (z-10).
    return (
      <div className={`${claseKpi(tono, true, activa, compacta)} relative`}>
        <ContenidoKpi
          titulo={
            <>
              <Link
                href={href}
                scroll={false}
                aria-current={activa ? "true" : undefined}
                className="after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-foreground"
              >
                {titulo}
              </Link>
              <span className="relative z-10">{ayuda}</span>
            </>
          }
          valor={valor}
          subtexto={subtexto}
          tono={tono}
          ayudaLectores={ayudaLectores}
        >
          {children}
        </ContenidoKpi>
      </div>
    );
  }
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={activa ? "true" : undefined}
      className={claseKpi(tono, true, activa, compacta)}
    >
      {contenido}
    </Link>
  );
}
