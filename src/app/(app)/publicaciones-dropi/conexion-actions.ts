"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { usuarioDropi } from "@/lib/dropi/cliente-proveedor";
import { borrarSesionDropi, guardarSesionDropi } from "@/lib/dropi/sesion";
import { esAdministrador } from "@/lib/permisos/acceso";
import { aplicarCambiosDropi } from "@/lib/publicaciones/cambios-dropi";
import { leerTokenDropi } from "@/lib/publicaciones/dropi-guardado";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "publicaciones-dropi";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResultadoConexion {
  error?: string;
  pais?: string;
  venceEn?: string;
  dropiUsuario?: string;
  aplicados?: number;
  errores?: number;
  pendientes?: number;
}

/**
 * «Conectar Dropi» (migración 0137): guarda, cifrada, la sesión de proveedor que una persona trae desde Dropi con el favorito, y
 * aplica lo que estaba pendiente. Solo un administrador: esa sesión da acceso a toda la cuenta de Dropi. Antes de guardarla se
 * comprueba con Dropi que sea de proveedor (y que el servidor llega a Dropi).
 */
export async function conectarDropi(codigoPais: string, token: string): Promise<ResultadoConexion> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!esAdministrador(usuario)) return { error: "Solo un administrador puede conectar Dropi." };
  if (typeof codigoPais !== "string" || !/^[a-z]{2}$/i.test(codigoPais) || typeof token !== "string") return { error: "La conexión no trae una sesión de Dropi." };
  const datos = leerTokenDropi(token);
  if (!datos) return { error: "La conexión no trae una sesión de Dropi." };
  if (datos.venceEn.getTime() <= Date.now() + 10 * 60_000) return { error: "Esa sesión de Dropi ya venció (o vence en minutos): inicia sesión de nuevo en Dropi y vuelve a pulsar." };
  const supabase = createServiceClient();
  const { data: pais } = await supabase.from("paises").select("id, codigo, nombre").eq("codigo", codigoPais.toUpperCase()).maybeSingle();
  if (!pais || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, pais.id as string))) return { error: "Ese país no está en el sistema o no lo puedes ver." };
  const u = await usuarioDropi(token, pais.codigo as string, datos.usuarioId);
  if ("error" in u) return { error: u.error };
  const error = await guardarSesionDropi(supabase, {
    paisId: pais.id as string,
    token,
    usuarioId: datos.usuarioId,
    usuario: u.nombre,
    venceEn: datos.venceEn,
    por: { id: usuario.id, nombre: usuario.nombre || usuario.email },
  });
  if (error) return { error: /does not exist|schema cache/i.test(error) ? "Falta correr en Supabase la migración 0137." : "No se pudo guardar la conexión." };
  await registrarAuditoria({ accion: "conectar_dropi", entidad: "dropi_sesiones", entidadId: pais.id as string, detalle: `${pais.nombre}: ${u.nombre} (usuario ${datos.usuarioId}), vence ${datos.venceEn.toISOString()}` });
  const r = await aplicarCambiosDropi(supabase, { id: pais.id as string, codigo: pais.codigo as string });
  revalidatePath("/publicaciones-dropi");
  return { pais: pais.nombre as string, venceEn: datos.venceEn.toISOString(), dropiUsuario: u.nombre, aplicados: r.aplicados, errores: r.errores, pendientes: r.pendientes };
}

/** Quita la sesión de Dropi guardada de un país (lo que se haga después queda pendiente hasta volver a conectar). */
export async function desconectarDropi(paisId: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!esAdministrador(usuario)) return { error: "Solo un administrador puede desconectar Dropi." };
  if (typeof paisId !== "string" || !UUID.test(paisId)) return { error: "País no válido." };
  const supabase = createServiceClient();
  if (!(await puedeVerPaisId(supabase, usuario.paisesPermitidos, paisId))) return { error: "País no válido." };
  await borrarSesionDropi(supabase, paisId);
  await registrarAuditoria({ accion: "conectar_dropi", entidad: "dropi_sesiones", entidadId: paisId, detalle: "Desconectó Dropi" });
  revalidatePath("/publicaciones-dropi");
  return {};
}

/** Vuelve a intentar en Dropi un cambio que quedó pendiente o con error (con la sesión vigente). */
export async function reintentarCambioDropi(cambioId: string): Promise<{ error?: string; estado?: "aplicado" | "pendiente" | "error"; detalle?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (typeof cambioId !== "string" || !UUID.test(cambioId)) return { error: "Cambio no válido." };
  const supabase = createServiceClient();
  const { data: c } = await supabase.from("dropi_cambios_pendientes").select("id, pais_id, estado").eq("id", cambioId).maybeSingle();
  if (!c || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, c.pais_id as string))) return { error: "Cambio no válido." };
  if (c.estado !== "pendiente" && c.estado !== "error") return { error: "Ese cambio ya no está pendiente." };
  const { data: pais } = await supabase.from("paises").select("id, codigo").eq("id", c.pais_id).maybeSingle();
  if (!pais) return { error: "País no válido." };
  const r = await aplicarCambiosDropi(supabase, { id: pais.id as string, codigo: pais.codigo as string }, [cambioId]);
  revalidatePath("/publicaciones-dropi");
  const res = r.resultados.get(cambioId);
  if (res?.ok) return { estado: "aplicado", detalle: "Cambiado en Dropi." };
  if (!r.conSesion) return { estado: "pendiente", detalle: "Dropi no está conectado: pulsa «Conectar Dropi» (un administrador)." };
  return { estado: "error", detalle: res?.error ?? "No se pudo cambiar en Dropi." };
}
