"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria, registrarAuditoriaLote } from "@/lib/auditoria";
import { getUsuarioActual, requireModuloEscritura } from "@/lib/auth";
import { insertarConCorrelativo, leerCorrelativo } from "@/lib/retiros/correlativo";
import { cambiarEstadoEnLote, type ResultadoLote } from "@/lib/retiros/en-lote";
import { ESTADO_ETIQUETA as ETIQUETA_ESTADO } from "@/lib/retiros/estados";

const TOLERANCIA_DISCREPANCIA = 3;

/** Estados que se pueden elegir a mano desde la ficha de "Modificar" o la barra en lote.
 * "cancelado" queda afuera a propósito: sigue siendo una acción aparte (botón Cancelar), no un
 * valor más del selector, porque es un cierre distinto al de la conciliación normal. */
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
  // "A recibir" ya no se edita a mano: siempre es monto menos comisión, para que la comisión
  // configurada en la cuenta destino se refleje tal cual, sin que alguien la pise sin querer.
  const a_recibir = monto - comision;
  const gestionadoPorTexto = formData.get("gestionado_por") as string;
  const gestionado_por = gestionadoPorTexto === "correo" ? "correo" : "plataforma";
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
          gestionado_por,
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

/**
 * Concilia un retiro desde la ventana de "Conciliar" en la tabla: a diferencia de cerrarRetiro
 * (que deja pasar una discrepancia marcando "novedad"), acá NO se guarda nada si el monto
 * recibido se aleja de lo esperado más de TOLERANCIA_DISCREPANCIA — hay que corregirlo o
 * investigarlo antes de poder conciliar. Al conciliar, además de cerrar el retiro, marca la
 * bandera de consolidación (antes editable a mano, ahora solo se activa desde acá).
 */
