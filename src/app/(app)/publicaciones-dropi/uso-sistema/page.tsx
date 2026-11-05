import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarAltas } from "./datos-uso";
import { PanelUso } from "./panel-uso";

export const metadata = { title: "Uso del sistema · Gestión de IDs Dropi" };

export const dynamic = "force-dynamic";

/**
 * Gestión de IDs Dropi › Uso del sistema: qué se creó en el sistema y qué directo en Dropi, y por qué, para pasar al sistema lo que todavía se
 * hace allá. Supervisión: solo quien tiene el módulo `uso-sistema` (Hernán y Alcides); la pestaña no se le muestra a nadie más.
 */
export default async function UsoSistemaPage() {
  const usuario = await requireModulo("uso-sistema");
  const datos = await cargarAltas(createServiceClient(), usuario.paisesPermitidos);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Uso del sistema" oculto />
      {datos ? (
        <PanelUso altas={datos.altas} paises={datos.paises} puedeEscribir={!usuario.modulosSoloLectura.includes("uso-sistema")} />
      ) : (
        <p className="text-sm text-muted-foreground">Falta correr en Supabase la migración 0227.</p>
      )}
    </Pagina>
  );
}
