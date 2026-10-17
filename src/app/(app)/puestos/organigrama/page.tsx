import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { cargarPuestos } from "@/lib/puestos/datos";
import { createServiceClient } from "@/lib/supabase/server";
import { AvisoSinMigracion } from "../aviso-sin-migracion";
import { VistaOrganigrama } from "./vista-organigrama";

export const metadata = { title: "Organigrama" };

export const dynamic = "force-dynamic";

export default async function OrganigramaPage() {
  const usuario = await requireModulo("puestos");
  const [datos, pais] = await Promise.all([cargarPuestos(), getPaisActual(createServiceClient())]);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Organigrama" oculto />
      {datos ? (
        <VistaOrganigrama
          puestos={datos.puestos}
          opciones={{ personas: datos.personas, manuales: datos.manuales, cursos: datos.cursos }}
          codigoPais={pais.codigo}
          puedeEscribir={!usuario.modulosSoloLectura.includes("puestos")}
        />
      ) : (
        <AvisoSinMigracion />
      )}
    </Pagina>
  );
}
