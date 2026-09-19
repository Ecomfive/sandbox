import type { ReactNode } from "react";

type Tono = "neutral" | "destructive";

const tonos: Record<Tono, string> = {
  neutral: "border-border bg-card",
  destructive: "border-red-300 bg-red-50",
};

/** Grilla responsiva para tarjetas de indicadores — nunca se cortan ni desbordan, a cualquier ancho.
 * `min-w-0` es necesario porque este grid suele vivir dentro de un contenedor flex-col: sin eso,
 * un hijo flex no se encoge por debajo del ancho "natural" de sus columnas y la página se corta. */
export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">{children}</div>;
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
        <p className={`text-xs font-medium ${tono === "destructive" ? "text-red-700" : ""}`}>{titulo}</p>
      )}
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tono === "destructive" ? "text-red-700" : ""}`}>
        {valor}
      </p>
      {subtexto && <p className="mt-0.5 text-xs text-muted-foreground">{subtexto}</p>}
      {children}
    </div>
  );
}
