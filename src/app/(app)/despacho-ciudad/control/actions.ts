"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { esFormaPagoRecibo, fechaPagoDe, finSemanaPago, inicioSemanaPago, leerAjuste, type Ajuste } from "@/lib/despacho/control-envios";
import { cargarControl, COLUMNAS_SEMANA, aSemana } from "@/lib/despacho/datos-control";
import { rangoDespacho } from "@/lib/despacho/datos";
import { SOLO_TODA_LA_EMPRESA } from "@/lib/finanzas/acceso-tienda";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";

// Envíos Delivery › Control de envíos (25 nov 2026, migración 0366), lo que hace Yiletsi (edición de Envíos Delivery, con todas las tiendas: lo que
// se le paga a cada delivery no es de una tienda): los datos del recibo y las tarifas de cada delivery, las propinas, los ajustes y la nota de la
// semana, y cerrar la semana (se le manda al delivery para que firme). Una semana enviada se puede volver a abrir mientras no esté firmada; una firmada
// se anula (el PDF queda guardado y anotado) para corregirla y volver a mandarla.

type Resultado = { error?: string; aviso?: string };
const SIN_MIGRACION = "Falta correr en Supabase la migración 0366 (control de envíos).";
const esJueves = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && inicioSemanaPago(v) === v;
const RUTAS = ["/despacho-ciudad/control", "/repartidor/pagos"];
const refrescar = () => RUTAS.forEach((r) => revalidatePath(r));

async function exigirEscritura() {
  const usuario = await requireModuloEscritura("despacho-ciudad");
  if (await cargarTiendasPermitidas()) throw new Error(SOLO_TODA_LA_EMPRESA);
  return usuario;
}

/** La semana guardada (o null si todavía no tiene nada anotado). */
async function semanaDe(deliveryId: string, jueves: string) {
  const { data, error } = await createServiceClient().from("despacho_semanas").select(COLUMNAS_SEMANA).eq("delivery_id", deliveryId).eq("semana", jueves).maybeSingle();
  if (error) return { error: SIN_MIGRACION } as const;
  return { semana: data ? aSemana(data as Record<string, unknown>) : null } as const;
}

