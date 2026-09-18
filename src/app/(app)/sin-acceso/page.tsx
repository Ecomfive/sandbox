import Link from "next/link";
import { linkClass } from "@/components/ui/link";

export default function SinAccesoPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
      <h1 className="text-lg font-semibold tracking-tight">No tienes acceso a esta sección</h1>
      <p className="text-sm text-muted-foreground">
        Tu rol no incluye este módulo. Si crees que deberías verlo, pide a un administrador que
        ajuste tus permisos en Usuarios y roles.
      </p>
      <Link href="/" className={`text-sm ${linkClass}`}>
        Volver al dashboard
      </Link>
    </main>
  );
}
