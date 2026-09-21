import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { VentanaCuentaRetiro } from "./ventana-cuenta-retiro";
import { TablaCuentas } from "./tabla-cuentas";
import type { FilaCuenta } from "./def-cuentas";

export const metadata = { title: "Cuentas destino" };

export const dynamic = "force-dynamic";

export default async function CuentasRetiroPage() {
  await requireModulo("retiros");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  // `datos_binance` lo agrega la migración 0039: si todavía no existe, la consulta falla y se repite sin esa columna
  // (la lista de cuentas nunca queda vacía por eso).
  const consultar = (columnas: string) =>
    supabase.from("cuentas_retiro").select(columnas).eq("pais_id", pais.id).order("numero", { ascending: true });
  const COLUMNAS = "id, numero, tipo, nombre, detalle, activa, comision_tipo, comision_porcentaje, comision_monto_fijo";
  const conBinance = await consultar(`${COLUMNAS}, datos_binance`);
  const cuentas = (conBinance.error ? (await consultar(COLUMNAS)).data : conBinance.data) as unknown as FilaCuenta[] | null;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Cuentas destino" oculto />
      <div className="flex justify-end">
        <VentanaCuentaRetiro paisId={pais.id} paisNombre={pais.nombre} />
      </div>

      <TablaCuentas cuentas={cuentas ?? []} paisId={pais.id} paisNombre={pais.nombre} />
    </Pagina>
  );
}
