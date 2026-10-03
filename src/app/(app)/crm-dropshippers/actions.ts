"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { normalizarTelefono } from "@/lib/crm/telefono";
import { CANALES, ESTADOS, ESTADOS_PEDIDO, NIVELES, PRIORIDADES, TIPOS_CASO, etiquetaEstado, etiquetaNivel } from "./def-crm";

/** Devuelve el error como valor, no lo lanza: en producción Next.js oculta el mensaje de una excepción de una acción. */
export async function crearDropshipper(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("crm-dropshippers");
  const pais_id = String(formData.get("pais_id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const contacto_email = String(formData.get("contacto_email") ?? "").trim() || null;
  const telefonoTexto = String(formData.get("contacto_telefono") ?? "").trim();
  const tienda = String(formData.get("tienda") ?? "").trim() || null;
  const ciudad = String(formData.get("ciudad") ?? "").trim() || null;

  if (!nombre) return { error: "Escribe el nombre del dropshipper." };
  if (!/^[0-9a-fA-F-]{8,64}$/.test(pais_id)) return { error: "País no válido." };

  const supabase = createServiceClient();
  const { data: pais } = await supabase.from("paises").select("codigo").eq("id", pais_id).single();

  // El WhatsApp se guarda en formato internacional: con él se enlaza la conversación. Sin prefijo se asume el país actual.
  let contacto_telefono: string | null = null;
  let pais_origen: string | null = null;
  if (telefonoTexto) {
    const tel = normalizarTelefono(telefonoTexto, pais?.codigo);
    if (!tel) return { error: "El teléfono no es válido. Escríbelo con el prefijo del país, p. ej. +57 300 111 2233." };
    contacto_telefono = tel.e164;
    pais_origen = tel.pais;
  }

  const { data, error } = await supabase
    .from("dropshippers")
    .insert({ pais_id, nombre, tienda, ciudad, contacto_email, contacto_telefono, pais_origen })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "Ya hay un dropshipper con ese WhatsApp." };
    return { error: error.message };
  }
  const { error: errorPais } = await supabase.from("dropshipper_paises").insert({ dropshipper_id: data.id, pais_id });
  if (errorPais) {
    await supabase.from("dropshippers").delete().eq("id", data.id);
    return { error: errorPais.message };
  }
  await registrarAuditoria({ accion: "crear_dropshipper", entidad: "dropshippers", entidadId: data.id, detalle: `nombre=${nombre}` });
  revalidatePath("/crm-dropshippers", "layout");
  return {};
}

export async function actualizarDropshipper(formData: FormData) {
  await requireModuloEscritura("crm-dropshippers");
  const id = formData.get("id") as string;
  const estado = formData.get("estado") as string;
  const volumenRaw = formData.get("volumen_mensual_estimado") as string;
  const notas = (formData.get("notas") as string) || null;

  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("dropshippers").select("estado").eq("id", id).single();
  const { error } = await supabase
    .from("dropshippers")
    .update({
      estado,
      volumen_mensual_estimado: volumenRaw === "" ? null : Number(volumenRaw),
      notas,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  if (actual && actual.estado !== estado) {
    await registrarAuditoria({
      accion: "cambiar_estado_dropshipper",
      entidad: "dropshippers",
      entidadId: id,
      antes: { Estado: etiquetaEstado(actual.estado) },
      despues: { Estado: etiquetaEstado(estado) },
    });
  }
  revalidatePath("/crm-dropshippers", "layout");
}

/** La actividad de un dropshipper (agregado, cambios de estado...) para su tarjeta. Es una lectura, así que basta
 * poder abrir CRM Dropshippers. Devuelve el error como valor, no lo lanza. */
export async function obtenerHistorialDropshipper(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo("crm-dropshippers");
  if (typeof id !== "string" || !/^[0-9a-fA-F-]{8,64}$/.test(id)) return { error: "Dropshipper no válido." };

  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "dropshippers")
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };

  return {
    eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })),
  };
}

