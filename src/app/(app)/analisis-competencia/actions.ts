"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { getPlataformaActual } from "@/lib/plataforma-actual";
import { leerVerificacion } from "@/lib/imagen/ia-imagen";
import { MAX_POR_PEDIDO, pedidoCompararCompetencia } from "@/lib/competencia/verificar-ia";
import { pedirIA, proveedorTexto } from "@/lib/publicaciones/ia/proveedor";
import { cargarDatosCompetencia } from "./datos-competencia";
import type { ProductoC } from "./def-competencia";
import { createServiceClient } from "@/lib/supabase/server";
import { PAIS_DE_EFFI, sincronizarEffi, type ResumenLecturaEffi } from "@/lib/effi/sincronizar";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Marca alertas como vistas: las que se pasan o, sin ids, todas las del país y la plataforma de la barra. */
export async function marcarAlertasVistas(ids?: string[]): Promise<{ error?: string }> {
  await requireModuloEscritura("analisis-competencia");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const plataforma = await getPlataformaActual(pais.codigo);
  const tabla = plataforma === "dropi" ? "competencia_alertas" : `${plataforma}_competencia_alertas`;
  let q = supabase.from(tabla).update({ vista: true }).eq("pais_id", pais.id).eq("vista", false);
  if (ids) {
    if (!ids.length || ids.length > 500 || !ids.every((i) => UUID.test(i))) return { error: "Selección no válida." };
    q = q.in("id", ids);
  }
  const { error } = await q;
  if (error) return { error: "No se pudieron marcar las alertas." };
  revalidatePath("/analisis-competencia");
  return {};
}

/**
 * «Actualizar nuestros precios desde Effi» (7 nov 2026, pedido de Hernán): la misma lectura de la API que corre cada día, que además pone al día nuestros precios en el análisis. Los de la
 * competencia no están en la API: siguen llegando con la lectura del catálogo. Solo consulta Effi.
 */
export async function actualizarPreciosEffi(): Promise<{ resumen?: ResumenLecturaEffi; error?: string }> {
  await requireModuloEscritura("analisis-competencia");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (pais.codigo !== PAIS_DE_EFFI) return { error: "Effi es de Costa Rica: elige ese país arriba." };
  try {
    const resumen = await sincronizarEffi(supabase);
    revalidatePath("/analisis-competencia", "layout");
    return { resumen };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer Effi." };
  }
}

/** Cuántos productos nuestros (con sus dudosos) revisa la IA en cada pulsación: así la acción termina a tiempo. */
const POR_TANDA = 6;

/**
 * La IA con visión revisa los pares dudosos del país y la plataforma de la barra (7 nov 2026, pedido de Hernán: «también debes tomar en cuenta las fotos»): por cada
 * producto nuestro, sus dudosos con foto, y guarda el veredicto de cada par (migración 0246). Una tanda por pulsación; lo que queda se revisa con la siguiente.
 */
export async function revisarDudososConIA(): Promise<{ error: string } | { revisados: number; mismos: number; parecidos: number; distintos: number; quedan: number }> {
  const usuario = await requireModuloEscritura("analisis-competencia");
  if (!proveedorTexto()) return { error: "No hay una IA conectada (la clave OPENAI_API_KEY o ANTHROPIC_API_KEY en Vercel)." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const plataforma = await getPlataformaActual(pais.codigo);
  const datos = await cargarDatosCompetencia(supabase, pais, plataforma);
  if (!datos) return { error: "No se pudo cargar el análisis." };
  const porId = new Map(datos.productos.map((p) => [p.id, p]));
  const grupos = new Map<string, ProductoC[]>();
  for (const p of datos.productos) {
    if (!p.dudosoDe || p.revision || p.estado !== "activo" || !p.foto || !porId.get(p.dudosoDe)?.foto) continue;
    grupos.set(p.dudosoDe, [...(grupos.get(p.dudosoDe) ?? []), p]);
  }
  const tanda = [...grupos].slice(0, POR_TANDA);
  const consumo = { operacion: "competencia_dudosos", modulo: "analisis-competencia", usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email } };
  const filas: { plataforma: string; producto_id: string; nuestro_id: string; veredicto: string; motivo: string | null; creado_por: string }[] = [];
  let fallos = 0;
  await Promise.all(
    tanda.map(async ([nuestroId, otros]) => {
      const nuestro = porId.get(nuestroId)!;
      const lista = otros.slice(0, MAX_POR_PEDIDO);
      const r = await pedirIA(pedidoCompararCompetencia({ nombre: nuestro.nombre, foto: nuestro.foto! }, lista.map((o) => ({ nombre: o.nombre, foto: o.foto! }))), false, consumo);
      if (!("texto" in r)) return void fallos++;
      for (const v of leerVerificacion(r.texto, lista.length)) {
        filas.push({ plataforma, producto_id: lista[v.n - 1].id, nuestro_id: nuestroId, veredicto: v.veredicto, motivo: v.motivo, creado_por: usuario.id });
      }
    }),
  );
  if (!filas.length) return { error: fallos ? "La IA no respondió. Prueba de nuevo en un momento." : "No hay pares dudosos con foto para revisar." };
  const { error } = await supabase.from("competencia_verificaciones").upsert(filas, { onConflict: "plataforma,producto_id,nuestro_id" });
  if (error) return { error: "No se pudo guardar lo que dijo la IA (¿falta la migración 0246?)." };
  revalidatePath("/analisis-competencia");
  revalidatePath("/analisis-competencia/resumen");
  const cuenta = (v: string) => filas.filter((f) => f.veredicto === v).length;
  return { revisados: filas.length, mismos: cuenta("mismo"), parecidos: cuenta("parecido"), distintos: cuenta("distinto"), quedan: Math.max(0, datos.dudososSinRevisar - filas.length) };
}
