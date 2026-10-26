"use client";

import { Ventana } from "@/components/ui/ventana";
import type { AccesoCrm } from "@/lib/crm/areas";
import { FlechaAbajoIcon, FlechaArribaIcon } from "@/lib/nav-icons";
import type { FilaCaso, FilaDropshipper } from "./def-crm";
import { BotonNavegar, ContenidoFichaDropshipper } from "./ficha-lateral";

/**
 * La ficha de un dropshipper que se abre desde la lista (26 oct 2026): una ventana como las de Gestión de IDs Dropi (a la derecha, al
 * centro o a pantalla completa, como prefiera la persona), con las flechas para pasar al anterior y al siguiente de la lista.
 */
export function FichaDropshipper({
  dropshipper,
  casos,
  codigoPais,
  hoy,
  acceso,
  anterior,
  siguiente,
  alCerrar,
}: {
  dropshipper: FilaDropshipper | undefined;
  casos: FilaCaso[];
  codigoPais: string;
  hoy: string;
  acceso: AccesoCrm;
  anterior?: () => void;
  siguiente?: () => void;
  alCerrar: () => void;
}) {
  const d = dropshipper;
  if (!d) return null;
  return (
    <Ventana
      abierto
      alCerrar={alCerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        <>
          <span className="text-sm font-medium text-muted-foreground tabular-nums">{d.codigo}</span>
          <span className="text-lg font-semibold">{d.nombre}</span>
          {d.tiendas.length > 0 && <span className="text-sm text-muted-foreground">{d.tiendas.join(", ")}</span>}
        </>
      }
      navegacion={
        <>
          <BotonNavegar texto="Dropshipper anterior" icono={FlechaArribaIcon} activo={!!anterior} alHacerClic={() => anterior?.()} />
          <BotonNavegar texto="Dropshipper siguiente" icono={FlechaAbajoIcon} activo={!!siguiente} alHacerClic={() => siguiente?.()} />
        </>
      }
    >
      <ContenidoFichaDropshipper key={d.id} d={d} casos={casos} codigoPais={codigoPais} hoy={hoy} acceso={acceso} />
    </Ventana>
  );
}