/** Devuelve el error como valor, no lo lanza (ver `crearDropshipper`). */
export async function registrarInteraccion(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("crm-dropshippers");
  const dropshipper_id = formData.get("dropshipper_id") as string;
  const fecha = formData.get("fecha") as string;
  const tipo = formData.get("tipo") as string;
  const nota = String(formData.get("nota") ?? "").trim();

  if (!dropshipper_id) return { error: "Elige el dropshipper." };
  if (!nota) return { error: "Escribe la nota de la interacción." };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("interacciones_dropshipper")
    .insert({ dropshipper_id, fecha, tipo, nota });
  if (error) return { error: error.message };
  revalidatePath("/crm-dropshippers", "layout");
  return {};
}

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);
const esUnoDe = (lista: readonly { valor: string }[], v: string) => lista.some((x) => x.valor === v);
const texto = (formData: FormData, campo: string) => String(formData.get(campo) ?? "").trim();

/** El país donde se registra un caso o un pedido: uno de los países donde ese dropshipper vende. */
async function resolverPais(supabase: ReturnType<typeof createServiceClient>, dropshipperId: string, codigo: string) {
  const { data: pais } = await supabase.from("paises").select("id").eq("codigo", codigo).maybeSingle();
  if (!pais) return { error: "Elige el país." } as const;
  const { data: vende } = await supabase
    .from("dropshipper_paises")
    .select("pais_id")
    .eq("dropshipper_id", dropshipperId)
    .eq("pais_id", pais.id)
    .maybeSingle();
  if (!vende) return { error: "Ese dropshipper no vende en ese país." } as const;
  return { id: pais.id as string };
}

/** Abre un caso de soporte. Devuelve el error como valor (ver `crearDropshipper`). */
export async function crearCaso(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("crm-dropshippers");
  const dropshipper_id = texto(formData, "dropshipper_id");
  const titulo = texto(formData, "titulo");
  const tipo = texto(formData, "tipo");
  const prioridad = texto(formData, "prioridad");
  const canal = texto(formData, "canal");
  const numero_pedido = texto(formData, "numero_pedido") || null;

  if (!ES_ID(dropshipper_id)) return { error: "Elige el dropshipper." };
  if (!titulo) return { error: "Escribe de qué trata el caso." };
  if (titulo.length > 200) return { error: "El título es muy largo (máximo 200 caracteres)." };
  if (!esUnoDe(TIPOS_CASO, tipo) || !esUnoDe(PRIORIDADES, prioridad) || !esUnoDe(CANALES, canal)) {
    return { error: "Revisa el tipo, la prioridad y el canal." };
  }

  const supabase = createServiceClient();
  const pais = await resolverPais(supabase, dropshipper_id, texto(formData, "pais"));
  if ("error" in pais) return { error: pais.error };

  const { data, error } = await supabase
    .from("casos_dropshipper")
    .insert({ dropshipper_id, pais_id: pais.id, titulo, tipo, prioridad, canal, numero_pedido })
    .select("id, numero")
    .single();
  if (error) return { error: "No se pudo abrir el caso." };
  await registrarAuditoria({
    accion: "crear_caso_dropshipper",
    entidad: "dropshippers",
    entidadId: dropshipper_id,
    detalle: `caso=${data.numero} ${titulo}`,
  });
  revalidatePath("/crm-dropshippers", "layout");
  return {};
}

/** Registra a mano un pedido de un dropshipper (hasta que Dropi los traiga solo). */
export async function crearPedidoManual(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("crm-dropshippers");
  const dropshipper_id = texto(formData, "dropshipper_id");
  const numero = texto(formData, "numero") || null;
  const fecha = texto(formData, "fecha");
  const estado = texto(formData, "estado");
  const monto = Number(texto(formData, "monto").replace(",", "."));

  if (!ES_ID(dropshipper_id)) return { error: "Elige el dropshipper." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) return { error: "Escribe la fecha del pedido." };
  if (!Number.isFinite(monto) || monto < 0 || monto > 1e9) return { error: "El monto debe ser un número mayor o igual a cero." };
  if (!esUnoDe(ESTADOS_PEDIDO, estado)) return { error: "Elige el estado del pedido." };

  const supabase = createServiceClient();
  const pais = await resolverPais(supabase, dropshipper_id, texto(formData, "pais"));
  if ("error" in pais) return { error: pais.error };

  const { error } = await supabase
    .from("pedidos_dropshipper")
    .insert({ dropshipper_id, pais_id: pais.id, numero, fecha, monto, estado, origen: "manual" });
  if (error) return { error: "No se pudo guardar el pedido." };
  await registrarAuditoria({
    accion: "crear_pedido_dropshipper",
    entidad: "dropshippers",
    entidadId: dropshipper_id,
    detalle: `pedido=${numero ?? "—"} monto=${monto}`,
  });
  revalidatePath("/crm-dropshippers", "layout");
  return {};
}

