import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AvisoSoloPais } from "@/components/plataformas/aviso-solo-pais";
import { SelectorPlataforma } from "@/components/plataformas/selector-plataforma";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { MonedaCompetencia } from "@/components/competencia/moneda-competencia";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { monedaDePais } from "@/lib/moneda/tipo-cambio";
import { getPaisActual } from "@/lib/pais";
import { COOKIE_PLATAFORMA_COMPETENCIA, PAIS_DE_DROP, plataformaDisponible, plataformaValida } from "@/lib/plataformas";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarDatosCompetencia } from "./datos-competencia";
import type { DatosCompetencia } from "./def-competencia";

/**
 * El marco de cada pestaña de Análisis de competencia: comprueba el acceso y carga los datos del país de la barra. Arriba se elige la plataforma (Dropi o Drop, 3 nov 2026): Drop es solo
 * de Costa Rica, así que con otro país se avisa, y sin búsquedas de Drop todavía sale vacío. Cada pestaña pone arriba el
 * tablero de tarjetas (`TableroCompetencia`): en Competidores filtran la lista; en Resumen llevan a Competidores con su filtro.
 */
export async function PaginaCompetencia({ titulo, children }: { titulo: string; children: (datos: DatosCompetencia, puedeEscribir: boolean) => ReactNode }) {
  const usuario = await requireModulo("analisis-competencia");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const plataforma = plataformaValida((await cookies()).get(COOKIE_PLATAFORMA_COMPETENCIA)?.value);
  const esDrop = plataforma === "drop";
  // Los datos de Dropi solo se cargan si se mira Dropi: de Drop todavía no hay búsquedas.
  const datos = esDrop ? null : await cargarDatosCompetencia(supabase, pais);
  const selector = <SelectorPlataforma plataforma={plataforma} cookie={COOKIE_PLATAFORMA_COMPETENCIA} />;
  if (esDrop) {
    const permitidos = usuario.paisesPermitidos;
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-5">
        <EncabezadoPagina titulo={titulo} oculto />
        {selector}
        {plataformaDisponible("drop", pais.codigo) ? (
          <p className="rounded-[10px] border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">Todavía no hay búsquedas del catálogo de Drop de {pais.nombre}.</p>
        ) : (
          <AvisoSoloPais plataforma="drop" paisPermitido={permitidos === null || permitidos.includes(PAIS_DE_DROP)} />
        )}
      </Pagina>
    );
  }
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <EncabezadoPagina titulo={titulo} oculto />
      {selector}
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
