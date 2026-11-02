import Image from "next/image";
import { redirect } from "next/navigation";
import { cerrarSesion } from "@/app/login/actions";
import { getUsuarioSesion } from "@/lib/auth";
import { tieneContrasenaTemporal } from "@/lib/cuenta/contrasena";
import { ElegirContrasena } from "./elegir-contrasena";

export const dynamic = "force-dynamic";

/**
 * Quien entra con la contraseña temporal que le dio un administrador (Usuarios y roles) llega aquí desde cualquier página del sistema
 * (el layout de `(app)` lo manda) y elige la suya antes de seguir. Sin la marca de temporal, va al inicio.
 */
export default async function ElegirContrasenaPage() {
  const usuario = await getUsuarioSesion();
  if (!usuario) redirect("/login");
  if (!tieneContrasenaTemporal(usuario)) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <Image src="/brand/ecomfive-rojo.png" alt="Ecomfive" width={161} height={44} className="mx-auto h-8 w-auto" />
        <h1 className="mt-6 mb-0 text-center text-xl font-semibold tracking-tight">Elige tu contraseña</h1>
        <p className="mt-1 mb-6 text-center text-sm text-muted-foreground">
          Entraste con una contraseña temporal. Cámbiala por una que solo tú conozcas para seguir.
        </p>
        <ElegirContrasena />
        <form action={cerrarSesion} className="mt-4 text-center">
          <button type="submit" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
