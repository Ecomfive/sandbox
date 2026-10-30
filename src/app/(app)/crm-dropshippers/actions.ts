"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria, registrarAuditoriaLote } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { mencionadosValidos, notificarMenciones } from "@/lib/menciones";
import { ACCIONES_COMERCIALES, FASES, MODULO_ATENCION, MODULO_COMERCIAL, accesoCrm, areaParaNota, areasVisibles, etiquetaFase } from "@/lib/crm/areas";
import { normalizarTelefono } from "@/lib/crm/telefono";
import { enlazarChatsPorTelefono, telefonoDeOtro } from "@/lib/whatsapp/vinculo";
import { CANALES, PRIORIDADES, TIPOS_CASO, etiquetaEstado, etiquetaTipo } from "./def-crm";

/** Devuelve el error como valor, no lo lanza: en producción Next.js oculta el mensaje de una excepción de una acción. */
export async function crearDropshipper(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("crm-dropshippers");
  const pais_id = String(formData.get("pais_id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const contacto_email = String(formData.get("contacto_email") ?? "").trim() || null;
  const telefonoTexto = String(formData.get("contacto_telefono") ?? "").trim();
  const tiendas = listaTiendas(formData);
  const ciudad = String(formData.get("ciudad") ?? "").trim() || null;
  // La captación (ferias, eventos) es del área comercial: solo quien la tiene puede crear un dropshipper «captado».
  const faseNueva = String(formData.get("fase") ?? "activo");
  const fase = FASES.some((f) => f.valor === faseNueva) && (faseNueva === "activo" || accesoCrm(usuario).escribeComercial) ? faseNueva : "activo";

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
    if (await telefonoDeOtro(supabase, tel.e164, null)) return { error: "Ya hay un dropshipper con ese WhatsApp." };
  }

  const { data, error } = await supabase
    .from("dropshippers")
    .insert({ pais_id, nombre, tienda: tiendas[0] ?? null, tiendas, ciudad, contacto_email, contacto_telefono, pais_origen, fase, captado_en: fase === "activo" ? null : new Date().toLocaleDateString("en-CA") })
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
  // Si ya había chats de ese número, quedan enlazados desde ahora.
  if (contacto_telefono && (await enlazarChatsPorTelefono(supabase, data.id, contacto_telefono)) > 0) revalidatePath("/crm-dropshippers/bandeja");
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

/** Devuelve el error como valor, no lo lanza (ver `crearDropshipper`). La nota queda en el área de quien la escribe. */
export async function registrarInteraccion(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO_ATENCION);
  const dropshipper_id = formData.get("dropshipper_id") as string;
  const fecha = formData.get("fecha") as string;
  const tipo = formData.get("tipo") as string;
  const nota = String(formData.get("nota") ?? "").trim();
  // La nota se guarda en el área de quien la escribe; Atención no puede crear notas comerciales.
  const area = areaParaNota(accesoCrm(usuario), String(formData.get("area") ?? "") || undefined);

  if (!dropshipper_id) return { error: "Elige el dropshipper." };
  if (!area) return { error: "No tienes permiso para escribir en esa área." };
  if (!nota) return { error: "Escribe la nota de la interacción." };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("interacciones_dropshipper")
    .insert({ dropshipper_id, fecha, tipo, nota, area, creado_por: usuario.id });
  if (error) return { error: error.message };

  // Las personas etiquetadas con «@» reciben un aviso «Para ti» que abre la ficha de este dropshipper.
  const mencionados = await mencionadosValidos(formData.getAll("menciones").map(String), nota, usuario.id);
  if (mencionados.length) {
    const { data: d } = await supabase.from("dropshippers").select("nombre, codigo").eq("id", dropshipper_id).maybeSingle();
    const autor = usuario.nombre || usuario.email;
    await notificarMenciones({
      mencionados,
      autorId: usuario.id,
      autorNombre: autor,
      titulo: `${autor} te mencionó en una nota de ${d ? `${d.nombre}${d.codigo ? ` (${d.codigo})` : ""}` : "un dropshipper"}`,
      texto: nota,
      href: `/crm-dropshippers?abrir=${dropshipper_id}`,
    });
  }
  revalidatePath("/crm-dropshippers", "layout");
  return {};
}

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);
const esUnoDe = (lista: readonly { valor: string }[], v: string) => lista.some((x) => x.valor === v);
const texto = (formData: FormData, campo: string) => String(formData.get(campo) ?? "").trim();

