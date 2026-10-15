"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { coincidencias, interpretarTarjeta, totalDeResultados, validarLectura, type AnuncioBiblioteca, type ResultadoLecturaBiblioteca } from "@/lib/instagram/biblioteca-lectura";
import { decodificarLectura } from "@/lib/instagram/marcador";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "instagram";
const ENTIDAD = "instagram_capturas";

interface FilaCaptura {
  id: string;
  numero: number;
  titulo: string | null;
  metricas: Record<string, unknown> | null;
  pagina_destino: string | null;
}

/**
 * Guarda lo que el marcador leyó de la Biblioteca de anuncios de Meta (`#d=…` de `/instagram/biblioteca`): para cada captura que tenga
 * copy, cuenta los anuncios de **la misma página** con **el mismo copy** y lo deja en `metricas.anuncios_mismo_copy` (con el detalle
 * en `metricas.biblioteca`). Si la captura no tenía página de destino, toma la del botón de esos anuncios; si no tenía nombre de
 * página y todos los anuncios con ese copy son de una sola, toma ese nombre. Nada de lo que ya escribió una persona se pisa. Devuelve
 * el error como valor: en producción Next.js oculta el mensaje de una excepción.
 */
export async function guardarLecturaBiblioteca(fragmento: string): Promise<ResultadoLecturaBiblioteca> {
  await requireModuloEscritura(MODULO);
  if (typeof fragmento !== "string" || fragmento.length === 0 || fragmento.length > 700_000) return { error: "La lectura no es válida o es demasiado grande." };
  const valida = validarLectura(decodificarLectura(`#d=${fragmento}`));
  if ("error" in valida) return { error: valida.error };

  const anuncios = valida.lectura.t.map(interpretarTarjeta).filter((a): a is AnuncioBiblioteca => a !== null);
  if (anuncios.length === 0) return { error: "No se reconoció ningún anuncio en la Biblioteca. Ábrela con la búsqueda del botón de la ficha y vuelve a pulsar el marcador." };
  const resultados = totalDeResultados(valida.lectura.r);
  const suma = anuncios.reduce((s, a) => s + a.cantidad, 0);
  const parcial = resultados !== null && resultados > suma;

  const supabase = createServiceClient();
  const r = await traerTodasConError<FilaCaptura>((a, b) =>
    supabase.from(ENTIDAD).select("id, numero, titulo, metricas, pagina_destino").not("titulo", "is", null).order("numero", { ascending: true }).range(a, b),
  );
  if (r.error || !r.data) return { error: "No se pudieron leer las capturas." };

  const leidoEn = new Date().toISOString();
  const actualizadas: NonNullable<ResultadoLecturaBiblioteca["actualizadas"]> = [];
  const omitidas: NonNullable<ResultadoLecturaBiblioteca["omitidas"]> = [];
  for (const c of r.data) {
    const metricasAntes = (c.metricas ?? {}) as Record<string, unknown>;
    const nombre = typeof metricasAntes.nombre_pagina === "string" && metricasAntes.nombre_pagina ? metricasAntes.nombre_pagina : null;
    const res = coincidencias({ copy: c.titulo, nombrePagina: nombre }, anuncios);
    if (!res) continue;
    if ("motivo" in res) {
      omitidas.push({ numero: c.numero, motivo: res.motivo });
      continue;
    }
    const { ok } = res;
    const metricas: Record<string, unknown> = {
      ...metricasAntes,
      anuncios_mismo_copy: ok.total,
      biblioteca: { activos: ok.activos, inactivos: ok.inactivos, desde: ok.desde, pagina: ok.pagina, ids: ok.ids, destinos: ok.destinos, resultados, leidos: suma, parcial, leido_en: leidoEn },
    };
    if (!nombre && ok.pagina) metricas.nombre_pagina = ok.pagina;
    const destinoNuevo = !c.pagina_destino && ok.destinos.length > 0;
    const cambios: Record<string, unknown> = { metricas, actualizado_en: leidoEn };
    if (destinoNuevo) cambios.pagina_destino = ok.destinos[0].url;
    const { error } = await supabase.from(ENTIDAD).update(cambios).eq("id", c.id);
    if (error) {
      omitidas.push({ numero: c.numero, motivo: "No se pudo guardar." });
      continue;
    }
    const antes = typeof metricasAntes.anuncios_mismo_copy === "number" ? String(metricasAntes.anuncios_mismo_copy) : "—";
    await registrarAuditoria({
      accion: "leer_biblioteca_captura_instagram",
      entidad: ENTIDAD,
      entidadId: c.id,
      antes: { "Anuncios con el mismo copy": antes, ...(destinoNuevo ? { "Página de destino": "—" } : {}) },
      despues: { "Anuncios con el mismo copy": `${ok.total} (${ok.activos} activos)`, ...(destinoNuevo ? { "Página de destino": ok.destinos[0].url } : {}) },
    });
    actualizadas.push({ numero: c.numero, pagina: ok.pagina, total: ok.total, activos: ok.activos, destinoNuevo });
  }
  if (actualizadas.length > 0) revalidatePath("/instagram");
  return { leidos: anuncios.length, resultados, parcial, actualizadas, omitidas };
}