/** Los datos del recibo y las tarifas de un delivery (los completa Yiletsi). */
export async function guardarDatosDelivery(deliveryId: string, datos: { nombreCompleto: string; cedula: string; formaPago: string; tarifaEntrega: string; tarifaCambio: string }): Promise<Resultado> {
  await exigirEscritura();
  if (!esUuid(deliveryId)) return { error: "Delivery no válido." };
  const nombreCompleto = String(datos.nombreCompleto ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const cedula = String(datos.cedula ?? "").replace(/\s+/g, "").slice(0, 40);
  const entrega = Number(String(datos.tarifaEntrega).replace(",", "."));
  const cambio = Number(String(datos.tarifaCambio).replace(",", "."));
  if (!esFormaPagoRecibo(datos.formaPago)) return { error: "Elige la forma de pago." };
  if (!Number.isFinite(entrega) || entrega <= 0 || entrega > 100 || !Number.isFinite(cambio) || cambio < 0 || cambio > 100) return { error: "Revisa las tarifas." };
  const { data, error } = await createServiceClient()
    .from("despacho_deliverys")
    .update({
      nombre_completo: nombreCompleto || null,
      cedula: cedula || null,
      forma_pago: datos.formaPago,
      tarifa_entrega: Math.round(entrega * 100) / 100,
      tarifa_cambio: Math.round(cambio * 100) / 100,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", deliveryId)
    .select("nombre")
    .maybeSingle();
  if (error) return { error: SIN_MIGRACION };
  if (!data) return { error: "Ese delivery ya no existe." };
  await registrarAuditoria({ accion: "datos_delivery", entidad: "despacho_deliverys", entidadId: deliveryId, detalle: `${data.nombre}: tarifas ${entrega} / ${cambio}, ${datos.formaPago}` });
  refrescar();
  return {};
}

/** Cambia las propinas y ajustes, o la nota, de una semana todavía abierta. */
async function cambiarSemana(deliveryId: string, jueves: string, cambio: (ajustes: Ajuste[]) => { ajustes?: Ajuste[]; nota?: string | null } | { error: string }): Promise<Resultado> {
  if (!esUuid(deliveryId) || !esJueves(jueves)) return { error: "Semana no válida." };
  const leida = await semanaDe(deliveryId, jueves);
  if ("error" in leida) return { error: leida.error };
  if (leida.semana && leida.semana.estado !== "abierta") return { error: "Esa semana ya se le mandó al delivery: vuelve a abrirla para cambiarla." };
  const nuevo = cambio(leida.semana?.ajustes ?? []);
  if ("error" in nuevo) return nuevo;
  const supabase = createServiceClient();
  const fila = { ...(nuevo.ajustes ? { ajustes: nuevo.ajustes } : {}), ...(nuevo.nota !== undefined ? { nota: nuevo.nota } : {}), actualizado_en: new Date().toISOString() };
  const { error } = leida.semana
    ? await supabase.from("despacho_semanas").update(fila).eq("id", leida.semana.id).eq("estado", "abierta")
    : await supabase.from("despacho_semanas").insert({ delivery_id: deliveryId, semana: jueves, ...fila });
  if (error) return { error: "No se pudo guardar. Vuelve a probar." };
  refrescar();
  return {};
}

export async function agregarAjuste(deliveryId: string, jueves: string, tipo: string, monto: string, motivo: string): Promise<Resultado> {
  await exigirEscritura();
  const a = leerAjuste(tipo, monto, motivo);
  if (!a) return { error: tipo === "propina" ? "Escribe el monto de la propina." : "Escribe el monto (con − si descuenta) y el motivo." };
  const r = await cambiarSemana(deliveryId, jueves, (ajustes) => (ajustes.length >= 30 ? { error: "Esa semana ya tiene muchos ajustes." } : { ajustes: [...ajustes, a] }));
  if (!r.error) await registrarAuditoria({ accion: "ajuste_delivery", entidad: "despacho_semanas", entidadId: deliveryId, detalle: `${jueves} · ${a.tipo} ${a.monto} · ${a.motivo}` });
  return r;
}

export async function quitarAjuste(deliveryId: string, jueves: string, indice: number): Promise<Resultado> {
  await exigirEscritura();
  return cambiarSemana(deliveryId, jueves, (ajustes) => (Number.isInteger(indice) && indice >= 0 && indice < ajustes.length ? { ajustes: ajustes.filter((_, i) => i !== indice) } : { error: "Ese ajuste ya no está." }));
}

export async function guardarNota(deliveryId: string, jueves: string, nota: string): Promise<Resultado> {
  await exigirEscritura();
  const texto = String(nota ?? "").trim().slice(0, 1500);
  return cambiarSemana(deliveryId, jueves, () => ({ nota: texto || null }));
}

/**
 * Cierra la semana y se la manda a los deliverys (todos, o uno): queda fija (lo que se le paga por tienda, ClickSi, propinas y ajustes, día por
 * día) y el delivery la ve en «Mis pagos» para firmar el recibo. Solo después del miércoles en que termina (el de prueba, cuando sea, para probar).
 * Sin nombre completo y cédula no se manda (el recibo los lleva): se avisa a cuáles les falta.
 */
export async function enviarSemana(jueves: string, deliveryId: string | null): Promise<Resultado> {
  const usuario = await exigirEscritura();
  if (!esJueves(jueves) || (deliveryId !== null && !esUuid(deliveryId))) return { error: "Semana no válida." };
  const supabase = createServiceClient();
  const control = await cargarControl(supabase, jueves);
  if (!control) return { error: SIN_MIGRACION };
  const terminada = finSemanaPago(jueves) < rangoDespacho(1).hoy;
  const porId = new Map(control.deliverys.map((d) => [d.id, d]));
  const enviados: string[] = [];
  const faltanDatos: string[] = [];
  let sinTerminar = false;
  for (const r of control.resumenes) {
    if (!r.deliveryId || (deliveryId && r.deliveryId !== deliveryId)) continue;
    const d = porId.get(r.deliveryId)!;
    const guardada = control.semanas.get(r.deliveryId);
    if (guardada && guardada.estado !== "abierta") continue;
    if (!deliveryId && r.asignados === 0 && !guardada?.ajustes.length) continue;
    if (!terminada && !r.prueba) {
      sinTerminar = true;
      continue;
    }
    if (!d.nombreCompleto || !d.cedula) {
      faltanDatos.push(d.nombre);
      continue;
    }
    const fila = {
      estado: "enviada",
      detalle: r,
      total_oceans: r.totalOceans,
      total_clicksi: r.clicksi,
      fecha_pago: fechaPagoDe(jueves),
      enviada_por: usuario.id,
      enviada_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    };
    const { error } = guardada
      ? await supabase.from("despacho_semanas").update(fila).eq("id", guardada.id).eq("estado", "abierta")
      : await supabase.from("despacho_semanas").insert({ delivery_id: r.deliveryId, semana: jueves, ...fila });
    if (error) return { error: `No se pudo mandar la semana de ${d.nombre}. Vuelve a probar.` };
    enviados.push(d.nombre);
  }
  if (enviados.length) await registrarAuditoria({ accion: "enviar_semana_deliverys", entidad: "despacho_semanas", entidadId: jueves, detalle: enviados.join(", ") });
  refrescar();
  const partes = [
    enviados.length ? `Se mandó a ${enviados.join(", ")}.` : "",
    faltanDatos.length ? `Falta el nombre completo o la cédula de ${faltanDatos.join(", ")}: complétalos en sus datos y vuelve a mandar.` : "",
    sinTerminar ? "La semana todavía no termina: se cierra a partir del jueves." : "",
  ].filter(Boolean);
  if (!enviados.length) return { error: partes.join(" ") || "No había nada que mandar." };
  return { aviso: partes.join(" ") };
}

/** Vuelve a abrir una semana enviada que el delivery todavía no firma (para corregirla). */
export async function reabrirSemana(semanaId: string): Promise<Resultado> {
  await exigirEscritura();
  if (!esUuid(semanaId)) return { error: "Semana no válida." };
  const { data, error } = await createServiceClient()
    .from("despacho_semanas")
    .update({ estado: "abierta", detalle: null, total_oceans: null, total_clicksi: null, enviada_en: null, enviada_por: null, actualizado_en: new Date().toISOString() })
    .eq("id", semanaId)
    .eq("estado", "enviada")
    .select("semana")
    .maybeSingle();
  if (error) return { error: "No se pudo abrir." };
  if (!data) return { error: "Esa semana ya está firmada o abierta." };
  await registrarAuditoria({ accion: "reabrir_semana_delivery", entidad: "despacho_semanas", entidadId: semanaId, detalle: String(data.semana) });
  refrescar();
  return {};
}

/** Anula la firma de una semana (para corregirla): el PDF firmado queda guardado y anotado, y la semana vuelve a estar abierta. */
export async function anularFirma(semanaId: string, motivo: string): Promise<Resultado> {
  const usuario = await exigirEscritura();
  if (!esUuid(semanaId)) return { error: "Semana no válida." };
  const texto = String(motivo ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!texto) return { error: "Escribe por qué se anula." };
  const supabase = createServiceClient();
  const { data: s } = await supabase.from("despacho_semanas").select("id, estado, semana, firmada_en, pdf_ruta, anulados").eq("id", semanaId).maybeSingle();
  if (!s || s.estado !== "firmada") return { error: "Esa semana no está firmada." };
  const anulados = [...(Array.isArray(s.anulados) ? s.anulados : []), { firmadaEn: s.firmada_en, pdfRuta: s.pdf_ruta, anuladaEn: new Date().toISOString(), por: usuario.nombre ?? usuario.email, motivo: texto }];
  const { error } = await supabase
    .from("despacho_semanas")
    .update({ estado: "abierta", anulados, detalle: null, total_oceans: null, total_clicksi: null, enviada_en: null, enviada_por: null, firmada_en: null, firma_ruta: null, pdf_ruta: null, codigo: null, actualizado_en: new Date().toISOString() })
    .eq("id", semanaId)
    .eq("estado", "firmada");
  if (error) return { error: "No se pudo anular." };
  await registrarAuditoria({ accion: "anular_recibo_delivery", entidad: "despacho_semanas", entidadId: semanaId, detalle: `${s.semana}: ${texto}` });
  refrescar();
  return {};
}
