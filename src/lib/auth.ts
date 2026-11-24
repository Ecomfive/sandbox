import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSessionClient, createServiceClient } from "@/lib/supabase/server";
import { aAccesoPlano, esAdministrador, nivelesEfectivos, type PermisoPropio } from "@/lib/permisos/acceso";
import {
  bloqueaPorDosPasos,
  dosPasosObligatorio,
  estadoDosPasos,
  nivelDelToken,
  rutaDosPasosDesde,
  tieneFactorVerificado,
  type EstadoDosPasos,
  type FactorAuth,
  type NivelSesion,
} from "@/lib/seguridad/dos-pasos";
import { accionPermitida, contarAjustes, pestanaVisible, resolverAfinado, type Afinado, type FilaAfinada } from "@/lib/permisos/afinado";
import { MODULOS_AFINABLES, catalogoDe } from "@/lib/permisos/catalogo";
import { paginaInicialDe, primeraPestanaPermitida } from "@/lib/nav-data";
import { leerTiendasPermitidas, modulosSegunTiendas } from "@/lib/finanzas/tiendas-permitidas";
import { RUTA_PORTAL_PROVEEDOR, cuentaDeProveedor } from "@/lib/proveedor/cuenta";
import { RUTA_PANEL_REPARTIDOR, cuentaDeRepartidor } from "@/lib/despacho/cuenta-repartidor";

/** Cookie de "Ver así": el id del rol que Usuarios y roles está probando, o nada. Vive solo en el
 * navegador de quien la prende (ver `src/lib/vista-previa-actions.ts`), nunca en la base. */
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const VISTA_PREVIA_COOKIE = "vista_previa_rol_id";

export interface UsuarioActual {
  id: string;
  email: string;
  nombre: string | null;
  avatarUrl: string | null;
  rolId: string | null;
  rolNombre: string | null;
  modulos: string[];
  modulosSoloLectura: string[];
  /** Desde cuándo trabaja de verdad (primer ingreso real, no la invitación) — null si nunca entró. */
  primerIngresoEn: string | null;
  /** Si esta persona está probando la app como otro rol ("Ver así"): con qué rol, además de los suyos propios
   * (que quedan en `rolId`/`rolNombre`). `modulos`/`modulosSoloLectura` ya son los de ese rol mientras dura. */
  vistaPrevia: { rolId: string; rolNombre: string } | null;
  /**
   * Lo afinado dentro de cada módulo (pestañas, acciones, campos y alcance que se aparta del acceso completo), ya con lo del
   * rol y lo propio de la persona juntos. Solo trae los módulos con algún ajuste: sin entrada, ve todo lo que su nivel permite.
   * Se consulta con los ayudantes de `src/lib/permisos/afinado.ts` (`pestanaVisible`, `accionPermitida`, `nivelDeCampo`…).
   */
  afinado: Record<string, Afinado>;
  /**
   * Los países que puede ver (códigos, y «importacion» para Compras Importadora); `null` = todos. Limita Compras, el
   * histórico de compras de Producto e Inventario y el país de la barra (ver `src/lib/paises-permitidos.ts`).
   */
  /** Las tiendas (`fin_unidades`) que puede ver; `null` = todas (migración 0937). Ver `src/lib/finanzas/tiendas-permitidas.ts`. */
  tiendasPermitidas: string[] | null;
  paisesPermitidos: string[] | null;
}

interface Permiso {
  modulo: string;
  solo_lectura: boolean;
}

/**
 * Si un error de la base es solo «esa tabla o columna todavía no existe» (una migración sin correr). Ese caso, y solo ese, se trata como «sin
 * restricciones nuevas». Cualquier otro error (tiempo de espera, conexión) corta la petición: un límite que no se pudo leer no puede valer como
 * «sin límite» (auditoría de seguridad, 18 nov 2026).
 */
export function esFaltaDeMigracion(error: unknown): boolean {
  const codigo = String((error as { code?: unknown } | null)?.code ?? "");
  return codigo === "42P01" || codigo === "42703" || codigo === "PGRST204" || codigo === "PGRST205";
}

