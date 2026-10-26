"use server";

// «Descubrir proveedores» (migración 0157): el panel pide la dirección de subida, la extensión lee el catálogo de Dropi del país
// desde su pestaña y lo sube, y aquí se resume por proveedor (`descubrir`) comparando con la foto de la lectura anterior. Leerlo
// lo pide quien tiene la extensión (por ahora, Hernán: `puedeActualizarDropi`); el resultado lo ve todo el que entra al módulo.

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { puedeActualizarDropi } from "@/lib/dropi-actualizar/partes";
import { descubrir, enlaceProveedor, fotoDe, type FotoCatalogo, type LecturaCatalogo } from "@/lib/scraping/descubrir";
import { createServiceClient } from "@/lib/supabase/server";

const BUCKET = "wms-compras";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Por ahora, México (la sesión de dropshipper que hay). */
const PAISES = ["mx"];
const RUTA = "/scraping-proveedores/proveedores";

const falta = (m: string) => /does not exist|schema cache/i.test(m);

/** Empieza una lectura del catálogo de un país: la anota y devuelve la dirección de subida para la extensión (vale 2 horas). */
export async function empezarDescubrir(pais: string): Promise<{ error?: string; id?: string; subida?: Record<string, string> }> {
  const usuario = await requireModuloEscritura("scraping-proveedores");
  if (!puedeActualizarDropi(usuario)) return { error: "Leer el catálogo todavía no está disponible para tu usuario." };
  if (!PAISES.includes(pais)) return { error: "Ese país todavía no se puede leer." };
  const supabase = createServiceClient();
  const { data: enCurso } = await supabase.from("scraping_descubrir_lecturas").select("id").eq("estado", "corriendo").gte("inicio", new Date(Date.now() - 40 * 60000).toISOString()).limit(1).maybeSingle();
  if (enCurso) return { error: "Ya hay una lectura del catálogo en curso." };
  const { data, error } = await supabase.from("scraping_descubrir_lecturas").insert({ pais, pedida_por: usuario.nombre || usuario.email }).select("id").single();
  if (error || !data) return { error: error && falta(error.message) ? "Falta correr en Supabase la migración 0157." : "No se pudo empezar la lectura." };
  const { data: s, error: e } = await supabase.storage.from(BUCKET).createSignedUploadUrl(`tmp-dropi-panel/${data.id}/catalogo.json`, { upsert: true });
  if (e || !s) return { error: `No se pudo preparar la subida (${e?.message ?? "sin detalle"}).` };
  return { id: data.id as string, subida: { catalogo: s.signedUrl } };
}

