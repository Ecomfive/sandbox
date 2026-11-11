import { hoyPanama } from "@/lib/af4/fecha";
import { cargarMensajero, resolverMensajero } from "@/lib/ventas/cargar-mensajero";
import { AppMensajero } from "./app-mensajero";

export const dynamic = "force-dynamic";

export default async function PaginaMensajero({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sesion = await resolverMensajero(token);
  if (!sesion) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-2 px-4 text-center">
        <h1 className="text-lg font-semibold">Este enlace ya no vale</h1>
        <p className="text-sm text-muted-foreground">Pídele a tu coordinador uno nuevo.</p>
      </main>
    );
  }
  const datos = await cargarMensajero(sesion, hoyPanama());
  return <AppMensajero token={token} datos={datos} />;
}
