import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarRutas } from "./datos-envios";
import { TablaEnvios } from "./tabla-envios";

export const metadata = { title: "Envíos · Compras" };

export const dynamic = "force-dynamic";

/** Compras › Envíos: lo que promete cada agente de envío por país y vía, sus tarifas y lo que de verdad tardó. */
export default async function EnviosComprasPage() {
  const usuario = await requireModulo("compras");
  const { rutas, agentes, tipos, error } = await cargarRutas();
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Envíos" oculto />
      {error ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar los envíos (¿falta correr la migración 0092?).
        </p>
      ) : (
        <TablaEnvios rutas={rutas} agentes={agentes} tipos={tipos} puedeEscribir={!usuario.modulosSoloLectura.includes("compras")} />
      )}
    </Pagina>
  );
}
