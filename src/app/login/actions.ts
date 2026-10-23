"use server";

import { redirect } from "next/navigation";
import { RUTA_PORTAL_PROVEEDOR, cuentaDeProveedor } from "@/lib/proveedor/cuenta";
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
  redirect("/");
}

export async function cerrarSesion() {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/login");
}
