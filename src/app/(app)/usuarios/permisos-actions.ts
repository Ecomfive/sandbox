"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura, type UsuarioActual } from "@/lib/auth";
import { propioDeNivel } from "@/lib/permisos/acceso";
import { resolverAfinado, valorDe, valorPorDefecto, valorValido, type FilaAfinada, type TipoAfinado } from "@/lib/permisos/afinado";
import { MODULOS_ACCESO, MODULOS_SENSIBLES, catalogoDe, etiquetaDeModulo, type Nivel } from "@/lib/permisos/catalogo";
import { esColorRol } from "@/lib/permisos/color-rol";
import { esUuid } from "@/lib/seguridad/ruta-almacen";

// Las acciones de Usuarios y roles que cambian lo que ve o puede cada rol y cada persona. Todas devuelven el error como valor (en
// producción Next.js oculta el mensaje de una excepción) y todas exigen poder MODIFICAR Usuarios y roles.

type Resultado = { error?: string };
const CLAVES_MODULO = new Set(MODULOS_ACCESO.map((m) => m.clave));
const NIVELES: readonly Nivel[] = ["n", "r", "w"];
const SIN_PERMISO = "Tu rol no puede modificar Usuarios y roles.";

async function exigir(): Promise<UsuarioActual | { error: string }> {
  try {
    return await requireModuloEscritura("usuarios");
  } catch (error) {
    return { error: error instanceof Error ? error.message : SIN_PERMISO };
  }
}
const fallo = (r: UsuarioActual | { error: string }): r is { error: string } => "error" in r;

function refrescar() {
  revalidatePath("/usuarios", "layout");
}

const textoNivel = (n: Nivel) => (n === "n" ? "sin acceso" : n === "r" ? "solo lectura" : "edición");

/** Nadie se puede quitar a sí misma la edición de Usuarios y roles desde su propio rol o ficha: se quedaría sin forma de volver. */
const SE_QUEDARIA_FUERA = "No puedes quitarte a ti misma la edición de Usuarios y roles.";

// ---------------------------------------------------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------------------------------------------------

async function ponerNivelRol(rolId: string, modulos: string[], nivel: Nivel): Promise<Resultado> {
  const supabase = createServiceClient();
  if (nivel === "n") {
    const { error } = await supabase.from("permisos_rol").delete().eq("rol_id", rolId).in("modulo", modulos);
    return error ? { error: error.message } : {};
  }
  const { error } = await supabase
    .from("permisos_rol")
    .upsert(modulos.map((modulo) => ({ rol_id: rolId, modulo, solo_lectura: nivel === "r" })), { onConflict: "rol_id,modulo" });
  return error ? { error: error.message } : {};
}

/** El nivel de un módulo para un rol: sin acceso, solo lectura o edición. */
export async function fijarNivelRol(rolId: string, modulo: string, nivel: Nivel): Promise<Resultado> {
  return fijarNivelRolLote(rolId, [modulo], nivel);
}

/** El mismo nivel para varios módulos a la vez (los botones de cada área de la matriz). */
export async function fijarNivelRolLote(rolId: string, modulos: string[], nivel: Nivel): Promise<Resultado> {
  const usuario = await exigir();
  if (fallo(usuario)) return usuario;
  if (!esUuid(rolId)) return { error: "Rol no válido." };
  if (!NIVELES.includes(nivel)) return { error: "Nivel no válido." };
  if (!Array.isArray(modulos) || modulos.length === 0 || modulos.length > MODULOS_ACCESO.length || !modulos.every((m) => CLAVES_MODULO.has(m))) return { error: "Módulo no válido." };
  const unicos = [...new Set(modulos)];
  if (usuario.rolId === rolId && unicos.includes("usuarios") && nivel !== "w") return { error: SE_QUEDARIA_FUERA };

  const supabase = createServiceClient();
  const { data: rol } = await supabase.from("roles").select("nombre").eq("id", rolId).maybeSingle();
  if (!rol) return { error: "Ese rol ya no existe." };
  const resultado = await ponerNivelRol(rolId, unicos, nivel);
  if (resultado.error) return resultado;
  await registrarAuditoria({
    accion: "cambiar_permiso_rol",
    entidad: "roles",
    entidadId: rolId,
    detalle: `${rol.nombre}: ${unicos.length === 1 ? etiquetaDeModulo(unicos[0]) : `${unicos.length} módulos`} → ${textoNivel(nivel)}`,
  });
  refrescar();
  return {};
}

