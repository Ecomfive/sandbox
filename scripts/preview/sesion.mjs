// Cookie de sesión de Supabase (formato de @supabase/ssr) para la persona de la vista previa. El PostgREST falso
// acepta cualquier token y responde /auth/v1/user con esa persona (ver postgrest.mts).
export const USUARIO_ID = "00000000-0000-4000-8000-0000000000a1";

export function cookieSesion(urlSupabase) {
  const ref = new URL(urlSupabase).hostname.split(".")[0];
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24 * 365;
  const user = { id: USUARIO_ID, aud: "authenticated", role: "authenticated", email: "preview@ejemplo.test", app_metadata: {}, user_metadata: {} };
  const access = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USUARIO_ID, role: "authenticated", aud: "authenticated", exp })}.preview`;
  const sesion = { access_token: access, refresh_token: "preview", token_type: "bearer", expires_in: 3600 * 24 * 365, expires_at: exp, user };
  return { name: `sb-${ref}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(sesion)).toString("base64url")}` };
}