/** Las tiendas del formulario (un campo `tienda` por cada una): sin vacías ni repetidas, hasta 20. */
const listaTiendas = (formData: FormData) =>
  [...new Set(formData.getAll("tienda").map((v) => String(v).trim().slice(0, 200)).filter(Boolean))].slice(0, 20);

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
  // Uno o varios usuarios (29 oct 2026): un mismo dropshipper puede tener varios usuarios de Dropi. Cada `id_externo` va con su `tienda_nombre`.
  const ids = formData.getAll("id_externo").map((v) => String(v).trim());
  const tiendas = formData.getAll("tienda_nombre").map((v) => String(v).trim());
  if (!ES_ID(dropshipper_id)) return { error: "Dropshipper no válido." };
  if (!ids.length || ids.some((id) => !/^[\w.-]{1,64}$/.test(id))) return { error: "Elige el usuario de la plataforma." };
  if (ids.length > 30) return { error: "Son demasiados usuarios de una vez (máximo 30)." };
  if (new Set(ids).size !== ids.length) return { error: "Elegiste el mismo usuario dos veces." };

  const supabase = createServiceClient();
  const [{ data: pais }, { data: plat }] = await Promise.all([
    supabase.from("paises").select("id").eq("codigo", texto(formData, "pais")).maybeSingle(),
    supabase.from("plataformas").select("id, nombre").eq("nombre", texto(formData, "plataforma")).maybeSingle(),
  ]);
  if (!pais || !plat) return { error: "Elige el país y la plataforma." };

  const filas = ids.map((id_externo, n) => ({ dropshipper_id, plataforma_id: plat.id, pais_id: pais.id, id_externo, tienda_nombre: tiendas[n] || null }));
  const { error } = await supabase.from("dropshipper_cuentas").insert(filas);
  if (error) {
    return {
      error:
        error.code === "23505"
          ? ids.length > 1
            ? "Alguno de esos usuarios ya está vinculado a un dropshipper: no se vinculó ninguno."
            : "Ese usuario ya está vinculado a un dropshipper."
          : ids.length > 1
            ? "No se pudieron vincular las cuentas."
            : "No se pudo vincular la cuenta.",
    };
  }
  // Para que sus cifras de ese país aparezcan en el directorio, el dropshipper debe vender en él.
  await supabase.from("dropshipper_paises").upsert({ dropshipper_id, pais_id: pais.id }, { onConflict: "dropshipper_id,pais_id", ignoreDuplicates: true });
  await registrarAuditoriaLote(
    filas.map((f) => ({
      accion: "vincular_cuenta_dropshipper",
      entidad: "dropshippers",
      entidadId: dropshipper_id,
      detalle: `${plat.nombre} usuario ${f.id_externo}${f.tienda_nombre ? ` (${f.tienda_nombre})` : ""}`,
    })),
  );
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

// ---- Áreas: seguimientos comerciales, escalar un caso, captación y línea de tiempo por área ----

export interface Seguimiento {
  id: string;
  titulo: string;
  detalle: string | null;
  vence: string | null;
  estado: "pendiente" | "hecha";
  escalado: boolean;
  responsable: string | null;
}

/** Los seguimientos del área comercial de un dropshipper. Solo quien tiene el área comercial los puede ver. */
export async function obtenerSeguimientos(dropshipperId: string): Promise<{ seguimientos: Seguimiento[] } | { error: string }> {
  await requireModulo(MODULO_COMERCIAL);
  if (!ES_ID(dropshipperId)) return { error: "Dropshipper no válido." };
  const { data, error } = await createServiceClient()
    .from("tareas_dropshipper")
    .select("id, titulo, detalle, vence, estado, origen, perfiles:responsable_id(nombre)")
    .eq("dropshipper_id", dropshipperId)
    .order("estado", { ascending: true })
    .order("vence", { ascending: true, nullsFirst: false })
    .limit(30);
  if (error) return { error: "No se pudieron cargar los seguimientos." };
  return {
    seguimientos: (data ?? []).map((t) => ({
      id: t.id,
      titulo: t.titulo,
      detalle: t.detalle,
      vence: t.vence,
      estado: t.estado,
      escalado: t.origen === "escalado",
      responsable: (Array.isArray(t.perfiles) ? t.perfiles[0]?.nombre : (t.perfiles as { nombre: string | null } | null)?.nombre) ?? null,
    })),
  };
}