const lista = (valor: string, max: number) =>
  [...new Set(valor.split(",").map((e) => e.trim()).filter(Boolean))].slice(0, max);

/** Edita los datos de un dropshipper. Devuelve el error como valor (ver `crearDropshipper`). */
export async function editarDropshipper(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("crm-dropshippers");
  const id = texto(formData, "id");
  const nombre = texto(formData, "nombre");
  const estado = texto(formData, "estado");
  const nivel = texto(formData, "nivel");
  const tienda = texto(formData, "tienda") || null;
  const ciudad = texto(formData, "ciudad") || null;
  const contacto_email = texto(formData, "contacto_email").toLowerCase() || null;
  const notas = texto(formData, "notas") || null;
  const etiquetas = lista(texto(formData, "etiquetas"), 30);
  const productos = lista(texto(formData, "productos"), 60);

  if (!ES_ID(id)) return { error: "Dropshipper no válido." };
  if (!nombre) return { error: "Escribe el nombre del dropshipper." };
  if (!esUnoDe(ESTADOS, estado) || !esUnoDe(NIVELES, nivel)) return { error: "Revisa el estado y el nivel." };
  if (contacto_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto_email)) return { error: "El correo no es válido." };

  const supabase = createServiceClient();
  const { data: actual } = await supabase
    .from("dropshippers")
    .select("estado, nivel, contacto_telefono, dropshipper_paises(paises(codigo))")
    .eq("id", id)
    .single();
  if (!actual) return { error: "No se encontró el dropshipper." };

  // El WhatsApp se guarda en formato internacional; sin prefijo se asume el primer país donde vende.
  let contacto_telefono: string | null = null;
  let pais_origen: string | null | undefined;
  const telefonoTexto = texto(formData, "contacto_telefono");
  if (telefonoTexto) {
    const primero = ((actual.dropshipper_paises ?? []) as unknown as { paises: { codigo: string } | { codigo: string }[] | null }[])
      .map((p) => (Array.isArray(p.paises) ? p.paises[0]?.codigo : p.paises?.codigo))
      .find(Boolean);
    const tel = normalizarTelefono(telefonoTexto, primero);
    if (!tel) return { error: "El teléfono no es válido. Escríbelo con el prefijo del país, p. ej. +57 300 111 2233." };
    contacto_telefono = tel.e164;
    if (tel.e164 !== actual.contacto_telefono) pais_origen = tel.pais;
  }

  const { error } = await supabase
    .from("dropshippers")
    .update({
      nombre,
      estado,
      nivel,
      tienda,
      ciudad,
      contacto_email,
      contacto_telefono,
      notas,
      etiquetas,
      productos,
      ...(pais_origen !== undefined ? { pais_origen } : {}),
    })
    .eq("id", id);
  if (error) return { error: error.code === "23505" ? "Ya hay un dropshipper con ese WhatsApp." : "No se pudo guardar." };

  const antes: Record<string, string> = {};
  const despues: Record<string, string> = {};
  if (actual.estado !== estado) {
    antes.Estado = etiquetaEstado(actual.estado);
    despues.Estado = etiquetaEstado(estado);
  }
  if (actual.nivel !== nivel) {
    antes.Nivel = etiquetaNivel(actual.nivel);
    despues.Nivel = etiquetaNivel(nivel);
  }
  const cambioDeEstado = Object.keys(despues).length > 0;
  await registrarAuditoria({
    accion: cambioDeEstado ? "cambiar_estado_dropshipper" : "editar_dropshipper",
    entidad: "dropshippers",
    entidadId: id,
    ...(cambioDeEstado ? { antes, despues } : { detalle: "datos editados" }),
  });
  revalidatePath("/crm-dropshippers", "layout");
  return {};
}

