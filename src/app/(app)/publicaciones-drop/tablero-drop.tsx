import type { ComponentType } from "react";
import { COLORES, type Color } from "@/components/panel/colores-tablero";
import { ActualizarIcon, AnalisisCompetenciaIcon, DesconectadoIcon, DropshipperIcon, EnlaceIcon, EstadoIcon, InventarioIcon, MargenIcon, SugerenciaIcon, TiendaIcon, VentasIcon } from "@/lib/nav-icons";

interface Tarjeta {
  id: string;
  titulo: string;
  detalle: string;
  icono: ComponentType<{ className?: string }>;
  color: Color;
}

/** Las mismas tarjetas que el tablero de Gestión de IDs Dropi, para cuando se conecten los datos de Drop. */
const TARJETAS: Tarjeta[] = [
  { id: "activas", titulo: "Activas en Drop", detalle: "Publicadas y activas según Drop", icono: TiendaIcon, color: "verde" },
  { id: "margen-bajo", titulo: "Margen bajo", detalle: "Utilidad por debajo del margen mínimo", icono: MargenIcon, color: "rojo" },
  { id: "ventas-caida", titulo: "Ventas en caída", detalle: "Venden menos que en el periodo anterior", icono: VentasIcon, color: "ambar" },
  { id: "bajar-precio", titulo: "Bajar precio", detalle: "Hay un competidor más barato", icono: AnalisisCompetenciaIcon, color: "rojo" },
  { id: "verificar-dropshipper", titulo: "Verificar dropshipper", detalle: "Privados por verificar", icono: DropshipperIcon, color: "azul" },
  { id: "republicar", titulo: "Republicar", detalle: "Sin ventas por mucho tiempo", icono: ActualizarIcon, color: "azul" },
  { id: "recomendaciones", titulo: "Recomendaciones", detalle: "De precio o combo, sin decidir", icono: SugerenciaIcon, color: "violeta" },
  { id: "por-optimizar", titulo: "Por optimizar", detalle: "Título, fotos, video o precio sugerido por mejorar", icono: EstadoIcon, color: "azul" },
  { id: "sin-id", titulo: "Sin ID de Drop", detalle: "Publicaciones sin su ID de Drop anotado", icono: DesconectadoIcon, color: "rojo" },
  { id: "sin-vincular", titulo: "Sin vincular producto", detalle: "Sin su producto de Producto", icono: EnlaceIcon, color: "violeta" },
  { id: "sin-stock", titulo: "Sin stock", detalle: "Activas en Drop con 0 unidades", icono: InventarioIcon, color: "rojo" },
  { id: "poco-stock", titulo: "Poco stock", detalle: "Venden y les quedan pocas unidades", icono: InventarioIcon, color: "ambar" },
];

/**
 * El tablero de acciones de Gestión de IDs Drop: igual al de Dropi, en cero mientras no haya datos. Las tarjetas se vuelven botones que
 * filtran la lista (como las de Dropi) cuando se conecten las publicaciones.
 */
export function TableroDrop() {
  return (
    <section aria-label="Tablero de acciones" className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
      {TARJETAS.map((t) => {
        const c = COLORES[t.color];
        const Icono = t.icono;
        return (
          <div key={t.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <span className="flex items-center gap-3">
              <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.icono}`}>
                <Icono className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 text-xs leading-tight font-medium tracking-wide text-muted-foreground uppercase hyphens-auto">{t.titulo}</span>
            </span>
            <span className={`text-3xl leading-none font-semibold tabular-nums ${c.numero}`}>0</span>
            <span className="text-xs text-muted-foreground">{t.detalle}</span>
          </div>
        );
      })}
    </section>
  );
}
