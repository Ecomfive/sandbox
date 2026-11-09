import { ControlPeriodo } from "@/components/af4/control-periodo";
import { ControlSegmentado } from "@/components/af4/control-segmentado";
import { TODAS } from "@/lib/clientes/metricas";
import { hrefClientes, type DatosPagina } from "./datos";

/**
 * Los filtros de Clientes y marketing con los controles del Portal AF4: período (últimos N meses, año o un mes) y tienda,
 * como enlaces que conservan el otro filtro. Van dentro de `EncabezadoAF4`.
 */
export function Selectores({ datos, ruta, conPeriodo = true }: { datos: DatosPagina; ruta: string; conPeriodo?: boolean }) {
  const { periodo, tienda } = datos;
  return (
    <>
      {conPeriodo && (
        <ControlPeriodo periodo={periodo} opciones={datos.opcionesPeriodo} href={(p) => hrefClientes(ruta, { periodo: p, tienda: tienda?.id })} />
      )}
      <ControlSegmentado
        etiqueta="Elegir tienda"
        opciones={datos.opcionesTienda.map((o) => ({ ...o, href: hrefClientes(ruta, { periodo: periodo.clave, tienda: o.valor }) }))}
        elegido={tienda?.id ?? TODAS}
        maxBotones={6}
      />
    </>
  );
}