/** Resume lo que subió la extensión, lo guarda y deja la foto para la próxima lectura. */
export async function procesarDescubrir(id: string): Promise<{ error?: string; proveedores?: number; productos?: number; conAnterior?: boolean }> {
  await requireModuloEscritura("scraping-proveedores");
  if (!UUID.test(id)) return { error: "Lectura no válida." };
  const supabase = createServiceClient();
  const { data: lectura } = await supabase.from("scraping_descubrir_lecturas").select("id, pais, estado").eq("id", id).maybeSingle();
  if (!lectura || lectura.estado !== "corriendo") return { error: "Esa lectura ya terminó." };
  const temporal = `tmp-dropi-panel/${id}/catalogo.json`;
  const fallar = async (error: string) => {
    await supabase.from("scraping_descubrir_lecturas").update({ estado: "fallida", error: error.slice(0, 300), fin: new Date().toISOString() }).eq("id", id);
    await supabase.storage.from(BUCKET).remove([temporal]);
    return { error };
  };
  try {
    const { data: archivo, error: e } = await supabase.storage.from(BUCKET).download(temporal);
    if (e || !archivo) return fallar("No llegó la lectura del catálogo.");
    const l = JSON.parse(Buffer.from(await archivo.arrayBuffer()).toString("utf8")) as LecturaCatalogo;
    if (!Array.isArray(l.productos) || !l.productos.length) return fallar("La lectura no trae productos.");
    const rutaFoto = `scraping-catalogo/${lectura.pais}.json`;
    const previa = await supabase.storage.from(BUCKET).download(rutaFoto);
    const anterior = previa.data ? (JSON.parse(Buffer.from(await previa.data.arrayBuffer()).toString("utf8")) as FotoCatalogo) : null;
    const resumen = descubrir(l, anterior);
    for (let i = 0; i < resumen.length; i += 500) {
      const { error: ei } = await supabase.from("scraping_descubrir_proveedores").insert(
        resumen.slice(i, i + 500).map((p) => ({
          lectura_id: id,
          pais: lectura.pais,
          dropi_proveedor_id: p.dropiId,
          nombre: p.nombre,
          productos: p.productos,
          nuevos_30: p.nuevos30,
          stock: p.stock,
          ventas_estimadas: p.ventas,
          con_ventas: p.conVentas,
          destacados: p.destacados,
        })),
      );
      if (ei) return fallar(`No se pudo guardar el resumen (${ei.message}).`);
    }
    await supabase.storage.from(BUCKET).upload(rutaFoto, new Blob([JSON.stringify(fotoDe(l))], { type: "application/json" }), { upsert: true, contentType: "application/json" });
    await supabase.storage.from(BUCKET).remove([temporal]);
    await supabase
      .from("scraping_descubrir_lecturas")
      .update({ estado: "lista", productos: l.productos.length, proveedores: resumen.length, con_anterior: !!anterior, fin: new Date().toISOString() })
      .eq("id", id);
    revalidatePath(RUTA);
    return { proveedores: resumen.length, productos: l.productos.length, conAnterior: !!anterior };
  } catch (e) {
    return fallar(e instanceof Error ? e.message : String(e));
  }
}

/** Anota que la lectura falló en la pestaña de Dropi (la sesión venció, Dropi respondió con error…). */
export async function fallarDescubrir(id: string, error: string): Promise<void> {
  await requireModuloEscritura("scraping-proveedores");
  if (!UUID.test(id)) return;
  const supabase = createServiceClient();
  await supabase.from("scraping_descubrir_lecturas").update({ estado: "fallida", error: String(error).slice(0, 300), fin: new Date().toISOString() }).eq("id", id).eq("estado", "corriendo");
  await supabase.storage.from(BUCKET).remove([`tmp-dropi-panel/${id}/catalogo.json`]);
  revalidatePath(RUTA);
}

/** «Seguir»: agrega un proveedor descubierto a los que se siguen (con su primera búsqueda pedida). */
export async function seguirProveedor(pais: string, dropiId: number, nombre: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("scraping-proveedores");
  if (!PAISES.includes(pais) || !Number.isInteger(dropiId) || dropiId <= 0) return { error: "Proveedor no válido." };
  const limpio = String(nombre ?? "").trim().slice(0, 200) || `Proveedor ${dropiId}`;
  const supabase = createServiceClient();
  const { data: existe } = await supabase.from("scraping_proveedores").select("id, activo").eq("pais", pais).eq("dropi_id", dropiId).maybeSingle();
  if (existe?.activo) return { error: "Ese proveedor ya se sigue." };
  let provId = existe?.id as string | undefined;
  if (existe) await supabase.from("scraping_proveedores").update({ activo: true }).eq("id", existe.id);
  else {
    const { data, error } = await supabase
      .from("scraping_proveedores")
      .insert({ nombre: limpio, pais, dropi_url: enlaceProveedor(pais, dropiId, limpio), dropi_id: dropiId, creado_por: usuario.id })
      .select("id")
      .single();
    if (error || !data) return { error: "No se pudo agregar el proveedor." };
    provId = data.id as string;
  }
  await supabase.from("scraping_busquedas").insert({ proveedor_id: provId, estado: "pendiente", pedida_por: usuario.id });
  await registrarAuditoria({ accion: "agregar_proveedor_scraping", entidad: "scraping_proveedores", entidadId: provId!, detalle: `${limpio} (desde «Descubrir proveedores»)` });
  revalidatePath(RUTA);
  revalidatePath("/scraping-proveedores");
  return {};
}
