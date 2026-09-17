import { Badge } from "@/components/ui/badge";

export function KpiCard({
  titulo,
  valor,
  delta,
  invertirColor = false,
}: {
  titulo: string;
  valor: string;
  delta: number | null;
  /** Para métricas donde subir es malo (ej. diferencias, devoluciones). */
  invertirColor?: boolean;
}) {
  const positivo = delta !== null && (invertirColor ? delta <= 0 : delta >= 0);

  return (
    <div className="min-w-[10rem] flex-1 rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{valor}</p>
      {delta === null ? (
        <p className="mt-1 text-xs text-muted-foreground">Sin histórico para comparar</p>
      ) : (
        <Badge tone={positivo ? "success" : "destructive"}>
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(1)}%
        </Badge>
      )}
    </div>
  );
}
