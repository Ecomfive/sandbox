import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { claseCifra } from "@/components/af4/estilos-af4";
import { Pagina } from "@/components/ui/pagina";
import { diaMes, hoyPanama } from "@/lib/af4/fecha";
import { dinero, dinero2, dineroKpi, fraccion } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import Link from "next/link";
import { cargarExtrasGrupo, cargarPrestamosGrupo, cargarTasasFinancistas, SIN_MIGRACION_GRUPO } from "@/lib/finanzas/cargar-prestamos-grupo";
import {
  abonosPorCargo,
  ahorroPrepago,
  claveInteres,
  conciliarConfirmaciones,
  costoFinanciero,
  deudasNetas,
  etiquetaTipoGrupo,
  historialPrestamo,
  interesDelMes,
  neteosPosibles,
  pendientes,
  saldosPorPar,
  type ClaseParte,
} from "@/lib/finanzas/prestamos-grupo";
import { anilloFoco } from "@/components/ui/field";
import { sumarMeses } from "@/lib/af4/fecha";
import { BotonNetear, InteresEntreEmpresas, NuevaConfirmacion, type FilaInteres } from "./acciones-grupo";
import { createServiceClient } from "@/lib/supabase/server";
import { AvisoTesoreria } from "../aviso";
import { TasasFinancistas } from "./tasas-financistas";
import { CrearParteGrupo, TablaMovimientosGrupo, type FilaMovGrupo } from "./vista-grupo";

export const metadata = { title: "Préstamos del grupo" };

export const dynamic = "force-dynamic";

const ESTADO: Record<string, { texto: string; punto: string }> = {
  vencido: { texto: "Vencido", punto: "bg-destructive" },
  por_vencer: { texto: "Por vencer", punto: "bg-warning" },
  al_dia: { texto: "Al día", punto: "bg-success" },
  sin_fecha: { texto: "Sin fecha", punto: "bg-muted-foreground" },
};

