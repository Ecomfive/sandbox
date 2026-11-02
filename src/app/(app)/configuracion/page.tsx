import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { tasasUsd } from "@/lib/moneda/tipo-cambio";
import { fulfillmentEnMoneda, monedasFulfillment, montoConMoneda } from "@/lib/publicaciones/fulfillment-pais";
import type { FilaCuenta } from "../retiros/cuentas/def-cuentas";
import { TablaCuentasConfiguracion } from "../retiros/cuentas/tabla-cuentas";
import { TablaPlataformas } from "./tabla-plataformas";
import { TablaPaises } from "./tabla-paises";
import { UmbralesTipoCliente } from "./umbrales-tipo-cliente";

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

  const [{ data: paisPlataformas }, cuentasConBinance, { data: todosLosPaises }, { data: correlativos }, umbralesR] = await Promise.all([
    // `fulfillment` lo agrega la migración 0213: sin ella, se repite sin esa columna.
    supabase
      .from("pais_plataformas")
      .select("id, disponible_para_retiro, fulfillment, fulfillment_moneda, plataformas(nombre)")
      .eq("pais_id", pais.id)
      .then((r) => (r.error ? supabase.from("pais_plataformas").select("id, disponible_para_retiro, plataformas(nombre)").eq("pais_id", pais.id) : r)),
    consultarCuentas(`${COLUMNAS_CUENTA}, datos_binance`),
    supabase.from("paises").select("id, codigo, nombre").order("nombre"),
    supabase.from("wms_compras_correlativo").select("clave, prefijo, ultimo"),
    // Umbrales del tipo de cliente del CRM (migración 0196). Sin ella, la sección no sale.
    supabase.from("crm_tipo_cliente_umbrales").select("pais_id, vip_desde, black_desde"),
  ]);
  const cuentas = (cuentasConBinance.error ? (await consultarCuentas(COLUMNAS_CUENTA)).data : cuentasConBinance.data) as unknown as
    | FilaCuenta[]
    | null;

  // El fulfillment va en la moneda en que lo factura cada plataforma (dólares o la del país); debajo se ve cuánto es en la otra (tipo de cambio del día).
  const monedas = monedasFulfillment(pais.codigo);
  const porUsd = monedas.length > 1 ? (await tasasUsd(supabase)).porUsd : {};
  const plataformas = ((paisPlataformas ?? []) as { id: string; disponible_para_retiro: boolean; fulfillment?: number | null; fulfillment_moneda?: string | null; plataformas: unknown }[])
    .map((pp) => {
      const fulfillment = pp.fulfillment === null || pp.fulfillment === undefined ? null : Number(pp.fulfillment);
      const moneda = pp.fulfillment_moneda ?? "USD";
      const otra = monedas.find((m) => m !== moneda) ?? null;
      // «PA»: a dólares; el código del país: a su moneda.
      const enOtra = fulfillment === null || otra === null ? null : fulfillmentEnMoneda(fulfillment, moneda, otra === "USD" ? "PA" : pais.codigo, porUsd);
      return {
        id: pp.id,
        disponible: pp.disponible_para_retiro,
        nombre: (pp.plataformas as { nombre: string } | null)?.nombre ?? "?",
        fulfillment,
        fulfillmentMoneda: moneda,
        fulfillmentEquivalente: enOtra === null || otra === null ? null : `≈ ${montoConMoneda(enOtra, otra)}`,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <Pagina ancho="angosta" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Configuración del sistema" oculto />

      <div id="paises" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Países</h2>
        <TablaPaises
          paises={((todosLosPaises ?? []) as { id: string; codigo: string; nombre: string }[]).map((p) => {
            const c = (correlativos ?? []).find((x) => x.clave === p.codigo);
            return { ...p, prefijo: (c?.prefijo as string | null) ?? null, ultimo: (c?.ultimo as number | undefined) ?? 0 };
          })}
          puedeEscribir={puedeEscribir}
        />
      </div>

      {!umbralesR.error && (
        <div id="tipo-cliente" className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-tight">Tipo de cliente del CRM (pedidos al mes)</h2>
          <UmbralesTipoCliente
            puedeEscribir={puedeEscribir}
            umbrales={((todosLosPaises ?? []) as { id: string; codigo: string; nombre: string }[]).map((p) => {
              const u = (umbralesR.data ?? []).find((x) => x.pais_id === p.id);
              return { paisId: p.id, codigo: p.codigo, nombre: p.nombre, vipDesde: Number(u?.vip_desde ?? 500), blackDesde: Number(u?.black_desde ?? 1000) };
            })}
          />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Plataformas de {pais.nombre}</h2>
        <TablaPlataformas plataformas={plataformas} paisId={pais.id} nombrePais={pais.nombre} monedas={monedas} puedeEscribir={puedeEscribir} />
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