/** Lo afinado y lo propio de una persona (migración 0118). Sin la migración todos ven lo de siempre; con otro error, la petición falla (no se abre). */
interface PermisosFinos {
  propios: PermisoPropio[];
  afinadosPersona: FilaAfinada[];
  afinadosRoles: (FilaAfinada & { rol_id: string })[];
}

async function cargarPermisosFinos(supabase: ReturnType<typeof createServiceClient>, perfilId: string): Promise<PermisosFinos> {
  const seguro = async <T,>(consulta: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
    const r = await consulta;
    if (r.error) {
      if (esFaltaDeMigracion(r.error)) return [];
      throw new Error("No se pudieron leer los permisos de la persona.");
    }
    return r.data ?? [];
  };
  const [propios, afinadosPersona, afinadosRoles] = await Promise.all([
    seguro<PermisoPropio>(supabase.from("permisos_persona").select("modulo, nivel").eq("perfil_id", perfilId)),
    seguro<FilaAfinada>(supabase.from("permisos_persona_afinados").select("modulo, tipo, clave, valor").eq("perfil_id", perfilId)),
    // Es una tabla chica (unas decenas de filas): se trae entera y se separa por rol aquí, para no esperar a saber el rol.
    seguro<FilaAfinada & { rol_id: string }>(supabase.from("permisos_afinados").select("rol_id, modulo, tipo, clave, valor")),
  ]);
  return { propios, afinadosPersona, afinadosRoles };
}

/** Los módulos afinables con algún ajuste, juntando lo del rol y, encima, lo de la persona. */
function juntarAfinado(rolId: string | null, finos: Pick<PermisosFinos, "afinadosPersona" | "afinadosRoles">): Record<string, Afinado> {
  const resultado: Record<string, Afinado> = {};
  for (const modulo of MODULOS_AFINABLES) {
    const filas: FilaAfinada[] = [
      ...finos.afinadosRoles.filter((f) => f.rol_id === rolId && f.modulo === modulo),
      ...finos.afinadosPersona.filter((f) => f.modulo === modulo),
    ];
    const afinado = resolverAfinado(catalogoDe(modulo), filas);
    if (contarAjustes(afinado) > 0) resultado[modulo] = afinado;
  }
  return resultado;
}

/**
 * Id de la persona con sesión en esta petición (o null): la única consulta a la autenticación. Con `cache` el
 * layout, la página y el resto de la petición comparten la misma respuesta. Se separa del perfil para poder pedir
 * lo que solo depende del id (los favoritos) sin esperar a que se resuelvan el perfil y los permisos.
 */
export const getUsuarioIdSesion = cache(async (): Promise<string | null> => (await getUsuarioSesion())?.id ?? null);

/** El usuario de autenticación con sesión (con su `app_metadata`), de la misma consulta que `getUsuarioIdSesion`. */
export const getUsuarioSesion = cache(async () => (await getSesionComprobada())?.user ?? null);

/**
 * La sesión de esta petición comprobada por Supabase, con su nivel (seguridad · 19 nov 2026): `aal1` = entró solo con la contraseña,
 * `aal2` = además escribió el código de la verificación en dos pasos. El nivel se lee del MISMO token que Supabase acaba de comprobar
 * (`getUser(token)`, que le pregunta al servidor de Auth): un token inventado o alterado no pasa esa comprobación, así que el `aal` no
 * se puede falsificar desde el navegador. Los factores (`user.factors`) también vienen de esa respuesta, no de la cookie.
 */
const getSesionComprobada = cache(async (): Promise<{ user: User; nivel: NivelSesion | null } | null> => {
  const cliente = await createSessionClient();
  // `getSession` lee la cookie (y la renueva si venció, como hacía `getUser()`); el token se comprueba enseguida con el servidor.
  const {
    data: { session },
  } = await cliente.auth.getSession();
  if (!session?.access_token) return null;
  const {
    data: { user },
  } = await cliente.auth.getUser(session.access_token);
  if (!user) return null;
  return { user, nivel: nivelDelToken(session.access_token) };
});

