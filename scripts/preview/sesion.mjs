// Cookie de sesión de Supabase (formato de @supabase/ssr) para la persona de la vista previa. El PostgREST falso
// acepta cualquier token y responde /auth/v1/user con esa persona (ver postgrest.mts), pero exige en `apikey` la clave
// de la corrida (auditoría de seguridad, 18 nov 2026).
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const USUARIO_ID = "00000000-0000-4000-8000-0000000000a1";

/** Dirección del PostgREST falso: la de .env.preview si está en el entorno; si no, la de levantar.sh. */
export const URL_SUPA_PREVIEW = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

/** La clave de la corrida: PREVIEW_CLAVE del entorno o la que levantar.sh dejó en `<PREVIEW_DIR>/clave`. */
export function clavePreview() {
  if (process.env.PREVIEW_CLAVE) return process.env.PREVIEW_CLAVE;
  try {
    return readFileSync(join(process.env.PREVIEW_DIR ?? ".preview", "clave"), "utf8").trim();
  } catch {
    return "";
  }
}

export function cookieSesion(urlSupabase) {
  const ref = new URL(urlSupabase).hostname.split(".")[0];
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24 * 365;
  const user = { id: USUARIO_ID, aud: "authenticated", role: "authenticated", email: "preview@ejemplo.test", app_metadata: {}, user_metadata: {} };
  const access = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USUARIO_ID, role: "authenticated", aud: "authenticated", exp })}.preview`;
  const sesion = { access_token: access, refresh_token: "preview", token_type: "bearer", expires_in: 3600 * 24 * 365, expires_at: exp, user };
  return { name: `sb-${ref}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(sesion)).toString("base64url")}` };
}
