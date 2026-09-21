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
  const usuario = await requireModulo("retiros");
  const puedeEscribir = !usuario.modulosSoloLectura.includes("retiros");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  // `datos_binance` lo agrega la migración 0039: si todavía no existe, la consulta falla y se repite sin esa columna
  // (la lista de cuentas nunca queda vacía por eso).
  const consultar = (columnas: string) =>
    supabase.from("cuentas_retiro").select(columnas).eq("pais_id", pais.id).order("numero", { ascending: true });
  const COLUMNAS = "id, numero, tipo, nombre, detalle, activa, comision_tipo, comision_porcentaje, comision_monto_fijo, creado_en";
  const conBinance = await consultar(`${COLUMNAS}, datos_binance`);
  const cuentas = (conBinance.error ? (await consultar(COLUMNAS)).data : conBinance.data) as unknown as FilaCuenta[] | null;

  const eliminadaEn = await fechasDeEliminacion(
    supabase,
    (cuentas ?? []).filter((c) => !c.activa).map((c) => c.id)
  );

  // El "numero" que se guarda solo sirve para mantener el orden de creación (no se reutiliza si se
  // borra una cuenta vieja); el que se ve siempre es su posición 1, 2, 3... sin huecos, aunque haya
  // cuentas eliminadas hace tiempo. Si en el futuro se puede reordenar la lista a mano, esto se cae.
  const cuentasNumeradas = (cuentas ?? []).map((c, i) => ({ ...c, numero: i + 1, eliminada_en: eliminadaEn.get(c.id) ?? null }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Cuentas destino" oculto />
      {puedeEscribir && (
        <div className="flex justify-end">
          <VentanaCuentaRetiro paisId={pais.id} paisNombre={pais.nombre} />
        </div>
      )}

      <TablaCuentas
        cuentas={cuentasNumeradas}
        paisId={pais.id}
        paisNombre={pais.nombre}
        codigoPais={pais.codigo}
        puedeEscribir={puedeEscribir}
      />
    </Pagina>
  );
}

/**
 * Cuándo se eliminó cada cuenta que hoy está eliminada (inactiva): la última vez que alguien la eliminó o la
 * desactivó, según el historial de auditoría. «Eliminar» solo desactiva, así que la cuenta no guarda esa fecha; si no
 * hay registro (se desactivó antes de que existiera la auditoría) la cuenta simplemente no trae fecha. Un error de la
 * consulta tampoco rompe la página: la ficha muestra la cuenta sin esa fecha.
 */
async function fechasDeEliminacion(supabase: ReturnType<typeof createServiceClient>, idsEliminadas: string[]) {
  const fechas = new Map<string, string>();
  if (idsEliminadas.length === 0) return fechas;
  const { data } = await supabase
    .from("historial_auditoria")
    .select("entidad_id, accion, despues, creado_en")
    .eq("entidad", "cuentas_retiro")
    .in("accion", ["eliminar_cuenta_retiro", "activar_cuenta_retiro"])
    .in("entidad_id", idsEliminadas)
    .order("creado_en", { ascending: false });
  for (const e of data ?? []) {
    if (!e.entidad_id || fechas.has(e.entidad_id)) continue; // el primero de cada cuenta es el más reciente
    const desactivo = e.accion === "eliminar_cuenta_retiro" || (e.despues as { Estado?: string } | null)?.Estado === "Inactiva";
    if (desactivo) fechas.set(e.entidad_id, e.creado_en);
  }
  return fechas;
}
