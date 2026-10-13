import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { obtenerProductosTest } from "../datos-test";
import { DashboardTest } from "../dashboard-test";

export const metadata = { title: "Dashboard · Test productos" };

export const dynamic = "force-dynamic";

/** Test productos › Dashboard: todo el testing del país de la barra de arriba a la vez, con filtros que se cruzan. */
export default async function DashboardTestPage() {
  await requireModulo("productos-test");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const productos = await obtenerProductosTest(supabase, pais.id);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Dashboard de test productos" oculto />
      <DashboardTest productos={productos} codigoPais={pais.codigo} />
    </Pagina>
  );
}
