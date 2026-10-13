import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { obtenerProductosTest } from "../datos-test";
import { InformeTest } from "../informe-test";

export const metadata = { title: "Informe" };

export const dynamic = "force-dynamic";

/** Informe de Productos Test (Sistema WMS): lo testeado por día, semana o mes, con winners, gasto y CPA. Por ahora solo Panamá. */
export default async function InformeProductosTestPage() {
  await requireModulo("productos-test");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const productos = await obtenerProductosTest(supabase, pais.id);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo={`Test productos ${pais.codigo}`} oculto />
      <InformeTest productos={productos} codigoPais={pais.codigo} />
    </Pagina>
  );
}
