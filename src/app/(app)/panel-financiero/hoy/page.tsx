import Link from "next/link";
import { claseCifra } from "@/components/af4/estilos-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { anilloFoco } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { diaMes, hoyPanama, mesCorto } from "@/lib/af4/fecha";
import { dineroKpi, entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { sumarDias } from "@/lib/deliverys/liquidacion";
import { cargarEerr } from "@/lib/finanzas/cargar-eerr";
import { cargarPosicion } from "@/lib/finanzas/cargar-tesoreria";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { efectivoEnRepartidores, porCobrarDropi, ventasDelDia } from "@/lib/finanzas/panel-hoy";
import { veTodaLaEmpresa } from "@/lib/finanzas/tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";
import { DEF_ALERTA, type TipoAlerta } from "@/lib/tareas/alertas";

export const metadata = { title: "Hoy" };

export const dynamic = "force-dynamic";

type Tono = "neutral" | "destructive" | "warning" | "success";
const PUNTO: Record<Tono, string> = { neutral: "bg-muted-foreground", destructive: "bg-destructive", warning: "bg-warning", success: "bg-success" };

/** Una cifra del día: grande, legible en el celular, y lleva a su módulo. */
function Cifra({ titulo, valor, detalle, href, tono = "neutral" }: { titulo: string; valor: string; detalle?: string; href: string; tono?: Tono }) {
  return (
    <Link href={href} className={`flex min-h-32 flex-col justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted ${anilloFoco}`}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[tono]}`} />
        {titulo}
      </span>
      <span className={`mt-2 block text-[1.75rem] font-semibold leading-tight sm:text-4xl ${claseCifra}`}>{valor}</span>
      {detalle && <span className="mt-1 block text-xs text-muted-foreground">{detalle}</span>}
    </Link>
  );
}

/** Los 6 números del día, para mirarlos en el celular (la app instalada del portal). */
export default async function PanelHoyPage() {
  const usuario = await requireModulo("panel-financiero");
  const permitidas = await cargarTiendasPermitidas();
  const todaLaEmpresa = veTodaLaEmpresa(permitidas);
  const puede = (m: string) => usuario.modulos.includes(m) && (todaLaEmpresa || m === "ventas-tiendas" || m === "estado-resultados");
  const supabase = createServiceClient();
  const hoy = hoyPanama();
  const ayer = sumarDias(hoy, -1);
  const mes = `${hoy.slice(0, 7)}-01`;
  const lista = permitidas ? (permitidas.length ? permitidas : ["00000000-0000-0000-0000-000000000000"]) : null;
  const nulo = Promise.resolve(null);
  // La caja del día es la Posición de caja de Tesorería (un solo cargador: bancos, Yappy, efectivo en repartidores y
  // Dropi). Con ella también salen el efectivo en repartidores y la wallet de Dropi, sin volver a leerlos.
  const conPosicion = puede("tesoreria") || puede("flujo-caja");

  const [ventasR, posicionR, saldosR, dropiR, semanasR, cierresR, eerrR, alertasR] = await Promise.all([
    puede("ventas-tiendas")
      ? (lista ? supabase.from("ven_ordenes").select("total, estado_entrega").eq("fecha", ayer).in("unidad_id", lista) : supabase.from("ven_ordenes").select("total, estado_entrega").eq("fecha", ayer)).limit(5000)
      : nulo,
    conPosicion ? cargarPosicion(supabase, hoy).catch(() => null) : nulo,
    puede("cuentas-por-cobrar") ? supabase.from("saldos_wallet").select("pais_id, monto, fecha, plataformas!inner(nombre), paises!inner(codigo)").ilike("plataformas.nombre", "dropi%").neq("paises.codigo", "CR").order("fecha", { ascending: false }).limit(50) : nulo,
    puede("cuentas-por-cobrar") ? supabase.from("fin_dropi_mensual").select("pais_id, moneda, ganancias, retiros") : nulo,
    puede("deliverys") && !conPosicion ? supabase.from("del_semanas").select("repartidor_id, semana, cobrado_efectivo").gte("semana", sumarDias(hoy, -56)).limit(5000) : nulo,
    puede("deliverys") && !conPosicion ? supabase.from("del_cierres").select("repartidor_id, semana, estado").gte("semana", sumarDias(hoy, -63)).limit(5000) : nulo,
    puede("estado-resultados") ? cargarEerr(supabase, null, [mes], { unidades: permitidas }) : nulo,
    todaLaEmpresa ? supabase.from("fin_alertas").select("tipo, severidad").is("resuelta_en", null).is("vista_en", null).limit(1000) : nulo,
  ]);

  const ventas = ventasR && !ventasR.error ? ventasDelDia(ventasR.data ?? []) : null;
  const posicion = posicionR && posicionR.posicion.partidas.length ? posicionR : null;
  const caja = posicion ? posicion.posicion.total : null;
  const bancos = posicion?.posicion.partidas.find((p) => p.clave === "bancos") ?? null;
  const dropi =
    saldosR || dropiR
      ? porCobrarDropi(
          saldosR && !saldosR.error ? ((saldosR.data ?? []) as { pais_id: string; monto: number; fecha: string }[]) : [],
          dropiR && !dropiR.error ? ((dropiR.data ?? []) as { pais_id: string; moneda: string; ganancias: number; retiros: number }[]) : [],
        )
      : null;
  const partidaEfectivo = posicion?.posicion.partidas.find((p) => p.clave === "repartidores") ?? null;
  const efectivo =
    puede("deliverys") && partidaEfectivo
      ? { total: partidaEfectivo.monto, repartidores: (posicion?.antiguedad ?? []).filter((a) => a.total > 0).length }
      : semanasR && !semanasR.error
        ? efectivoEnRepartidores(semanasR.data ?? [], cierresR && !cierresR.error ? (cierresR.data ?? []) : [])
        : null;
  const ebitda = eerrR && !("error" in eerrR) ? { valor: eerrR.eerr.ebitda[mes] ?? 0, ingresos: eerrR.eerr.ingresosNetos[mes] ?? 0 } : null;
  const alertas = alertasR && !alertasR.error ? ((alertasR.data ?? []) as { tipo: TipoAlerta; severidad: string }[]).filter((a) => usuario.modulos.includes(DEF_ALERTA[a.tipo]?.modulo ?? "usuarios")) : null;
  const criticas = alertas?.filter((a) => a.severidad === "critica").length ?? 0;

  const cifras = [
    ventas && <Cifra key="v" titulo={`Ventas de ayer · ${diaMes(ayer)}`} valor={dineroKpi(ventas.total)} detalle={`${entero(ventas.ordenes)} ${ventas.ordenes === 1 ? "orden" : "órdenes"}`} href="/ventas-tiendas/ordenes" />,
    caja !== null && (
      <Cifra
        key="c"
        titulo="Caja del día"
        valor={dineroKpi(caja)}
        detalle={bancos ? `Bancos ${dineroKpi(bancos.monto)}${bancos.fecha ? ` · al ${diaMes(bancos.fecha)}` : ""}` : undefined}
        tono={caja < 0 ? "destructive" : "neutral"}
        href={puede("tesoreria") ? "/tesoreria" : "/proyeccion-caja"}
      />
    ),
    dropi !== null && <Cifra key="d" titulo="Por cobrar a Dropi" valor={dineroKpi(dropi)} href="/cuentas-por-cobrar" />,
    efectivo && (
      <Cifra key="e" titulo="Efectivo en repartidores" valor={dineroKpi(efectivo.total)} detalle={`${entero(efectivo.repartidores)} ${efectivo.repartidores === 1 ? "repartidor" : "repartidores"}`} tono={efectivo.total > 0 ? "warning" : "neutral"} href={partidaEfectivo && puede("tesoreria") ? "/tesoreria/repartidores" : "/deliverys"} />
    ),
    ebitda && (
      <Cifra
        key="b"
        titulo={`EBITDA ${mesCorto(mes)} a la fecha`}
        valor={dineroKpi(ebitda.valor)}
        detalle={ebitda.ingresos ? `Ingresos ${dineroKpi(ebitda.ingresos)}` : undefined}
        tono={ebitda.valor < 0 ? "destructive" : "neutral"}
        href="/estado-resultados"
      />
    ),
    alertas && (
      <Cifra key="a" titulo="Alertas abiertas" valor={entero(alertas.length)} detalle={criticas ? `${entero(criticas)} críticas` : undefined} tono={criticas ? "destructive" : alertas.length ? "warning" : "success"} href="/panel-financiero" />
    ),
  ].filter(Boolean);

  return (
    <Pagina ancho="media" className="flex flex-col gap-4">
      <EncabezadoAF4 titulo="Hoy" actualizado={new Date().toISOString()} imprimir={false} />
      {cifras.length ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{cifras}</div> : <EstadoVacioAF4 titulo="No hay cifras del día para tus módulos" />}
    </Pagina>
  );
}
