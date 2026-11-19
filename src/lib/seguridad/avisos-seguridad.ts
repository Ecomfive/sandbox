// Avisos de seguridad al momento (seguridad · 19 nov 2026): cuando un correo o una IP llega al tope del login, cuando se crea una cuenta
// y cuando a alguien le queda la edición de Usuarios y roles. Le llega un aviso «Para ti» (tipo «seguridad», sale también como tarjeta en
// pantalla) a cada persona activa que puede MODIFICAR Usuarios y roles, y queda en la bitácora (`alerta_seguridad`). Uno por asunto por
// hora. Solo servidor: NO es un archivo "use server". Nada de esto lanza: un aviso que falla no frena lo que lo disparó.

import "server-only";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { personasConModulos } from "@/lib/whatsapp/personas-crm";
import type { PermisoPropio, PermisoRol } from "@/lib/permisos/acceso";
import {
  avisoCuentaNueva,
  avisoDosPasosActivada,
  avisoDosPasosQuitada,
  avisoPuedeModificarUsuarios,
  avisoRolConUsuarios,
  claveAviso,
  puedeModificarUsuarios,
  type MotivoAviso,
  type TextoAviso,
} from "./avisos-seguridad-reglas";
import { limitar } from "./limite";
import { claveLimite, LIMITES } from "./limite-reglas";

const RUTA_BITACORA = "/usuarios/auditoria";
const MOTIVOS_SIN_SESION: ReadonlySet<MotivoAviso> = new Set(["ingreso_correo", "ingreso_ip"]);
const CLAVE_TOPE_TOTAL = claveLimite("aviso-seguridad-total", "login");
let topeAnotado = false;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AvisoSeguridad extends TextoAviso {
  motivo: MotivoAviso;
  /** El asunto (correo, IP, persona, rol): con el motivo arma la clave que evita repetir el aviso en la hora. */
  asunto: string[];
  /** Adónde lleva el aviso (una ruta del sistema); por defecto, la bitácora de Usuarios y roles. */
  href?: string;
  /** La fila de la bitácora (una persona, un rol). */
  entidadId?: string;
}

/** Quién hizo el cambio (si hay sesión), para el aviso. */
async function autorActual(): Promise<{ id: string | null; nombre: string }> {
  try {
    const u = await getUsuarioActual();
    return u ? { id: u.id, nombre: u.nombre || u.email } : { id: null, nombre: "Sistema" };
  } catch {
    return { id: null, nombre: "Sistema" };
  }
}

/** Manda un aviso de seguridad a quienes pueden modificar Usuarios y roles y lo deja en la bitácora. Nunca lanza. */
export async function avisarSeguridad(aviso: AvisoSeguridad): Promise<void> {
  try {
    if (!(await limitar(claveAviso(aviso.motivo, ...aviso.asunto), LIMITES.avisoSeguridad))) return;
    // Tope total de los avisos del login, que cualquiera dispara sin sesión (muchas IP o muchos correos): 20 por hora. Los que nacen de un
    // cambio hecho con sesión (cuentas, roles, dos pasos) no entran en el tope: un ataque al login no puede taparlos.
    if (MOTIVOS_SIN_SESION.has(aviso.motivo) && !(await limitar(CLAVE_TOPE_TOTAL, LIMITES.avisoSeguridadTotal))) {
      if (!topeAnotado) console.warn("[avisos-seguridad] tope de avisos del login por hora: los que siguen no se mandan");
      topeAnotado = true;
      return;
    }
    const supabase = createServiceClient();
    const [personas, autor] = await Promise.all([personasConModulos(supabase, ["usuarios"]), autorActual()]);
    const destinos = personas.filter((p) => !p.soloLectura).map((p) => p.id);
    if (destinos.length) {
      const filas = (tipo: string) =>
        destinos.map((usuario_id) => ({
          usuario_id,
          tipo,
          titulo: aviso.titulo.slice(0, 200),
          texto: aviso.texto.slice(0, 500),
          href: aviso.href ?? RUTA_BITACORA,
          autor_id: autor.id,
          autor_nombre: autor.nombre,
        }));
      let { error } = await supabase.from("notificaciones_usuario").insert(filas("seguridad"));
      // Sin la migración 0330 la regla de la tabla no conoce «seguridad»: sale como un aviso común, pero sale.
      if (error?.code === "23514") ({ error } = await supabase.from("notificaciones_usuario").insert(filas("mencion")));
      if (error) console.error("[avisos-seguridad] no se pudo avisar", aviso.motivo, error);
    } else {
      console.warn("[avisos-seguridad] nadie puede modificar Usuarios y roles: el aviso queda solo en la bitácora", aviso.motivo);
    }
    await registrarAuditoria({ accion: "alerta_seguridad", entidad: "seguridad", entidadId: aviso.entidadId, detalle: `${aviso.titulo}. ${aviso.texto}`.slice(0, 1000) });
  } catch (e) {
    console.error("[avisos-seguridad] falló el aviso", aviso.motivo, e);
  }
}

