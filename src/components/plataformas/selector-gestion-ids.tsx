import type { ReactNode } from "react";
import { SelectorPlataforma } from "@/components/plataformas/selector-plataforma";
import { getUsuarioActual } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { GESTION_IDS, gestionesDePais, type PlataformaId } from "@/lib/plataformas";
import { createServiceClient } from "@/lib/supabase/server";

const DESTINOS = Object.fromEntries(Object.entries(GESTION_IDS).map(([id, g]) => [id, g.ruta])) as Record<PlataformaId, string>;

/**
 * El selector de Gestión de IDs (6 nov 2026, pedido de Hernán): una sola gestión en el menú y, arriba de cada una, los logos de las plataformas para pasar de Dropi a Drop o a Effi, igual
 * que en Análisis de competencia. Solo sale con más de una gestión que la persona pueda abrir en el país de la barra (Drop y Effi son solo de Costa Rica). `actual` es la plataforma de la
 * página donde se dibuja, no la de la barra de arriba. Va en el `layout` de cada gestión, así lo traen todas sus pestañas.
 */
export async function SelectorGestionIds({ actual, children }: { actual: PlataformaId; children: ReactNode }) {
  const [usuario, pais] = await Promise.all([getUsuarioActual(), getPaisActual(createServiceClient())]);
  const opciones = gestionesDePais(pais.codigo, usuario?.modulos ?? null);
  return (
    <>
      {opciones.length > 1 && (
        <div className="mx-auto -mb-3 w-full max-w-[1800px] px-6 pt-6">
          <SelectorPlataforma plataforma={actual} plataformas={opciones} destinos={DESTINOS} />
        </div>
      )}
      {children}
    </>
  );
}
