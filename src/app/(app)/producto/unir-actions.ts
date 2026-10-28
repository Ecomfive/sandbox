"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModuloEscritura } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { elegirConservado, lineasUnidas, mensajeErrorUnir, type CandidatoUnir, type ProductoUnido, type ResumenUnion } from "@/lib/wms/unir-productos";

// Unir dos productos duplicados desde la ficha (28 oct 2026). Solo un administrador con edición en Producto: el que se queda es siempre
// el más viejo (lo decide el servidor, no el navegador) y la base (`wms_unir_productos`, migración 0121) pasa a él todo lo vinculado al
// otro y borra el sobrante en una sola transacción, o se niega y no cambia nada. Con `p_aplicar = false` solo simula.

const MODULO = "producto";
const SOLO_ADMIN = "Solo un administrador puede unir productos.";
const ES_UUID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-fA-F-]{36}$/.test(v);
const BUCKET_FOTOS = "wms-productos";
const PREFIJO_FOTOS = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_FOTOS}/`;
const COLUMNAS = "id, numero, codigo, nombre, clase, tipo, creado_en, foto_url, padre_id";

interface FilaSku {
  id: string;
  numero: number | null;
  codigo: string;
  nombre: string;
  clase: string;
  tipo: string;
  creado_en: string;
  foto_url: string | null;
  padre_id: string | null;
}

const aProducto = (f: FilaSku): ProductoUnido => ({
  id: f.id,
  numero: f.numero ?? null,
  codigo: f.codigo,
  nombre: f.nombre,
  clase: f.clase,
  tipo: f.tipo,
  creado: String(f.creado_en).slice(0, 10),
  foto: f.foto_url ?? null,
});

/** Los productos que se pueden unir con el abierto: del mismo tipo (simple o combo), sin variantes y distintos de él. Busca por nombre, SKU o N.º. */
export async function buscarParaUnir(idActual: string, consulta: string): Promise<{ candidatos: CandidatoUnir[] } | { error: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!esAdministrador(usuario)) return { error: SOLO_ADMIN };
  if (!ES_UUID(idActual)) return { error: "Producto no válido." };
  const t = String(consulta ?? "").trim().slice(0, 80);
  if (t.length < 2) return { candidatos: [] };

  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("skus_maestros").select("id, tipo, padre_id").eq("id", idActual).maybeSingle();
  if (!actual) return { error: "El producto ya no existe." };
  if (actual.padre_id) return { error: "Una variante no se une con otro producto." };

  // El texto de la persona va como valor de un filtro (nunca armado dentro de un `.or()`), y sus comodines de LIKE se escapan.
  const patron = `%${t.replace(/[\\%_]/g, "\\$&")}%`;
  const numero = /^#?\d{1,7}$/.test(t) ? Number(t.replace("#", "")) : null;
  const base = () => supabase.from("skus_maestros").select(COLUMNAS).is("padre_id", null).eq("tipo", actual.tipo).neq("id", idActual).limit(15);
  const consultas = [base().ilike("nombre", patron), base().ilike("codigo", patron)];
  if (numero !== null) consultas.push(base().eq("numero", numero));
  const resultados = await Promise.all(consultas);
  if (resultados.some((r) => r.error)) return { error: "No se pudo buscar." };

  const vistos = new Map<string, CandidatoUnir>();
  for (const r of resultados) for (const f of (r.data ?? []) as FilaSku[]) if (!vistos.has(f.id)) vistos.set(f.id, aProducto(f));
  const candidatos = [...vistos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).slice(0, 15);
  return { candidatos };
}

type Preparado = { error: string } | { supabase: SupabaseClient; conservar: FilaSku; eliminar: FilaSku };

/** Lee los dos productos de la base y decide cuál se queda (el más viejo). */
async function preparar(a: unknown, b: unknown): Promise<Preparado> {
  if (!ES_UUID(a) || !ES_UUID(b) || a === b) return { error: "Elige dos productos distintos." };
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("skus_maestros").select(COLUMNAS).in("id", [a, b]);
  if (error) return { error: "No se pudieron leer los productos." };
  const filas = (data ?? []) as FilaSku[];
  if (filas.length !== 2) return { error: "Uno de los productos ya no existe." };
  return { supabase, ...elegirConservado(filas[0], filas[1]) };
}

type Informe = { conservado: string; eliminado: string; movido: Record<string, unknown>; simulacion: boolean };

async function llamarUnion(supabase: SupabaseClient, conservar: FilaSku, eliminar: FilaSku, aplicar: boolean): Promise<{ error: string } | { informe: Informe }> {
  const { data, error } = await supabase.rpc("wms_unir_productos", { p_conservar: conservar.id, p_eliminar: eliminar.id, p_aplicar: aplicar });
  if (error) {
    if (error.code === "42883" || error.code === "PGRST202") return { error: "Falta correr en Supabase la migración 0121." };
    return { error: mensajeErrorUnir(error.message) };
  }
  return { informe: data as Informe };
}

/** Qué pasaría al unir los dos productos, sin cambiar nada: cuál queda, cuál se va y qué pasa al que queda. */
export async function simularUnion(idA: string, idB: string): Promise<ResumenUnion | { error: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!esAdministrador(usuario)) return { error: SOLO_ADMIN };
  const p = await preparar(idA, idB);
  if ("error" in p) return p;
  const r = await llamarUnion(p.supabase, p.conservar, p.eliminar, false);
  if ("error" in r) return r;
  return { conservar: aProducto(p.conservar), eliminar: aProducto(p.eliminar), lineas: lineasUnidas(r.informe.movido) };
}

/**
 * Une los dos productos de verdad: el más viejo se queda y recibe todo lo del otro, que se elimina. Queda en la actividad del que se
 * queda, a nombre de quien lo hizo. La foto del eliminado se borra de Storage si ningún producto la usa (si el que queda no tenía foto,
 * la base se la pasa y no se borra).
 */
export async function unirProductos(idA: string, idB: string): Promise<ResumenUnion | { error: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!esAdministrador(usuario)) return { error: SOLO_ADMIN };
  const p = await preparar(idA, idB);
  if ("error" in p) return p;
  const { supabase, conservar, eliminar } = p;

  // Un margen de un minuto por si el reloj de este servidor y el de la base no marcan lo mismo.
  const desde = new Date(Date.now() - 60_000).toISOString();
  const r = await llamarUnion(supabase, conservar, eliminar, true);
  if ("error" in r) return r;

  // La base anota la unión como «Unir productos» (también la corre quien la usa desde el editor SQL): aquí se pone el nombre de quien
  // la hizo y se deja solo el detalle («Se unió X (nombre)»), sin el antes/después de la base, que en la actividad se lee confuso.
  // Es solo para saber quién fue; si falla, la unión ya está hecha.
  await supabase
    .from("historial_auditoria")
    .update({ usuario_id: usuario.id ?? null, usuario_nombre: usuario.nombre ?? usuario.email ?? "Unir productos", antes: null, despues: null })
    .eq("accion", "unir_productos")
    .eq("entidad", "skus_maestros")
    .eq("entidad_id", conservar.id)
    .eq("usuario_nombre", "Unir productos")
    .gte("creado_en", desde);

  if (eliminar.foto_url && eliminar.foto_url.startsWith(PREFIJO_FOTOS)) {
    const { count } = await supabase.from("skus_maestros").select("id", { count: "exact", head: true }).eq("foto_url", eliminar.foto_url);
    if (!count) await supabase.storage.from(BUCKET_FOTOS).remove([eliminar.foto_url.slice(PREFIJO_FOTOS.length)]);
  }

  // Lo que se movió estaba en estos módulos.
  revalidatePath("/producto");
  revalidatePath("/publicaciones-dropi");
  revalidatePath("/productos-test");
  revalidatePath("/filtro-productos");
  revalidatePath("/compras", "layout");
  return { conservar: aProducto(conservar), eliminar: aProducto(eliminar), lineas: lineasUnidas(r.informe.movido) };
}