/** Crea un seguimiento comercial. Devuelve el error como valor (ver `crearDropshipper`). */
export async function crearSeguimiento(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO_COMERCIAL);
  const dropshipper_id = texto(formData, "dropshipper_id");
  const titulo = texto(formData, "titulo");
  const detalle = texto(formData, "detalle") || null;
  const vence = texto(formData, "vence") || null;
  if (!ES_ID(dropshipper_id)) return { error: "Dropshipper no válido." };
  if (!titulo) return { error: "Escribe qué hay que hacer." };
  if (titulo.length > 200) return { error: "El título es muy largo (máximo 200 caracteres)." };
  if (vence && (!/^\d{4}-\d{2}-\d{2}$/.test(vence) || Number.isNaN(Date.parse(vence)))) return { error: "La fecha no es válida." };

  const { data, error } = await createServiceClient()
    .from("tareas_dropshipper")
    .insert({ dropshipper_id, titulo, detalle, vence, responsable_id: usuario.id, creado_por: usuario.id })
    .select("id")
    .single();
  if (error) return { error: "No se pudo crear el seguimiento." };
  await registrarAuditoria({ accion: "crear_seguimiento_dropshipper", entidad: "dropshippers", entidadId: dropshipper_id, detalle: titulo });
  void data;
  revalidatePath("/crm-dropshippers", "layout");
  return {};
}

/** Marca un seguimiento como hecho (o lo vuelve a abrir). */
export async function completarSeguimiento(id: string, hecha: boolean): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO_COMERCIAL);
  if (!ES_ID(id)) return { error: "Seguimiento no válido." };
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("tareas_dropshipper")
    .update({ estado: hecha ? "hecha" : "pendiente", hecha_en: hecha ? new Date().toISOString() : null })
    .eq("id", id)
    .select("dropshipper_id, titulo")
    .maybeSingle();
  if (error || !data) return { error: "No se pudo actualizar el seguimiento." };
  if (hecha) {
    await registrarAuditoria({ accion: "completar_seguimiento_dropshipper", entidad: "dropshippers", entidadId: data.dropshipper_id, detalle: data.titulo });
  }
  revalidatePath("/crm-dropshippers", "layout");
  return {};
}

/**
 * Atención pasa un caso a Comercial: crea un seguimiento para el líder comercial del dropshipper (o sin asignar) con el
 * contexto del caso. Basta poder escribir en Atención; quien lo hace no ve el área comercial.
 */
export async function escalarCaso(casoId: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO_ATENCION);
  if (!ES_ID(casoId)) return { error: "Caso no válido." };
  const supabase = createServiceClient();
  const { data: caso } = await supabase
    .from("casos_dropshipper")
    .select("id, numero, titulo, dropshipper_id, escalado_en, dropshippers(responsable_id)")
    .eq("id", casoId)
    .maybeSingle();
  if (!caso) return { error: "No se encontró el caso." };
  if (caso.escalado_en) return { error: "Este caso ya se pasó a Comercial." };

  const responsable = (Array.isArray(caso.dropshippers) ? caso.dropshippers[0] : caso.dropshippers) as { responsable_id: string | null } | null;
  const { error } = await supabase.from("tareas_dropshipper").insert({
    dropshipper_id: caso.dropshipper_id,
    titulo: `Caso #${caso.numero}: ${caso.titulo}`.slice(0, 200),
    origen: "escalado",
    caso_id: caso.id,
    responsable_id: responsable?.responsable_id ?? null,
    creado_por: usuario.id,
  });
  if (error) return { error: "No se pudo pasar el caso a Comercial." };
  await supabase.from("casos_dropshipper").update({ escalado_en: new Date().toISOString() }).eq("id", caso.id);
  await registrarAuditoria({ accion: "escalar_caso_dropshipper", entidad: "dropshippers", entidadId: caso.dropshipper_id, detalle: `caso=${caso.numero}` });
  revalidatePath("/crm-dropshippers", "layout");
  return {};
}

export interface LiderComercial {
  id: string;
  nombre: string;
}