/**
 * Usuario con sesión activa, su rol y los módulos a los que ese rol tiene acceso (una vez por petición). Es la puerta de todo:
 * `requireModulo*`, `exigirAcceso`, las rutas de API y el layout pasan por aquí.
 *
 * Verificación en dos pasos (seguridad · 19 nov 2026): si a la persona le falta escribir el código (o activarla, cuando es
 * obligatoria), devuelve null igual que sin sesión. Así ninguna página, acción del servidor ni ruta le da nada aunque se llame directo:
 * la regla está aquí, no en el menú ni en el layout. Las páginas la llevan a `/dos-pasos` (`irSinPerfil` y el layout de `(app)`).
 *
 * Si quien administra perdió el celular y no hay otra persona que pueda quitarle la verificación desde Usuarios y roles: en el panel de
 * Supabase, Authentication › Users › esa persona › «MFA factors», borrar el factor (apagar `DOS_PASOS_ADMIN` en Vercel no alcanza:
 * solo deja de exigirla a quien no la activó). Al volver a entrar, la activa de nuevo con el celular nuevo.
 */
export const getUsuarioActual = cache(async (): Promise<UsuarioActual | null> => {
  const base = await cargarUsuario();
  if (!base) return null;
  // Sin poder leer el estado (no debería pasar: sale de la misma sesión) no se abre: null, como sin sesión.
  const dos = await getDosPasos();
  if (!dos || bloqueaPorDosPasos(dos.estado)) return null;
  return base.usuario;
});

/** Lo de la verificación en dos pasos de la persona con sesión (ver `getDosPasos`). */
export interface DosPasosSesion {
  estado: EstadoDosPasos;
  perfilId: string;
  email: string;
  nombre: string | null;
  /** Los factores de la cuenta, de la respuesta de Supabase (no de la cookie). */
  factores: FactorAuth[];
}

/**
 * Lo de la verificación en dos pasos de la persona con sesión (seguridad · 19 nov 2026), o null sin sesión o sin perfil activo (las
 * cuentas del portal del proveedor no tienen perfil: no les afecta). Quién la debe tener sale de sus permisos REALES, no de «Ver así».
 * No da módulos: lo usan la pantalla `/dos-pasos` y sus acciones (que no pueden pedir un módulo, porque la persona todavía no los
 * tiene) y el layout para la invitación.
 */
export const getDosPasos = cache(async (): Promise<DosPasosSesion | null> => {
  const base = await cargarUsuario();
  if (!base) return null;
  const sesion = await getSesionComprobada();
  if (!sesion || sesion.user.id !== base.usuario.id) return null;
  const factores = (sesion.user.factors ?? []) as FactorAuth[];
  const estado = estadoDosPasos({
    administra: base.administraUsuarios,
    nivel: sesion.nivel,
    tieneFactor: tieneFactorVerificado(factores),
    obligatorio: dosPasosObligatorio(process.env),
  });
  return { estado, perfilId: base.usuario.id, email: base.usuario.email, nombre: base.usuario.nombre, factores };
});

/**
 * La persona y sus permisos, SIN mirar la verificación en dos pasos. No se exporta a propósito: todo lo de afuera pasa por
 * `getUsuarioActual`, que sí la mira. `administraUsuarios` son sus permisos reales (antes de «Ver así» y de las tiendas).
 */
