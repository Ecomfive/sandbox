// Piezas comunes de las pestañas de Planificación: permisos, la base del plan y el aviso de lo que falta.

import type { ReactNode } from "react";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo, type UsuarioActual } from "@/lib/auth";
import { cargarBasePlan, type BasePlan } from "@/lib/finanzas/cargar-planificacion";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";

export const MODULO_PLAN = "planificacion";

export interface ContextoPlan {
  usuario: UsuarioActual;
  permitidas: string[] | null;
  puedeEscribir: boolean;
  base: BasePlan | { error: string };
}

/** `balance: false` no lee el balance de apertura ni la deuda (el Pronóstico no los usa). */
export async function contextoPlan(opciones: { balance?: boolean } = {}): Promise<ContextoPlan> {
  const usuario = await requireModulo(MODULO_PLAN);
  const permitidas = await cargarTiendasPermitidas();
  const base = await cargarBasePlan(createServiceClient(), permitidas, opciones);
  return { usuario, permitidas, puedeEscribir: !usuario.modulosSoloLectura.includes(MODULO_PLAN), base };
}

export function SinDatosPlan({ titulo, pagina, children }: { titulo: string; pagina: string; children?: ReactNode }) {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo={pagina} imprimir={false} />
      <EstadoVacioAF4 titulo={titulo}>{children}</EstadoVacioAF4>
    </Pagina>
  );
}

/** Los avisos de la base (lo que falta para que el plan sea completo), como líneas con su punto ámbar. */
export function AvisosPlan({ avisos }: { avisos: string[] }) {
  const unicos = [...new Set(avisos)];
  if (!unicos.length) return null;
  return (
    <ul className="flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3 text-sm">
      {unicos.map((a) => (
        <li key={a} className="flex items-center gap-2">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
          {a}
        </li>
      ))}
    </ul>
  );
}
