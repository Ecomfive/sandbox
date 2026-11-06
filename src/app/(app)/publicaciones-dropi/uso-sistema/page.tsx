import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarUsoPersonas } from "./datos-personas";
import { cargarAltas } from "./datos-uso";
import { PanelPersonas } from "./panel-personas";
import { PanelUso } from "./panel-uso";
import { VistasUso } from "./vistas-uso";

export const metadata = { title: "Uso del sistema · Gestión de IDs Dropi" };

export const dynamic = "force-dynamic";

/**
 * Gestión de IDs Dropi › Uso del sistema: quién usa el sistema y en qué parte, y qué se creó en el sistema y qué directo en Dropi, y por qué, para
 * pasar al sistema lo que todavía se hace afuera. Supervisión: solo quien tiene el módulo `uso-sistema` (Hernán y Alcides); la pestaña no se le muestra a nadie más.
 */
export default async function UsoSistemaPage() {
  const usuario = await requireModulo("uso-sistema");
  const supabase = createServiceClient();
  const [datos, personas] = await Promise.all([cargarAltas(supabase, usuario.paisesPermitidos), cargarUsoPersonas(supabase)]);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Uso del sistema" oculto />
      {datos ? (
        <VistasUso
          personas={personas ? <PanelPersonas datos={personas} hoy={personas.hoy} altas={datos.altas} /> : <p className="text-sm text-muted-foreground">Falta correr en Supabase la migración 0166.</p>}
          publicaciones={<PanelUso altas={datos.altas} paises={datos.paises} puedeEscribir={!usuario.modulosSoloLectura.includes("uso-sistema")} />}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Falta correr en Supabase la migración 0228.</p>
      )}
    </Pagina>
  );
}
