"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { monedaDePais, tasasUsd } from "@/lib/moneda/tipo-cambio";
import { fulfillmentEnMoneda, leerFulfillment } from "@/lib/publicaciones/fulfillment-pais";
import { formatoMonto, monedaPublicaciones } from "@/lib/publicaciones/moneda";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dolares = (n: number | null) => (n === null ? "sin dato" : `US$${n.toFixed(2)}`);

/** `enMoneda`: el monto en la moneda del país («₡1 011»), solo si no es el dólar. */
export type ResultadoFulfillment = { ok: true; valor: number | null; cambiadas: number; enMoneda: string | null } | { error: string };

/**
 * El fulfillment por pedido de una plataforma en un país, en dólares (Configuración; pedido de Alcides, 31 oct 2026; migración 0213). Se guarda en
 * `pais_plataformas.fulfillment`. Si la plataforma es **Dropi**, además es el del país (`paises.fulfillment`) y se pone en **todas** las
 * publicaciones de Gestión de IDs Dropi de ese país que tenían otro, **pasado a su moneda** con el tipo de cambio del día (su utilidad y su margen se
 * recalculan solos), con el valor de antes en la Actividad de cada una; las nuevas lo traen. Vacío = sin fulfillment fijo (en Dropi, se vuelve a
 * escribir en cada publicación y no se toca ninguna). Pide poder escribir en Configuración y, para Dropi, también en Gestión de IDs Dropi.
 */
export async function guardarFulfillmentPlataforma(paisPlataformaId: string, texto: string): Promise<ResultadoFulfillment> {
  const usuario = await requireModuloEscritura("configuracion");
  if (typeof paisPlataformaId !== "string" || !UUID.test(paisPlataformaId)) return { error: "Plataforma no válida." };
  const leido = leerFulfillment(texto);
  if ("error" in leido) return leido;
  const { valor } = leido;
  const supabase = createServiceClient();

  const { data: fila, error: errorFila } = await supabase
    .from("pais_plataformas")
    .select("id, pais_id, fulfillment, plataformas(nombre), paises(codigo, nombre)")
    .eq("id", paisPlataformaId)
    .maybeSingle();
  if (errorFila) return { error: /fulfillment|column|schema cache/i.test(errorFila.message) ? "Falta correr la migración 0213 (fulfillment por plataforma) en la base." : "No se pudo leer la plataforma." };
  if (!fila) return { error: "Esa plataforma no existe en este país." };
  const paisId = fila.pais_id as string;
  if (!(await puedeVerPaisId(supabase, usuario.paisesPermitidos, paisId))) return { error: "No tienes acceso a este país." };
  const plataforma = (fila.plataformas as unknown as { nombre: string } | null)?.nombre ?? "?";
  const pais = fila.paises as unknown as { codigo: string; nombre: string } | null;
  const codigo = pais?.codigo ?? "";
  const nombrePais = pais?.nombre ?? "";
  const esDropi = plataforma.trim().toLowerCase() === "dropi";
  if (esDropi && (!usuario.modulos.includes("publicaciones-dropi") || usuario.modulosSoloLectura.includes("publicaciones-dropi")))
    return { error: "El fulfillment de Dropi cambia el margen de las publicaciones: hace falta poder escribir en Gestión de IDs Dropi." };

  // El monto en la moneda del país (para Dropi, el que van a tener sus publicaciones). En Dropi, sin tipo de cambio no se guarda nada (quedaría a medias).
  const enDolares = monedaDePais(codigo) === "USD";
  let enMoneda: number | null = null;
  if (valor !== null) {
    enMoneda = enDolares ? valor : fulfillmentEnMoneda(valor, codigo, (await tasasUsd(supabase)).porUsd);
    if (esDropi && enMoneda === null) return { error: `No hay tipo de cambio de hoy para pasarlo a la moneda de ${nombrePais}. Inténtalo más tarde.` };
  }

  const antes = fila.fulfillment === null || fila.fulfillment === undefined ? null : Number(fila.fulfillment);
  const { error: errorGuardar } = await supabase.from("pais_plataformas").update({ fulfillment: valor }).eq("id", paisPlataformaId);
  if (errorGuardar) return { error: "No se pudo guardar el fulfillment." };

  let cambiadas = 0;
  const moneda = monedaPublicaciones(codigo, {});
  const enTexto = enMoneda === null ? null : formatoMonto(enMoneda, moneda);
  if (esDropi) {
    const { error: errorPais } = await supabase.from("paises").update({ fulfillment: valor }).eq("id", paisId);
    if (errorPais) return { error: "Se guardó en la plataforma, pero no en el país. Vuelve a guardarlo." };
    if (valor !== null && enMoneda !== null) {
      const distintas = (
        await traerTodasLasFilas<{ id: string; fulfillment: number | null }>((d, h) =>
          supabase.from("dropi_publicaciones").select("id, fulfillment").eq("pais_id", paisId).order("id").range(d, h),
        )
      ).filter((p) => p.fulfillment === null || Number(p.fulfillment) !== enMoneda);
      for (let i = 0; i < distintas.length; i += 500) {
        const lote = distintas.slice(i, i + 500);
        const { error: errorLote } = await supabase.from("dropi_publicaciones").update({ fulfillment: enMoneda }).in("id", lote.map((p) => p.id));
        if (errorLote) return { error: `Se guardó el fulfillment, pero no se pudo poner en todas las publicaciones (${cambiadas} de ${distintas.length}). Vuelve a guardarlo.` };
        await supabase.from("dropi_publicacion_comentarios").insert(
          lote.map((p) => ({
            publicacion_id: p.id,
            autor: "Fulfillment del país",
            texto: `Fulfillment: ${p.fulfillment === null ? "sin dato" : formatoMonto(Number(p.fulfillment), moneda)} → ${enTexto} (${dolares(valor)} de Dropi en ${nombrePais}, cambiado en Configuración por ${usuario.nombre || usuario.email})`,
          })),
        );
        cambiadas += lote.length;
      }
    }
  }

  await registrarAuditoria({
    accion: "fulfillment_plataforma",
    entidad: "pais_plataformas",
    entidadId: paisPlataformaId,
    antes: { [`Fulfillment de ${plataforma} en ${nombrePais}`]: dolares(antes) },
    despues: { [`Fulfillment de ${plataforma} en ${nombrePais}`]: valor === null ? "sin dato" : dolares(valor) },
    detalle: cambiadas ? `${cambiadas} publicaciones de Gestión de IDs Dropi pasaron a ${enTexto}` : undefined,
  });
  revalidatePath("/configuracion");
  if (esDropi) revalidatePath("/publicaciones-dropi");
  return { ok: true, valor, cambiadas, enMoneda: enDolares ? null : enTexto };
}
