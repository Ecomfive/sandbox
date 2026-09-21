import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { formatearFechaHoraCompleta } from "@/lib/formato";
import { VentanaCuentaRetiro } from "./ventana-cuenta-retiro";
import { TablaCuentas } from "./tabla-cuentas";
import { HistorialEliminadas, type CuentaEliminada } from "./historial-eliminadas";
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

  // La cuenta eliminada ya no está en `cuentas_retiro` (se borra de verdad): lo único que queda de
  // ella es el registro que `eliminarCuentaRetiro` deja en `historial_auditoria`, con su nombre.
  const { data: eliminadas } = await supabase
    .from("historial_auditoria")
    .select("id, usuario_nombre, detalle, creado_en")
    .eq("entidad", "cuentas_retiro")
    .eq("accion", "eliminar_cuenta_retiro")
    .order("creado_en", { ascending: false })
    .limit(50);
  const historialEliminadas: CuentaEliminada[] = (eliminadas ?? []).map((e) => ({
    id: e.id,
    nombre: e.detalle ?? "Cuenta de retiro eliminada.",
    fechaTexto: formatearFechaHoraCompleta(e.creado_en, pais.codigo),
    usuario: e.usuario_nombre,
  }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Cuentas destino" oculto />
      {puedeEscribir && (
        <div className="flex justify-end">
          <VentanaCuentaRetiro paisId={pais.id} paisNombre={pais.nombre} />
        </div>
      )}

      <TablaCuentas cuentas={cuentas ?? []} paisId={pais.id} paisNombre={pais.nombre} puedeEscribir={puedeEscribir} />

      <HistorialEliminadas eventos={historialEliminadas} />
    </Pagina>
  );
}
