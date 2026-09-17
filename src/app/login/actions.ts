"use server";

import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
}

export async function iniciarSesion(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "Correo o contraseña incorrectos." };
  }
  redirect("/");
}

export async function cerrarSesion() {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/login");
}
