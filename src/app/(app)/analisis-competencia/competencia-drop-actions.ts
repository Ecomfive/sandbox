"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { guardarCatalogo, type LecturaCatalogo } from "@/lib/competencia/guardar-catalogo";
import { huellasCatalogo } from "@/lib/competencia/huellas-catalogo";
import { createServiceClient } from "@/lib/supabase/server";

// «Drop: competencia» (24 nov 2026, pedido de Hernán): la extensión (0.8.4, lector `competencia_drop`) lee el Catálogo de Drop con la sesión de dropshipper,
// en un perfil aparte de Chrome, y lo sube aquí; se guarda igual que la lectura que antes se hacía con scripts (guardarCatalogo: cambios, iguales y alertas).

const BUCKET = "wms-compras";
// La misma carpeta temporal de «Actualizar datos»: la extensión solo acepta subir ahí.
const CARPETA = "tmp-dropi-panel";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODULO = "analisis-competencia";

/** Da la dirección firmada donde la extensión sube el catálogo (vale 2 horas). */
export async function empezarCompetenciaDrop(): Promise<{ id: string; subida: { competenciadrop: string } } | { error: string }> {
  await requireModuloEscritura(MODULO);
  const id = crypto.randomUUID();
  const { data, error } = await createServiceClient().storage.from(BUCKET).createSignedUploadUrl(`${CARPETA}/${id}/competenciadrop.json`, { upsert: true });
  if (error || !data) return { error: "No se pudo preparar la subida." };
  return { id, subida: { competenciadrop: data.signedUrl } };
}

/** Guarda lo que subió la extensión y borra el archivo temporal. */
export async function procesarCompetenciaDrop(id: string): Promise<{ resumen: string } | { error: string }> {
  const u = await requireModuloEscritura(MODULO);
  if (!UUID.test(String(id))) return { error: "Lectura no válida." };
  const supabase = createServiceClient();
  const ruta = `${CARPETA}/${id}/competenciadrop.json`;
  const { data: archivo, error } = await supabase.storage.from(BUCKET).download(ruta);
  if (error || !archivo) return { error: "No llegó la lectura de Drop al sistema." };
  let lectura: LecturaCatalogo | null = null;
  try {
    const x = JSON.parse(await archivo.text());
    if (x && x.tipo === "competencia-drop" && Array.isArray(x.productos)) lectura = x as LecturaCatalogo;
  } catch {
    lectura = null;
  }
  if (!lectura) return { error: "La lectura de Drop llegó vacía o con otro formato." };
  try {
    // Las fotos nuevas se miden hasta 3 minutos: lo que no alcance, en la próxima lectura.
    const r = await guardarCatalogo(supabase, lectura, huellasCatalogo(supabase, Date.now() + 180_000));
    await supabase.storage.from(BUCKET).remove([ruta]);
    const resumen = `${r.productos} productos de ${r.proveedores} proveedores · ${r.nuestros} nuestros · ${r.iguales} iguales a uno nuestro · ${r.nuevos} nuevos · ${r.alertas} alertas`;
    await registrarAuditoria({ accion: "leer_competencia_drop", entidad: "drop_competencia_busquedas", detalle: `${u.nombre || u.email}: ${resumen}` });
    revalidatePath("/analisis-competencia");
    revalidatePath("/publicaciones-drop");
    revalidatePath("/actualizar-datos");
    return { resumen };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar la lectura." };
  }
}
