import type { ReactNode } from "react";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarDatosCompetencia } from "./datos-competencia";
import type { DatosCompetencia } from "./def-competencia";
import { ResumenCompetencia } from "./vista-competencia";

/**
 * El marco de cada pestaña de Análisis de competencia: comprueba el acceso, carga los datos del país de la barra y pone la
 * barra de indicadores arriba (la misma en todas las pestañas, como en Test productos y Compras).
 */
export async function PaginaCompetencia({ titulo, children }: { titulo: string; children: (datos: DatosCompetencia, puedeEscribir: boolean) => ReactNode }) {
  const usuario = await requireModulo("analisis-competencia");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const datos = await cargarDatosCompetencia(supabase, pais);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <EncabezadoPagina titulo={titulo} oculto />
      {!datos ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudo cargar el análisis. Falta correr en Supabase la migración 0108.
        </p>
      ) : !datos.productos.length ? (
        <p className="rounded-[10px] border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          Todavía no hay búsquedas del catálogo de Dropi de {datos.pais}. La primera se corre con la sesión de dropshipper de ese país.
        </p>
      ) : (
        <>
          <ResumenCompetencia datos={datos} />
          {children(datos, !usuario.modulosSoloLectura.includes("analisis-competencia"))}
        </>
      )}
    </Pagina>
  );
}
