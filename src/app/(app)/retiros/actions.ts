"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual, requireModuloEscritura } from "@/lib/auth";
import { insertarConCorrelativo, leerCorrelativo } from "@/lib/retiros/correlativo";
import { ESTADO_ETIQUETA as ETIQUETA_ESTADO } from "@/lib/retiros/estados";

const TOLERANCIA_DISCREPANCIA = 3;

/** Estados que se pueden elegir a mano desde la columna Estado de la tabla. "cancelado"
 * queda afuera a propósito: sigue siendo una acción aparte (botón Cancelar), no un valor
 * más del desplegable, porque es un cierre distinto al de la conciliación normal. */
const ESTADOS_EDITABLES = ["abierto", "novedad", "cerrado"] as const;
type EstadoEditable = (typeof ESTADOS_EDITABLES)[number];

async function registrarEvento(supabase: ReturnType<typeof createServiceClient>, retiroId: string, evento: string) {
  await supabase.from("retiro_eventos").insert({ retiro_id: retiroId, evento });
}

export async function alternarConsolidado(formData: FormData) {
  await requireModuloEscritura("retiros");
  const id = formData.get("id") as string;
  const consolidado = formData.get("consolidado") === "true";

  const supabase = createServiceClient();
  const { error } = await supabase.from("retiros").update({ consolidado }).eq("id", id);
  if (error) throw new Error(error.message);

  await registrarAuditoria({
    accion: "marcar_consolidacion",
    entidad: "retiros",
    entidadId: id,
    antes: { Consolidación: consolidado ? "Pendiente" : "Consolidado" },
    despues: { Consolidación: consolidado ? "Consolidado" : "Pendiente" },
  });

  revalidatePath("/retiros");
}

export async function registrarSaldo(formData: FormData) {
  await requireModuloEscritura("retiros");
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

async function consultarSiguienteCorrelativo(supabase: ReturnType<typeof createServiceClient>): Promise<number | null> {
  const { data, error } = await supabase.rpc("siguiente_correlativo_retiro");
  const numero = Number(data);
  return error || !Number.isInteger(numero) || numero < 1 ? null : numero;
}

/**
 * Muestra el correlativo que tendría el próximo retiro, SIN gastarlo: abrir la ficha de crear y no
 * guardar deja el mismo número para la próxima vez. Solo se asigna de verdad al crear el retiro.
 * Devuelve null si no se pudo consultar (entonces se asigna al guardar).
 */
export async function verSiguienteCorrelativo(): Promise<number | null> {
  await requireModuloEscritura("retiros");
  return consultarSiguienteCorrelativo(createServiceClient());
}

export async function crearRetiro(formData: FormData) {
  await requireModuloEscritura("retiros");
  const pais_id = formData.get("pais_id") as string;
  const plataforma_id = formData.get("plataforma_id") as string;
  const cuenta_retiro_id = (formData.get("cuenta_retiro_id") as string) || null;
  const monto = Number(formData.get("monto"));
  const comision = Number(formData.get("comision") || 0);
  const fecha = formData.get("fecha") as string;
  const notas = (formData.get("notas") as string) || null;
  const fecha_limite = (formData.get("fecha_limite") as string) || null;
  const aRecibirTexto = (formData.get("a_recibir") as string) || "";
  const a_recibir = aRecibirTexto !== "" && !Number.isNaN(Number(aRecibirTexto)) ? Number(aRecibirTexto) : monto - comision;
  // La persona asignada la pone el sistema: quien crea el retiro.
  const usuario = await getUsuarioActual();
  const asignado_a = usuario?.id ?? null;
  // El número que vio la persona al abrir la ficha; se usa si sigue libre (es el que escribirá en Dropi).
  const correlativoPedido = leerCorrelativo(formData.get("numero_correlativo") as string | null);

  const supabase = createServiceClient();
  const { data, error } = await insertarConCorrelativo<{ id: string; numero_correlativo: number }>(
    async (numero_correlativo) =>
      await supabase
        .from("retiros")
        .insert({
          ...(numero_correlativo !== null ? { numero_correlativo } : {}),
          pais_id,
          plataforma_id,
          cuenta_retiro_id,
          monto,
          comision,
          a_recibir,
          fecha,
          notas,
          asignado_a,
          fecha_limite,
          estado: "abierto",
        })
        .select("id, numero_correlativo")
        .single(),
    () => consultarSiguienteCorrelativo(supabase),
    correlativoPedido
  );
  if (error || !data) throw new Error(error?.message ?? "No se pudo crear el retiro");

  const correlativoFinal = Number(data.numero_correlativo);
  await registrarEvento(supabase, data.id, `Retiro creado por ${monto.toFixed(2)}`);
  await registrarAuditoria({
    accion: "crear_retiro",
    entidad: "retiros",
    entidadId: data.id,
    detalle: `correlativo=${correlativoFinal} monto=${monto.toFixed(2)} comision=${comision.toFixed(2)} a_recibir=${a_recibir.toFixed(2)}`,
  });

  revalidatePath("/retiros");
  // Si otra persona ocupó primero el número que se mostró, la ficha del retiro lo avisa.
  const cambio = correlativoPedido !== null && correlativoPedido !== correlativoFinal;
  redirect(`/retiros/${data.id}${cambio ? `?correlativo_cambio=${correlativoPedido}` : ""}`);
}

export async function cerrarRetiro(formData: FormData) {
  await requireModuloEscritura("retiros");
  const id = formData.get("id") as string;
  const pais_id = formData.get("pais_id") as string;
  const soporte_numero = (formData.get("soporte_numero") as string) || null;
  const montoRecibido = Number(formData.get("monto_recibido"));
  const comprobante = formData.get("comprobante") as File | null;

  const supabase = createServiceClient();

  const { data: retiro, error: errorRetiro } = await supabase
    .from("retiros")
    .select("estado, a_recibir, monto_neto, comprobante_path")
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

  const esperado = Number(retiro.a_recibir ?? retiro.monto_neto);
  const diferencia = montoRecibido - esperado;
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
      ? `Novedad: se esperaban ${esperado.toFixed(2)} y llegaron ${montoRecibido.toFixed(2)} (diferencia de ${diferencia.toFixed(2)})`
      : `Retiro cerrado: monto recibido ${montoRecibido.toFixed(2)}`
  );
  await registrarAuditoria({
    accion: conDiscrepancia ? "cerrar_retiro_con_novedad" : "cerrar_retiro",
    entidad: "retiros",
    entidadId: id,
    antes: { Estado: ETIQUETA_ESTADO[retiro.estado] ?? retiro.estado },
    despues: {
      Estado: ETIQUETA_ESTADO[estado] ?? estado,
      "Monto recibido": montoRecibido.toFixed(2),
      Diferencia: diferencia.toFixed(2),
    },
  });

  revalidatePath("/retiros");
  revalidatePath(`/retiros/${id}`);

  return { conDiscrepancia, diferencia };
}

