import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { TablaCuentas } from "./tabla-cuentas";
import type { FilaCuenta } from "./def-cuentas";

export const metadata = { title: "Cuentas destino" };

export const dynamic = "force-dynamic";

export default async function CuentasRetiroPage() {
  const usuario = await requireModulo("retiros");
  const puedeEscribir = !usuario.modulosSoloLectura.includes("retiros");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  // `datos_binance` lo agrega la migración 0039: si todavía no existe, la consulta falla y se repite sin esa columna
  // (la lista de cuentas nunca queda vacía por eso).
  const consultar = (columnas: string) =>
    supabase.from("cuentas_retiro").select(columnas).eq("pais_id", pais.id).order("numero", { ascending: true });
  const COLUMNAS = "id, numero, tipo, nombre, detalle, activa, comision_tipo, comision_porcentaje, comision_monto_fijo";
  const conBinance = await consultar(`${COLUMNAS}, datos_binance`);
  const cuentas = (conBinance.error ? (await consultar(COLUMNAS)).data : conBinance.data) as unknown as FilaCuenta[] | null;

  // El "numero" que se guarda solo sirve para mantener el orden de creación (no se reutiliza si se
  // borra una cuenta vieja); el que se ve siempre es su posición 1, 2, 3... sin huecos, aunque haya
  // cuentas eliminadas hace tiempo. Si en el futuro se puede reordenar la lista a mano, esto se cae.
  const cuentasNumeradas = (cuentas ?? []).map((c, i) => ({ ...c, numero: i + 1 }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Cuentas destino" oculto />

      <TablaCuentas cuentas={cuentasNumeradas} paisId={pais.id} paisNombre={pais.nombre} puedeEscribir={puedeEscribir} />
    </Pagina>
  );
}
