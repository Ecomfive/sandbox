import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { requireModulo } from "@/lib/auth";
import { resolverPeriodo } from "@/lib/dashboard/periodo";
import { formatearFecha, formatearFechaHoraCompleta, formatearMoneda } from "@/lib/formato";
import { linkClass } from "@/components/ui/link";
import { ActualizarIcon, WalletIcon } from "@/lib/nav-icons";
import { TablaRetiros, type FilaRetiro } from "./tabla-retiros";
import { CrearRetiroPanel } from "./crear-retiro-panel";

export const dynamic = "force-dynamic";

const hoy = () => new Date().toISOString().slice(0, 10);

const COLUMNAS_RETIRO =
  "id, numero_correlativo, monto, fecha, estado, notas, banco, dropi_id, plataforma_id, plataformas(nombre), cuentas_retiro(nombre)";
const PRESETS_VALIDOS = ["7d", "30d", "mes_actual", "mes_anterior"];
const esFechaIso = (valor: unknown): valor is string =>
  typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(new Date(valor).getTime());

export default async function RetirosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireModulo("retiros");
  const sp = await searchParams;
  const desde = esFechaIso(sp.desde) ? sp.desde : undefined;
  const hasta = esFechaIso(sp.hasta) ? sp.hasta : undefined;
  const preset = typeof sp.preset === "string" && PRESETS_VALIDOS.includes(sp.preset) ? sp.preset : undefined;
  const periodo = (desde && hasta) || preset ? resolverPeriodo({ preset, desde, hasta }) : null;

  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [
    { data: plataformasPais },
    { data: saldos },
    { data: retiros },
    { data: retirosFiltrados },
    { data: cuentasRetiro },
    { data: perfiles },
  ] =
    await Promise.all([
      supabase
        .from("pais_plataformas")
        .select("plataforma_id, plataformas(id, nombre)")
        .eq("pais_id", pais.id),
      supabase
        .from("saldos_wallet")
        .select("plataforma_id, monto, fecha, actualizado_en, plataformas(nombre)")
        .eq("pais_id", pais.id)
        .order("fecha", { ascending: false }),
      supabase
        .from("retiros")
        .select(COLUMNAS_RETIRO)
        .eq("pais_id", pais.id)
        .order("fecha", { ascending: false })
        .limit(50),
      periodo
        ? supabase
            .from("retiros")
            .select(COLUMNAS_RETIRO)
            .eq("pais_id", pais.id)
            .gte("fecha", periodo.desde)
            .lte("fecha", periodo.hasta)
            .order("fecha", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: null }),
      supabase
        .from("cuentas_retiro")
        .select("id, nombre")
        .eq("pais_id", pais.id)
        .eq("activa", true)
        .order("nombre"),
      supabase.from("perfiles").select("id, nombre, email").eq("activo", true).order("nombre"),
    ]);

  const plataformas = (plataformasPais ?? [])
    .map((pp) => pp.plataformas as unknown as { id: string; nombre: string } | null)
    .filter((p): p is { id: string; nombre: string } => p !== null)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const ultimoSaldoPorPlataforma = new Map<string, { monto: number; fecha: string; nombre: string }>();
  for (const s of saldos ?? []) {
    if (!ultimoSaldoPorPlataforma.has(s.plataforma_id)) {
      ultimoSaldoPorPlataforma.set(s.plataforma_id, {
        monto: Number(s.monto),
        fecha: s.fecha,
        nombre: (s.plataformas as unknown as { nombre: string } | null)?.nombre ?? "?",
      });
    }
  }

  const ultimaActualizacion = (saldos ?? []).reduce<string | null>(
    (max, s) => (max === null || Date.parse(s.actualizado_en) > Date.parse(max) ? s.actualizado_en : max),
    null
  );

  const mesActual = hoy().slice(0, 7);
  const abiertos = (retiros ?? []).filter((r) => r.estado === "abierto").length;
  const conNovedad = (retiros ?? []).filter((r) => r.estado === "novedad").length;
  const totalCerradoMes = (retiros ?? [])
    .filter((r) => r.estado === "cerrado" && r.fecha.slice(0, 7) === mesActual)
    .reduce((acc, r) => acc + Number(r.monto), 0);

  const retirosTabla = periodo ? (retirosFiltrados ?? []) : (retiros ?? []);
  const filasRetiro: FilaRetiro[] = retirosTabla.map((r) => ({
    id: r.id,
    numeroCorrelativo: r.numero_correlativo,
    fecha: r.fecha,
    plataformaNombre: (r.plataformas as unknown as { nombre: string } | null)?.nombre ?? null,
    destino: (r.cuentas_retiro as unknown as { nombre: string } | null)?.nombre ?? r.banco ?? "—",
    monto: Number(r.monto),
    estado: r.estado,
  }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Consolidación de retiros</h1>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          {ultimaActualizacion && (
            <p className="text-xs text-muted-foreground">
              Última actualización:{" "}
              <span className="tabular-nums">
                {formatearFechaHoraCompleta(ultimaActualizacion, pais.codigo)}
              </span>
            </p>
          )}
          <a
            href={`http://localhost:4321/actualizar-saldo-rapido?pais=${pais.codigo.toLowerCase()}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Actualizar retiros desde Dropi"
            className="inline-flex items-center justify-center rounded-md border border-border bg-card p-2 text-foreground transition-colors hover:bg-muted"
          >
            <ActualizarIcon className="h-4 w-4" />
          </a>
        </div>
        <div className="mt-3">
          <KpiGrid>
            {(plataformas ?? []).map((p) => {
              const ultimo = ultimoSaldoPorPlataforma.get(p.id);
              const esAutomatico = p.nombre === "Dropi";
              return (
                <KpiCard
                  key={p.id}
                  titulo={esAutomatico ? null : p.nombre}
                  valor={
                    <span className="inline-flex items-center gap-1.5">
                      {esAutomatico && <WalletIcon className="h-4 w-4 text-muted-foreground" />}
                      {ultimo ? formatearMoneda(ultimo.monto, pais.codigo) : "Sin registrar"}
                    </span>
                  }
                  subtexto={esAutomatico ? undefined : ultimo ? `al ${formatearFecha(ultimo.fecha)}` : undefined}
                />
              );
            })}
          </KpiGrid>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">Retiros</h2>
          <div className="flex items-center gap-4">
            <Link href="/retiros/cuentas" className={linkClass}>
              Cuentas de retiro
            </Link>
            <CrearRetiroPanel
              paisId={pais.id}
              plataformas={plataformas}
              cuentas={cuentasRetiro ?? []}
              perfiles={perfiles ?? []}
            />
          </div>
        </div>

        <div className="mt-3">
          <KpiGrid>
            <KpiCard titulo="Abiertos" valor={abiertos} />
            <KpiCard titulo="Con novedad" valor={conNovedad} tono={conNovedad > 0 ? "destructive" : "neutral"} />
            <KpiCard titulo="Cerrados este mes" valor={formatearMoneda(totalCerradoMes, pais.codigo)} />
          </KpiGrid>
        </div>

        <TablaRetiros retiros={filasRetiro} codigoPais={pais.codigo} hayFiltro={periodo !== null} />
      </div>
    </main>
  );
}