// ---- Cuentas de plataforma vinculadas (Dropi hoy; Boxful y EFI cuando lleguen) y su desempeño ----

export interface UsuarioPlataforma {
  idExterno: string;
  tienda: string | null;
  pedidos: number;
  ultimoPedido: string | null;
  dropshipperId: string | null;
  dropshipperNombre: string | null;
}

/** Los usuarios de una plataforma que tienen pedidos en un país, para elegir a cuál vincular un dropshipper. */
export async function listarUsuariosPlataforma(
  codigoPais: string,
  plataforma: string,
): Promise<{ usuarios: UsuarioPlataforma[] } | { error: string }> {
  await requireModulo("crm-dropshippers");
  const supabase = createServiceClient();
  const [{ data: pais }, { data: plat }] = await Promise.all([
    supabase.from("paises").select("id").eq("codigo", codigoPais).maybeSingle(),
    supabase.from("plataformas").select("id").eq("nombre", plataforma).maybeSingle(),
  ]);
  if (!pais || !plat) return { error: "País o plataforma no válidos." };
  const { data, error } = await supabase.rpc("crm_usuarios_plataforma", { p_plataforma: plat.id, p_pais: pais.id });
  if (error) return { error: "No se pudo cargar la lista de usuarios." };
  return {
    usuarios: (data ?? []).map((u: Record<string, unknown>) => ({
      idExterno: String(u.id_externo),
      tienda: (u.tienda_nombre as string | null) ?? null,
      pedidos: Number(u.pedidos),
      ultimoPedido: (u.ultimo_pedido as string | null) ?? null,
      dropshipperId: (u.dropshipper_id as string | null) ?? null,
      dropshipperNombre: (u.dropshipper_nombre as string | null) ?? null,
    })),
  };
}

/** Vincula un dropshipper con un usuario de una plataforma. Devuelve el error como valor (ver `crearDropshipper`). */
export async function vincularCuenta(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("crm-dropshippers");
  const dropshipper_id = texto(formData, "dropshipper_id");
  const id_externo = texto(formData, "id_externo");
  const tienda_nombre = texto(formData, "tienda_nombre") || null;
  if (!ES_ID(dropshipper_id)) return { error: "Dropshipper no válido." };
  if (!/^[\w.-]{1,64}$/.test(id_externo)) return { error: "Elige el usuario de la plataforma." };

  const supabase = createServiceClient();
  const [{ data: pais }, { data: plat }] = await Promise.all([
    supabase.from("paises").select("id").eq("codigo", texto(formData, "pais")).maybeSingle(),
    supabase.from("plataformas").select("id, nombre").eq("nombre", texto(formData, "plataforma")).maybeSingle(),
  ]);
  if (!pais || !plat) return { error: "Elige el país y la plataforma." };

  const { error } = await supabase
    .from("dropshipper_cuentas")
    .insert({ dropshipper_id, plataforma_id: plat.id, pais_id: pais.id, id_externo, tienda_nombre });
  if (error) {
    return { error: error.code === "23505" ? "Ese usuario ya está vinculado a un dropshipper." : "No se pudo vincular la cuenta." };
  }
  // Para que sus cifras de ese país aparezcan en el directorio, el dropshipper debe vender en él.
  await supabase.from("dropshipper_paises").upsert({ dropshipper_id, pais_id: pais.id }, { onConflict: "dropshipper_id,pais_id", ignoreDuplicates: true });
  await registrarAuditoria({
    accion: "vincular_cuenta_dropshipper",
    entidad: "dropshippers",
    entidadId: dropshipper_id,
    detalle: `${plat.nombre} usuario ${id_externo}${tienda_nombre ? ` (${tienda_nombre})` : ""}`,
  });
  revalidatePath("/crm-dropshippers", "layout");
  return {};
}

