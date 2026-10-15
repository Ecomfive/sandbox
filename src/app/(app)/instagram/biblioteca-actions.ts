"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import {
  coincidencias,
  interpretarTarjeta,
  resumirAnuncios,
  totalDeResultados,
  validarAnuncios,
  validarLectura,
  type AnuncioBiblioteca,
  type CapturaParaVincular,
  type ResultadoLecturaBiblioteca,
  type ResultadoVinculo,
} from "@/lib/instagram/biblioteca-lectura";
import { decodificarLectura } from "@/lib/instagram/marcador";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "instagram";
const ENTIDAD = "instagram_capturas";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FilaCaptura {
  id: string;
  numero: number;
  titulo: string | null;
  metricas: Record<string, unknown> | null;
  pagina_destino: string | null;
  autor_usuario: string | null;
}

/**
 * El nombre con que la Biblioteca mostraba la página la última vez que se leyó o se vinculó a mano esta captura. (El usuario de Instagram
 * de la cuenta también sirve para reconocerla: suele parecerse a la página, `nenagosling` → «Nenagoslingshop».)
 */
function paginaDeBiblioteca(metricas: Record<string, unknown>): string | null {
  const b = metricas.biblioteca;
  return b && typeof b === "object" && typeof (b as Record<string, unknown>).pagina === "string" ? ((b as Record<string, unknown>).pagina as string) : null;
}

/**
 * Guarda lo que el marcador leyó de la Biblioteca de anuncios de Meta (`#d=…` de `/instagram/biblioteca`): para cada captura que tenga
 * copy, cuenta los anuncios de **la misma página** con **el mismo copy** y lo deja en `metricas.anuncios_mismo_copy` (con el detalle
 * en `metricas.biblioteca`). Si la captura no tenía página de destino, toma la del botón de esos anuncios; si no tenía nombre de
 * página y todos los anuncios con ese copy son de una sola, toma ese nombre. Nada de lo que ya escribió una persona se pisa. Los
 * anuncios que ninguna captura reconoció se devuelven (con las capturas) para vincularlos a mano. Devuelve el error como valor: en
 * producción Next.js oculta el mensaje de una excepción.
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
    supabase.from(ENTIDAD).select("id, numero, titulo, metricas, pagina_destino, autor_usuario").not("titulo", "is", null).order("numero", { ascending: true }).range(a, b),
  );
  if (r.error || !r.data) return { error: "No se pudieron leer las capturas." };

  const leidoEn = new Date().toISOString();
  const actualizadas: NonNullable<ResultadoLecturaBiblioteca["actualizadas"]> = [];
  const omitidas: NonNullable<ResultadoLecturaBiblioteca["omitidas"]> = [];
  const usados = new Set<string>();
  for (const c of r.data) {
    const metricasAntes = (c.metricas ?? {}) as Record<string, unknown>;
    const nombre = typeof metricasAntes.nombre_pagina === "string" && metricasAntes.nombre_pagina ? metricasAntes.nombre_pagina : null;
    const alterna = paginaDeBiblioteca(metricasAntes);
    const res = coincidencias({ copy: c.titulo, nombrePagina: nombre, paginasAlternas: [alterna, c.autor_usuario].filter((n): n is string => !!n) }, anuncios);
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
    // La cuenta (el usuario de la página del anunciante) solo se completa si estaba vacía; se anota de dónde salió para abrir su página de Facebook y no su perfil de Instagram.
    const cuentaNueva = !c.autor_usuario && ok.usuario ? ok.usuario : null;
    if (cuentaNueva) metricas.cuenta_origen = "biblioteca";
    const cambios: Record<string, unknown> = { metricas, actualizado_en: leidoEn };
    if (destinoNuevo) cambios.pagina_destino = ok.destinos[0].url;
    if (cuentaNueva) cambios.autor_usuario = cuentaNueva;
    const { error } = await supabase.from(ENTIDAD).update(cambios).eq("id", c.id);
    if (error) {
      omitidas.push({ numero: c.numero, motivo: "No se pudo guardar." });
      continue;
    }
    for (const id of ok.ids) usados.add(id);
    const antes = typeof metricasAntes.anuncios_mismo_copy === "number" ? String(metricasAntes.anuncios_mismo_copy) : "—";
    await registrarAuditoria({
      accion: "leer_biblioteca_captura_instagram",
      entidad: ENTIDAD,
      entidadId: c.id,
      antes: { "Anuncios con el mismo copy": antes, ...(destinoNuevo ? { "Página de destino": "—" } : {}), ...(cuentaNueva ? { "Cuenta del video": "—" } : {}) },
      despues: { "Anuncios con el mismo copy": `${ok.total} (${ok.activos} activos)`, ...(destinoNuevo ? { "Página de destino": ok.destinos[0].url } : {}), ...(cuentaNueva ? { "Cuenta del video": `@${cuentaNueva}` } : {}) },
    });
    actualizadas.push({ numero: c.numero, pagina: ok.pagina, total: ok.total, activos: ok.activos, destinoNuevo });
  }
  if (actualizadas.length > 0) revalidatePath("/instagram");

  // Lo que ninguna captura reconoció se puede vincular a mano: se devuelve con las capturas entre las que elegir.
  const sinVincular = anuncios.filter((a) => !usados.has(a.id)).map((a) => ({ ...a, copy: a.copy.slice(0, 200) }));
  let capturas: CapturaParaVincular[] = [];
  if (sinVincular.length > 0) {
    const todas = await supabase.from(ENTIDAD).select("id, numero, titulo, metricas").order("numero", { ascending: false }).limit(300);
    capturas = (todas.data ?? []).map((c) => {
      const m = (c.metricas ?? {}) as Record<string, unknown>;
      return { id: c.id as string, numero: c.numero as number, pagina: typeof m.nombre_pagina === "string" ? m.nombre_pagina : null, copy: typeof c.titulo === "string" ? c.titulo.slice(0, 120) : null };
    });
  }
  return { leidos: anuncios.length, resultados, parcial, actualizadas, omitidas, sinVincular, capturas };
}

/**
 * Vincula a mano unos anuncios leídos de la Biblioteca a una captura, cuando el sistema no los reconoció (el nombre de la cuenta en
 * Instagram no es el de la página en la Biblioteca, o el copy cambió): la captura toma de esos anuncios cuántos son, cuántos están
 * activos, desde cuándo circulan y la página de destino (si no tenía). Además guarda el nombre de la página en la Biblioteca para que
 * la próxima lectura la reconozca sola. Lo escrito por una persona no se pisa (la página de destino solo se completa si estaba vacía).
 * Devuelve el error como valor.
 */
