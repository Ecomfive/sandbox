"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";
import { SIN_MIGRACION_TP } from "@/lib/finanzas/cargar-precio-transferencia";
import { BASES_COSTO, leerPoliticaTP, politicaAJson, validarPoliticaTP, validarReglaTP } from "@/lib/finanzas/precio-transferencia";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "estado-resultados";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidar() {
  revalidatePath("/estado-resultados");
  revalidatePath("/estado-resultados/precio-transferencia");
}

const fallo = (e: unknown, texto: string) => ({ error: e instanceof Error ? e.message : texto });

/** Guarda la política: margen por defecto, costo base, importadora, tiendas que le compran y tipos de mercancía. */
export async function guardarPoliticaTP(formData: FormData): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    const acceso = await sinAccesoTodaLaEmpresa();
    if (acceso) return { error: acceso };
    const tiendas = formData.getAll("tiendas").map(String);
    const tipos = formData.getAll("tipos").map(String);
    const p = validarPoliticaTP({
      margen: String(formData.get("margen") ?? ""),
      base: formData.get("base"),
      proveedora: String(formData.get("proveedora") ?? ""),
      // Todas marcadas = sin lista (las tiendas nuevas entran solas).
      tiendas: formData.get("todas_tiendas") === "1" ? null : tiendas,
      tipos: formData.get("tipos_predeterminados") === "1" ? null : tipos,
    });
    if ("error" in p) return p;
    const supabase = createServiceClient();
    const ids = [...(p.unidadProveedoraId ? [p.unidadProveedoraId] : []), ...(p.tiendas ?? [])];
    const [unidades, tiposR, previo] = await Promise.all([
      ids.length ? supabase.from("fin_unidades").select("id, nombre").in("id", ids) : Promise.resolve({ data: [], error: null }),
      p.tiposMercancia ? supabase.from("fin_tipos").select("nombre").eq("seccion", "costo_ventas").in("nombre", p.tiposMercancia) : Promise.resolve({ data: [], error: null }),
      supabase.from("fin_config").select("valor").eq("clave", "precio_transferencia").maybeSingle(),
    ]);
    const nombres = new Map(((unidades.data ?? []) as { id: string; nombre: string }[]).map((u) => [u.id, u.nombre]));
    if (ids.some((id) => !nombres.has(id))) return { error: "Alguna tienda ya no existe." };
    if (p.tiposMercancia && (tiposR.data ?? []).length !== p.tiposMercancia.length) return { error: "Algún tipo de mercancía no es de costo de ventas." };
    const antes = leerPoliticaTP(previo.data?.valor);
    const { error } = await supabase.from("fin_config").upsert({ clave: "precio_transferencia", valor: politicaAJson(p) }, { onConflict: "clave" });
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    const vista = (x: typeof p) => ({
      "Margen por defecto": `${x.margenPct} %`,
      "Costo base": BASES_COSTO.find((b) => b.clave === x.base)!.etiqueta,
      Importadora: x.unidadProveedoraId ? (nombres.get(x.unidadProveedoraId) ?? "Elegida") : "ECOMFIVE",
      Tiendas: x.tiendas ? `${x.tiendas.length} elegidas` : "Todas",
      "Tipos de mercancía": x.tiposMercancia ? x.tiposMercancia.join(", ") : "Los de siempre",
    });
    await registrarAuditoria({ accion: "guardar_precio_transferencia", entidad: "fin_config", entidadId: "precio_transferencia", antes: vista(antes), despues: vista(p) });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo guardar la política.");
  }
}

/** Un margen propio para un producto o una categoría (si ya había uno, se reemplaza). */
export async function crearReglaTP(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const acceso = await sinAccesoTodaLaEmpresa();
    if (acceso) return { error: acceso };
    const r = validarReglaTP({ alcance: formData.get("alcance"), clave: formData.get("clave"), margen: String(formData.get("margen") ?? "") });
    if ("error" in r) return r;
    const supabase = createServiceClient();
    const { data: existe, error: e1 } = await supabase.from("fin_precio_transferencia_reglas").select("id, clave, margen_pct").eq("alcance", r.alcance).ilike("clave", r.clave.replace(/[%_\\]/g, (c) => `\\${c}`)).maybeSingle();
    if (e1) return { error: SIN_MIGRACION_TP };
    const ahora = new Date().toISOString();
    const { error } = existe
      ? await supabase.from("fin_precio_transferencia_reglas").update({ margen_pct: r.margenPct, actualizado_en: ahora }).eq("id", existe.id)
      : await supabase.from("fin_precio_transferencia_reglas").insert({ alcance: r.alcance, clave: r.clave, margen_pct: r.margenPct, creado_por: usuario.id });
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    await registrarAuditoria({
      accion: "crear_regla_precio_transferencia",
      entidad: "fin_precio_transferencia_reglas",
      entidadId: existe?.id ? String(existe.id) : undefined,
      detalle: `${r.alcance === "producto" ? "Producto" : "Categoría"} «${r.clave}»`,
      antes: existe ? { Margen: `${Number(existe.margen_pct)} %` } : undefined,
      despues: { Margen: `${r.margenPct} %` },
    });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo guardar el margen.");
  }
}

export async function eliminarReglaTP(id: string): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    const acceso = await sinAccesoTodaLaEmpresa();
    if (acceso) return { error: acceso };
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Margen inválido." };
    const supabase = createServiceClient();
    const { data: antes, error: e1 } = await supabase.from("fin_precio_transferencia_reglas").select("alcance, clave, margen_pct").eq("id", id).maybeSingle();
    if (e1) return { error: SIN_MIGRACION_TP };
    if (!antes) return { error: "Ese margen ya no existe." };
    const { error } = await supabase.from("fin_precio_transferencia_reglas").delete().eq("id", id);
    if (error) return { error: `No se pudo quitar: ${error.message}` };
    await registrarAuditoria({
      accion: "eliminar_regla_precio_transferencia",
      entidad: "fin_precio_transferencia_reglas",
      entidadId: id,
      detalle: `${antes.alcance === "producto" ? "Producto" : "Categoría"} «${antes.clave}»`,
      antes: { Margen: `${Number(antes.margen_pct)} %` },
    });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo quitar el margen.");
  }
}
