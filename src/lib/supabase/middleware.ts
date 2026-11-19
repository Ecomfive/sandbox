import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { OPCIONES_COOKIE_SESION } from "@/lib/supabase/cookies";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Refresca la cookie de sesión de Supabase en cada request para que los
 * Server Components no vean una sesión vencida. No redirige a nadie: el
 * control de acceso por página/módulo vive en `requireModulo` (src/lib/auth.ts).
 * `cabecerasPeticion`: las de la petición que siguen hacia la página, si el middleware agregó alguna (el nonce de la
 * política de contenido y `x-ruta`, auditoría de seguridad, 18 y 19 nov 2026); sin ellas siguen las de la petición tal cual.
 *
 * Si Supabase renueva la sesión aquí, la cookie nueva tiene que llegar también a la página y a las acciones de ESTA petición
 * (seguridad · 19 nov 2026): `NextResponse.next({ request: { headers } })` copia las cabeceras al crearse, así que tras renovar se
 * arma de nuevo con la cookie ya cambiada. Si no, el servidor veía la cookie vieja y volvía a renovar con un token de renovación
 * ya usado (solo funcionaba por el margen de reuso de Supabase) y podía perder la sesión `aal2` de la verificación en dos pasos.
 */
export async function updateSession(request: NextRequest, cabecerasPeticion?: Headers) {
  /** Las cabeceras que siguen hacia la página: las agregadas por el middleware y la cookie tal como está ahora en `request`. */
  const cabecerasHacia = () => {
    const cabeceras = new Headers(cabecerasPeticion ?? request.headers);
    const cookie = request.cookies.toString();
    if (cookie) cabeceras.set("cookie", cookie);
    else cabeceras.delete("cookie");
    return cabeceras;
  };
  let supabaseResponse = NextResponse.next({ request: { headers: cabecerasHacia() } });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: OPCIONES_COOKIE_SESION,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, cabecerasRespuesta) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request: { headers: cabecerasHacia() } });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
        // Las que pide la librería junto con la cookie (que ninguna caché guarde la respuesta con la sesión).
        for (const [clave, valor] of Object.entries(cabecerasRespuesta ?? {})) {
          supabaseResponse.headers.set(clave, valor);
        }
      },
    },
  });

  await supabase.auth.getUser();

  return supabaseResponse;
}
