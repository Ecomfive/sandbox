"use server";

// El Pareto de clientes en el tablero de Gestión de IDs Dropi (12 nov 2026, pedido de Hernán: «el 20 % de los clientes que traen el 80 % de las guías,
// eso ya lo tenemos pero queremos verlo desde Dropi Panamá»). Son las mismas guías del Pareto de Dirección en el CRM: mes a mes de `crm_pedidos_mensuales`
// (migración 0207) y, para los últimos 30 días (pedido de Hernán, el mismo día), `pedidos_30` de `crm_salud_dropshippers` (migración 0197: las mismas guías sin
// cancelados, contadas por día). Se piden al abrir la página, aparte, para que la lista de publicaciones no espere (unos 300 ms cada una con Panamá, a la vez).

import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { cargarPareto, type DatosPareto } from "../crm-dropshippers/direccion/datos-pareto";
import { guardado } from "../crm-dropshippers/direccion/guardado";

export interface ClientePareto {
  nombre: string;
  codigo: string | null;
}

export type ParetoClientes =
  | (DatosPareto & {
      /** Las guías de cada cliente en los últimos 30 días (solo los que tuvieron alguna). */
      dias30: Record<string, number>;
      clientes: Record<string, ClientePareto>;
      nombrePais: string;
      enlazarCrm: boolean;
    })
  | { error: string };

const hoyPanama = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });

/** Las guías de cada cliente en los últimos 30 días, por día (no por mes calendario). */
async function guias30(supabase: ReturnType<typeof createServiceClient>, paisId: string): Promise<{ porCliente: Record<string, number> } | { error: string }> {
  const r = await traerTodasConError<{ dropshipper_id: string; pedidos_30: number }>((d, h) =>
    supabase.rpc("crm_salud_dropshippers", { p_pais: paisId }).order("dropshipper_id").range(d, h),
  );
  if (r.error) return { error: "Falta correr la migración 0197 (salud de los clientes) en la base." };
  return { porCliente: Object.fromEntries((r.data ?? []).filter((f) => Number(f.pedidos_30) > 0).map((f) => [f.dropshipper_id, Number(f.pedidos_30)])) };
}

/** Las guías de cada cliente mes a mes (12 meses) y de los últimos 30 días en el país de la barra, con su nombre. `enlazarCrm`: si quien mira puede abrir su ficha en el CRM. */
export async function cargarParetoClientes(): Promise<ParetoClientes> {
  const usuario = await requireModulo("publicaciones-dropi");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const hoy = hoyPanama();
  // Lo mismo que usa Dirección y guardado un minuto: abrir y cerrar la página no vuelve a contar las guías.
  const [datos, d30] = await Promise.all([
    guardado(`pareto:${pais.id}:${hoy}`, () => cargarPareto(supabase, pais.id, hoy)),
    guardado(`pareto30:${pais.id}:${hoy}`, () => guias30(supabase, pais.id)),
  ]);
  if ("error" in datos) return datos;
  if ("error" in d30) return d30;
  const dias30 = d30.porCliente;
  const ids = [...new Set([...Object.keys(datos.porMes), ...Object.keys(dias30)])];
  const clientes: Record<string, ClientePareto> = {};
  for (let i = 0; i < ids.length; i += 200) {
    const r = await supabase.from("dropshippers").select("id, nombre, codigo").in("id", ids.slice(i, i + 200));
    if (r.error) return { error: "No se pudieron leer los nombres de los clientes." };
    for (const d of (r.data ?? []) as { id: string; nombre: string | null; codigo: string | null }[]) clientes[d.id] = { nombre: d.nombre?.trim() || "Sin nombre", codigo: d.codigo };
  }
  return { ...datos, dias30, clientes, nombrePais: pais.nombre, enlazarCrm: usuario.modulos.includes("crm-dropshippers") };
}
