import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { cargarPuestos } from "@/lib/puestos/datos";
import { createServiceClient } from "@/lib/supabase/server";
import { AvisoSinMigracion } from "./aviso-sin-migracion";
import { TablaPuestos } from "./tabla-puestos";

export const metadata = { title: "Puestos" };

export const dynamic = "force-dynamic";

export default async function PuestosPage({ searchParams }: { searchParams: Promise<{ abrir?: string }> }) {
  const usuario = await requireModulo("puestos");
  const [datos, pais, { abrir }] = await Promise.all([cargarPuestos(), getPaisActual(createServiceClient()), searchParams]);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Puestos" oculto />
      {datos ? (
        <TablaPuestos
          puestos={datos.puestos}
          opciones={{ personas: datos.personas, manuales: datos.manuales, cursos: datos.cursos }}
          codigoPais={pais.codigo}
          puedeEscribir={!usuario.modulosSoloLectura.includes("puestos")}
          abrirInicial={typeof abrir === "string" ? abrir : null}
        />
      ) : (
        <AvisoSinMigracion />
      )}
    </Pagina>
  );
}
