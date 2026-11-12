import type { EstadoPlazo } from "@/lib/compras/plazos";

// Las dos piezas nuevas de Compras y del portal de Shen Zhen (reunión con Alcides del 11 nov 2026, prototipo aprobado): la prioridad
// (un cuadradito de color y su nombre) y el plazo de la etapa (el texto y una barrita verde, ámbar o roja). Los textos los pone quien
// las usa: Compras en español, el portal en el idioma de su cuenta.

const TONO_PRIORIDAD: Record<string, { texto: string; punto: string }> = {
  urgente: { texto: "text-destructive", punto: "bg-destructive" },
  alta: { texto: "text-warning", punto: "bg-warning" },
  normal: { texto: "text-foreground", punto: "bg-primario" },
  baja: { texto: "text-muted-foreground", punto: "bg-border-control" },
};

/** «■ Urgente»: la prioridad de una compra. Sin prioridad, una raya. */
export function MarcaPrioridad({ prioridad, texto }: { prioridad: string | null; texto: string }) {
  const tono = prioridad ? TONO_PRIORIDAD[prioridad] : undefined;
  if (!tono) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${tono.texto}`}>
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-[2px] ${tono.punto}`} />
      {texto}
    </span>
  );
}

const TONO_PLAZO: Record<EstadoPlazo["tono"], { texto: string; barra: string }> = {
  ok: { texto: "text-success", barra: "bg-success" },
  aviso: { texto: "text-warning", barra: "bg-warning" },
  vencido: { texto: "text-destructive", barra: "bg-destructive" },
};

/** «3 d de 5 d» con su barrita: verde mientras queda tiempo, ámbar en el último día y roja cuando venció. Sin plazo, una raya. */
export function BarraPlazo({ estado, texto, titulo }: { estado: EstadoPlazo | null; texto: string; titulo?: string }) {
  if (!estado) return <span className="text-muted-foreground">—</span>;
  const tono = TONO_PLAZO[estado.tono];
  return (
    <span className="inline-flex min-w-[7rem] flex-col gap-1" title={titulo}>
      <span className={`text-xs font-semibold whitespace-nowrap tabular-nums ${tono.texto}`}>{texto}</span>
      <span aria-hidden="true" className="block h-1 overflow-hidden rounded-full bg-muted">
        <span className={`block h-full rounded-full ${tono.barra}`} style={{ width: `${Math.max(4, estado.pct)}%` }} />
      </span>
    </span>
  );
}
