import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionClient, createServiceClient } from "@/lib/supabase/server";
import { aAccesoPlano, nivelesEfectivos, type PermisoPropio } from "@/lib/permisos/acceso";
import { accionPermitida, contarAjustes, pestanaVisible, resolverAfinado, type Afinado, type FilaAfinada } from "@/lib/permisos/afinado";
import { MODULOS_AFINABLES, catalogoDe } from "@/lib/permisos/catalogo";
import { paginaInicialDe } from "@/lib/nav-data";
import { RUTA_PORTAL_PROVEEDOR, cuentaDeProveedor } from "@/lib/proveedor/cuenta";

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
  paisesPermitidos: string[] | null;
}

interface Permiso {
  modulo: string;
  solo_lectura: boolean;
}

/** Lo afinado y lo propio de una persona (migración 0118). Cada consulta falla en silencio: sin la migración todos ven lo de siempre. */
interface PermisosFinos {
  propios: PermisoPropio[];
  afinadosPersona: FilaAfinada[];
  afinadosRoles: (FilaAfinada & { rol_id: string })[];
}

async function cargarPermisosFinos(supabase: ReturnType<typeof createServiceClient>, perfilId: string): Promise<PermisosFinos> {
  const seguro = async <T,>(consulta: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
    try {
      const r = await consulta;
      return r.error ? [] : (r.data ?? []);
    } catch {
      return [];
    }
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
export const getUsuarioIdSesion = cache(async (): Promise<string | null> => {
  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  return user?.id ?? null;
});

/** Usuario con sesión activa, su rol y los módulos a los que ese rol tiene acceso (una vez por petición). */
export const getUsuarioActual = cache(async (): Promise<UsuarioActual | null> => {
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
  let completo = await supabase.from("perfiles").select(`${columnas}, paises_permitidos`).eq("id", userId).maybeSingle();
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

  return {
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
  };
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
 * Sin perfil del equipo: una cuenta del portal del proveedor (Chin) vuelve a su portal, que es lo único que puede abrir; sin
 * sesión, a entrar.
 */
async function irSinPerfil(): Promise<never> {
  const usuarioId = await getUsuarioIdSesion();
  if (usuarioId && (await cuentaDeProveedor(usuarioId))) redirect(RUTA_PORTAL_PROVEEDOR);
  redirect("/login");
}

/** Exige sesión activa y acceso al módulo dado; si no lo tiene, la lleva a lo suyo. */
export async function requireModulo(clave: string): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual();
  if (!usuario) return irSinPerfil();
  if (!usuario.modulos.includes(clave)) irAlInicio(usuario, clave);
  return usuario;
}

/** Exige acceso de escritura al módulo dado — para usar dentro de cada server action que
 * modifique datos, no solo en la página. El menú oculta los botones a quien no tiene permiso,
 * pero un server action se puede invocar directo, así que esta es la barrera real. */
export async function requireModuloEscritura(clave: string): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual();
  if (!usuario) throw new Error("No hay sesión activa.");
  if (!usuario.modulos.includes(clave)) throw new Error("No tienes acceso a este módulo.");
  if (usuario.modulosSoloLectura.includes(clave)) {
    throw new Error("Tu rol solo tiene acceso de lectura a este módulo.");
  }
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
