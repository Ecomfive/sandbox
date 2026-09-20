import type { ReactNode } from "react";

type Tono = "neutral" | "destructive";

const tonos: Record<Tono, string> = {
  neutral: "border-border bg-card",
  destructive: "border-destructive/30 bg-destructive-soft",
};

/** Grilla responsiva para tarjetas de indicadores — nunca se cortan ni desbordan, a cualquier ancho.
 * `min-w-0` es necesario porque este grid suele vivir dentro de un contenedor flex-col: sin eso,
 * un hijo flex no se encoge por debajo del ancho "natural" de sus columnas y la página se corta.
 * Cada tarjeta crece hasta 20rem y no más: en una página ancha, dos o tres tarjetas no se estiran
 * a media pantalla cada una. */
export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(12rem,20rem))] gap-3">{children}</div>;
}

/** Agrupa un KpiGrid bajo una barra de título — la tarjeta contenedora queda con su propio
 * borde/esquinas y una franja superior que nombra el grupo, en vez de un <h2> suelto al lado. */
export function KpiGroup({ titulo, children }: { titulo: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground">
        {titulo}
      </div>
      <div className="p-4">{children}</div>
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
