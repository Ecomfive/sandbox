"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { monedaDePais, tasasUsd } from "@/lib/moneda/tipo-cambio";
import { fulfillmentEnMoneda, leerFulfillment, monedasFulfillment, montoConMoneda } from "@/lib/publicaciones/fulfillment-pais";
import { formatoMonto, monedaPublicaciones } from "@/lib/publicaciones/moneda";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `equivalente`: el mismo monto en la otra moneda del país («≈ US$2.00» si se guardó en colones, «≈ ₡1 011» si en dólares), o null. */
export type ResultadoFulfillment = { ok: true; valor: number | null; moneda: string; cambiadas: number; equivalente: string | null } | { error: string };

/**
 * El fulfillment por pedido de una plataforma en un país, en la moneda en que lo factura el proveedor (dólares o la del país; Configuración, pedido
 * de Alcides, 31 oct 2026; migración 0213). Se guarda en `pais_plataformas.fulfillment` y `fulfillment_moneda`. Si la plataforma es **Dropi**, se
 * pone en **todas** las publicaciones de Gestión de IDs Dropi de ese país que tenían otro, tal cual si está en su moneda o pasado con el tipo de cambio
 * del día (su utilidad y su margen se recalculan solos), con el valor de antes en la Actividad de cada una; las nuevas lo traen. Vacío = sin
 * fulfillment fijo (en Dropi, se vuelve a escribir en cada publicación y no se toca ninguna). Pide poder escribir en Configuración y, para Dropi,
 * también en Gestión de IDs Dropi.
 */
export async function guardarFulfillmentPlataforma(paisPlataformaId: string, texto: string, monedaElegida: string): Promise<ResultadoFulfillment> {
  const usuario = await requireModuloEscritura("configuracion");
  if (typeof paisPlataformaId !== "string" || !UUID.test(paisPlataformaId)) return { error: "Plataforma no válida." };
  const leido = leerFulfillment(texto);
  if ("error" in leido) return leido;
  const { valor } = leido;
  const supabase = createServiceClient();

  const { data: fila, error: errorFila } = await supabase
    .from("pais_plataformas")
    .select("id, pais_id, fulfillment, fulfillment_moneda, plataformas(nombre), paises(codigo, nombre)")
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
  const moneda = String(monedaElegida ?? "");
  if (!monedasFulfillment(codigo).includes(moneda)) return { error: "Elige en qué moneda va el fulfillment." };
  if (esDropi && (!usuario.modulos.includes("publicaciones-dropi") || usuario.modulosSoloLectura.includes("publicaciones-dropi")))
    return { error: "El fulfillment de Dropi cambia el margen de las publicaciones: hace falta poder escribir en Gestión de IDs Dropi." };

  // El monto en la moneda de las publicaciones del país (para Dropi, el que van a tener). En Dropi, sin tipo de cambio no se guarda nada (quedaría a medias).
  const monedaPais = monedaDePais(codigo);
  const porUsd = monedaPais === "USD" && moneda === "USD" ? {} : (await tasasUsd(supabase)).porUsd;
  let enMoneda: number | null = null;
  if (valor !== null) {
    enMoneda = fulfillmentEnMoneda(valor, moneda, codigo, porUsd);
    if (esDropi && enMoneda === null) return { error: `No hay tipo de cambio de hoy para pasarlo a la moneda de ${nombrePais}. Inténtalo más tarde.` };
  }
  // El mismo monto en la otra moneda del país, para verlo debajo.
  const otra = monedasFulfillment(codigo).find((m) => m !== moneda) ?? null;
  const enOtra = valor === null || otra === null ? null : otra === monedaPais ? enMoneda : fulfillmentEnMoneda(valor, moneda, "PA", porUsd); // «PA»: a dólares

  const antes = fila.fulfillment === null || fila.fulfillment === undefined ? null : Number(fila.fulfillment);
  const monedaAntes = String(fila.fulfillment_moneda ?? "USD");
  const { error: errorGuardar } = await supabase.from("pais_plataformas").update({ fulfillment: valor, fulfillment_moneda: moneda }).eq("id", paisPlataformaId);
  if (errorGuardar) return { error: "No se pudo guardar el fulfillment." };

  let cambiadas = 0;
  const monedaPub = monedaPublicaciones(codigo, {});
  const enTexto = enMoneda === null ? null : formatoMonto(enMoneda, monedaPub);
  if (esDropi) {
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
            texto: `Fulfillment: ${p.fulfillment === null ? "sin dato" : formatoMonto(Number(p.fulfillment), monedaPub)} → ${enTexto} (${montoConMoneda(valor, moneda)} de Dropi en ${nombrePais}, cambiado en Configuración por ${usuario.nombre || usuario.email})`,
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
    antes: { [`Fulfillment de ${plataforma} en ${nombrePais}`]: montoConMoneda(antes, monedaAntes) },
    despues: { [`Fulfillment de ${plataforma} en ${nombrePais}`]: montoConMoneda(valor, moneda) },
    detalle: cambiadas ? `${cambiadas} publicaciones de Gestión de IDs Dropi pasaron a ${enTexto}` : undefined,
  });
  revalidatePath("/configuracion");
  if (esDropi) revalidatePath("/publicaciones-dropi");
  return { ok: true, valor, moneda, cambiadas, equivalente: enOtra === null || otra === null ? null : `≈ ${montoConMoneda(enOtra, otra)}` };
}