interface PerfilLeido {
  id: string;
  nombre: string | null;
  email: string | null;
  rol_id: string | null;
  roles: { nombre: string | null } | { nombre: string | null }[] | null;
}

const nombreRol = (p: PerfilLeido) => (Array.isArray(p.roles) ? p.roles[0]?.nombre : p.roles?.nombre) ?? null;

/** La persona y si hoy puede modificar Usuarios y roles (rol + permiso propio). */
async function leerPersona(perfilId: string): Promise<{ perfil: PerfilLeido; puede: boolean } | null> {
  if (!UUID.test(perfilId)) return null;
  const supabase = createServiceClient();
  const { data: perfil } = await supabase.from("perfiles").select("id, nombre, email, rol_id, roles(nombre)").eq("id", perfilId).maybeSingle();
  if (!perfil) return null;
  const p = perfil as unknown as PerfilLeido;
  const [delRol, propios] = await Promise.all([
    p.rol_id ? supabase.from("permisos_rol").select("modulo, solo_lectura").eq("rol_id", p.rol_id).eq("modulo", "usuarios") : Promise.resolve({ data: [] }),
    supabase.from("permisos_persona").select("modulo, nivel").eq("perfil_id", perfilId).eq("modulo", "usuarios"),
  ]);
  // Sin la tabla de permisos propios (0118) cuenta solo el rol.
  const deLaPersona = ("error" in propios && propios.error ? [] : (propios.data ?? [])) as PermisoPropio[];
  return { perfil: p, puede: puedeModificarUsuarios((delRol.data ?? []) as PermisoRol[], deLaPersona) };
}

/** Se acaba de crear la cuenta del equipo `perfilId` (llamar después de guardar el perfil). */
export async function avisarCuentaNueva(perfilId: string): Promise<void> {
  try {
    const leida = await leerPersona(perfilId);
    if (!leida) return;
    const { perfil, puede } = leida;
    await avisarSeguridad({
      motivo: "cuenta_nueva",
      asunto: [perfil.id],
      entidadId: perfil.id,
      href: `/usuarios/personas/${perfil.id}`,
      ...avisoCuentaNueva({ nombre: perfil.nombre, email: perfil.email, rol: nombreRol(perfil), puedeModificarUsuarios: puede }),
    });
  } catch (e) {
    console.error("[avisos-seguridad] cuenta nueva", e);
  }
}

/**
 * Tras cambiarle el rol (o un permiso propio de Usuarios y roles) a una persona: si ahora puede modificar Usuarios y roles, avisa. Si no,
 * no hace nada.
 */
