import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { registrarSaldo } from "./actions";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { requireModulo } from "@/lib/auth";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import { FormularioConToast } from "@/components/ui/toast";
import { linkClass } from "@/components/ui/link";
import { WalletIcon } from "@/lib/nav-icons";
import { TablaRetiros, type FilaRetiro } from "./tabla-retiros";

export const dynamic = "force-dynamic";

const hoy = () => new Date().toISOString().slice(0, 10);

export default async function RetirosPage() {
  await requireModulo("retiros");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [{ data: plataformasPais }, { data: saldos }, { data: retiros }] = await Promise.all([
    supabase
      .from("pais_plataformas")
      .select("plataforma_id, plataformas(id, nombre)")
      .eq("pais_id", pais.id),
    supabase
      .from("saldos_wallet")
      .select("plataforma_id, monto, fecha, plataformas(nombre)")
      .eq("pais_id", pais.id)
      .order("fecha", { ascending: false }),
    supabase
      .from("retiros")
      .select(
        "id, numero_correlativo, monto, fecha, estado, notas, banco, dropi_id, plataforma_id, plataformas(nombre), cuentas_retiro(nombre)"
      )
      .eq("pais_id", pais.id)
      .order("fecha", { ascending: false })
      .limit(50),
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

  const mesActual = hoy().slice(0, 7);
  const abiertos = (retiros ?? []).filter((r) => r.estado === "abierto").length;
  const conNovedad = (retiros ?? []).filter((r) => r.estado === "novedad").length;
  const totalCerradoMes = (retiros ?? [])
    .filter((r) => r.estado === "cerrado" && r.fecha.slice(0, 7) === mesActual)
    .reduce((acc, r) => acc + Number(r.monto), 0);

  const filasRetiro: FilaRetiro[] = (retiros ?? []).map((r) => ({
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
        <div className="flex flex-wrap items-center justify-end gap-3">
          <a
            href={`http://localhost:4321/actualizar-saldo-rapido?pais=${pais.codigo.toLowerCase()}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button type="button" variant="secondary">
              Actualizar retiros desde Dropi
            </Button>
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

        <FormularioConToast
          action={registrarSaldo}
          mensajeExito="Saldo registrado"
          className="mt-4 flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4"
        >
          <input type="hidden" name="pais_id" value={pais.id} />
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Plataforma</label>
            <select name="plataforma_id" required className={fieldClass}>
              {(plataformas ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Saldo actual</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="monto"
              required
              className={`${fieldClass} w-32 tabular-nums`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Fecha</label>
            <input
              type="date"
              name="fecha"
              defaultValue={hoy()}
              required
              className={fieldClass}
            />
          </div>
          <Button type="submit" variant="secondary">
            Registrar saldo
          </Button>
        </FormularioConToast>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">Retiros</h2>
          <div className="flex items-center gap-4">
            <Link href="/retiros/cuentas" className={linkClass}>
              Cuentas de retiro
            </Link>
            <Link href="/retiros/nuevo">
              <Button type="button">Crear retiro</Button>
            </Link>
          </div>
        </div>

        <div className="mt-3">
          <KpiGrid>
            <KpiCard titulo="Abiertos" valor={abiertos} />
            <KpiCard titulo="Con novedad" valor={conNovedad} tono={conNovedad > 0 ? "destructive" : "neutral"} />
            <KpiCard titulo="Cerrados este mes" valor={formatearMoneda(totalCerradoMes, pais.codigo)} />
          </KpiGrid>
        </div>

        <TablaRetiros retiros={filasRetiro} codigoPais={pais.codigo} />
      </div>
    </main>
  );
}