export interface DatosRol {
  nombre: string;
  descripcion: string;
  color: string | null;
}

function limpiarDatosRol(datos: DatosRol): { error: string } | { nombre: string; descripcion: string | null; color: string | null } {
  const nombre = String(datos?.nombre ?? "").trim();
  if (!nombre) return { error: "Falta el nombre del rol." };
  if (nombre.length > 60) return { error: "El nombre del rol es muy largo (máximo 60 letras)." };
  const descripcion = String(datos?.descripcion ?? "").trim();
  if (descripcion.length > 240) return { error: "La descripción es muy larga (máximo 240 letras)." };
  return { nombre, descripcion: descripcion || null, color: esColorRol(datos?.color) ? datos.color : null };
}

const ERROR_NOMBRE_REPETIDO = "Ya existe un rol con ese nombre.";

/** Nombre, descripción y color del rol (lo que se cambia desde su cabecera). */
export async function guardarDatosRol(id: string, datos: DatosRol): Promise<Resultado> {
  const usuario = await exigir();
  if (fallo(usuario)) return usuario;
  if (!esUuid(id)) return { error: "Rol no válido." };
  const limpios = limpiarDatosRol(datos);
  if ("error" in limpios) return limpios;
  const supabase = createServiceClient();
  const { error } = await supabase.from("roles").update(limpios).eq("id", id);
  if (error) {
    if (error.message.includes("color")) return { error: "Falta correr la migración 0118 en Supabase." };
    return { error: error.code === "23505" ? ERROR_NOMBRE_REPETIDO : error.message };
  }
  await registrarAuditoria({ accion: "editar_rol", entidad: "roles", entidadId: id, detalle: limpios.nombre });
  refrescar();
  return {};
}

export type InicioRol = { tipo: "blanco" } | { tipo: "lectura" } | { tipo: "copiar"; rolId: string };

/** Copia los módulos y lo afinado de un rol a otro (`reemplazar` borra antes lo que el destino ya tenía). */
async function copiarPermisos(origenId: string, destinoId: string, reemplazar: boolean): Promise<Resultado> {
  const supabase = createServiceClient();
  const [{ data: permisos, error: e1 }, afinados] = await Promise.all([
    supabase.from("permisos_rol").select("modulo, solo_lectura").eq("rol_id", origenId),
    supabase.from("permisos_afinados").select("modulo, tipo, clave, valor").eq("rol_id", origenId),
  ]);
  if (e1) return { error: e1.message };
  if (reemplazar) {
    const { error } = await supabase.from("permisos_rol").delete().eq("rol_id", destinoId);
    if (error) return { error: error.message };
    await supabase.from("permisos_afinados").delete().eq("rol_id", destinoId);
  }
  if ((permisos ?? []).length > 0) {
    const { error } = await supabase.from("permisos_rol").insert((permisos ?? []).map((p) => ({ rol_id: destinoId, modulo: p.modulo, solo_lectura: p.solo_lectura })));
    if (error) return { error: error.message };
  }
  // Sin la migración 0118 no hay nada afinado que copiar: se sigue igual.
  if (!afinados.error && (afinados.data ?? []).length > 0) {
    const { error } = await supabase.from("permisos_afinados").insert((afinados.data ?? []).map((a) => ({ rol_id: destinoId, modulo: a.modulo, tipo: a.tipo, clave: a.clave, valor: a.valor })));
    if (error) return { error: error.message };
  }
  return {};
}

