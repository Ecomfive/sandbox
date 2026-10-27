"use server";

import { redirect } from "next/navigation";
import { RUTA_PORTAL_PROVEEDOR, cuentaDeProveedor } from "@/lib/proveedor/cuenta";
import { segundoPasoActivo } from "@/lib/seguridad/segundo-paso";
import { borrarMarcaSegundoPaso, enviarCodigoCorreo, factorTotp } from "@/lib/seguridad/segundo-paso-servidor";
import { createServiceClient, createSessionClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
}

export async function iniciarSesion(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "Correo o contraseña incorrectos." };
  }
  // Una cuenta del portal del proveedor (Shen Zhen) entra a su portal, no al sistema.
  const cuenta = data.user ? await cuentaDeProveedor(data.user.id) : null;
  if (cuenta) {
    await createServiceClient().from("proveedor_usuarios").update({ ultimo_ingreso_en: new Date().toISOString() }).eq("id", cuenta.cuentaId);
    redirect(RUTA_PORTAL_PROVEEDOR);
  }
  // Verificación en dos pasos (27 oct 2026): con la contraseña puesta todavía no hay sesión para el sistema; se pide el código de la app
  // autenticadora (si la tiene activada) o el que llega por correo, que se manda aquí mismo. Un código reciente sigue valiendo si se pide
  // otro antes de tiempo, así que ese límite no saca a nadie.
  if (segundoPasoActivo()) {
    if (!(await factorTotp())) {
      const r = await enviarCodigoCorreo(data.user.id, data.user.email ?? email);
      if ("error" in r && !r.limite) {
        await supabase.auth.signOut();
        return { error: r.error };
      }
    }
    redirect("/login/verificar");
  }
  redirect("/");
}

export async function cerrarSesion() {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  await borrarMarcaSegundoPaso();
  redirect("/login");
}
