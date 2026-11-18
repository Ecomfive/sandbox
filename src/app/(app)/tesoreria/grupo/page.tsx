import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { claseCifra } from "@/components/af4/estilos-af4";
import { Pagina } from "@/components/ui/pagina";
import { diaMes, hoyPanama } from "@/lib/af4/fecha";
import { dinero, dinero2, dineroKpi, fraccion } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarPrestamosGrupo, SIN_MIGRACION_GRUPO } from "@/lib/finanzas/cargar-prestamos-grupo";
import { costoFinanciero, deudasNetas, etiquetaTipoGrupo, pendientes, saldosPorPar, type ClaseParte } from "@/lib/finanzas/prestamos-grupo";
import { createServiceClient } from "@/lib/supabase/server";
import { AvisoTesoreria } from "../aviso";
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
  const datos = await cargarPrestamosGrupo(createServiceClient());
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

  const netas = deudasNetas(saldosPorPar(datos.movs));
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
    }));
  const partesActivas = datos.partes.filter((p) => p.activo).map((p) => ({ id: p.id, nombre: p.nombre }));
  const puedeEscribir = !usuario.modulosSoloLectura.includes("tesoreria");

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Préstamos del grupo" />
      <FilaKpiAF4>
        <KpiAF4 titulo="Entre empresas del grupo" destacado valor={dineroKpi(entreEmpresas)} subtexto="Saldo neto entre países" />
        <KpiAF4 titulo="Se le debe a socios" valor={dineroKpi(aSocios)} subtexto="Alcides y otros" />
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
                </tr>
              </thead>
              <tbody>
                {netas.map((d) => (
                  <tr key={`${d.acreedorId}|${d.deudorId}`} className="border-t border-border">
                    <td className="px-4 py-2">{n(d.deudorId)}</td>
                    <td className="px-4 py-2">{n(d.acreedorId)}</td>
                    <td className={`px-4 py-2 text-right ${claseCifra}`}>{dinero2(d.monto)}</td>
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
                  <span className={`shrink-0 ${claseCifra}`}>{dinero(p.pendiente)}</span>
                </li>
              ))}
            </ul>
          )}
        </MarcoAF4>
      </div>

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
