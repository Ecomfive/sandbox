import type { ReactNode } from "react";
import { SelectorPlataforma } from "@/components/plataformas/selector-plataforma";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { MonedaCompetencia } from "@/components/competencia/moneda-competencia";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { monedaDePais } from "@/lib/moneda/tipo-cambio";
import { getPaisActual } from "@/lib/pais";
import { getPlataformaActual } from "@/lib/plataforma-actual";
import { plataformaDe, plataformasDePais, tieneCompetencia } from "@/lib/plataformas";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarDatosCompetencia, datosCompetenciaVacios } from "./datos-competencia";
import type { DatosCompetencia } from "./def-competencia";

/**
 * El marco de cada pestaña de Análisis de competencia: comprueba el acceso y carga los datos del país de la barra. Arriba se elige la plataforma (Dropi o Drop, 3 nov 2026): Drop es solo
 * de Costa Rica: el selector solo sale con Costa Rica elegido (con otro país no hay nada que elegir y se mira Dropi); sin búsquedas de Drop todavía, las pestañas se dibujan igual
 * que las de Dropi pero sin datos. Cada pestaña pone arriba el
 * tablero de tarjetas (`TableroCompetencia`): en Competidores filtran la lista; en Resumen llevan a Competidores con su filtro.
 */
export async function PaginaCompetencia({ titulo, children }: { titulo: string; children: (datos: DatosCompetencia, puedeEscribir: boolean) => ReactNode }) {
  const usuario = await requireModulo("analisis-competencia");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const elegida = await getPlataformaActual(pais.codigo);
  // Effi no tiene análisis de competencia: si la plataforma de la barra es Effi, aquí se mira Dropi.
  const plataforma = tieneCompetencia(elegida) ? elegida : "dropi";
  const plataformas = plataformasDePais(pais.codigo).filter((p) => tieneCompetencia(p.id));
  const esDrop = plataforma === "drop";
  // Los datos de Dropi solo se cargan si se mira Dropi: de Drop todavía no hay búsquedas.
  const datos = esDrop ? datosCompetenciaVacios("drop", pais.nombre) : await cargarDatosCompetencia(supabase, pais);
  // Solo con más de una plataforma en el país (Costa Rica): en los demás países ni se ofrece.
  const selector = plataformas.length > 1 ? <SelectorPlataforma plataforma={plataforma} plataformas={plataformas} /> : null;
  const puedeEscribir = !usuario.modulosSoloLectura.includes("analisis-competencia");
  if (esDrop) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-5">
        <EncabezadoPagina titulo={titulo} oculto />
        {selector}
        {/* Igual que la de Dropi, sin datos: Drop es de Costa Rica y se paga en colones. */}
        <MonedaCompetencia moneda={monedaDePais(pais.codigo)}>{children(datos!, puedeEscribir)}</MonedaCompetencia>
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
          Todavía no hay búsquedas del catálogo de {plataformaDe(datos.plataforma).nombre} de {datos.pais}. La primera se corre con la sesión de dropshipper de ese país.
        </p>
      ) : (
        // Los precios en la moneda del catálogo del país: Panamá en dólares, Costa Rica en colones.
        <MonedaCompetencia moneda={monedaDePais(pais.codigo)}>
          {children(datos, puedeEscribir)}
        </MonedaCompetencia>
      )}
    </Pagina>
  );
}
