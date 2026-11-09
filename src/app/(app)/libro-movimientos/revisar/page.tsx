import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { Pagina } from "@/components/ui/pagina";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { dineroKpi, entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarCalidad } from "@/lib/finanzas/cargar-calidad";
import { createServiceClient } from "@/lib/supabase/server";
import { VistaRevisar, type MovRevisar } from "./vista-revisar";

export const metadata = { title: "Revisar" };

export const dynamic = "force-dynamic";

/** Posibles duplicados y montos atípicos del libro, para revisar uno por uno. */
export default async function RevisarPage() {
  const usuario = await requireModulo("libro-movimientos");
  const supabase = createServiceClient();
  // Permisos por tienda (mejora 99): solo los movimientos de sus tiendas.
  const permitidas = await cargarTiendasPermitidas();
  const [calidad, unidades, tipos, actualizado] = await Promise.all([
    cargarCalidad(supabase, null, permitidas),
    supabase.from("fin_unidades").select("id, nombre"),
    supabase.from("fin_tipos").select("id, nombre"),
    ultimaActualizacionLibro(supabase),
  ]);
  if ("error" in calidad) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Revisar" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo leer el libro">{calidad.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const nombreUnidad = new Map((unidades.data ?? []).map((u) => [u.id as string, u.nombre as string]));
  const nombreTipo = new Map((tipos.data ?? []).map((t) => [t.id as string, t.nombre as string]));
  const nombreProveedor = new Map(calidad.proveedores.map((p) => [p.id, p.nombre]));
  const porId = new Map(calidad.movimientos.map((m) => [m.id, m]));
  const vista = (id: string): MovRevisar | null => {
    const m = porId.get(id);
    if (!m) return null;
    return {
      id,
      periodo: m.periodo,
      fecha: m.fecha,
      descripcion: m.descripcion,
      monto: m.monto,
      tienda: nombreUnidad.get(m.unidad_id) ?? "—",
      tipo: m.tipo_id ? (nombreTipo.get(m.tipo_id) ?? "—") : "Sin tipo",
      origen: m.origen,
      proveedor: m.proveedor_id ? (nombreProveedor.get(m.proveedor_id) ?? null) : null,
    };
  };
  const pares = calidad.duplicados
    .slice(0, 300)
    .map((p) => ({ clave: p.clave, similitud: p.similitud, dias: p.dias, a: vista(p.a), b: vista(p.b) }))
    .filter((p): p is typeof p & { a: MovRevisar; b: MovRevisar } => !!p.a && !!p.b);
  const atipicos = calidad.atipicosPendientes
    .map((a) => ({ ...a, mov: vista(a.id) }))
    .filter((a): a is typeof a & { mov: MovRevisar } => !!a.mov)
    .sort((x, y) => y.mov.periodo.localeCompare(x.mov.periodo) || y.veces - x.veces)
    .slice(0, 300);
  const montoDuplicado = calidad.duplicados.reduce((s, p) => s + Math.abs(porId.get(p.b)?.monto ?? 0), 0);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Revisar" actualizado={actualizado} imprimir={false} />
      {calidad.falta && <EstadoVacioAF4 compacto titulo="Falta la migración 0925">Sin ella no se recuerda «no es duplicado» ni se puede anular.</EstadoVacioAF4>}
      <FilaKpiAF4>
        <KpiAF4 titulo="Posibles duplicados" tono={calidad.duplicados.length ? "warning" : "success"} valor={entero(calidad.duplicados.length)} subtexto={`${dineroKpi(montoDuplicado)} en juego`} />
        <KpiAF4 titulo="Montos atípicos" tono={calidad.atipicosPendientes.length ? "warning" : "success"} valor={entero(calidad.atipicosPendientes.length)} subtexto="más de 3× la mediana de su tipo" />
      </FilaKpiAF4>
      <VistaRevisar pares={pares} atipicos={atipicos.map((a) => ({ mov: a.mov, veces: a.veces, mediana: a.mediana, z: a.z }))} puedeEscribir={!usuario.modulosSoloLectura.includes("libro-movimientos")} />
    </Pagina>
  );
}
