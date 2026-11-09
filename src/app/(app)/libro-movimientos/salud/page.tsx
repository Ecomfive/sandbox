import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import Link from "next/link";
import { claseCifra } from "@/components/af4/estilos-af4";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { anilloFoco } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { mesEnCursoPanama } from "@/lib/af4/fecha";
import { entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarCalidad } from "@/lib/finanzas/cargar-calidad";
import { mesesCerrados } from "@/lib/finanzas/guardar-libro";
import { UNIDAD_SIN_ASIGNAR } from "@/lib/finanzas/libro-excel";
import { indicadoresSalud, resumenSalud, type EstadoSalud, type TablaCritica } from "@/lib/finanzas/salud-datos";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Salud de datos" };

export const dynamic = "force-dynamic";

const PUNTO: Record<EstadoSalud, string> = { bien: "bg-success", atencion: "bg-warning", problema: "bg-destructive" };
/** El instante de hace `n` días (para «últimos 30 días»). */
const haceDias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const TEXTO: Record<EstadoSalud, string> = { bien: "bien", atencion: "atención", problema: "problema" };

/** Qué tan completos y confiables están los datos del portal, cada indicador con el enlace a donde se resuelve. */
export default async function SaludDatosPage() {
  const usuario = await requireModulo("libro-movimientos");
  // La salud de los datos mira todo el portal: con tiendas limitadas no se muestra.
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Salud de datos" />;
  const supabase = createServiceClient();
  const puede = (m: string) => usuario.modulos.includes(m);
  const contar = async (tabla: string) => {
    const { count, error } = await supabase.from(tabla).select("*", { count: "exact", head: true });
    return error ? null : (count ?? 0);
  };
  const hace30 = haceDias(30);

  // Tablas que, vacías, dejan un módulo sin datos (solo las de módulos que la persona puede abrir).
  const criticas: (Omit<TablaCritica, "filas"> & { tabla: string; modulo: string })[] = [
    { tabla: "fin_base_distribucion", nombre: "Base de reparto", href: "/libro-movimientos/importar", accion: "Importar", modulo: "libro-movimientos" },
    { tabla: "fin_saldos_iniciales", nombre: "Saldos iniciales", href: "/flujo-caja", accion: "Cargar", modulo: "flujo-caja" },
    { tabla: "fin_costos_lotes", nombre: "Costos de mercancía", href: "/costos-mercancia/importar", accion: "Importar", modulo: "costos-mercancia" },
    { tabla: "ven_ordenes", nombre: "Ventas por tienda", href: "/ventas-tiendas/importar", accion: "Importar", modulo: "ventas-tiendas" },
    { tabla: "conc_lineas", nombre: "Extractos bancarios", href: "/conciliacion-bancaria/importar", accion: "Importar", modulo: "conciliacion-bancaria" },
    { tabla: "del_entregas", nombre: "Deliverys", href: "/deliverys/importar", accion: "Importar", modulo: "deliverys" },
    { tabla: "fin_presupuestos", nombre: "Presupuesto", href: "/presupuesto", accion: "Crear", modulo: "presupuesto" },
    { tabla: "fin_bienes_uso", nombre: "Bienes de uso", href: "/bienes-de-uso/importar", accion: "Importar", modulo: "bienes-de-uso" },
  ].filter((t) => puede(t.modulo));

  const [calidad, total, sinTipo, sinTienda, pendientes, lineas, resueltas, cerrados, sinTasa, fallidas, filasCriticas, actualizado] = await Promise.all([
    cargarCalidad(supabase, null),
    contar("fin_movimientos"),
    supabase.from("fin_movimientos").select("id", { count: "exact", head: true }).is("tipo_id", null).then((r) => r.count ?? 0),
    supabase.from("fin_movimientos").select("id, fin_unidades!inner(nombre)", { count: "exact", head: true }).eq("fin_unidades.nombre", UNIDAD_SIN_ASIGNAR),
    supabase.from("fin_unidades").select("id").eq("nombre", UNIDAD_SIN_ASIGNAR).maybeSingle().then(async ({ data }) => {
      const filtro = data?.id ? `tipo_id.is.null,unidad_id.eq.${data.id}` : "tipo_id.is.null";
      const { count } = await supabase.from("fin_movimientos").select("id", { count: "exact", head: true }).or(filtro);
      return count ?? 0;
    }),
    puede("conciliacion-bancaria") ? contar("conc_lineas") : Promise.resolve(null),
    puede("conciliacion-bancaria")
      ? supabase.from("conc_lineas").select("id", { count: "exact", head: true }).in("estado", ["conciliada", "ignorada"]).then((r) => (r.error ? null : (r.count ?? 0)))
      : Promise.resolve(null),
    mesesCerrados(supabase),
    supabase.from("fin_movimientos").select("id", { count: "exact", head: true }).neq("moneda", "USD").is("tasa_usd", null).then((r) => (r.error ? null : (r.count ?? 0))),
    supabase.from("fin_importaciones").select("id", { count: "exact", head: true }).eq("estado", "fallida").gte("creado_en", hace30).then((r) => (r.error ? null : (r.count ?? 0))),
    Promise.all(criticas.map((t) => contar(t.tabla))),
    ultimaActualizacionLibro(supabase),
  ]);

  if ("error" in calidad || total === null) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Salud de datos" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo leer el libro">Correr la migración 0901 en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }

  const indicadores = indicadoresSalud({
    movimientos: total,
    sinTipo,
    sinTienda: sinTienda.count ?? 0,
    pendientes,
    lineasBanco: lineas,
    lineasResueltas: resueltas,
    mesesConMovimientos: calidad.movimientos.map((m) => m.periodo),
    mesesCerrados: [...cerrados],
    mesActual: mesEnCursoPanama(),
    duplicados: calidad.duplicados.length,
    atipicos: calidad.atipicosPendientes.length,
    sinTasa,
    tablas: criticas.map((t, i) => ({ nombre: t.nombre, filas: filasCriticas[i], href: t.href, accion: t.accion })),
    importacionesFallidas: fallidas,
  }).filter((x) => (x.id === "cierres" ? puede("cierre-mes") : x.id === "tasa" ? puede("estado-resultados") : true));
  const r = resumenSalud(indicadores);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Salud de datos" actualizado={actualizado} imprimir={false} />
      <FilaKpiAF4>
        <KpiAF4 titulo="Indicadores bien" tono={r.problemas ? "destructive" : r.bien === r.total ? "success" : "warning"} valor={`${entero(r.bien)} de ${entero(r.total)}`} />
        {indicadores.slice(0, 2).map((x) => (
          <KpiAF4 key={x.id} titulo={x.titulo} tono={x.estado === "bien" ? "success" : x.estado === "atencion" ? "warning" : "destructive"} valor={x.valor} subtexto={x.detalle} href={x.href} />
        ))}
      </FilaKpiAF4>
      <MarcoAF4 id="titulo-salud" titulo="Indicadores" sinRelleno>
        <ul className="flex flex-col divide-y divide-border">
          {indicadores.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="flex min-w-48 flex-1 items-center gap-2 font-medium">
                <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[x.estado]}`} />
                {x.titulo}
                <span className="sr-only"> ({TEXTO[x.estado]})</span>
              </span>
              <span className={`w-20 text-right text-base font-semibold ${claseCifra}`}>{x.valor}</span>
              <span className="min-w-56 flex-[2] text-muted-foreground">{x.detalle}</span>
              {x.estado !== "bien" && (
                <Link href={x.href} className={`rounded-md border border-border bg-card px-2.5 py-1 font-medium hover:bg-muted ${anilloFoco}`}>
                  {x.accion}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </MarcoAF4>
    </Pagina>
  );
}
