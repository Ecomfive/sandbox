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
 * política de contenido, auditoría de seguridad, 18 nov 2026); sin ellas siguen las de la petición tal cual.
 */
export async function updateSession(request: NextRequest, cabecerasPeticion?: Headers) {
  const supabaseResponse = NextResponse.next({ request: cabecerasPeticion ? { headers: cabecerasPeticion } : request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: OPCIONES_COOKIE_SESION,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getUser();

  return supabaseResponse;
}
