import { ControlPeriodo } from "@/components/af4/control-periodo";
import { ControlSegmentado } from "@/components/af4/control-segmentado";
import { SelectorEntidad } from "@/components/finanzas/selector-entidad";
import { hrefRentabilidad, TODAS, type DatosPagina } from "./datos";

/**
 * Los filtros de Rentabilidad con los controles del Portal AF4: período (últimos N, año, un mes), entidad y tienda, como
 * enlaces que conservan los otros filtros. Va dentro de `EncabezadoAF4` (o solo, en las subpáginas).
 */
export function Selectores({ datos, ruta, conTienda = true }: { datos: DatosPagina; ruta: string; conTienda?: boolean }) {
  const { periodo, tienda, vistaQuery: vista } = datos;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ControlPeriodo
        periodo={periodo}
        opciones={datos.opcionesPeriodo}
        href={(p) => hrefRentabilidad(ruta, { periodo: p, tienda: tienda?.id ?? TODAS, vista })}
      />
      <SelectorEntidad ruta={ruta} opciones={datos.opcionesEntidad} vista={datos.vista} otros={{ periodo: periodo.clave }} conMoneda={false} />
      {conTienda && (
        <ControlSegmentado
          etiqueta="Elegir tienda"
          opciones={datos.opcionesTienda.map((o) => ({ ...o, href: hrefRentabilidad(ruta, { periodo: periodo.clave, tienda: o.valor, vista }) }))}
          elegido={tienda?.id ?? TODAS}
          maxBotones={6}
        />
      )}
    </div>
  );
}
