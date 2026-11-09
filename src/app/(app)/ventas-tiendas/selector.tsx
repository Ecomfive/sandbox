import { ControlSegmentado } from "@/components/af4/control-segmentado";
import { SelectorEnlace } from "@/components/af4/selector-enlace";
import { mesEnCursoPanama, mesMedio } from "@/lib/af4/fecha";

export interface OpcionSelector {
  valor: string;
  etiqueta: string;
}

/** Arma `?mes=…&tienda=…` sin los que están vacíos o en «todas». */
export function conFiltros(ruta: string, filtros: Record<string, string | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) if (v && v !== "todas") p.set(k, v);
  const q = p.toString();
  return q ? `${ruta}?${q}` : ruta;
}

/**
 * Los filtros de Ventas por tienda con los controles del Portal AF4: el mes (lista desplegable, del más nuevo al más
 * viejo), la tienda y, en Órdenes, el estado. Son enlaces: `href*` arma cada dirección con los demás filtros. Solo en el
 * servidor (recibe funciones). El mes sigue viajando como `?mes=AAAA-MM-01`, igual que antes.
 */
export function FiltrosVentas({
  meses,
  mes,
  tiendas,
  tienda,
  hrefMes,
  hrefTienda,
  estados,
  estado,
  hrefEstado,
}: {
  meses: string[];
  mes: string;
  tiendas: OpcionSelector[];
  tienda: string;
  hrefMes: (mes: string) => string;
  hrefTienda: (tienda: string) => string;
  estados?: OpcionSelector[];
  estado?: string;
  hrefEstado?: (estado: string) => string;
}) {
  const enCurso = mesEnCursoPanama();
  const opcionesMes = [...meses].reverse().map((m) => ({ valor: m, etiqueta: m >= enCurso ? `${mesMedio(m)} · parcial` : mesMedio(m), href: hrefMes(m) }));
  return (
    <>
      <SelectorEnlace etiqueta="Elegir mes" opciones={opcionesMes} elegido={mes} />
      <ControlSegmentado etiqueta="Elegir tienda" opciones={tiendas.map((o) => ({ ...o, href: hrefTienda(o.valor) }))} elegido={tienda} maxBotones={6} />
      {estados && hrefEstado && (
        <ControlSegmentado etiqueta="Elegir estado" opciones={estados.map((o) => ({ ...o, href: hrefEstado(o.valor) }))} elegido={estado ?? "todas"} maxBotones={4} />
      )}
    </>
  );
}