export async function avisarSiPuedeModificarUsuarios(perfilId: string): Promise<void> {
  try {
    const leida = await leerPersona(perfilId);
    if (!leida?.puede) return;
    const { perfil } = leida;
    await avisarSeguridad({
      motivo: "puede_modificar_usuarios",
      asunto: [perfil.id, perfil.rol_id ?? "sin-rol"],
      entidadId: perfil.id,
      href: `/usuarios/personas/${perfil.id}`,
      ...avisoPuedeModificarUsuarios({ nombre: perfil.nombre, email: perfil.email, rol: nombreRol(perfil) }),
    });
  } catch (e) {
    console.error("[avisos-seguridad] permiso de Usuarios y roles", e);
  }
}

/** Tras cambiar los permisos de un rol: si ahora puede modificar Usuarios y roles, avisa (cuántas personas lo tienen). */
export async function avisarSiRolModificaUsuarios(rolId: string): Promise<void> {
  try {
    if (!UUID.test(rolId)) return;
    const supabase = createServiceClient();
    const [{ data: permiso }, { data: rol }, { count }] = await Promise.all([
      supabase.from("permisos_rol").select("solo_lectura").eq("rol_id", rolId).eq("modulo", "usuarios").maybeSingle(),
      supabase.from("roles").select("nombre").eq("id", rolId).maybeSingle(),
      supabase.from("perfiles").select("id", { count: "exact", head: true }).eq("rol_id", rolId).eq("activo", true),
    ]);
    if (!permiso || permiso.solo_lectura) return;
    await avisarSeguridad({
      motivo: "rol_con_usuarios",
      asunto: [rolId],
      entidadId: rolId,
      href: `/usuarios/roles/${rolId}`,
      ...avisoRolConUsuarios({ rol: String(rol?.nombre ?? "sin nombre"), personas: count ?? 0 }),
    });
  } catch (e) {
    console.error("[avisos-seguridad] rol con Usuarios y roles", e);
  }
}

/**
 * Tras activar la verificación en dos pasos (llamar con la activación ya confirmada). Si no fue la persona, quien tiene su contraseña acaba
 * de poner su propio celular: el aviso lo deja ver a tiempo.
 */
export async function avisarDosPasosActivada(perfilId: string): Promise<void> {
  try {
    const leida = await leerPersona(perfilId);
    if (!leida) return;
    const { perfil, puede } = leida;
    await avisarSeguridad({
      motivo: "dos_pasos_activada",
      asunto: [perfil.id],
      entidadId: perfil.id,
      href: `/usuarios/personas/${perfil.id}`,
      ...avisoDosPasosActivada({ nombre: perfil.nombre, email: perfil.email, rol: nombreRol(perfil), puedeModificarUsuarios: puede }),
    });
  } catch (e) {
    console.error("[avisos-seguridad] dos pasos activada", e);
  }
}

/** Tras «Quitar verificación en dos pasos» de una persona: quién se la quitó (`porId`, el de la sesión) y a quién. */
export async function avisarDosPasosQuitada(perfilId: string, porId: string | null): Promise<void> {
  try {
    if (!UUID.test(perfilId)) return;
    const supabase = createServiceClient();
    const ids = porId && UUID.test(porId) ? [perfilId, porId] : [perfilId];
    const { data } = await supabase.from("perfiles").select("id, nombre, email").in("id", ids);
    const filas = (data ?? []) as { id: string; nombre: string | null; email: string | null }[];
    const persona = filas.find((f) => f.id === perfilId);
    if (!persona) return;
    const quien = filas.find((f) => f.id === porId);
    await avisarSeguridad({
      motivo: "dos_pasos_quitada",
      asunto: [perfilId],
      entidadId: perfilId,
      href: `/usuarios/personas/${perfilId}`,
      ...avisoDosPasosQuitada({ nombre: persona.nombre, email: persona.email, por: quien ? quien.nombre || quien.email : null }),
    });
  } catch (e) {
    console.error("[avisos-seguridad] dos pasos quitada", e);
  }
}
