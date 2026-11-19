"use server";

// Caja mínima por empresa (mejora 52, migración 0989): el monto debajo del cual la caja de una empresa (bancos y billeteras
// en USD) enciende la alerta. Se guarda en `fin_config.caja_minima_empresas`.

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { limitadoATiendas } from "@/components/finanzas/solo-toda-la-empresa";
import { leerMinimosEmpresas } from "@/lib/finanzas/tesoreria";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usd = (v: number) => `US$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export async function guardarMinimoEmpresa(entidadId: unknown, monto: unknown): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura("tesoreria");
    if (await limitadoATiendas()) return { error: "Solo para quien ve toda la empresa." };
    if (typeof entidadId !== "string" || !UUID.test(entidadId)) return { error: "Empresa inválida." };
    const t = typeof monto === "string" ? monto.trim().replace(/[$\s,]/g, "") : "";
    const n = t === "" ? null : Number(t);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 100_000_000)) return { error: "El mínimo es un monto en USD." };
    const supabase = createServiceClient();
    const [{ data: entidad }, { data: actual, error }] = await Promise.all([
      supabase.from("fin_entidades").select("razon_social, codigo").eq("id", entidadId).maybeSingle(),
      supabase.from("fin_config").select("valor").eq("clave", "caja_minima_empresas").maybeSingle(),
    ]);
    if (!entidad) return { error: "La empresa ya no existe." };
    if (error) return { error: error.message };
    const minimos = leerMinimosEmpresas(actual?.valor);
    const antes = minimos[entidadId] ?? null;
    if (n === null || n === 0) delete minimos[entidadId];
    else minimos[entidadId] = Math.round(n * 100) / 100;
    const { error: e2 } = await supabase.from("fin_config").upsert({ clave: "caja_minima_empresas", valor: minimos, actualizado_por: usuario.id, actualizado_en: new Date().toISOString() });
    if (e2) return { error: e2.message };
    await registrarAuditoria({
      accion: "caja_minima_empresa",
      entidad: "fin_config",
      detalle: `Caja mínima de ${entidad.razon_social || entidad.codigo}`,
      antes: { Mínimo: antes === null ? "sin mínimo" : usd(antes) },
      despues: { Mínimo: n ? usd(n) : "sin mínimo" },
    });
    revalidatePath("/tesoreria");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el mínimo." };
  }
}
