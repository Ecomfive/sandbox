"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { BODEGA_DE_PLATAFORMA } from "@/lib/wms/cuadro-plataformas";
import { PAISES_CON_RECEPCION } from "@/lib/wms/recepcion";
import { ETIQUETA_PLATAFORMA, type Plataforma } from "@/lib/wms/stock-plataformas";
import { leerStockPlataformas } from "../datos-plataformas";

/**
 * Toma el corte de una plataforma que no lo tiene: guarda lo que dice su última lectura, con la fecha de esa lectura, y desde ahí empieza el cuadro. Solo un administrador, y una
 * sola vez por plataforma: un corte nuevo borraría las diferencias que ya existen.
 */
export async function tomarCorte(plataforma: Plataforma): Promise<{ error?: string; productos?: number }> {
  const usuario = await requireModuloEscritura("inventario");
  if (!esAdministrador(usuario)) return { error: "Solo un administrador puede tomar el corte." };
  if (!(plataforma in BODEGA_DE_PLATAFORMA)) return { error: "Plataforma no válida." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (!PAISES_CON_RECEPCION.includes(pais.codigo)) return { error: "El cuadro por ahora es solo para Costa Rica." };
  const { data: bodega } = await supabase.from("wms_bodegas").select("id").eq("pais_id", pais.id).eq("codigo", BODEGA_DE_PLATAFORMA[plataforma]).maybeSingle();
  if (!bodega) return { error: "Esa plataforma no tiene bodega en este país." };
  const { count } = await supabase.from("wms_cortes_externa").select("id", { count: "exact", head: true }).eq("bodega_id", bodega.id);
  if (count) return { error: "Esta plataforma ya tiene corte." };
  const { porProducto, lecturas, fallaron } = await leerStockPlataformas(supabase, pais.id);
  const fecha = lecturas[plataforma]?.slice(0, 10);
  if (fallaron || !fecha) return { error: "No se pudo leer la plataforma: no se tomó el corte." };
  const filas = [...porProducto].flatMap(([sku, s]) =>
    s[plataforma] > 0 ? [{ bodega_id: bodega.id, fecha, sku_maestro_id: sku, nombre: s.lineas.find((l) => l.plataforma === plataforma)?.nombre ?? "Producto", cantidad: s[plataforma], origen: "manual" }] : [],
  );
  if (!filas.length) return { error: "La plataforma no tiene unidades: no hay nada que guardar." };
  const { error } = await supabase.from("wms_cortes_externa").insert(filas);
  if (error) return { error: "No se pudo guardar el corte." };
  await registrarAuditoria({ accion: "corte_plataforma", entidad: "wms_bodegas", entidadId: bodega.id, detalle: `Corte de ${ETIQUETA_PLATAFORMA[plataforma]} del ${fecha}: ${filas.length} productos · ${pais.nombre}` });
  revalidatePath("/inventario/cuadro");
  return { productos: filas.length };
}