/** Crea un rol y le pone sus primeros permisos: en blanco, todo en solo lectura (menos lo sensible) o copiados de otro rol. */
export async function crearRolConPermisos(datos: DatosRol, inicio: InicioRol): Promise<Resultado & { id?: string }> {
  const usuario = await exigir();
  if (fallo(usuario)) return usuario;
  const limpios = limpiarDatosRol(datos);
  if ("error" in limpios) return limpios;
  if (inicio?.tipo === "copiar" && !esUuid(inicio.rolId)) return { error: "El rol que se copia no es válido." };

  const supabase = createServiceClient();
  const { data: creado, error } = await supabase.from("roles").insert(limpios).select("id").single();
  if (error || !creado) {
    if (error?.message.includes("color")) return { error: "Falta correr la migración 0118 en Supabase." };
    return { error: error?.code === "23505" ? ERROR_NOMBRE_REPETIDO : (error?.message ?? "No se pudo crear el rol.") };
  }

  let resultado: Resultado = {};
  if (inicio?.tipo === "copiar") resultado = await copiarPermisos(inicio.rolId, creado.id, false);
  else if (inicio?.tipo === "lectura") {
    const modulos = MODULOS_ACCESO.map((m) => m.clave).filter((m) => !MODULOS_SENSIBLES.has(m));
    resultado = await ponerNivelRol(creado.id, modulos, "r");
  }
  if (resultado.error) {
    await supabase.from("roles").delete().eq("id", creado.id);
    return resultado;
  }
  await registrarAuditoria({ accion: "crear_rol", entidad: "roles", entidadId: creado.id, detalle: limpios.nombre });
  refrescar();
  return { id: creado.id as string };
}

/** Un rol nuevo con los mismos módulos y ajustes que otro, llamado «Copia de …». */
export async function duplicarRol(id: string): Promise<Resultado & { id?: string }> {
  const usuario = await exigir();
  if (fallo(usuario)) return usuario;
  if (!esUuid(id)) return { error: "Rol no válido." };
  const supabase = createServiceClient();
  const { data: origen } = await supabase.from("roles").select("nombre, descripcion, color").eq("id", id).maybeSingle();
  if (!origen) return { error: "Ese rol ya no existe." };
  const { data: nombres } = await supabase.from("roles").select("nombre");
  const usados = new Set((nombres ?? []).map((n) => String(n.nombre).toLowerCase()));
  let nombre = `Copia de ${origen.nombre}`.slice(0, 60);
  for (let n = 2; usados.has(nombre.toLowerCase()) && n < 100; n++) nombre = `Copia de ${origen.nombre}`.slice(0, 54) + ` (${n})`;
  const creado = await crearRolConPermisos({ nombre, descripcion: origen.descripcion ?? "", color: origen.color ?? null }, { tipo: "copiar", rolId: id });
  if (creado.error) return creado;
  await registrarAuditoria({ accion: "duplicar_rol", entidad: "roles", entidadId: creado.id, detalle: `${origen.nombre} → ${nombre}` });
  return creado;
}