/** Las personas que pueden llevar dropshippers en lo comercial: las de un rol con acceso al área comercial. */
export async function obtenerLideresComerciales(): Promise<{ lideres: LiderComercial[] } | { error: string }> {
  await requireModulo(MODULO_COMERCIAL);
  const supabase = createServiceClient();
  const { data: roles, error } = await supabase.from("permisos_rol").select("rol_id").eq("modulo", MODULO_COMERCIAL);
  if (error) return { error: "No se pudo cargar la lista." };
  const ids = (roles ?? []).map((r) => r.rol_id);
  // Lo propio de cada persona (migración 0118) manda sobre su rol: a quien se le dio el área comercial aparte también cuenta, y a
  // quien se le quitó, no. Sin la migración, no hay nada propio.
  const { data: propios, error: errorPropios } = await supabase.from("permisos_persona").select("perfil_id, nivel").eq("modulo", MODULO_COMERCIAL);
  const conPropio = errorPropios ? [] : (propios ?? []);
  const sumados = conPropio.filter((p) => p.nivel !== "ninguno").map((p) => p.perfil_id as string);
  const quitados = new Set(conPropio.filter((p) => p.nivel === "ninguno").map((p) => p.perfil_id as string));
  if (ids.length === 0 && sumados.length === 0) return { lideres: [] };
  const { data: perfiles } = await supabase.from("perfiles").select("id, nombre, email, rol_id").eq("activo", true).order("nombre");
  const elegibles = (perfiles ?? []).filter((p) => !quitados.has(p.id) && ((p.rol_id && ids.includes(p.rol_id)) || sumados.includes(p.id)));
  return { lideres: elegibles.map((p) => ({ id: p.id, nombre: p.nombre || p.email })) };
}

/** Cambia la fase de captación de un dropshipper y/o le asigna su líder comercial (la «transferencia»). */
export async function transferirDropshipper(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO_COMERCIAL);
  const dropshipper_id = texto(formData, "dropshipper_id");
  const fase = texto(formData, "fase");
  const responsable_id = texto(formData, "responsable_id") || null;
  if (!ES_ID(dropshipper_id)) return { error: "Dropshipper no válido." };
  if (!FASES.some((f) => f.valor === fase)) return { error: "Elige la fase." };
  if (responsable_id && !ES_ID(responsable_id)) return { error: "Líder no válido." };

  const supabase = createServiceClient();
  if (responsable_id) {
    const lideres = await obtenerLideresComerciales();
    if ("error" in lideres || !lideres.lideres.some((l) => l.id === responsable_id)) return { error: "Esa persona no tiene el área comercial." };
  }
  const { data: antes } = await supabase
    .from("dropshippers")
    .select("fase, perfiles:responsable_id(nombre)")
    .eq("id", dropshipper_id)
    .maybeSingle();
  if (!antes) return { error: "No se encontró el dropshipper." };

  const { error } = await supabase.from("dropshippers").update({ fase, responsable_id }).eq("id", dropshipper_id);
  if (error) return { error: "No se pudo guardar." };

  const nombreAntes = (Array.isArray(antes.perfiles) ? antes.perfiles[0]?.nombre : (antes.perfiles as { nombre: string | null } | null)?.nombre) ?? "Sin asignar";
  let nombreDespues = "Sin asignar";
  if (responsable_id) {
    const { data: p } = await supabase.from("perfiles").select("nombre, email").eq("id", responsable_id).maybeSingle();
    nombreDespues = p?.nombre || p?.email || "Sin asignar";
  }
  await registrarAuditoria({
    accion: "transferir_dropshipper",
    entidad: "dropshippers",
    entidadId: dropshipper_id,
    antes: { Fase: etiquetaFase(antes.fase), "Líder comercial": nombreAntes },
    despues: { Fase: etiquetaFase(fase), "Líder comercial": nombreDespues },
  });
  revalidatePath("/crm-dropshippers", "layout");
  return {};
}

export interface ItemLinea {
  id: string;
  area: "comercial" | "atencion" | "general";
  texto: string;
  creadoEn: string;
  /** Quién lo hizo, y lo que hizo sin su nombre: la Actividad común los muestra por separado, como en Compras. */
  autor?: string | null;
  detalle?: string;
}

