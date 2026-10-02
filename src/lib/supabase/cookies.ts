/**
 * Opciones de las cookies de sesión de Supabase: no son legibles desde JavaScript, así que un XSS no podría llevarse la
 * sesión. Es seguro porque la app no usa un cliente de Supabase en el navegador que lea la sesión (el cliente de
 * `lib/supabase/client.ts` solo sube archivos con una firma temporal).
 */
export const OPCIONES_COOKIE_SESION = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