const cargarUsuario = cache(async (): Promise<{ usuario: UsuarioActual; administraUsuarios: boolean } | null> => {
  const userId = await getUsuarioIdSesion();
  if (!userId) return null;

  const supabase = createServiceClient();
  // Lo afinado y lo propio arrancan a la vez que el perfil (no dependen de él).
  const finosPendientes = cargarPermisosFinos(supabase, userId);
  // Perfil, rol y permisos en una sola consulta (antes eran dos, una tras otra). Si la base no devuelve los permisos
  // incluidos (o la consulta falla), se piden aparte como antes: el acceso nunca depende de que esto funcione.
  // `paises_permitidos` (migración 0087) va en la misma consulta; sin la migración se pide como antes y la persona ve todos
  // los países, que es lo que veía.
  const columnas = "id, email, nombre, avatar_url, activo, rol_id, primer_ingreso_en, roles(id, nombre, permisos_rol(modulo, solo_lectura))";
  let completo = await supabase.from("perfiles").select(`${columnas}, paises_permitidos, tiendas_permitidas`).eq("id", userId).maybeSingle();
  // Solo se vuelve a pedir sin `paises_permitidos` si la columna no existe; con cualquier otro error no se sigue (no se abre a todos los países).
  if (completo.error && !esFaltaDeMigracion(completo.error)) throw new Error("No se pudo leer el perfil de la persona.");
  if (completo.error) completo = (await supabase.from("perfiles").select(columnas).eq("id", userId).maybeSingle()) as typeof completo;
  const perfil = completo.error
    ? (
        await supabase
          .from("perfiles")
          .select("id, email, nombre, avatar_url, activo, rol_id, primer_ingreso_en, roles(id, nombre)")
          .eq("id", userId)
          .maybeSingle()
      ).data
    : completo.data;

  if (!perfil || !perfil.activo) return null;

  const rol = perfil.roles as unknown as { id: string; nombre: string; permisos_rol?: Permiso[] } | null;

  let permisos: Permiso[] = [];
  if (rol) {
    if (Array.isArray(rol.permisos_rol)) {
      permisos = rol.permisos_rol;
    } else {
      const { data } = await supabase.from("permisos_rol").select("modulo, solo_lectura").eq("rol_id", rol.id);
      permisos = data ?? [];
    }
  }

  const finos = await finosPendientes;
  // El acceso de la persona: el de su rol y, encima, lo que se le dio o quitó solo a ella.
  const efectivo = aAccesoPlano(nivelesEfectivos(permisos, finos.propios));
  let modulos = efectivo.modulos;
  let modulosSoloLectura = efectivo.modulosSoloLectura;
  let afinado = juntarAfinado(rol?.id ?? null, finos);
  let vistaPrevia: { rolId: string; rolNombre: string } | null = null;
  // Quién debe tener la verificación en dos pasos: lo que la persona puede de verdad, antes de «Ver así» y de las tiendas (seguridad · 19 nov 2026).
  const administraUsuarios = esAdministrador(efectivo);

  // "Ver así": solo quien de verdad administra Usuarios y roles puede probar la app con los
  // permisos de otro rol (o de otra persona) — así que el cambio se aplica DESPUÉS de calcular los permisos reales,
  // y solo si esta persona puede MODIFICAR Usuarios y roles (lo mismo que exige prenderlo; con solo
  // lectura, poner la cookie a mano daba los permisos de cualquier rol). La cookie lleva además el id
  // de quien la prendió: una cookie de otra persona, o escrita a mano sin ese id, no vale.
  // Formato: `<quien la prendió>:<rol>` o `<quien la prendió>:p-<persona>` (la app como la ve esa persona, con lo suyo).
  if (modulos.includes("usuarios") && !modulosSoloLectura.includes("usuarios")) {
    const valor = (await cookies()).get(VISTA_PREVIA_COOKIE)?.value || "";
    const [duenoId, objetivo] = valor.split(":");
    const comoPersona = !!objetivo && objetivo.startsWith("p-");
    const idObjetivo = comoPersona ? objetivo.slice(2) : objetivo;
    if (duenoId === perfil.id && idObjetivo && ES_UUID.test(idObjetivo)) {
      if (comoPersona) {
        const { data: otra } = await supabase.from("perfiles").select("id, nombre, email, rol_id, roles(id, nombre, permisos_rol(modulo, solo_lectura))").eq("id", idObjetivo).maybeSingle();
        if (otra) {
          const rolOtra = otra.roles as unknown as { id: string; nombre: string; permisos_rol?: Permiso[] } | null;
          const finosOtra = await cargarPermisosFinos(supabase, otra.id);
          const plano = aAccesoPlano(nivelesEfectivos(rolOtra?.permisos_rol ?? [], finosOtra.propios));
          modulos = plano.modulos;
          modulosSoloLectura = plano.modulosSoloLectura;
          afinado = juntarAfinado(rolOtra?.id ?? null, { afinadosPersona: finosOtra.afinadosPersona, afinadosRoles: finos.afinadosRoles });
          vistaPrevia = { rolId: rolOtra?.id ?? "", rolNombre: `${otra.nombre || otra.email}${rolOtra ? ` (${rolOtra.nombre})` : ""}` };
        }
      } else {
        const { data: rolPrevia } = await supabase
          .from("roles")
          .select("id, nombre, permisos_rol(modulo, solo_lectura)")
          .eq("id", idObjetivo)
          .maybeSingle();
        if (rolPrevia) {
          const permisosPrevia = (rolPrevia.permisos_rol ?? []) as Permiso[];
          modulos = permisosPrevia.map((p) => p.modulo);
          modulosSoloLectura = permisosPrevia.filter((p) => p.solo_lectura).map((p) => p.modulo);
          afinado = juntarAfinado(rolPrevia.id, { afinadosPersona: [], afinadosRoles: finos.afinadosRoles });
          vistaPrevia = { rolId: rolPrevia.id, rolNombre: rolPrevia.nombre };
        }
      }
    }
  }

  // Con tiendas limitadas (gente de una tienda cliente), los módulos de toda la empresa no se tienen: no solo salen del menú,
  // el servidor tampoco los da, así que sus acciones y páginas los rechazan (auditoría de seguridad, 18 nov 2026). La lista de
  // tiendas es la de la persona real, también en «Ver así».
  const tiendasPermitidas = leerTiendasPermitidas((perfil as { tiendas_permitidas?: unknown }).tiendas_permitidas);
  modulos = modulosSegunTiendas(modulos, tiendasPermitidas);
  modulosSoloLectura = modulosSegunTiendas(modulosSoloLectura, tiendasPermitidas);

  const usuario: UsuarioActual = {
    id: perfil.id,
    email: perfil.email,
    nombre: perfil.nombre,
    avatarUrl: perfil.avatar_url,
    rolId: rol?.id ?? null,
    rolNombre: rol?.nombre ?? null,
    primerIngresoEn: perfil.primer_ingreso_en,
    vistaPrevia,
    modulos,
    modulosSoloLectura,
    afinado,
    paisesPermitidos: listaPaises((perfil as { paises_permitidos?: unknown }).paises_permitidos),
    tiendasPermitidas,
  };
  return { usuario, administraUsuarios };
});

