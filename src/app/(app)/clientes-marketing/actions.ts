"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { secretoLlaves } from "@/lib/clientes/identidad";
import { recalcularClientes } from "@/lib/clientes/recalcular";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "clientes-marketing";

export interface ResultadoRecalcular {
  clientes: number;
  identificados: number;
  ordenes: number;
  /** Órdenes con teléfono inválido, sospechoso o sin teléfono. */
  sinTelefonoValido: number;
}

/** Rearma los clientes desde las órdenes de Ventas por tienda. Pide poder modificar Clientes y marketing. */
export async function recalcularClientesAccion(): Promise<{ error: string } | ResultadoRecalcular> {
  try {
    await requireModuloEscritura(MODULO);
    const r = await recalcularClientes(createServiceClient(), secretoLlaves());
    const q = r.resumen.porCalidad;
    const sinTelefonoValido = q.invalido + q.sospechoso + q.sin_dato;
    await registrarAuditoria({
      accion: "recalcular_clientes",
      entidad: "cli_clientes",
      detalle: `${r.clientes} clientes de ${r.ordenesVinculadas} órdenes · ${sinTelefonoValido} órdenes sin teléfono válido · ${r.resumen.telefonosCompartidos} teléfonos compartidos`,
    });
    revalidatePath("/clientes-marketing", "layout");
    return { clientes: r.clientes, identificados: r.resumen.clientesIdentificados, ordenes: r.ordenesVinculadas, sinTelefonoValido };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo recalcular." };
  }
}
