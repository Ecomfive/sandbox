"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModulo } from "@/lib/auth";
import { puedeUnirProductos } from "@/lib/permisos/unir-productos";
import {
  elegirConservado,
  emparejarVariantes,
  lineasDeInforme,
  lineasUnidas,
  mensajeErrorUnir,
  type CandidatoUnir,
  type InformeUnion,
  type ParejasUnion,
  type ProductoUnido,
  type ResumenUnion,
  type VarianteUnion,
} from "@/lib/wms/unir-productos";

// Unir dos productos duplicados desde la ficha (28 oct 2026). Solo un administrador o quien tenga el módulo «Unir productos duplicados» (9 nov 2026,
// por persona; ver `puedeUnirProductos`): de entrada se queda el más viejo y, desde el 23 nov 2026, la persona puede elegir el otro (Lentes Smart, el
// más viejo, era el que sobraba). La base (`wms_unir_productos`, migración 0121) pasa al que queda todo lo vinculado al otro y borra el sobrante en una
// sola transacción, o se niega y no cambia nada. Con `p_aplicar = false` solo simula. Con variantes (23 nov 2026, migración 0355) se usa
// `wms_unir_productos_variantes`: cada variante del que se va se une con su pareja del que queda (se propone por graduación o nombre) o pasa como nueva.

const MODULO = "producto";
const SIN_PERMISO = "No tienes permiso para unir productos.";
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

