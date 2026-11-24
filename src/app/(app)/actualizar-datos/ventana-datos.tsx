"use client";

import { BotonPlantilla } from "@/components/importar/boton-plantilla";
import { ImportarCartera } from "@/components/cartera/importar-cartera";
import type { VentanaFuente } from "@/lib/actualizar-datos/estado";
import { LECTORES, LECTORES_PAIS, sinExtension, sitioDe, type ClaveLector } from "@/lib/dropi-actualizar/partes";
import type { ModuloImportable } from "@/lib/importar/reconocer";
import { ImportarBienes } from "../bienes-de-uso/importar/importar-bienes";
import { ImportarConciliacion } from "../conciliacion-bancaria/importar/importar-conciliacion";
import { ImportarCostos } from "../costos-mercancia/importar/importar-costos";
import { ImportarDeliverys } from "../deliverys/importar/importar-deliverys";
import { ImportarExcel } from "../libro-movimientos/importar/importar-excel";
import { ImportarNomina } from "../nomina/importar/importar-nomina";
import type { Corrida, UltimaParte } from "../publicaciones-dropi/actualizar/datos";
import { PanelActualizarDropi } from "../publicaciones-dropi/actualizar/panel-actualizar";
import { ImportarConteo } from "../rentabilidad/inventario/conteo/importar-conteo";
import { LeerSiscore } from "../tienda-pedidos/logistica/leer-siscore";
import { LeerTuWinner } from "../tu-winner/leer-tuwinner";
import { LeerCompetenciaDrop } from "../analisis-competencia/leer-competencia-drop";
import { ImportarVentas } from "../ventas-tiendas/importar/importar-ventas";

/** Lo que la página carga para las ventanas que lo necesitan (solo si alguna fila las usa). */
export interface ExtrasVentanas {
  dropi: { disponible: boolean; corridas: Corrida[]; ultima: Partial<Record<string, UltimaParte>> } | null;
  entidades: { codigo: string; razon_social: string; moneda: string }[] | null;
  cuentas: { id: string; nombre: string }[] | null;
}

/** Los lectores de una cuenta: los suyos que pasan por la extensión (Effi tiene su propia fila y no pasa por ella). */
const TODOS = [...LECTORES_PAIS.pa, ...LECTORES_PAIS.cr, ...LECTORES_PAIS.mx] as ClaveLector[];
const lectoresDeSitio = (sitio: string): ClaveLector[] => TODOS.filter((l) => LECTORES[l] && sitioDe(l) === sitio && !sinExtension(l));

/**
 * El contenido de la ventana de «Actualizar datos» (19 nov 2026, pedido de Hernán: actualizar desde el panel, sin ir a otra página): el mismo componente de
 * la pantalla de siempre, con sus mismos permisos en el servidor. Dropi, Drop y Dunamixfy arrancan solos con la cuenta elegida.
 */
export function ContenidoVentana(props: { ventana: VentanaFuente; extras: ExtrasVentanas; alCambiarEnMarcha: (enMarcha: boolean) => void }) {
  return (
    <div className="p-4">
      <Contenido {...props} />
    </div>
  );
}

function Contenido({ ventana, extras, alCambiarEnMarcha }: { ventana: VentanaFuente; extras: ExtrasVentanas; alCambiarEnMarcha: (enMarcha: boolean) => void }) {
  switch (ventana.tipo) {
    case "dropi":
      if (!extras.dropi) return <p className="m-0 text-sm text-muted-foreground">No se pudo cargar la actualización de Dropi.</p>;
      return <PanelActualizarDropi {...(extras.dropi as Parameters<typeof PanelActualizarDropi>[0])} iniciar={ventana.sitio ? lectoresDeSitio(ventana.sitio) : null} alCambiarEnMarcha={alCambiarEnMarcha} />;
    case "siscore":
      return (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-sm text-muted-foreground">Lee las guías de Servientrega de la cuenta de tienda que esté abierta en SISCORE en este Chrome. Si no hay sesión, abre la pestaña y espera a que entres.</p>
          <LeerSiscore ultima={null} tiendaId={null} tiendaNombre={null} iniciar />
        </div>
      );
    case "tuwinner":
      return <LeerTuWinner leidoHoy={false} auto={false} iniciar />;
    case "conteo":
      return <ImportarConteo />;
    case "competencia-drop":
      return <LeerCompetenciaDrop iniciar />;
    case "excel":
      return (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <BotonPlantilla modulo={ventana.modulo as ModuloImportable} />
          </div>
          <ImportadorExcel modulo={ventana.modulo as ModuloImportable} extras={extras} />
        </div>
      );
  }
}

function ImportadorExcel({ modulo, extras }: { modulo: ModuloImportable; extras: ExtrasVentanas }) {
  switch (modulo) {
    case "libro-movimientos":
      return <ImportarExcel entidades={extras.entidades ?? []} />;
    case "bienes-de-uso":
      return <ImportarBienes />;
    case "cuentas-por-cobrar":
      return <ImportarCartera clase="cobrar" />;
    case "cuentas-por-pagar":
      return <ImportarCartera clase="pagar" />;
    case "costos-mercancia":
      return <ImportarCostos />;
    case "nomina":
      return <ImportarNomina />;
    case "ventas-tiendas":
      return <ImportarVentas />;
    case "deliverys":
      return <ImportarDeliverys />;
    case "conciliacion-bancaria":
      return <ImportarConciliacion cuentas={extras.cuentas ?? []} />;
  }
}
