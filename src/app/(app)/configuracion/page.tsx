import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { monedaDePais, tasasUsd } from "@/lib/moneda/tipo-cambio";
import { fulfillmentEnMoneda } from "@/lib/publicaciones/fulfillment-pais";
import { formatoMonto, monedaPublicaciones } from "@/lib/publicaciones/moneda";
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
      .select("id, disponible_para_retiro, fulfillment, plataformas(nombre)")
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

  // El fulfillment se escribe en dólares; en un país con otra moneda se ve también cuánto es en ella (tipo de cambio del día).
  const porUsd = monedaDePais(pais.codigo) === "USD" ? {} : (await tasasUsd(supabase)).porUsd;
  const monedaPais = monedaPublicaciones(pais.codigo, {});
  const plataformas = ((paisPlataformas ?? []) as { id: string; disponible_para_retiro: boolean; fulfillment?: number | null; plataformas: unknown }[])
    .map((pp) => {
      const fulfillment = pp.fulfillment === null || pp.fulfillment === undefined ? null : Number(pp.fulfillment);
      const enMoneda = fulfillment === null || monedaDePais(pais.codigo) === "USD" ? null : fulfillmentEnMoneda(fulfillment, pais.codigo, porUsd);
      return {
        id: pp.id,
        disponible: pp.disponible_para_retiro,
        nombre: (pp.plataformas as { nombre: string } | null)?.nombre ?? "?",
        fulfillment,
        fulfillmentEquivalente: enMoneda === null ? null : `≈ ${formatoMonto(enMoneda, monedaPais)}`,
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
        <TablaPlataformas plataformas={plataformas} paisId={pais.id} nombrePais={pais.nombre} puedeEscribir={puedeEscribir} />
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
