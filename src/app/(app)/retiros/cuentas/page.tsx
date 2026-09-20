import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { VentanaCuentaRetiro } from "./ventana-cuenta-retiro";
import { TablaCuentas } from "./tabla-cuentas";

export const dynamic = "force-dynamic";

export default async function CuentasRetiroPage() {
  await requireModulo("retiros");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: cuentas } = await supabase
    .from("cuentas_retiro")
    .select("id, numero, tipo, nombre, detalle, activa, comision_tipo, comision_porcentaje, comision_monto_fijo")
    .eq("pais_id", pais.id)
    .order("numero", { ascending: true });

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Cuentas destino" oculto />
      <div className="flex justify-end">
        <VentanaCuentaRetiro paisId={pais.id} />
      </div>

      <TablaCuentas cuentas={cuentas ?? []} paisId={pais.id} />
    </Pagina>
  );
}
