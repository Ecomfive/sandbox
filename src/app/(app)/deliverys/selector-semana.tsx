import { SelectorEnlace } from "@/components/af4/selector-enlace";
import { textoSemana } from "@/lib/deliverys/liquidacion";

/**
 * Las últimas semanas de cierre (jueves a miércoles) con el control del Portal AF4: una lista desplegable, de la más
 * nueva a la más vieja, cuyas opciones son enlaces (`?semana=`). Va en los filtros de `EncabezadoAF4`.
 */
export function SelectorSemana({ semanas, elegida, ruta }: { semanas: string[]; elegida: string; ruta: string }) {
  const opciones = semanas
    .slice(-10)
    .reverse()
    .map((s) => ({ valor: s, etiqueta: `Semana del ${textoSemana(s)}`, href: `${ruta}?semana=${s}` }));
  return <SelectorEnlace etiqueta="Elegir semana" opciones={opciones} elegido={elegida} />;
}

/** La semana pedida en la dirección si existe; si no, la más reciente. */
export function semanaElegida(semanas: string[], pedida: unknown): string | null {
  if (typeof pedida === "string" && semanas.includes(pedida)) return pedida;
  return semanas[semanas.length - 1] ?? null;
}
