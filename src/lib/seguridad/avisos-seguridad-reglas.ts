// Avisos de seguridad: lo puro (seguridad · 19 nov 2026). Qué dice cada aviso y con qué clave se evita repetirlo. Nunca llevan una
// contraseña (ni la intentada ni la temporal): solo correos, IP, nombres y roles. Prueba en `avisos-seguridad-reglas.test.ts`.

import { aAccesoPlano, nivelesEfectivos, type PermisoPropio, type PermisoRol } from "../permisos/acceso";
import { claveLimite, type ReglaLimite } from "./limite-reglas";

export type MotivoAviso =
  | "ingreso_correo"
  | "ingreso_ip"
  | "cuenta_nueva"
  | "puede_modificar_usuarios"
  | "rol_con_usuarios"
  | "dos_pasos_activada"
  | "dos_pasos_quitada";

export interface TextoAviso {
  titulo: string;
  texto: string;
}

/** La clave para no repetir un aviso (uno por motivo y asunto en la ventana de `LIMITES.avisoSeguridad`). */
export const claveAviso = (motivo: MotivoAviso, ...partes: string[]): string => claveLimite(`aviso-${motivo.replace(/_/g, "-")}`, ...partes);

const minutos = (regla: ReglaLimite) => Math.round(regla.ventana / 60);

/** ¿Con su rol y lo propio, la persona puede MODIFICAR Usuarios y roles? */
export function puedeModificarUsuarios(permisosDelRol: PermisoRol[], propios: PermisoPropio[]): boolean {
  const { modulos, modulosSoloLectura } = aAccesoPlano(nivelesEfectivos(permisosDelRol, propios));
  return modulos.includes("usuarios") && !modulosSoloLectura.includes("usuarios");
}

/** Lo escrito por otro que entra a un aviso: sin saltos ni signos de HTML y corto. */
export const textoSeguro = (t: string, largo = 120): string => t.replace(/[\u0000-\u001f\u007f<>"'`]/g, "").slice(0, largo);

/**
 * Un correo llegó a un tope de claves equivocadas: desde una IP (ahí queda frenado) o sumando varias IP (solo se avisa). Dice si es de una
 * cuenta del equipo (eso solo lo ve quien administra). El correo ya pasó por `pareceCorreo`.
 */
export function avisoIngresoCorreo(d: { correo: string; ip: string | null; cuenta: string | null; regla: ReglaLimite; variasIp?: boolean }): TextoAviso {
  const deQuien = d.cuenta ? `Es la cuenta de ${textoSeguro(d.cuenta)}.` : "No es de ninguna cuenta del sistema.";
  const correo = textoSeguro(d.correo);
  const ip = d.ip ? textoSeguro(d.ip, 45) : null;
  return {
    titulo: "Seguridad: muchos intentos fallidos de ingreso",
    texto: d.variasIp
      ? `${d.regla.maximo} claves equivocadas en ${minutos(d.regla)} minutos para ${correo}, desde varias IP${ip ? ` (la última, ${ip})` : ""}. ${deQuien} Cada IP queda frenada tras 5 intentos; si sigue, conviene cambiarle la contraseña.`
      : `${d.regla.maximo} claves equivocadas en ${minutos(d.regla)} minutos para ${correo}${ip ? ` desde la IP ${ip}` : ""}. ${deQuien} Desde esa IP, el ingreso con ese correo queda frenado hasta que pase la ventana; desde otra, la persona puede entrar.`,
  };
}

/** Una IP llegó al tope de claves equivocadas (con uno o varios correos). */
export function avisoIngresoIp(d: { ip: string; regla: ReglaLimite }): TextoAviso {
  return {
    titulo: "Seguridad: una IP prueba muchas claves",
    texto: `${d.regla.maximo} intentos fallidos de ingreso en ${minutos(d.regla)} minutos desde la IP ${d.ip}. Los ingresos desde esa IP quedan frenados hasta que pase la ventana.`,
  };
}

const quien = (p: { nombre: string | null; email: string | null }) => (p.nombre && p.email ? `${p.nombre} <${p.email}>` : p.nombre || p.email || "Una persona");

/** Se creó una cuenta del equipo. */
export function avisoCuentaNueva(d: { nombre: string | null; email: string | null; rol: string | null; puedeModificarUsuarios: boolean }): TextoAviso {
  return {
    titulo: "Seguridad: se creó una cuenta",
    texto: `${quien(d)} ya puede entrar al sistema con el rol ${d.rol ?? "sin rol"}.${d.puedeModificarUsuarios ? " Ese rol puede modificar Usuarios y roles." : ""} Si no lo esperabas, revísala en Usuarios y roles.`,
  };
}

/** A una persona le quedó la edición de Usuarios y roles (por su rol nuevo o por un permiso propio). */
export function avisoPuedeModificarUsuarios(d: { nombre: string | null; email: string | null; rol: string | null }): TextoAviso {
  return {
    titulo: "Seguridad: alguien más puede modificar Usuarios y roles",
    texto: `${quien(d)} ahora puede modificar Usuarios y roles (rol ${d.rol ?? "sin rol"}): puede crear cuentas y cambiar permisos. Si no lo esperabas, revísalo en Usuarios y roles.`,
  };
}

/** A un rol se le dio la edición de Usuarios y roles: todas sus personas la tienen. */
export function avisoRolConUsuarios(d: { rol: string; personas: number }): TextoAviso {
  return {
    titulo: "Seguridad: un rol ahora puede modificar Usuarios y roles",
    texto: `El rol ${d.rol} (${d.personas === 1 ? "1 persona" : `${d.personas} personas`}) ahora puede modificar Usuarios y roles: crear cuentas y cambiar permisos. Si no lo esperabas, revísalo en Usuarios y roles.`,
  };
}

/**
 * Alguien activó la verificación en dos pasos: si no fue esa persona, quien tiene su contraseña acaba de poner su propio celular (y desde
 * ahí entra con los dos pasos).
 */
export function avisoDosPasosActivada(d: { nombre: string | null; email: string | null; rol: string | null; puedeModificarUsuarios: boolean }): TextoAviso {
  return {
    titulo: "Seguridad: se activó la verificación en dos pasos",
    texto: `${quien(d)} (rol ${d.rol ?? "sin rol"}) activó la verificación en dos pasos con un celular.${d.puedeModificarUsuarios ? " Esta cuenta puede modificar Usuarios y roles." : ""} Si no fue esa persona, quítasela en su ficha de Usuarios y roles y dale una contraseña temporal nueva.`,
  };
}

/** Quien administra le quitó la verificación en dos pasos a una persona (perdió el celular, o alguien quiere entrar sin ella). */
export function avisoDosPasosQuitada(d: { nombre: string | null; email: string | null; por: string | null }): TextoAviso {
  return {
    titulo: "Seguridad: se quitó una verificación en dos pasos",
    texto: `${d.por ? textoSeguro(d.por) : "Alguien"} le quitó la verificación en dos pasos a ${quien(d)}: hasta que la active de nuevo, entra solo con su contraseña. Si no lo esperabas, revísalo en Usuarios y roles.`,
  };
}