/** Deja al rol con los mismos módulos y ajustes que otro (lo que tenía se reemplaza). */
export async function copiarPermisosDeRol(rolId: string, desdeId: string): Promise<Resultado> {
  const usuario = await exigir();
  if (fallo(usuario)) return usuario;
  if (!esUuid(rolId) || !esUuid(desdeId) || rolId === desdeId) return { error: "Elige otro rol." };
  const supabase = createServiceClient();
  const [{ data: destino }, { data: origen }, { data: origenUsuarios }] = await Promise.all([
    supabase.from("roles").select("nombre").eq("id", rolId).maybeSingle(),
    supabase.from("roles").select("nombre").eq("id", desdeId).maybeSingle(),
    supabase.from("permisos_rol").select("solo_lectura").eq("rol_id", desdeId).eq("modulo", "usuarios").maybeSingle(),
  ]);
  if (!destino || !origen) return { error: "Ese rol ya no existe." };
  if (usuario.rolId === rolId && (!origenUsuarios || origenUsuarios.solo_lectura)) return { error: SE_QUEDARIA_FUERA };
  const resultado = await copiarPermisos(desdeId, rolId, true);
  if (resultado.error) return resultado;
  await registrarAuditoria({ accion: "copiar_permisos_rol", entidad: "roles", entidadId: rolId, detalle: `${destino.nombre} ← ${origen.nombre}` });
  refrescar();
  return {};
}

/** Borra un rol, salvo que todavía tenga personas asignadas: ahí se bloquea con un mensaje claro en vez de dejar perfiles sin rol. */
export async function eliminarRolPorId(id: string): Promise<Resultado> {
  const usuario = await exigir();
  if (fallo(usuario)) return usuario;
  if (!esUuid(id)) return { error: "Rol no válido." };
  const supabase = createServiceClient();
  const { count } = await supabase.from("perfiles").select("id", { count: "exact", head: true }).eq("rol_id", id);
  if (count && count > 0) return { error: `No se puede eliminar: ${count} persona${count === 1 ? "" : "s"} todavía ${count === 1 ? "tiene" : "tienen"} este rol.` };
  const { data: rol } = await supabase.from("roles").select("nombre").eq("id", id).maybeSingle();
  const { error } = await supabase.from("roles").delete().eq("id", id);
  if (error) return { error: error.message };
  await registrarAuditoria({ accion: "eliminar_rol", entidad: "roles", entidadId: id, detalle: rol?.nombre ?? id });
  refrescar();
  return {};
}

// ---------------------------------------------------------------------------------------------------------------------
// Permisos propios de una persona
// ---------------------------------------------------------------------------------------------------------------------

/** El nivel que da el rol de la persona a un módulo. */
async function nivelDelRolDe(perfilId: string, modulo: string): Promise<Nivel> {
  const supabase = createServiceClient();
  const { data: perfil } = await supabase.from("perfiles").select("rol_id").eq("id", perfilId).maybeSingle();
  if (!perfil?.rol_id) return "n";
  const { data } = await supabase.from("permisos_rol").select("solo_lectura").eq("rol_id", perfil.rol_id).eq("modulo", modulo).maybeSingle();
  return !data ? "n" : data.solo_lectura ? "r" : "w";
}

/**
 * Un permiso propio de la persona sobre un módulo: sin acceso, lectura o edición, por encima de lo que da su rol. `"rol"` quita el
 * permiso propio y deja el del rol. Si lo elegido es lo mismo que ya da el rol, no se guarda nada (así «Personalizado» es verdad).
 */
export async function fijarNivelPersona(perfilId: string, modulo: string, nivel: Nivel | "rol"): Promise<Resultado> {
  const usuario = await exigir();
  if (fallo(usuario)) return usuario;
  if (!esUuid(perfilId)) return { error: "Persona no válida." };
  if (!CLAVES_MODULO.has(modulo)) return { error: "Módulo no válido." };
  if (nivel !== "rol" && !NIVELES.includes(nivel)) return { error: "Nivel no válido." };
  if (usuario.id === perfilId && modulo === "usuarios" && nivel !== "rol" && nivel !== "w") return { error: SE_QUEDARIA_FUERA };

  const supabase = createServiceClient();
  const { data: persona } = await supabase.from("perfiles").select("nombre, email").eq("id", perfilId).maybeSingle();
  if (!persona) return { error: "Esa persona ya no existe." };
  const delRol = await nivelDelRolDe(perfilId, modulo);
  if (nivel === "rol" || nivel === delRol) {
    const { error } = await supabase.from("permisos_persona").delete().eq("perfil_id", perfilId).eq("modulo", modulo);
    if (error) return { error: error.message.includes("permisos_persona") ? "Falta correr la migración 0118 en Supabase." : error.message };
  } else {
    const { error } = await supabase.from("permisos_persona").upsert({ perfil_id: perfilId, modulo, nivel: propioDeNivel(nivel) }, { onConflict: "perfil_id,modulo" });
    if (error) return { error: error.message.includes("permisos_persona") ? "Falta correr la migración 0118 en Supabase." : error.message };
  }
  await registrarAuditoria({
    accion: "cambiar_permiso_persona",
    entidad: "perfiles",
    entidadId: perfilId,
    detalle: `${persona.nombre ?? persona.email}: ${etiquetaDeModulo(modulo)} → ${nivel === "rol" ? "lo que da su rol" : textoNivel(nivel)}`,
  });
  refrescar();
  return {};
}