/** Quita el vínculo con una cuenta de plataforma (los pedidos siguen guardados; solo dejan de contarse para el dropshipper). */
export async function desvincularCuenta(cuentaId: string): Promise<{ error?: string }> {
  await requireModuloEscritura("crm-dropshippers");
  if (!ES_ID(cuentaId)) return { error: "Cuenta no válida." };
  const supabase = createServiceClient();
  const { data: cuenta } = await supabase
    .from("dropshipper_cuentas")
    .select("dropshipper_id, id_externo, plataformas(nombre)")
    .eq("id", cuentaId)
    .maybeSingle();
  if (!cuenta) return { error: "La cuenta ya no existe." };
  const { error } = await supabase.from("dropshipper_cuentas").delete().eq("id", cuentaId);
  if (error) return { error: "No se pudo desvincular." };
  const plataforma = Array.isArray(cuenta.plataformas) ? cuenta.plataformas[0]?.nombre : (cuenta.plataformas as { nombre: string } | null)?.nombre;
  await registrarAuditoria({
    accion: "desvincular_cuenta_dropshipper",
    entidad: "dropshippers",
    entidadId: cuenta.dropshipper_id,
    detalle: `${plataforma ?? "Plataforma"} usuario ${cuenta.id_externo}`,
  });
  revalidatePath("/crm-dropshippers", "layout");
  return {};
}

export interface DesempenoPais {
  codigoPais: string;
  pedidos: number;
  despachados: number;
  entregados: number;
  devueltos: number;
  cancelados: number;
  conNovedad: number;
  ventas: number;
}
export interface ProductoVendido {
  producto: string;
  sku: string | null;
  unidades: number;
  entregadas: number;
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lo que hizo un dropshipper en Dropi (u otra plataforma vinculada) entre dos fechas: guías, despachadas, entregadas,
 * tasa de entrega y productos. Las sumas las hace Postgres (`crm_desempeno`, `crm_productos_vendidos`). Es una lectura:
 * basta poder abrir el CRM. Devuelve el error como valor.
 */
export async function obtenerDesempeno(
  dropshipperId: string,
  desde: string,
  hasta: string,
): Promise<{ paises: DesempenoPais[]; productos: ProductoVendido[] } | { error: string }> {
  await requireModulo("crm-dropshippers");
  if (!ES_ID(dropshipperId)) return { error: "Dropshipper no válido." };
  if (!FECHA_ISO.test(desde) || !FECHA_ISO.test(hasta) || Number.isNaN(Date.parse(desde)) || Number.isNaN(Date.parse(hasta))) {
    return { error: "Las fechas no son válidas." };
  }
  if (desde > hasta) return { error: "La fecha de inicio es posterior a la final." };
  if (Date.parse(hasta) - Date.parse(desde) > 3 * 366 * 86_400_000) return { error: "Elige un período de hasta 3 años." };

  const supabase = createServiceClient();
  const [resumen, productos, paises] = await Promise.all([
    supabase.rpc("crm_desempeno", { p_dropshipper: dropshipperId, p_desde: desde, p_hasta: hasta }),
    supabase.rpc("crm_productos_vendidos", { p_dropshipper: dropshipperId, p_desde: desde, p_hasta: hasta }),
    supabase.from("paises").select("id, codigo"),
  ]);
  if (resumen.error || productos.error) return { error: "No se pudo cargar el desempeño." };
  const codigo = new Map((paises.data ?? []).map((p) => [p.id as string, p.codigo as string]));
  return {
    paises: (resumen.data ?? []).map((r: Record<string, unknown>) => ({
      codigoPais: codigo.get(r.pais_id as string) ?? "—",
      pedidos: Number(r.pedidos),
      despachados: Number(r.despachados),
      entregados: Number(r.entregados),
      devueltos: Number(r.devueltos),
      cancelados: Number(r.cancelados),
      conNovedad: Number(r.con_novedad),
      ventas: Number(r.ventas),
    })),
    productos: (productos.data ?? []).map((p: Record<string, unknown>) => ({
      producto: String(p.producto),
      sku: (p.sku as string | null) ?? null,
      unidades: Number(p.unidades),
      entregadas: Number(p.entregadas),
    })),
  };
}
