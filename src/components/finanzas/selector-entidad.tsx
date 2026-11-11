import { ControlSegmentado } from "@/components/af4/control-segmentado";
import { CONSOLIDADO, MONEDA_LOCAL, MONEDA_USD, conParametros, parametrosVista, type VistaEntidad } from "@/lib/finanzas/entidades";

/**
 * Entidad (Consolidado / Panamá / Costa Rica) y, en una entidad con otra moneda, la moneda en que se ve. Son enlaces que
 * conservan los demás filtros de la página (`otros`). Sin entidades (migración 0923 sin correr) no dibuja nada. Usa el
 * control del Portal AF4 (`ControlSegmentado`), igual que el período y la tienda.
 */
export function SelectorEntidad({
  ruta,
  opciones,
  vista,
  otros = {},
  conMoneda = true,
}: {
  ruta: string;
  opciones: { valor: string; etiqueta: string }[];
  vista: VistaEntidad;
  otros?: Record<string, string | null | undefined>;
  /** Si se ofrece ver la entidad en su moneda (Rentabilidad va siempre en dólares). */
  conMoneda?: boolean;
}) {
  if (opciones.length < 2) return null;
  const { entidad } = vista;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ControlSegmentado
        etiqueta="Elegir entidad"
        opciones={opciones.map((o) => ({ ...o, href: conParametros(ruta, { ...otros, entidad: o.valor }) }))}
        elegido={entidad?.codigo ?? CONSOLIDADO}
      />
      {conMoneda && entidad && entidad.moneda !== "USD" && (
        <ControlSegmentado
          etiqueta="Elegir moneda"
          opciones={[
            { valor: MONEDA_LOCAL, etiqueta: entidad.moneda },
            { valor: MONEDA_USD, etiqueta: "USD" },
          ].map((o) => ({ ...o, href: conParametros(ruta, { ...otros, ...parametrosVista(vista), moneda: o.valor }) }))}
          elegido={vista.local ? MONEDA_LOCAL : MONEDA_USD}
        />
      )}
    </div>
  );
}
