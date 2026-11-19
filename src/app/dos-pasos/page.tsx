import Image from "next/image";
import { redirect } from "next/navigation";
import { cerrarSesion } from "@/app/login/actions";
import { getDosPasos, getUsuarioIdSesion } from "@/lib/auth";
import { RUTA_PORTAL_PROVEEDOR, cuentaDeProveedor } from "@/lib/proveedor/cuenta";
import { destinoTrasDosPasos } from "@/lib/seguridad/dos-pasos";
import { ActivarDosPasos, CodigoDosPasos } from "./dos-pasos";

export const dynamic = "force-dynamic";

/**
 * Verificación en dos pasos (seguridad · 19 nov 2026). Llega aquí quien entró con su contraseña y le falta el código: el layout de
 * `(app)` y `requireModulo` lo mandan (`irADosPasosSiFalta`) con la página a la que iba en `volver`. Con la verificación activa, escribe
 * el código; sin ella, la activa leyendo el QR con una app de códigos. Si no es obligatoria para esta persona, puede dejarlo para después.
 */
export default async function DosPasosPage({ searchParams }: { searchParams: Promise<{ volver?: string | string[] }> }) {
  const { volver } = await searchParams;
  const destino = destinoTrasDosPasos(typeof volver === "string" ? volver : null);
  const usuarioId = await getUsuarioIdSesion();
  if (!usuarioId) redirect("/login");
  const dos = await getDosPasos();
  if (!dos) {
    // Una cuenta del portal del proveedor no usa esto; una sin perfil activo, a entrar.
    if (await cuentaDeProveedor(usuarioId)) redirect(RUTA_PORTAL_PROVEEDOR);
    redirect("/login");
  }
  if (dos.estado === "listo") redirect(destino);

  const pideCodigo = dos.estado === "pedir-codigo";
  const opcional = dos.estado === "invitar" || dos.estado === "libre";

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <Image src="/brand/ecomfive-rojo.png" alt="Ecomfive" width={161} height={44} className="mx-auto h-8 w-auto" />
        <h1 className="mt-6 mb-0 text-center text-xl font-semibold tracking-tight">{pideCodigo ? "Escribe tu código" : "Activa la verificación en dos pasos"}</h1>
        <p className="mt-1 mb-6 text-center text-sm text-muted-foreground">
          {pideCodigo
            ? "Abre la app de códigos de tu celular y escribe los 6 números de Ecomfive."
            : opcional
              ? "Además de tu contraseña, al entrar te pediremos un código de tu celular. Así nadie entra solo con tu contraseña."
              : "Tu cuenta administra el sistema: para entrar, además de tu contraseña necesitas un código de tu celular."}
        </p>
        {pideCodigo ? <CodigoDosPasos destino={destino} /> : <ActivarDosPasos destino={destino} opcional={opcional} />}
        <form action={cerrarSesion} className="mt-4 text-center">
          <button type="submit" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
