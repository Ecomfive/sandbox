import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import type { FilaCuenta } from "../retiros/cuentas/def-cuentas";
import { TablaCuentasConfiguracion } from "../retiros/cuentas/tabla-cuentas";
import { TablaPlataformas } from "./tabla-plataformas";

export const metadata = { title: "Configuración" };

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const usuario = await requireModulo("configuracion");
  const puedeEscribir = !usuario.modulosSoloLectura.includes("configuracion");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  // `datos_binance` lo agrega la migración 0039: si todavía no existe, la consulta falla y se repite sin esa columna.
  const COLUMNAS_CUENTA = "id, numero, tipo, nombre, detalle, activa, comision_tipo, comision_porcentaje, comision_monto_fijo";
  const consultarCuentas = (columnas: string) =>
    supabase.from("cuentas_retiro").select(columnas).eq("pais_id", pais.id).order("creado_en", { ascending: false });

  const [{ data: paisPlataformas }, cuentasConBinance] = await Promise.all([
    supabase
      .from("pais_plataformas")
      .select("id, disponible_para_retiro, plataformas(nombre)")
      .eq("pais_id", pais.id),
    consultarCuentas(`${COLUMNAS_CUENTA}, datos_binance`),
  ]);
  const cuentas = (cuentasConBinance.error ? (await consultarCuentas(COLUMNAS_CUENTA)).data : cuentasConBinance.data) as unknown as
    | FilaCuenta[]
    | null;

  const plataformas = (paisPlataformas ?? [])
    .map((pp) => ({
      id: pp.id,
      disponible: pp.disponible_para_retiro,
      nombre: (pp.plataformas as unknown as { nombre: string } | null)?.nombre ?? "?",
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <Pagina ancho="angosta" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Configuración del sistema" oculto />

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Plataformas para crear retiros</h2>
        <TablaPlataformas plataformas={plataformas} paisId={pais.id} puedeEscribir={puedeEscribir} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Cuentas de retiro</h2>
        <TablaCuentasConfiguracion
          cuentas={cuentas ?? []}
          paisId={pais.id}
          paisNombre={pais.nombre}
          puedeEscribir={puedeEscribir}
        />
      </div>
    </Pagina>
  );
}