/** `null` = todos los países; si no, los códigos que la persona puede ver (y «importacion»). */
function listaPaises(v: unknown): string[] | null {
  return Array.isArray(v) ? v.map(String) : null;
}

/**
 * Lleva a la persona a la primera sección que sí puede abrir, sin avisos: una página que no es suya simplemente no está. Solo si no
 * tiene ningún módulo cae en `/sin-acceso`, que no es un rechazo sino la pantalla de una cuenta todavía sin áreas.
 */
export function irAlInicio(usuario: Pick<UsuarioActual, "modulos">, excluirModulo?: string): never {
  redirect(paginaInicialDe(usuario.modulos, excluirModulo) ?? "/sin-acceso");
}

/**
 * Si a la persona con sesión le falta la verificación en dos pasos, la lleva a `/dos-pasos` con la página que pedía (la cabecera
 * `x-ruta` la pone el middleware y la pisa siempre: no se puede mandar desde el navegador). Si no le falta, no hace nada.
 */
export async function irADosPasosSiFalta(): Promise<void> {
  if (!bloqueaPorDosPasos((await getDosPasos())?.estado)) return;
  redirect(rutaDosPasosDesde((await headers()).get("x-ruta")));
}

/**
 * Sin perfil del equipo: una cuenta del portal del proveedor (Shen Zhen) vuelve a su portal, que es lo único que puede abrir; sin
 * sesión, a entrar.
 */
async function irSinPerfil(): Promise<never> {
  // Le falta la verificación en dos pasos: a escribir el código (o activarla), y después vuelve a la página que pidió.
  await irADosPasosSiFalta();
  const usuarioId = await getUsuarioIdSesion();
  if (usuarioId && (await cuentaDeProveedor(usuarioId))) redirect(RUTA_PORTAL_PROVEEDOR);
  // Una cuenta de repartidor (24 nov 2026) vuelve a su panel.
  if (usuarioId && (await cuentaDeRepartidor(usuarioId))) redirect(RUTA_PANEL_REPARTIDOR);
  redirect("/login");
}

