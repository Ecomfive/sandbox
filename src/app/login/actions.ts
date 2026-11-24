"use server";

import { redirect } from "next/navigation";
import { RUTA_PORTAL_PROVEEDOR, cuentaDeProveedor } from "@/lib/proveedor/cuenta";
import { RUTA_PANEL_REPARTIDOR, cuentaDeRepartidor } from "@/lib/despacho/cuenta-repartidor";
import { cerrarIntento, revisarIngreso } from "@/lib/seguridad/limite-ingreso";
import { DEMASIADOS_INTENTOS } from "@/lib/seguridad/limite-reglas";
import { createServiceClient, createSessionClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
}

export async function iniciarSesion(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  // Tope de claves equivocadas por correo + IP, por IP y por correo (seguridad · 19 nov 2026): el intento se suma antes de probar la
  // clave y, frenado, ni se prueba. El mensaje no dice si el correo existe.
  const { intento, frenado } = await revisarIngreso(email);
  if (frenado) return { error: DEMASIADOS_INTENTOS };

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  // Correcta (o Supabase no respondió): el intento se devuelve. Equivocada: queda contada.
  await cerrarIntento(intento, error);
  if (error) {
    return { error: "Correo o contraseña incorrectos." };
  }
  // Una cuenta del portal del proveedor (Shen Zhen) entra a su portal, no al sistema.
  const cuenta = data.user ? await cuentaDeProveedor(data.user.id) : null;
  if (cuenta) {
    await createServiceClient().from("proveedor_usuarios").update({ ultimo_ingreso_en: new Date().toISOString() }).eq("id", cuenta.cuentaId);
    redirect(RUTA_PORTAL_PROVEEDOR);
  }
  // Una cuenta de repartidor (24 nov 2026) entra a su panel, no al sistema.
  const repartidor = data.user ? await cuentaDeRepartidor(data.user.id) : null;
  if (repartidor) {
    await createServiceClient().from("despacho_repartidores").update({ ultimo_ingreso_en: new Date().toISOString() }).eq("id", repartidor.id);
    redirect(RUTA_PANEL_REPARTIDOR);
  }
  redirect("/");
}

export async function cerrarSesion() {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/login");
}