/**
 * Todo lo que ha pasado con un dropshipper, del más nuevo al más viejo: notas, casos, seguimientos y cambios en la
 * ficha. Atención no recibe las notas, los seguimientos ni los cambios comerciales: se filtran aquí, en el servidor.
 */
export async function obtenerLineaDeTiempo(id: string): Promise<{ items: ItemLinea[]; verComercial: boolean } | { error: string }> {
  const usuario = await requireModulo(MODULO_ATENCION);
  if (!ES_ID(id)) return { error: "Dropshipper no válido." };
  const acceso = accesoCrm(usuario);
  const supabase = createServiceClient();

  let auditoria = supabase
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "dropshippers")
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(40);
  if (!acceso.comercial) auditoria = auditoria.not("accion", "in", `(${ACCIONES_COMERCIALES.join(",")})`);

  // Lo que el equipo hizo en sus chats de WhatsApp (cambiar el nombre, pasarlo de área, tomarlo, etiquetas…), de las áreas que ve la persona
  // (29 oct 2026, pedido de Alcides: una sola Actividad con todo). Los mensajes no van: están en el chat.
  const chats = await supabase.from("whatsapp_conversaciones").select("id").eq("dropshipper_id", id).in("area", areasVisibles(acceso));
  const idsChats = (chats.data ?? []).map((c) => c.id as string);
  const deChats = idsChats.length
    ? supabase
        .from("historial_auditoria")
        .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
        .eq("entidad", "whatsapp_conversaciones")
        .in("entidad_id", idsChats)
        .not("accion", "in", "(enviar_archivo_whatsapp,enviar_plantilla_whatsapp,marcar_leido_whatsapp)")
        .order("creado_en", { ascending: false })
        .limit(40)
    : Promise.resolve({ data: [] as { id: number; accion: string; usuario_nombre: string | null; detalle: string | null; antes: Record<string, string> | null; despues: Record<string, string> | null; creado_en: string }[], error: null });

  const [notas, casos, tareas, eventos, eventosChat] = await Promise.all([
    supabase
      .from("interacciones_dropshipper")
      .select("id, tipo, nota, area, creado_en, fecha, perfiles:creado_por(nombre)")
      .eq("dropshipper_id", id)
      .in("area", areasVisibles(acceso))
      .order("fecha", { ascending: false })
      .limit(60),
    supabase
      .from("casos_dropshipper")
      .select("id, numero, titulo, abierto_en, resuelto_en, escalado_en")
      .eq("dropshipper_id", id)
      .order("abierto_en", { ascending: false })
      .limit(30),
    acceso.comercial
      ? supabase.from("tareas_dropshipper").select("id, titulo, origen, creado_en, hecha_en").eq("dropshipper_id", id).order("creado_en", { ascending: false }).limit(30)
      : Promise.resolve({ data: [] as { id: string; titulo: string; origen: string; creado_en: string; hecha_en: string | null }[], error: null }),
    auditoria,
    deChats,
  ]);
  if (notas.error || casos.error || tareas.error || eventos.error) return { error: "No se pudo cargar la actividad." };

  const items: ItemLinea[] = [];
  for (const n of notas.data ?? []) {
    const autor = (Array.isArray(n.perfiles) ? n.perfiles[0]?.nombre : (n.perfiles as { nombre: string | null } | null)?.nombre) ?? null;
    items.push({
      id: `n-${n.id}`,
      area: n.area === "comercial" ? "comercial" : "atencion",
      texto: `${autor ? `${autor}: ` : ""}${etiquetaTipo(n.tipo)} — ${n.nota}`,
      autor,
      detalle: `${etiquetaTipo(n.tipo)} — ${n.nota}`,
      creadoEn: n.creado_en ?? `${n.fecha}T12:00:00Z`,
    });
  }
  for (const c of casos.data ?? []) {
    const codigo = `CAS-${String(c.numero).padStart(4, "0")}`;
    items.push({ id: `c-${c.id}`, area: "atencion", texto: `Caso ${codigo} abierto: ${c.titulo}`, creadoEn: c.abierto_en });
    if (c.resuelto_en) items.push({ id: `cr-${c.id}`, area: "atencion", texto: `Caso ${codigo} resuelto`, creadoEn: c.resuelto_en });
    if (c.escalado_en && acceso.comercial) items.push({ id: `ce-${c.id}`, area: "comercial", texto: `Caso ${codigo} pasado a Comercial`, creadoEn: c.escalado_en });
  }
  for (const t of tareas.data ?? []) {
    items.push({ id: `t-${t.id}`, area: "comercial", texto: `Seguimiento${t.origen === "escalado" ? " (desde Atención)" : ""}: ${t.titulo}`, creadoEn: t.creado_en });
    if (t.hecha_en) items.push({ id: `th-${t.id}`, area: "comercial", texto: `Seguimiento hecho: ${t.titulo}`, creadoEn: t.hecha_en });
  }
  for (const e of eventos.data ?? []) {
    items.push({
      id: `a-${e.id}`,
      area: ACCIONES_COMERCIALES.includes(e.accion) ? "comercial" : "general",
      texto: formatearEventoAuditoria(e),
      autor: e.usuario_nombre,
      detalle: formatearEventoAuditoria({ ...e, usuario_nombre: null }),
      creadoEn: e.creado_en,
    });
  }
  for (const e of eventosChat.error ? [] : (eventosChat.data ?? [])) {
    items.push({
      id: `w-${e.id}`,
      area: "general",
      texto: `${formatearEventoAuditoria(e)} (chat de WhatsApp)`,
      autor: e.usuario_nombre,
      detalle: `${formatearEventoAuditoria({ ...e, usuario_nombre: null })} (chat de WhatsApp)`,
      creadoEn: e.creado_en,
    });
  }
  items.sort((a, b) => Date.parse(b.creadoEn) - Date.parse(a.creadoEn));
  return { items: items.slice(0, 80), verComercial: acceso.comercial };
}

