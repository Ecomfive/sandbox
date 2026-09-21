import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { TablaPatrones } from "./tabla-patrones";

export const metadata = { title: "Diccionario de patrones bancarios" };

export const dynamic = "force-dynamic";

export default async function PatronesBancariosPage() {
  const usuario = await requireModulo("extractos");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [{ data: plataformas }, { data: patrones }] = await Promise.all([
    supabase.from("plataformas").select("id, nombre").order("nombre"),
    supabase
      .from("patrones_bancarios")
      .select("id, fragmento, plataforma_id, plataformas(nombre)")
      .eq("pais_id", pais.id)
      .order("fragmento"),
  ]);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Diccionario de patrones bancarios" oculto />

      <TablaPatrones
        patrones={(patrones ?? []).map((p) => ({
          id: p.id,
          fragmento: p.fragmento,
          plataforma: (p.plataformas as unknown as { nombre: string } | null)?.nombre ?? null,
        }))}
        paisId={pais.id}
        plataformas={plataformas ?? []}
        puedeEscribir={!usuario.modulosSoloLectura.includes("extractos")}
      />
    </Pagina>
  );
}
