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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Cuentas destino</h1>
        <VentanaCuentaRetiro paisId={pais.id} />
      </div>

      <TablaCuentas cuentas={cuentas ?? []} paisId={pais.id} />
    </main>
  );
}
