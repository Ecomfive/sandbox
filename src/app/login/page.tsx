import { redirect } from "next/navigation";
import { getUsuarioSesionBruta } from "@/lib/auth";
import { segundoPasoActivo } from "@/lib/seguridad/segundo-paso";
import { segundoPasoCumplido } from "@/lib/seguridad/segundo-paso-servidor";
import { LoginFormulario } from "./login-formulario";

export const dynamic = "force-dynamic";

/**
 * Iniciar sesión. Con la verificación en dos pasos encendida, quien ya puso la contraseña pero no el código (cualquier página lo manda
 * aquí al no tener sesión) sigue en la pantalla del código, no en el formulario.
 */
export default async function LoginPage() {
  if (segundoPasoActivo()) {
    const usuario = await getUsuarioSesionBruta();
    if (usuario && !(await segundoPasoCumplido(usuario.id))) redirect("/login/verificar");
  }
  return <LoginFormulario />;
}