/** Los productos que se pueden unir con el abierto: del mismo tipo (simple o combo), que no sean variantes y distintos de él. Busca por nombre, SKU o N.º. */
export async function buscarParaUnir(idActual: string, consulta: string): Promise<{ candidatos: CandidatoUnir[] } | { error: string }> {
  const usuario = await requireModulo(MODULO);
  if (!puedeUnirProductos(usuario)) return { error: SIN_PERMISO };
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

/** Lo que la persona elige al unir: cuál se queda (uno de los dos; sin elegir, el más viejo) y las parejas de variantes (sin elegir, las propuestas). */
export interface OpcionesUnion {
  conservar?: string | null;
  pares?: Record<string, string | null> | null;
}

type Preparado = { error: string } | { supabase: SupabaseClient; conservar: FilaSku; eliminar: FilaSku };

/** Lee los dos productos de la base y decide cuál se queda: el elegido (si es uno de los dos) o el más viejo. */
async function preparar(a: unknown, b: unknown, conservarId?: unknown): Promise<Preparado> {
  if (!ES_UUID(a) || !ES_UUID(b) || a === b) return { error: "Elige dos productos distintos." };
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("skus_maestros").select(COLUMNAS).in("id", [a, b]);
  if (error) return { error: "No se pudieron leer los productos." };
  const filas = (data ?? []) as FilaSku[];
  if (filas.length !== 2) return { error: "Uno de los productos ya no existe." };
  const elegido = filas.find((f) => f.id === conservarId);
  if (elegido) return { supabase, conservar: elegido, eliminar: filas.find((f) => f.id !== elegido.id)! };
  return { supabase, ...elegirConservado(filas[0], filas[1]) };
}

type Informe = { conservado: string; eliminado: string; movido: Record<string, unknown>; simulacion: boolean } & InformeUnion;

/** Las variantes de los dos productos y las parejas: las que eligió la persona (si son válidas) o las propuestas. null si ninguno tiene variantes. */
async function parejasDe(supabase: SupabaseClient, conservar: FilaSku, eliminar: FilaSku, elegidas?: Record<string, string | null> | null): Promise<ParejasUnion | null> {
  const { data } = await supabase.from("skus_maestros").select("id, codigo, nombre, padre_id").in("padre_id", [conservar.id, eliminar.id]).order("codigo");
  const filas = (data ?? []) as (VarianteUnion & { padre_id: string })[];
  if (!filas.length) return null;
  const queda = filas.filter((f) => f.padre_id === conservar.id).map(({ id, codigo, nombre }) => ({ id, codigo, nombre }));
  const va = filas.filter((f) => f.padre_id === eliminar.id).map(({ id, codigo, nombre }) => ({ id, codigo, nombre }));
  const propuestas = emparejarVariantes(queda, conservar.codigo, va, eliminar.codigo);
  const idsQueda = new Set(queda.map((v) => v.id));
  const usadas = new Set<string>();
  return {
    queda,
    va: va.map((v) => {
      // Lo que eligió la persona vale si la pareja es una variante del que queda (o «pasa como nueva») y no se repite.
      const pedida = elegidas && Object.prototype.hasOwnProperty.call(elegidas, v.id) ? elegidas[v.id] : propuestas[v.id];
      const pareja = pedida && idsQueda.has(pedida) && !usadas.has(pedida) ? pedida : null;
      if (pareja) usadas.add(pareja);
      return { ...v, pareja };
    }),
  };
}

async function llamarUnion(
  supabase: SupabaseClient,
  conservar: FilaSku,
  eliminar: FilaSku,
  aplicar: boolean,
  parejas: ParejasUnion | null,
): Promise<{ error: string } | { informe: Informe }> {
  const { data, error } = parejas
    ? await supabase.rpc("wms_unir_productos_variantes", {
        p_conservar: conservar.id,
        p_eliminar: eliminar.id,
        p_pares: Object.fromEntries(parejas.va.filter((v) => v.pareja).map((v) => [v.id, v.pareja])),
        p_aplicar: aplicar,
      })
    : await supabase.rpc("wms_unir_productos", { p_conservar: conservar.id, p_eliminar: eliminar.id, p_aplicar: aplicar });
  if (error) {
    if (error.code === "42883" || error.code === "PGRST202") return { error: parejas ? "Falta correr en Supabase la migración 0355 (unir productos con variantes)." : "Falta correr en Supabase la migración 0121." };
    return { error: mensajeErrorUnir(error.message) };
  }
  return { informe: data as Informe };
}

/** Qué pasaría al unir los dos productos, sin cambiar nada: cuál queda, cuál se va, qué pasa al que queda y, con variantes, sus parejas. */
export async function simularUnion(idA: string, idB: string, opciones: OpcionesUnion = {}): Promise<ResumenUnion | { error: string }> {
  const usuario = await requireModulo(MODULO);
  if (!puedeUnirProductos(usuario)) return { error: SIN_PERMISO };
  const p = await preparar(idA, idB, opciones?.conservar);
  if ("error" in p) return p;
  const parejas = await parejasDe(p.supabase, p.conservar, p.eliminar, opciones?.pares);
  const r = await llamarUnion(p.supabase, p.conservar, p.eliminar, false, parejas);
  if ("error" in r) return r;
  return { conservar: aProducto(p.conservar), eliminar: aProducto(p.eliminar), lineas: parejas ? lineasDeInforme(r.informe) : lineasUnidas(r.informe.movido), variantes: parejas };
}

/**
 * Une los dos productos de verdad: el más viejo se queda y recibe todo lo del otro, que se elimina. Queda en la actividad del que se
 * queda, a nombre de quien lo hizo. La foto del eliminado se borra de Storage si ningún producto la usa (si el que queda no tenía foto,
 * la base se la pasa y no se borra).
 */
export async function unirProductos(idA: string, idB: string, opciones: OpcionesUnion = {}): Promise<ResumenUnion | { error: string }> {
  const usuario = await requireModulo(MODULO);
  if (!puedeUnirProductos(usuario)) return { error: SIN_PERMISO };
  const p = await preparar(idA, idB, opciones?.conservar);
  if ("error" in p) return p;
  const { supabase, conservar, eliminar } = p;
  const parejas = await parejasDe(supabase, conservar, eliminar, opciones?.pares);

  // Un margen de un minuto por si el reloj de este servidor y el de la base no marcan lo mismo.
  const desde = new Date(Date.now() - 60_000).toISOString();
  const r = await llamarUnion(supabase, conservar, eliminar, true, parejas);
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
  return { conservar: aProducto(conservar), eliminar: aProducto(eliminar), lineas: parejas ? lineasDeInforme(r.informe) : lineasUnidas(r.informe.movido), variantes: parejas };
}