/**
 * Crea un dropshipper a partir de un usuario de la plataforma que no está en el CRM y lo vincula en un solo paso. El
 * nombre es el de su tienda en la plataforma (se corrige después desde la ficha); no tiene más datos de contacto.
 */
export async function crearDropshipperDesdeUsuario(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO_ATENCION);
  const id_externo = texto(formData, "id_externo");
  const tienda = texto(formData, "tienda_nombre") || null;
  if (!/^[\w.-]{1,64}$/.test(id_externo)) return { error: "Usuario no válido." };

  const supabase = createServiceClient();
  const [{ data: pais }, { data: plat }] = await Promise.all([
    supabase.from("paises").select("id").eq("codigo", texto(formData, "pais")).maybeSingle(),
    supabase.from("plataformas").select("id, nombre").eq("nombre", texto(formData, "plataforma")).maybeSingle(),
  ]);
  if (!pais || !plat) return { error: "Elige el país y la plataforma." };

  // Si el usuario ya se vinculó (otra persona, otra pestaña), no se crea un duplicado.
  const { data: yaVinculado } = await supabase
    .from("dropshipper_cuentas")
    .select("id")
    .eq("plataforma_id", plat.id)
    .eq("pais_id", pais.id)
    .eq("id_externo", id_externo)
    .maybeSingle();
  if (yaVinculado) return { error: "Ese usuario ya está vinculado a un dropshipper." };

  const nombre = (tienda ?? `Usuario ${id_externo} (${plat.nombre})`).slice(0, 200);
  const { data: nuevo, error } = await supabase
    .from("dropshippers")
    .insert({ pais_id: pais.id, nombre, tienda, tiendas: tienda ? [tienda] : [], estado: "activo" })
    .select("id")
    .single();
  if (error) return { error: "No se pudo crear el dropshipper." };

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from("dropshipper_paises").insert({ dropshipper_id: nuevo.id, pais_id: pais.id }),
    supabase.from("dropshipper_cuentas").insert({ dropshipper_id: nuevo.id, plataforma_id: plat.id, pais_id: pais.id, id_externo, tienda_nombre: tienda }),
  ]);
  if (e1 || e2) {
    await supabase.from("dropshippers").delete().eq("id", nuevo.id);
    return { error: "No se pudo vincular la cuenta." };
  }
  await registrarAuditoria({
    accion: "crear_dropshipper",
    entidad: "dropshippers",
    entidadId: nuevo.id,
    detalle: `nombre=${nombre} (desde el usuario ${id_externo} de ${plat.nombre})`,
  });
  revalidatePath("/crm-dropshippers", "layout");
  return {};
}
