import type { ReactNode } from "react";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { MonedaCompetencia } from "@/components/competencia/moneda-competencia";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { monedaDePais } from "@/lib/moneda/tipo-cambio";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarDatosCompetencia } from "./datos-competencia";
import type { DatosCompetencia } from "./def-competencia";

/**
 * El marco de cada pestaña de Análisis de competencia: comprueba el acceso y carga los datos del país de la barra. Cada pestaña pone arriba el
 * tablero de tarjetas (`TableroCompetencia`): en Competidores filtran la lista; en Resumen llevan a Competidores con su filtro.
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
        // Los precios en la moneda del catálogo del país: Panamá en dólares, Costa Rica en colones.
        <MonedaCompetencia moneda={monedaDePais(pais.codigo)}>
          {children(datos, !usuario.modulosSoloLectura.includes("analisis-competencia"))}
        </MonedaCompetencia>
      )}
    </Pagina>
  );
}
