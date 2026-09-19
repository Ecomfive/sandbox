"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";

const TOLERANCIA_DISCREPANCIA = 3;

async function registrarEvento(supabase: ReturnType<typeof createServiceClient>, retiroId: string, evento: string) {
  await supabase.from("retiro_eventos").insert({ retiro_id: retiroId, evento });
}

export async function registrarSaldo(formData: FormData) {
  const pais_id = formData.get("pais_id") as string;
  const plataforma_id = formData.get("plataforma_id") as string;
  const monto = Number(formData.get("monto"));
  const fecha = formData.get("fecha") as string;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("saldos_wallet")
    .upsert({ pais_id, plataforma_id, monto, fecha }, { onConflict: "pais_id,plataforma_id,fecha" });
  if (error) throw new Error(error.message);

  await registrarAuditoria({
    accion: "registrar_saldo",
    entidad: "saldos_wallet",
    detalle: `plataforma=${plataforma_id} monto=${monto.toFixed(2)} fecha=${fecha}`,
  });

  revalidatePath("/retiros");
}

/** Aparta el próximo correlativo al abrir la ventana de crear. Devuelve null si no se pudo (se asignará al guardar). */
export async function reservarCorrelativo(): Promise<number | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("reservar_correlativo_retiro");
  const numero = Number(data);
  return error || !Number.isInteger(numero) || numero < 1 ? null : numero;
}

export async function crearRetiro(formData: FormData) {
  const pais_id = formData.get("pais_id") as string;
  const plataforma_id = formData.get("plataforma_id") as string;
  const cuenta_retiro_id = (formData.get("cuenta_retiro_id") as string) || null;
  const monto = Number(formData.get("monto"));
  const comision = Number(formData.get("comision") || 0);
  const fecha = formData.get("fecha") as string;
  const notas = (formData.get("notas") as string) || null;
  const asignado_a = (formData.get("asignado_a") as string) || null;
  const prioridad = (formData.get("prioridad") as string) || null;
  const fecha_limite = (formData.get("fecha_limite") as string) || null;
  const etiquetas = ((formData.get("etiquetas") as string) || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  const correlativoTexto = (formData.get("numero_correlativo") as string) || "";
  const numero_correlativo = /^\d+$/.test(correlativoTexto) ? Number(correlativoTexto) : null;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("retiros")
    .insert({
      ...(numero_correlativo !== null ? { numero_correlativo } : {}),
      pais_id,
      plataforma_id,
      cuenta_retiro_id,
      monto,
      comision,
      fecha,
      notas,
      asignado_a,
      prioridad,
      fecha_limite,
      etiquetas,
      estado: "abierto",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await registrarEvento(supabase, data.id, `Retiro creado por ${monto.toFixed(2)}`);
  await registrarAuditoria({
    accion: "crear_retiro",
    entidad: "retiros",
    entidadId: data.id,
    detalle: `monto=${monto.toFixed(2)} comision=${comision.toFixed(2)}`,
  });

  revalidatePath("/retiros");
  redirect(`/retiros/${data.id}`);
}

export async function cerrarRetiro(formData: FormData) {
  const id = formData.get("id") as string;
  const pais_id = formData.get("pais_id") as string;
  const soporte_numero = (formData.get("soporte_numero") as string) || null;
  const montoRecibido = Number(formData.get("monto_recibido"));
  const comprobante = formData.get("comprobante") as File | null;

  const supabase = createServiceClient();

  const { data: retiro, error: errorRetiro } = await supabase
    .from("retiros")
    .select("monto_neto, comprobante_path")
    .eq("id", id)
    .single();
  if (errorRetiro) throw new Error(errorRetiro.message);

  let comprobante_path = retiro.comprobante_path as string | null;
  if (comprobante && comprobante.size > 0) {
    const ruta = `${pais_id}/${id}/${Date.now()}-${comprobante.name}`;
    const { error: errorSubida } = await supabase.storage
      .from("comprobantes-retiro")
      .upload(ruta, comprobante, { contentType: comprobante.type || "application/octet-stream" });
    if (errorSubida) throw new Error(errorSubida.message);
    comprobante_path = ruta;
  }

  const diferencia = montoRecibido - Number(retiro.monto_neto);
  const conDiscrepancia = Math.abs(diferencia) > TOLERANCIA_DISCREPANCIA;
  const estado = conDiscrepancia ? "novedad" : "cerrado";

  const { error } = await supabase
    .from("retiros")
    .update({
      estado,
      soporte_numero,
      comprobante_path,
      monto_recibido: montoRecibido,
      fecha_cierre: new Date().toISOString().slice(0, 10),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await registrarEvento(
    supabase,
    id,
    conDiscrepancia
      ? `Novedad: se esperaban ${Number(retiro.monto_neto).toFixed(2)} y llegaron ${montoRecibido.toFixed(2)} (diferencia de ${diferencia.toFixed(2)})`
      : `Retiro cerrado: monto recibido ${montoRecibido.toFixed(2)}`
  );
  await registrarAuditoria({
    accion: conDiscrepancia ? "cerrar_retiro_con_novedad" : "cerrar_retiro",
    entidad: "retiros",
    entidadId: id,
    detalle: `monto_recibido=${montoRecibido.toFixed(2)} diferencia=${diferencia.toFixed(2)}`,
  });

  revalidatePath("/retiros");
  revalidatePath(`/retiros/${id}`);

  return { conDiscrepancia, diferencia };
}

export async function cancelarRetiro(formData: FormData) {
  const id = formData.get("id") as string;

  const supabase = createServiceClient();
  const { error } = await supabase.from("retiros").update({ estado: "cancelado" }).eq("id", id);
  if (error) throw new Error(error.message);

  await registrarEvento(supabase, id, "Retiro cancelado");
  await registrarAuditoria({ accion: "cancelar_retiro", entidad: "retiros", entidadId: id });

  revalidatePath("/retiros");
  revalidatePath(`/retiros/${id}`);
}
