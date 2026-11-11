import Link from "next/link";
import { anilloFoco } from "@/components/ui/field";
import { SelectorEnlace, type OpcionEnlace } from "./selector-enlace";

/** Más opciones que esto no caben como botones: se dibujan como lista desplegable. */
const MAX_BOTONES = 7;

/**
 * Un filtro de la barra de contexto (período, entidad, moneda, tienda, escenario): botones unidos, el elegido en negro
 * (`aria-current`). Son enlaces: la dirección se puede copiar y funciona sin JavaScript. Con muchas opciones se vuelve
 * una lista desplegable (`SelectorEnlace`). Reemplaza los `Selector`, `Opciones` y `nav` hechos a mano de cada página.
 */
export function ControlSegmentado({
  etiqueta,
  opciones,
  elegido,
  maxBotones = MAX_BOTONES,
}: {
  /** Nombre del grupo para lectores de pantalla («Elegir tienda»). */
  etiqueta: string;
  opciones: OpcionEnlace[];
  elegido: string | null;
  maxBotones?: number;
}) {
  if (opciones.length < 2) return null;
  if (opciones.length > maxBotones) return <SelectorEnlace etiqueta={etiqueta} opciones={opciones} elegido={elegido} />;
  return (
    <nav aria-label={etiqueta} className="inline-flex h-8 max-w-full items-stretch overflow-x-auto rounded-md border border-border-control bg-card p-0.5">
      {opciones.map((o) => {
        const activo = o.valor === elegido;
        return (
          <Link
            key={o.valor}
            href={o.href}
            scroll={false}
            aria-current={activo ? "page" : undefined}
            className={`flex items-center rounded-[5px] px-2.5 text-[13px] whitespace-nowrap transition-colors ${anilloFoco} ${
              activo ? "bg-foreground font-medium text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {o.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
