// Verificación en dos pasos (27 oct 2026), la parte que toca la sesión. La lógica pura está en segundo-paso.ts.
// El gate vive en `getUsuarioSesion` (src/lib/auth.ts): mientras el segundo paso no se cumpla, la persona no tiene sesión para el sistema
// (páginas, acciones y rutas de API), aunque la contraseña ya esté puesta. Las cuentas del portal del proveedor no pasan por aquí.

import { cuentaDeProveedor } from "@/lib/proveedor/cuenta";
import { createSessionClient } from "@/lib/supabase/server";
import { nivelDeToken, segundoPasoActivo } from "./segundo-paso";

/**
 * ¿La sesión cumplió el segundo paso? Sí si la verificación está apagada, si la sesión ya subió a `aal2` (puso el código de su app
 * autenticadora en este ingreso: Supabase lo firma dentro del token, no se puede falsificar) o si es una cuenta del portal del proveedor.
 */
export async function segundoPasoCumplido(usuarioId: string): Promise<boolean> {
  if (!segundoPasoActivo()) return true;
  const { data } = await (await createSessionClient()).auth.getSession();
  if (nivelDeToken(data.session?.access_token) === "aal2") return true;
  return (await cuentaDeProveedor(usuarioId)) !== null;
}

/** La app autenticadora (TOTP) ya activada y confirmada de la persona con sesión, o null. */
export async function factorTotp(): Promise<{ id: string } | null> {
  const { data } = await (await createSessionClient()).auth.mfa.listFactors();
  const f = (data?.totp ?? []).find((x) => x.status === "verified");
  return f ? { id: f.id } : null;
}