/** Quita todo lo propio de la persona en un módulo: su permiso y lo que había afinado. */
export async function quitarAjustesPersona(perfilId: string, modulo: string): Promise<Resultado> {
  const usuario = await exigir();
  if (fallo(usuario)) return usuario;
  if (!esUuid(perfilId)) return { error: "Persona no válida." };
  if (!CLAVES_MODULO.has(modulo)) return { error: "Módulo no válido." };
  if (usuario.id === perfilId && modulo === "usuarios") {
    const delRol = await nivelDelRolDe(perfilId, modulo);
    if (delRol !== "w") return { error: SE_QUEDARIA_FUERA };
  }
  const supabase = createServiceClient();
  const { data: persona } = await supabase.from("perfiles").select("nombre, email").eq("id", perfilId).maybeSingle();
  const [a, b] = await Promise.all([
    supabase.from("permisos_persona").delete().eq("perfil_id", perfilId).eq("modulo", modulo),
    supabase.from("permisos_persona_afinados").delete().eq("perfil_id", perfilId).eq("modulo", modulo),
  ]);
  if (a.error || b.error) return { error: (a.error ?? b.error)!.message };
  await registrarAuditoria({ accion: "quitar_ajustes_persona", entidad: "perfiles", entidadId: perfilId, detalle: `${persona?.nombre ?? persona?.email ?? perfilId}: ${etiquetaDeModulo(modulo)}` });
  refrescar();
  return {};
}

// ---------------------------------------------------------------------------------------------------------------------
// Afinar un módulo: pestañas, acciones, campos y datos
// ---------------------------------------------------------------------------------------------------------------------

export interface DestinoAfinado {
  tipo: "rol" | "persona";
  id: string;
}

export interface CambioAfinado {
  tipo: TipoAfinado;
  clave: string;
  valor: string;
}

const TIPOS: readonly TipoAfinado[] = ["pestana", "accion", "campo", "alcance"];
const ETIQUETA_TIPO: Record<TipoAfinado, string> = { pestana: "Pestaña", accion: "Acción", campo: "Campo", alcance: "Alcance" };

/**
 * Guarda uno o varios cambios de lo que ve un rol o una persona dentro de un módulo. Solo queda guardado lo que se aparta de
 * lo normal: poner algo en su valor de siempre borra su fila. En una persona la comparación es contra lo que ya le da su rol,
 * así que soltar lo que el rol restringe se guarda como un permiso propio.
 */
