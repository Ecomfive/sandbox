"use server";

import { requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { PAISES_NAV } from "@/lib/nav-data";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { errorDecision, type Decision } from "@/lib/producto/por-pais";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";

const ETIQUETA: Record<Decision, string> = { enviar: "Enviar", descartado: "Descartado" };

/**
 * Guarda (o quita, con `decision = null`) la decisión de un producto en un país de «Producto › Por país»: «Enviar» (traerlo a ese
 * país) o «Descartado» (con su motivo). Pide poder modificar Producto y ver ese país. Devuelve el error como valor.
 */
export async function decidirProductoPais(
  skuId: string,
  codigoPais: string,
  decision: Decision | null,
  motivo: string,
): Promise<{ error: string } | { ok: true; por: string | null; en: string }> {
  try {
    const usuario = await requireModuloEscritura("producto");
    if (!esUuid(skuId)) return { error: "Producto no válido." };
    if (!PAISES_NAV.some((p) => p.codigo === codigoPais) || !puedeVerPais(usuario.paisesPermitidos, codigoPais)) return { error: "No puedes ver ese país." };
    const texto = String(motivo ?? "").trim();
    const problema = errorDecision(decision, texto);
    if (problema) return { error: problema };

    const supabase = createServiceClient();
    const [{ data: pais }, { data: producto }] = await Promise.all([
      supabase.from("paises").select("id").eq("codigo", codigoPais).maybeSingle(),
      supabase.from("skus_maestros").select("id, nombre").eq("id", skuId).maybeSingle(),
    ]);
    if (!pais || !producto) return { error: "No se encontró el producto o el país." };
    const { data: antes } = await supabase.from("producto_pais_decisiones").select("decision, motivo").eq("sku_id", skuId).eq("pais_id", pais.id).maybeSingle();

    const por = usuario.nombre ?? usuario.email ?? null;
    const en = new Date().toISOString();
    if (decision === null) {
      const { error } = await supabase.from("producto_pais_decisiones").delete().eq("sku_id", skuId).eq("pais_id", pais.id);
      if (error) return { error: error.code === "42P01" ? "Falta correr la migración 0231 en Supabase." : "No se pudo quitar la decisión." };
    } else {
      const { error } = await supabase
        .from("producto_pais_decisiones")
        .upsert({ sku_id: skuId, pais_id: pais.id, decision, motivo: texto || null, decidido_por: por, decidido_en: en }, { onConflict: "sku_id,pais_id" });
      if (error) return { error: error.code === "42P01" ? "Falta correr la migración 0231 en Supabase." : "No se pudo guardar la decisión." };
    }
    const nombrePais = PAISES_NAV.find((p) => p.codigo === codigoPais)?.nombre ?? codigoPais;
    await registrarAuditoria({
      accion: "decidir_producto_pais",
      entidad: "skus_maestros",
      entidadId: skuId,
      detalle: `${producto.nombre} en ${nombrePais}`,
      antes: { [nombrePais]: antes ? `${ETIQUETA[antes.decision as Decision]}${antes.motivo ? ` (${antes.motivo})` : ""}` : "Sin decidir" },
      despues: { [nombrePais]: decision ? `${ETIQUETA[decision]}${texto ? ` (${texto})` : ""}` : "Sin decidir" },
    });
    return { ok: true, por, en: en.slice(0, 10) };
  } catch {
    return { error: "No se pudo guardar la decisión." };
  }
}
