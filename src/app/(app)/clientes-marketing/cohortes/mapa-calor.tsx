import { claseCeldaColumna } from "@/components/tabla/estilos-tabla";
import { fraccion } from "@/lib/af4/formato";

/** Hasta dónde se mezcla el color de la serie principal con la tarjeta: el texto mantiene ≥ 4.5:1 en los dos temas. */
const MEZCLA_MAXIMA = 55;
const PASOS = [0, 15, 30, 45, 55];

const fondo = (mezcla: number) => (mezcla ? `color-mix(in oklab, var(--grafica-2) ${mezcla}%, var(--card))` : undefined);

/**
 * Una celda de mapa de calor con la paleta del Portal AF4: el número siempre escrito (el color nunca es la única señal) y,
 * detrás, el morado de la serie principal (`--grafica-2`) más intenso cuanto más alto el valor frente al máximo de la
 * tabla, en escalones de 5 %. Sin dato, la celda queda con «—».
 */
export function CeldaCalor({ valor, maximo, texto }: { valor: number | null; maximo: number; texto?: string }) {
  if (valor === null) return <td className={`${claseCeldaColumna} text-right tabular-nums text-muted-foreground`}>—</td>;
  const mezcla = maximo > 0 ? Math.round((Math.min(valor / maximo, 1) * MEZCLA_MAXIMA) / 5) * 5 : 0;
  return (
    <td
      className={`${claseCeldaColumna} text-right tabular-nums whitespace-nowrap text-foreground ${mezcla >= 40 ? "font-semibold" : ""}`}
      style={{ background: fondo(mezcla) }}
    >
      {texto ?? fraccion(valor)}
    </td>
  );
}

/** La escala del color, de 0 al máximo de la tabla (los valores ya van escritos en cada celda). */
export function LeyendaCalor({ maximo }: { maximo: number }) {
  return (
    <div aria-hidden="true" className="flex items-center gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground tabular-nums">
      <span>{fraccion(0)}</span>
      <span className="flex overflow-hidden rounded-sm border border-border">
        {PASOS.map((m) => (
          <span key={m} className="h-3 w-6" style={{ background: fondo(m) ?? "var(--card)" }} />
        ))}
      </span>
      <span>{fraccion(maximo)}</span>
    </div>
  );
}
