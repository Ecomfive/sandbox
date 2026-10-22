import { ContadorPestana } from "@/components/migas/contador-pestana";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarConsumo, cargarCreditos, cargarUmbrales } from "@/lib/ia/consumo";
import { ETIQUETA_PROVEEDOR, type ProveedorConsumo } from "@/lib/ia/precios";
import { desglosar, estadoSaldo, etiquetaOperacion, gastoPorDia, resumirProveedor, saldoEstimado } from "@/lib/ia/saldo";
import { createServiceClient } from "@/lib/supabase/server";
import { contarRecomendacionesPendientes } from "../recomendaciones-actions";
import { PanelConsumo, type DatosConsumo } from "./panel-consumo";

export const metadata = { title: "Consumo de IA · Gestión de IDs Dropi" };

export const dynamic = "force-dynamic";

const DIAS_GRAFICA = 30;

/**
 * Gestión de IDs Dropi › Consumo de IA: cuánto se gasta de las claves de OpenAI (texto) y de Gemini (imágenes, también las de las
 * landings), con qué y quién, cuánto crédito se estima que queda y cuándo avisar. Los costos se estiman: ninguna de las dos APIs los
 * devuelve.
 */
export default async function ConsumoPage() {
  const usuario = await requireModulo("publicaciones-dropi");
  const supabase = createServiceClient();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const creditos = await cargarCreditos(supabase);
  // Desde cuándo hay que leer el consumo: lo del mes y de la gráfica, y desde el primer saldo o recarga (para estimar lo que queda).
  const hace30 = new Date(`${hoy}T12:00:00Z`);
  hace30.setUTCDate(hace30.getUTCDate() - (DIAS_GRAFICA - 1));
  const primerCredito = creditos.reduce<string | null>((m, c) => (m === null || c.creadoEn < m ? c.creadoEn : m), null);
  const desdeDia = [inicioMes, hace30.toISOString().slice(0, 10)].sort()[0];
  const desde = [`${desdeDia}T00:00:00-05:00`, primerCredito].filter((x): x is string => !!x).sort()[0];
  const [{ filas, disponible }, umbrales] = await Promise.all([cargarConsumo(supabase, desde), cargarUmbrales(supabase)]);

  // OpenAI y Gemini siempre; Claude solo si ya se usó o tiene crédito registrado.
  const proveedores: ProveedorConsumo[] = ["openai", "gemini"];
  if (filas.some((f) => f.proveedor === "anthropic") || creditos.some((c) => c.proveedor === "anthropic")) proveedores.push("anthropic");

  const delMes = filas.filter((f) => new Date(f.creadoEn).toLocaleDateString("en-CA", { timeZone: "America/Panama" }) >= inicioMes);
  const datos: DatosConsumo = {
    disponible,
    puedeEscribir: !usuario.modulosSoloLectura.includes("publicaciones-dropi"),
    proveedores: proveedores.map((p) => {
      const saldo = saldoEstimado(p, creditos, filas);
      return {
        proveedor: p,
        etiqueta: ETIQUETA_PROVEEDOR[p],
        estado: estadoSaldo(saldo, umbrales[p]),
        saldoUsd: saldo.saldoUsd,
        gastadoDesdeUsd: saldo.gastadoUsd,
        desde: saldo.desde,
        umbralUsd: umbrales[p],
        mes: resumirProveedor(p, filas, inicioMes),
      };
    }),
    dias: gastoPorDia(filas, hoy, DIAS_GRAFICA),
    porOperacion: desglosar(delMes, (f) => etiquetaOperacion(f.operacion)),
    porPersona: desglosar(delMes, (f) => f.usuarioNombre ?? "Sin nombre"),
    ultimos: filas.slice(0, 15).map((f) => ({ proveedor: f.proveedor, operacion: etiquetaOperacion(f.operacion), modelo: f.modelo, persona: f.usuarioNombre, costoUsd: f.costoUsd, ok: f.ok, creadoEn: f.creadoEn })),
    creditos: creditos.slice(0, 8).map((c) => ({ proveedor: c.proveedor, tipo: c.tipo, montoUsd: c.montoUsd, nota: c.nota, persona: c.usuarioNombre, creadoEn: c.creadoEn })),
  };

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Consumo de IA" oculto />
      <ContadorPestana href="/publicaciones-dropi/recomendaciones" cargar={contarRecomendacionesPendientes} />
      <PanelConsumo datos={datos} />
    </Pagina>
  );
}