export default async function PrestamosGrupoPage() {
  const usuario = await requireModulo("tesoreria");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Tesorería" />;
  const hoy = hoyPanama();
  const supabase = createServiceClient();
  const [datos, tasas, extras] = await Promise.all([cargarPrestamosGrupo(supabase), cargarTasasFinancistas(supabase), cargarExtrasGrupo(supabase)]);
  if (!datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Préstamos del grupo" imprimir={false} />
        <AvisoTesoreria>{SIN_MIGRACION_GRUPO}</AvisoTesoreria>
      </Pagina>
    );
  }
  const nombre = new Map(datos.partes.map((p) => [p.id, p.nombre]));
  const clase = new Map<string, ClaseParte>(datos.partes.map((p) => [p.id, p.clase]));
  const n = (id: string) => nombre.get(id) ?? "—";

  const saldos = saldosPorPar(datos.movs);
  const netas = deudasNetas(saldos);
  const neteos = neteosPosibles(saldos);
  const aportes = datos.movs.filter((m) => m.naturaleza === "aporte").reduce((a, m) => a + m.monto, 0);
  const tasaDe = new Map((tasas ?? []).map((t) => [t.id, t.tasaCiclo]));
  const aplicados = abonosPorCargo(datos.movs);

  // Interés entre empresas (mejora 62): cada par de empresas con saldo, su tasa y el interés del mes anterior.
  const mesPasado = sumarMeses(`${hoy.slice(0, 7)}-01`, -1);
  const claves = new Set(datos.movs.map((m) => m.origenClave).filter((c): c is string => !!c));
  const esInteres = (m: { id: string }) => (datos.movs.find((x) => x.id === m.id)?.origenClave ?? "").startsWith("interes:");
  const filasInteres: FilaInteres[] = extras
    ? saldos
        .filter((s) => clase.get(s.acreedorId) === "empresa" && clase.get(s.deudorId) === "empresa" && s.saldo > 0)
        .map((s) => {
          const t = extras.tasas.find((x) => x.acreedorId === s.acreedorId && x.deudorId === s.deudorId)?.tasaAnual ?? 0;
          return {
            a: s.acreedorId,
            b: s.deudorId,
            par: `${n(s.deudorId)} le debe a ${n(s.acreedorId)}`,
            saldo: s.saldo,
            tasa: t ? String(Math.round(t * 10_000) / 100) : "",
            mes: mesPasado,
            interes: t ? interesDelMes(datos.movs, s.acreedorId, s.deudorId, t, mesPasado, esInteres) : 0,
            registrado: claves.has(claveInteres(s.acreedorId, s.deudorId, mesPasado)),
          };
        })
    : [];
  const conciliaciones = extras ? conciliarConfirmaciones(datos.movs, extras.confirmaciones) : null;
  const empresas = datos.partes.filter((p) => p.activo && p.clase === "empresa").map((p) => ({ id: p.id, nombre: p.nombre }));
  const sumaPor = (c: ClaseParte) => netas.filter((d) => clase.get(d.acreedorId) === c).reduce((a, d) => a + d.monto, 0);
  const entreEmpresas = netas.filter((d) => clase.get(d.acreedorId) === "empresa" && clase.get(d.deudorId) === "empresa").reduce((a, d) => a + d.monto, 0);
  const aSocios = sumaPor("socio");
  const aFinancistas = sumaPor("financista");

  const pend = pendientes(datos.movs, hoy);
  const vencido = pend.filter((p) => p.estado === "vencido");
  const porVencer = pend.filter((p) => p.estado === "por_vencer");
  const proximos = pend.filter((p) => p.vence).slice(0, 12);

  const anio = hoy.slice(0, 4);
  const costos = costoFinanciero(datos.movs, `${anio}-01-01`, `${anio}-12-31`);
  const costoAnio = costos.reduce((a, c) => a + c.costo, 0);
  const tasa = costos.find((c) => c.tasaAnual !== null);

  const filas: FilaMovGrupo[] = [...datos.movs]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map((m) => ({
      id: m.id,
      fecha: m.fecha,
      vence: m.vence,
      tipo: m.tipo,
      acreedor: n(m.acreedorId),
      deudor: n(m.deudorId),
      monto: m.tipo === "abono" ? -m.monto : m.monto,
      concepto: m.concepto,
      ordenes: m.ordenes.join(", "),
      medio: m.medio ?? "",
      origen: m.origen,
      naturaleza: m.naturaleza ?? "deuda",
      soporte: m.soporte ?? "",
      historial: (() => {
        if (m.tipo !== "prestamo" || m.naturaleza === "aporte") return null;
        const h = historialPrestamo(datos.movs, m.id, aplicados);
        return h
          ? {
              costos: h.costos.map((c) => ({ fecha: c.fecha, concepto: c.concepto, monto: c.monto })),
              abonos: h.abonos.map((a) => ({ fecha: a.fecha, monto: a.monto })),
              pagado: h.pagado,
              pendiente: h.pendiente,
              costoTotal: h.costoTotal,
              costoPct: h.costoPct,
            }
          : null;
      })(),
    }));
  const partesActivas = datos.partes.filter((p) => p.activo).map((p) => ({ id: p.id, nombre: p.nombre }));
  const puedeEscribir = !usuario.modulosSoloLectura.includes("tesoreria");

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Préstamos del grupo" />
      <FilaKpiAF4>
        <KpiAF4 titulo="Entre empresas del grupo" destacado valor={dineroKpi(entreEmpresas)} subtexto="Saldo neto entre países" />
        <KpiAF4 titulo="Se le debe a socios" valor={dineroKpi(aSocios)} subtexto={aportes > 0 ? `Aparte, ${dinero(aportes)} aportados como capital` : "Alcides y otros"} />
        <KpiAF4 titulo="Se le debe a financistas" valor={dineroKpi(aFinancistas)} subtexto="Ortoped&Co y otros" />
        <KpiAF4
          titulo="Vencido"
          tono={vencido.length ? "destructive" : porVencer.length ? "warning" : "neutral"}
          valor={dineroKpi(vencido.reduce((a, p) => a + p.pendiente, 0))}
          subtexto={`${vencido.length} vencidos · ${porVencer.length} vencen en 7 días`}
        />
        <KpiAF4
          titulo={`Costo financiero ${anio}`}
          tono={tasa && (tasa.tasaAnual ?? 0) > 0.3 ? "warning" : "neutral"}
          valor={dineroKpi(costoAnio)}
          subtexto={tasa?.tasaAnual != null ? `${fraccion(tasa.tasaAnual, { decimales: 0 })} anual efectivo · ${n(tasa.acreedorId)}` : "Comisiones e intereses del año"}
        />
      </FilaKpiAF4>

      <div className="grid gap-6 lg:grid-cols-2">
        <MarcoAF4 id="titulo-netas" titulo="Quién le debe a quién" detalle="USD · neto por par" sinRelleno>
          {netas.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Sin saldos pendientes.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Debe</th>
                  <th className="px-4 py-2 font-medium">Le debe a</th>
                  <th className="px-4 py-2 text-right font-medium">Saldo</th>
                  <th className="px-4 py-2 font-medium">
                    <span className="sr-only">Estado de cuenta</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {netas.map((d) => (
                  <tr key={`${d.acreedorId}|${d.deudorId}`} className="border-t border-border">
                    <td className="px-4 py-2">{n(d.deudorId)}</td>
                    <td className="px-4 py-2">{n(d.acreedorId)}</td>
                    <td className={`px-4 py-2 text-right ${claseCifra}`}>{dinero2(d.monto)}</td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/api/tesoreria/estado-cuenta?a=${d.acreedorId}&b=${d.deudorId}`}
                        prefetch={false}
                        aria-label={`Descargar el estado de cuenta entre ${n(d.deudorId)} y ${n(d.acreedorId)}`}
                        className={`whitespace-nowrap text-xs font-medium underline-offset-2 hover:underline ${anilloFoco} rounded`}
                      >
                        Estado de cuenta
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </MarcoAF4>

        <MarcoAF4 id="titulo-vencimientos" titulo="Próximos vencimientos" detalle="Lo pendiente, después de aplicar los abonos" sinRelleno>
          {proximos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nada con fecha de vencimiento pendiente.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {proximos.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2">
                  <span className={`size-2 shrink-0 rounded-full ${ESTADO[p.estado].punto}`} aria-hidden />
                  <span className="w-16 shrink-0 tabular-nums">{p.vence ? diaMes(p.vence) : "—"}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {n(p.deudorId)} → {n(p.acreedorId)} · {etiquetaTipoGrupo(p.tipo)}
                    {p.ordenes.length ? ` · ${p.ordenes.join(", ")}` : ""}
                  </span>
                  <span className="sr-only">{ESTADO[p.estado].texto}</span>
                  {(() => {
                    // Mejora 66: lo que se ahorraría prepagando hoy, si el financista cobra por días.
                    const ahorro = clase.get(p.acreedorId) === "financista" ? ahorroPrepago(p, tasaDe.get(p.acreedorId) ?? null, hoy) : null;
                    return ahorro ? <span className={`shrink-0 text-xs text-muted-foreground ${claseCifra}`}>prepagar ahorra ~{dinero(ahorro)}</span> : null;
                  })()}
                  <span className={`shrink-0 ${claseCifra}`}>{dinero(p.pendiente)}</span>
                </li>
              ))}
            </ul>
          )}
        </MarcoAF4>
      </div>

      {neteos.length > 0 && (
        <MarcoAF4 id="titulo-neteos" titulo="Se pueden netear" detalle="Se deben en las dos direcciones: un abono en cada lado por el menor saldo" sinRelleno>
          <ul className="divide-y divide-border text-sm">
            {neteos.map((x) => (
              <li key={`${x.a}|${x.b}`} className="flex flex-wrap items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1">
                  {n(x.a)} y {n(x.b)}
                </span>
                <span className={claseCifra}>{dinero2(x.monto)} en cada dirección</span>
                {puedeEscribir && <BotonNetear a={x.a} b={x.b} nombre={`${n(x.a)} y ${n(x.b)}`} monto={x.monto} />}
              </li>
            ))}
          </ul>
        </MarcoAF4>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <MarcoAF4 id="titulo-interes" titulo="Interés entre empresas" detalle="Tasa anual simple sobre el saldo de cada día; se registra como un costo" sinRelleno>
          {extras ? <InteresEntreEmpresas filas={filasInteres} puedeEscribir={puedeEscribir} /> : <p className="px-4 py-6 text-sm text-muted-foreground">Falta correr la migración 0989 en Supabase.</p>}
        </MarcoAF4>
        <MarcoAF4
          id="titulo-confirmaciones"
          titulo="Conciliación entre empresas"
          detalle="Lo que dice cada empresa contra el saldo del portal"
          accion={puedeEscribir && extras ? <NuevaConfirmacion empresas={empresas} hoy={hoy} /> : undefined}
          sinRelleno
        >
          {!conciliaciones ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Falta correr la migración 0989 en Supabase.</p>
          ) : conciliaciones.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Todavía no se registraron saldos confirmados.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {conciliaciones.slice(0, 12).map((c) => (
                <li key={c.id} className="flex flex-col gap-0.5 px-4 py-2">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${c.cuadra ? "bg-success" : "bg-warning"}`} />
                    <span className="min-w-0 flex-1 truncate">
                      {n(c.deudorId)} → {n(c.acreedorId)} · al {diaMes(c.fechaCorte)}
                    </span>
                    <span className="sr-only">{c.cuadra ? "Cuadra" : "No cuadra"}</span>
                    <span className={claseCifra}>portal {dinero2(c.sistema)}</span>
                  </span>
                  <span className={`pl-4 text-xs text-muted-foreground ${claseCifra}`}>
                    {c.saldoAcreedor !== null ? `${n(c.acreedorId)}: ${dinero2(c.saldoAcreedor)}${c.difAcreedor ? ` (dif. ${dinero2(c.difAcreedor)})` : ""}` : ""}
                    {c.saldoAcreedor !== null && c.saldoDeudor !== null ? " · " : ""}
                    {c.saldoDeudor !== null ? `${n(c.deudorId)}: ${dinero2(c.saldoDeudor)}${c.difDeudor ? ` (dif. ${dinero2(c.difDeudor)})` : ""}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </MarcoAF4>
      </div>

      <MarcoAF4 id="titulo-tasas" titulo="Tasa de los financistas" detalle="Con ella Compras y costos estima el financiamiento de cada OC" sinRelleno>
        {tasas ? <TasasFinancistas tasas={tasas} puedeEscribir={puedeEscribir} /> : <p className="px-4 py-6 text-sm text-muted-foreground">Falta correr la migración 0985 en Supabase.</p>}
      </MarcoAF4>

      <section aria-labelledby="titulo-movimientos" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 id="titulo-movimientos" className="text-sm font-semibold">
            Movimientos
          </h2>
          {puedeEscribir && <CrearParteGrupo />}
        </div>
        <TablaMovimientosGrupo filas={filas} partes={partesActivas} hoy={hoy} puedeEscribir={puedeEscribir} />
      </section>
    </Pagina>
  );
}