export async function vincularAnunciosACaptura(capturaId: string, crudos: unknown): Promise<ResultadoVinculo> {
  await requireModuloEscritura(MODULO);
  if (typeof capturaId !== "string" || !UUID.test(capturaId)) return { error: "Captura no válida." };
  const anuncios = validarAnuncios(crudos);
  if (anuncios.length === 0) return { error: "Elige al menos un anuncio." };

  const supabase = createServiceClient();
  const { data } = await supabase.from(ENTIDAD).select("numero, metricas, pagina_destino, autor_usuario").eq("id", capturaId).maybeSingle();
  if (!data) return { error: "La captura ya no existe." };
  const resumen = resumirAnuncios(anuncios);
  const metricasAntes = (data.metricas ?? {}) as Record<string, unknown>;
  const leidoEn = new Date().toISOString();
  const metricas: Record<string, unknown> = {
    ...metricasAntes,
    anuncios_mismo_copy: resumen.total,
    biblioteca: { activos: resumen.activos, inactivos: resumen.inactivos, desde: resumen.desde, pagina: resumen.pagina, ids: resumen.ids, destinos: resumen.destinos, manual: true, leido_en: leidoEn },
  };
  const destinoNuevo = !data.pagina_destino && resumen.destinos.length > 0;
  const cambios: Record<string, unknown> = { metricas, actualizado_en: leidoEn };
  if (destinoNuevo) cambios.pagina_destino = resumen.destinos[0].url;
  if (!data.autor_usuario && resumen.usuario) {
    cambios.autor_usuario = resumen.usuario;
    metricas.cuenta_origen = "biblioteca";
  }
  const { error } = await supabase.from(ENTIDAD).update(cambios).eq("id", capturaId);
  if (error) return { error: "No se pudo vincular." };

  const antes = typeof metricasAntes.anuncios_mismo_copy === "number" ? String(metricasAntes.anuncios_mismo_copy) : "—";
  await registrarAuditoria({
    accion: "vincular_biblioteca_captura_instagram",
    entidad: ENTIDAD,
    entidadId: capturaId,
    antes: { "Anuncios con el mismo copy": antes, ...(destinoNuevo ? { "Página de destino": "—" } : {}) },
    despues: { "Anuncios con el mismo copy": `${resumen.total} (${resumen.activos} activos)`, ...(destinoNuevo ? { "Página de destino": resumen.destinos[0].url } : {}) },
  });
  revalidatePath("/instagram");
  return { numero: data.numero, total: resumen.total, activos: resumen.activos, destinoNuevo };
}