export async function conciliarRetiro(formData: FormData): Promise<{ error?: string }> {
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
  if (errorRetiro) return { error: errorRetiro.message };

  const esperado = Number(retiro.a_recibir ?? retiro.monto_neto);
  const diferencia = montoRecibido - esperado;
  if (Math.abs(diferencia) > TOLERANCIA_DISCREPANCIA) {
    return {
      error: `No se puede conciliar: se esperaban $${esperado.toFixed(2)} y se recibieron $${montoRecibido.toFixed(2)} (diferencia de $${diferencia.toFixed(2)}, máximo permitido $${TOLERANCIA_DISCREPANCIA}). Corrige el monto o investiga antes de conciliar.`,
    };
  }

  let comprobante_path = retiro.comprobante_path as string | null;
  if (comprobante && comprobante.size > 0) {
    const ruta = `${pais_id}/${id}/${Date.now()}-${comprobante.name}`;
    const { error: errorSubida } = await supabase.storage
      .from("comprobantes-retiro")
      .upload(ruta, comprobante, { contentType: comprobante.type || "application/octet-stream" });
    if (errorSubida) return { error: errorSubida.message };
    comprobante_path = ruta;
  }

  const { error } = await supabase
    .from("retiros")
    .update({
      estado: "cerrado",
      soporte_numero,
      comprobante_path,
      monto_recibido: montoRecibido,
      fecha_cierre: new Date().toISOString().slice(0, 10),
      consolidado: true,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await registrarEvento(supabase, id, `Retiro conciliado: monto recibido ${montoRecibido.toFixed(2)}`);
  await registrarAuditoria({
    accion: "conciliar_retiro",
    entidad: "retiros",
    entidadId: id,
    antes: { Estado: ETIQUETA_ESTADO[retiro.estado] ?? retiro.estado, Consolidación: "Pendiente" },
    despues: {
      Estado: "Cerrado",
      Consolidación: "Consolidado",
      "Monto recibido": montoRecibido.toFixed(2),
    },
  });

  revalidatePath("/retiros");
  revalidatePath(`/retiros/${id}`);
  return {};
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

/** Edita a mano cualquier dato de un retiro ya creado — plataforma, cuenta destino, gestionado
 * por, monto, comisión, fechas, nota y estado — todo junto, desde la ficha de "Modificar". El
 * estado ya no se edita directo en la columna de la tabla: solo cambia desde acá, al conciliar,
 * al cancelar o con la barra de acciones en lote. No toca el correlativo. */
export async function actualizarRetiro(formData: FormData) {
  await requireModuloEscritura("retiros");
  const id = formData.get("id") as string;
  const plataforma_id = formData.get("plataforma_id") as string;
  const cuenta_retiro_id = (formData.get("cuenta_retiro_id") as string) || null;
  const monto = Number(formData.get("monto"));
  const comision = Number(formData.get("comision") || 0);
  const fecha = formData.get("fecha") as string;
  const notas = (formData.get("notas") as string) || null;
  const fecha_limite = (formData.get("fecha_limite") as string) || null;
  // "A recibir" tampoco se edita a mano acá: se recalcula igual que al crear.
  const a_recibir = monto - comision;
  const gestionadoPorTexto = formData.get("gestionado_por") as string;
  const gestionado_por = gestionadoPorTexto === "correo" ? "correo" : "plataforma";
  const estadoTexto = formData.get("estado") as string | null;

  const supabase = createServiceClient();
  const { data: antes, error: errorAntes } = await supabase
    .from("retiros")
    .select("monto, comision, estado")
    .eq("id", id)
    .single();
  if (errorAntes) throw new Error(errorAntes.message);

  // El estado solo se toca si viene en el formulario y es uno editable a mano — la ficha no lo
  // manda para un retiro cancelado, así que uno cancelado nunca se reabre desde acá.
  const estadoValido = estadoTexto !== null && ESTADOS_EDITABLES.includes(estadoTexto as EstadoEditable);
  const cambios: Record<string, unknown> = {
    plataforma_id,
    cuenta_retiro_id,
    monto,
    comision,
    a_recibir,
    fecha,
    notas,
    fecha_limite,
    gestionado_por,
  };
  if (estadoValido) cambios.estado = estadoTexto;

  const { error } = await supabase.from("retiros").update(cambios).eq("id", id);
  if (error) throw new Error(error.message);

  const cambioEstado = estadoValido && estadoTexto !== antes.estado;
  await registrarEvento(
    supabase,
    id,
    `Retiro modificado: monto ${Number(antes.monto).toFixed(2)} → ${monto.toFixed(2)}` +
      (cambioEstado
        ? `, estado ${ETIQUETA_ESTADO[antes.estado] ?? antes.estado} → ${ETIQUETA_ESTADO[estadoTexto!] ?? estadoTexto}`
        : "")
  );
  await registrarAuditoria({
    accion: "editar_retiro",
    entidad: "retiros",
    entidadId: id,
    antes: {
      Monto: Number(antes.monto).toFixed(2),
      Comisión: Number(antes.comision).toFixed(2),
      ...(cambioEstado ? { Estado: ETIQUETA_ESTADO[antes.estado] ?? antes.estado } : {}),
    },
    despues: {
      Monto: monto.toFixed(2),
      Comisión: comision.toFixed(2),
      ...(cambioEstado ? { Estado: ETIQUETA_ESTADO[estadoTexto!] ?? estadoTexto } : {}),
    },
  });

  revalidatePath("/retiros");
  revalidatePath(`/retiros/${id}`);
}

/** Borra el retiro por completo. Sus eventos (retiro_eventos) se borran en cascada; ninguna
 * otra tabla referencia retiros.id, así que no hace falta bloquear por relaciones como en
 * eliminarCuentaRetiro. Devuelve el error como valor en vez de lanzarlo, porque en producción
 * Next.js oculta el mensaje de cualquier excepción de un server action. */
export async function eliminarRetiro(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("retiros");
  const id = formData.get("id") as string;

  const supabase = createServiceClient();
  const { error } = await supabase.from("retiros").delete().eq("id", id);
  if (error) return { error: error.message };

  await registrarAuditoria({
    accion: "eliminar_retiro",
    entidad: "retiros",
    entidadId: id,
    detalle: "Retiro eliminado",
  });

  revalidatePath("/retiros");
  return {};
}

/**
 * Pasa a varios retiros a Abierto, Novedad o Cerrado desde la barra de acciones de la tabla. Es el mismo cambio
 * manual que se hace de a uno desde "Modificar" (solo mueve la etiqueta; no toca monto recibido ni comprobante),
 * con los mismos permisos: hace falta acceso de escritura a Retiros. Los cancelados no se tocan. La lógica está en
 * `cambiarEstadoEnLote` (`src/lib/retiros/en-lote.ts`); aquí solo se comprueba el permiso y se refresca la página.
 * Devuelve el error como valor, porque en producción Next.js oculta el mensaje de cualquier excepción.
 */
export async function cambiarEstadoRetirosEnLote(ids: string[], nuevoEstado: string): Promise<ResultadoLote> {
  try {
    await requireModuloEscritura("retiros");
  } catch (e) {
    return {
      cambiados: 0,
      yaEstaban: 0,
      cancelados: 0,
      noEncontrados: 0,
      error: e instanceof Error ? e.message : "No tienes permiso para cambiar retiros.",
    };
  }
  const resultado = await cambiarEstadoEnLote(createServiceClient(), ids, nuevoEstado, registrarAuditoriaLote);
  if (resultado.cambiados > 0) revalidatePath("/retiros");
  return resultado;
}