/** Exige sesión activa y acceso al módulo dado; si no lo tiene, la lleva a lo suyo. */
export async function requireModulo(clave: string): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual();
  if (!usuario) return irSinPerfil();
  if (!usuario.modulos.includes(clave)) irAlInicio(usuario, clave);
  return usuario;
}

/**
 * La primera pestaña de un panel con pestañas (Pedidos de tienda, Despacho ciudad, Tiendas Shopify; 17 nov 2026): si la persona tiene el
 * módulo de la pestaña principal, se queda; si solo tiene el de otra pestaña (por ejemplo, solo Devoluciones), la lleva a esa en vez de sacarla.
 */
export async function requirePanel(href: string, clave: string): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual();
  if (!usuario) return irSinPerfil();
  if (usuario.modulos.includes(clave)) return usuario;
  const otra = primeraPestanaPermitida(usuario.modulos, href);
  if (otra && otra !== href) redirect(otra);
  return irAlInicio(usuario, clave);
}

/** Exige acceso de escritura al módulo dado — para usar dentro de cada server action que
 * modifique datos, no solo en la página. El menú oculta los botones a quien no tiene permiso,
 * pero un server action se puede invocar directo, así que esta es la barrera real. */
export async function requireModuloEscritura(clave: string): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual();
  const motivo = motivoSinModulo(usuario, clave, true);
  if (motivo || !usuario) throw new Error(motivo ?? "No hay sesión activa.");
  return usuario;
}

/**
 * Por qué la persona no puede abrir el módulo (con `escritura`, modificarlo), o null si puede. La regla de
 * `requireModuloEscritura`, sin lanzar: la usa también `exigirAcceso` (plan de seguridad, fase 4 · 18 nov 2026).
 */
export function motivoSinModulo(usuario: Pick<UsuarioActual, "modulos" | "modulosSoloLectura"> | null, clave: string, escritura: boolean): string | null {
  if (!usuario) return "No hay sesión activa.";
  if (!usuario.modulos.includes(clave)) return "No tienes acceso a este módulo.";
  if (escritura && usuario.modulosSoloLectura.includes(clave)) return "Tu rol solo tiene acceso de lectura a este módulo.";
  return null;
}

/**
 * Acceso (con `escritura`, de escritura) a **alguno** de los módulos dados. Para lo que se puede hacer desde dos módulos: crear un producto
 * desde Producto o desde Gestión de IDs Dropi (donde Nicole, sin acceso a Producto, crea los que necesitan sus publicaciones).
 * Como `requireModuloEscritura`, es la barrera real dentro de cada server action.
 */
export async function requireAlgunModulo(claves: string[], escritura = false): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual();
  if (!usuario) throw new Error("No hay sesión activa.");
  const permitido = claves.some((c) => usuario.modulos.includes(c) && (!escritura || !usuario.modulosSoloLectura.includes(c)));
  if (!permitido) throw new Error(escritura ? "No tienes permiso para esto." : "No tienes acceso a este módulo.");
  return usuario;
}

/** Lo que dice el error cuando una acción está bloqueada para el rol (o la persona) dentro de un módulo que sí abre. */
export const MENSAJE_ACCION_BLOQUEADA = "Tu rol no puede hacer esto en este módulo.";

/** ¿Esta acción está bloqueada para la persona en ese módulo? (ver «Afinar» en Usuarios y roles). Solo mira lo afinado: el nivel del módulo se exige aparte. */
export function accionBloqueada(usuario: UsuarioActual, modulo: string, accion: string): boolean {
  return !accionPermitida(usuario.afinado[modulo], accion);
}

/**
 * Exige acceso al módulo y que la pestaña no esté oculta para la persona. Si está oculta la lleva a la primera que sí ve; sin
 * ninguna, a «Sin acceso». Para el `page.tsx` de cada pestaña de un módulo afinable.
 */
export async function requirePestana(modulo: string, pestana: string): Promise<UsuarioActual> {
  const usuario = await requireModulo(modulo);
  const afinado = usuario.afinado[modulo];
  if (!pestanaVisible(afinado, pestana)) {
    const primera = catalogoDe(modulo)?.pestanas.find((p) => pestanaVisible(afinado, p.clave));
    if (primera) redirect(primera.href);
    irAlInicio(usuario, modulo);
  }
  return usuario;
}
