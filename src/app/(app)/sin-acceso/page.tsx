import Link from "next/link";
import { redirect } from "next/navigation";
import { linkClass } from "@/components/ui/link";
import { getUsuarioActual, irAlInicio } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cuenta sin áreas" };

/**
 * Solo la ve una cuenta que todavía no tiene ningún módulo. Quien ya tiene alguno nunca se queda aquí: va a lo suyo (un enlace
 * viejo a esta ruta no es un rechazo).
 */
export default async function SinAccesoPage() {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");
  if (usuario.modulos.length > 0) irAlInicio(usuario);
  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Tu cuenta aún no tiene áreas asignadas</h1>
      <p className="text-sm text-muted-foreground">Pide a un administrador que te asigne un rol en Usuarios y roles.</p>
      <Link href="/ayuda" className={`text-sm ${linkClass}`}>
        Abrir el Centro de ayuda
      </Link>
    </main>
  );
}