export async function cancelarRetiro(formData: FormData) {
  await requireModuloEscritura("retiros");
  const id = formData.get("id") as string;

  const supabase = createServiceClient();
  const { data: retiro } = await supabase.from("retiros").select("estado").eq("id", id).single();

  const { error } = await supabase.from("retiros").update({ estado: "cancelado" }).eq("id", id);
  if (error) throw new Error(error.message);

  await registrarEvento(supabase, id, "Retiro cancelado");
  await registrarAuditoria({
    accion: "cancelar_retiro",
    entidad: "retiros",
    entidadId: id,
    antes: { Estado: ETIQUETA_ESTADO[retiro?.estado ?? ""] ?? retiro?.estado ?? "—" },
    despues: { Estado: "Cancelado" },
  });

  revalidatePath("/retiros");
  revalidatePath(`/retiros/${id}`);
}

/** Cambio manual y directo del estado desde la columna de la tabla — a diferencia de
 * cerrarRetiro(), no toca monto recibido ni comprobante: solo mueve la etiqueta. Sirve para
 * marcar a mano una novedad detectada en Dropi, o archivar un retiro como cerrado sin pasar
 * por el formulario de conciliación. */
export async function cambiarEstadoRetiro(formData: FormData) {
  await requireModuloEscritura("retiros");
  const id = formData.get("id") as string;
  const nuevoEstado = formData.get("estado") as string;

  if (!ESTADOS_EDITABLES.includes(nuevoEstado as EstadoEditable)) {
    throw new Error(`Estado inválido: ${nuevoEstado}`);
  }

  const supabase = createServiceClient();
  const { data: retiro, error: errorRetiro } = await supabase
    .from("retiros")
    .select("estado")
    .eq("id", id)
    .single();
  if (errorRetiro) throw new Error(errorRetiro.message);

  if (retiro.estado === nuevoEstado) return;

  const { error } = await supabase.from("retiros").update({ estado: nuevoEstado }).eq("id", id);
  if (error) throw new Error(error.message);

  await registrarEvento(
    supabase,
    id,
    `Estado cambiado a mano: ${ETIQUETA_ESTADO[retiro.estado] ?? retiro.estado} → ${ETIQUETA_ESTADO[nuevoEstado] ?? nuevoEstado}`
  );
  await registrarAuditoria({
    accion: "cambiar_estado_retiro",
    entidad: "retiros",
    entidadId: id,
    antes: { Estado: ETIQUETA_ESTADO[retiro.estado] ?? retiro.estado },
    despues: { Estado: ETIQUETA_ESTADO[nuevoEstado] ?? nuevoEstado },
  });

  revalidatePath("/retiros");
  revalidatePath(`/retiros/${id}`);
}