export async function fijarAfinado(destino: DestinoAfinado, modulo: string, cambios: CambioAfinado[]): Promise<Resultado> {
  const usuario = await exigir();
  if (fallo(usuario)) return usuario;
  if (!destino || (destino.tipo !== "rol" && destino.tipo !== "persona") || !esUuid(destino.id)) return { error: "Destino no válido." };
  const catalogo = catalogoDe(modulo);
  if (!catalogo) return { error: "Ese módulo todavía no se puede afinar." };
  if (!Array.isArray(cambios) || cambios.length === 0 || cambios.length > 80) return { error: "Cambios no válidos." };
  for (const c of cambios) {
    if (!TIPOS.includes(c?.tipo) || typeof c.clave !== "string" || typeof c.valor !== "string" || !valorValido(catalogo, c.tipo, c.clave, c.valor)) {
      return { error: "Hay un cambio que no es válido." };
    }
  }

  const supabase = createServiceClient();
  const esRol = destino.tipo === "rol";
  const tabla = esRol ? "permisos_afinados" : "permisos_persona_afinados";
  const columnaId = esRol ? "rol_id" : "perfil_id";

  // Contra qué se compara cada cambio: el valor por defecto (rol) o lo que ya resuelve el rol de la persona.
  let base: (tipo: TipoAfinado, clave: string) => string = (tipo, clave) => valorPorDefecto(catalogo, tipo, clave);
  let nombre = "";
  if (esRol) {
    const { data: rol } = await supabase.from("roles").select("nombre").eq("id", destino.id).maybeSingle();
    if (!rol) return { error: "Ese rol ya no existe." };
    nombre = rol.nombre;
  } else {
    const { data: persona } = await supabase.from("perfiles").select("nombre, email, rol_id").eq("id", destino.id).maybeSingle();
    if (!persona) return { error: "Esa persona ya no existe." };
    nombre = persona.nombre ?? persona.email;
    let filasRol: FilaAfinada[] = [];
    if (persona.rol_id) {
      const { data } = await supabase.from("permisos_afinados").select("modulo, tipo, clave, valor").eq("rol_id", persona.rol_id).eq("modulo", modulo);
      filasRol = (data ?? []) as FilaAfinada[];
    }
    const delRol = resolverAfinado(catalogo, filasRol);
    base = (tipo, clave) => valorDe(catalogo, delRol, tipo, clave);
  }

  const aGuardar = cambios.filter((c) => c.valor !== base(c.tipo, c.clave));
  const aBorrar = cambios.filter((c) => c.valor === base(c.tipo, c.clave));
  if (aGuardar.length > 0) {
    const { error } = await supabase
      .from(tabla)
      .upsert(aGuardar.map((c) => ({ [columnaId]: destino.id, modulo, tipo: c.tipo, clave: c.clave, valor: c.valor })), { onConflict: `${columnaId},modulo,tipo,clave` });
    if (error) return { error: error.message.includes(tabla) ? "Falta correr la migración 0118 en Supabase." : error.message };
  }
  for (const c of aBorrar) {
    const { error } = await supabase.from(tabla).delete().eq(columnaId, destino.id).eq("modulo", modulo).eq("tipo", c.tipo).eq("clave", c.clave);
    if (error) return { error: error.message };
  }

  const etiquetaClave = (c: CambioAfinado) =>
    c.tipo === "pestana"
      ? catalogo.pestanas.find((p) => p.clave === c.clave)?.etiqueta
      : c.tipo === "accion"
        ? catalogo.acciones.find((a) => a.clave === c.clave)?.etiqueta
        : c.tipo === "campo"
          ? catalogo.grupos.flatMap((g) => g.campos).find((f) => f.clave === c.clave)?.etiqueta
          : catalogo.alcance?.titulo;
  const resumen = cambios.slice(0, 4).map((c) => `${ETIQUETA_TIPO[c.tipo]} ${etiquetaClave(c) ?? c.clave} → ${c.valor}`);
  await registrarAuditoria({
    accion: esRol ? "afinar_rol" : "afinar_persona",
    entidad: esRol ? "roles" : "perfiles",
    entidadId: destino.id,
    detalle: `${nombre} · ${catalogo.etiqueta}: ${resumen.join("; ")}${cambios.length > 4 ? `; y ${cambios.length - 4} más` : ""}`,
  });
  refrescar();
  return {};
}
