import { geometriaBarra } from "@/lib/compras/estado-ruta";

/**
 * «Uso del plazo»: la franja verde es lo que promete el agente (de mínimo a máximo), la barra oscura lo que de verdad tardó y la
 * parte rayada en rojo lo que se pasó. La línea marca el plazo máximo. Todas las barras usan la misma escala (0 a 2,2 veces el
 * máximo), así que se comparan entre sí; el significado va en `etiqueta` para los lectores de pantalla.
 */
export function BarraUso({ min, max, real, etiqueta }: { min: number; max: number; real: number | null; etiqueta: string }) {
  const g = geometriaBarra(min, max, real);
  return (
    <span role="img" aria-label={etiqueta} className="relative block h-3 w-full rounded-[3px] bg-border">
      <span className="absolute top-px bottom-px min-w-1.5 rounded-[2px] border border-success/55 bg-success-soft" style={{ left: `${g.zonaIzq}%`, width: `${g.zonaAncho}%` }} />
      {real !== null && <span className="absolute top-[3px] bottom-[3px] left-0 rounded-r-[2px] bg-foreground/80" style={{ width: `${g.dentro}%` }} />}
      {g.excesoAncho > 0 && (
        <span
          className="absolute top-[3px] bottom-[3px] rounded-r-[2px]"
          style={{ left: `${g.excesoIzq}%`, width: `${g.excesoAncho}%`, backgroundImage: "repeating-linear-gradient(135deg, var(--destructive) 0 3px, var(--destructive-soft) 3px 6px)" }}
        />
      )}
      <span className="absolute -top-[3px] -bottom-[3px] -ml-px w-0.5 bg-foreground" style={{ left: `${g.limite}%` }} />
    </span>
  );
}
