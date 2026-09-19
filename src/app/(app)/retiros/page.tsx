import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { registrarSaldo } from "./actions";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { requireModulo } from "@/lib/auth";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { FormularioConToast } from "@/components/ui/toast";
import { linkClass } from "@/components/ui/link";
import { WalletIcon } from "@/lib/nav-icons";

export const dynamic = "force-dynamic";

const hoy = () => new Date().toISOString().slice(0, 10);

const ESTADO_TONO = {
  abierto: "info",
  cancelado: "neutral",
  novedad: "destructive",
  cerrado: "success",
} as const;

const ESTADO_ETIQUETA: Record<string, string> = {
  abierto: "Abierto",
  cancelado: "Cancelado",
  novedad: "Novedad",
  cerrado: "Cerrado",
};

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

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <WalletIcon className="h-5 w-5 text-muted-foreground" />
          Retiros y wallet
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pais.nombre} — saldo de wallet por plataforma y seguimiento de retiros. El saldo y el
          historial de retiros de Dropi se traen automáticamente de su panel; el resto se sigue
          registrando a mano hasta tener una extracción confiable para cada una.
        </p>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">Saldo de wallet</h2>
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
        <p className="mt-1 text-xs text-muted-foreground">
          Abre la herramienta local de actualización. Solo funciona en la computadora donde esa
          herramienta está corriendo y tiene la sesión de Dropi guardada.
        </p>
        <div className="mt-3">
          <KpiGrid>
            {(plataformas ?? []).map((p) => {
              const ultimo = ultimoSaldoPorPlataforma.get(p.id);
              const esAutomatico = p.nombre === "Dropi";
              return (
                <KpiCard
                  key={p.id}
                  titulo={
                    <span className="flex items-center gap-1.5">
                      {p.nombre}
                      {esAutomatico && <Badge tone="success">Automático</Badge>}
                    </span>
                  }
                  valor={ultimo ? formatearMoneda(ultimo.monto, pais.codigo) : "Sin registrar"}
                  subtexto={ultimo ? `al ${formatearFecha(ultimo.fecha)}` : undefined}
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

        <div className="mt-3 min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[42rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                <th className="py-2 pr-3 pl-4 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">Fecha</th>
                <th className="py-2 pr-3 font-medium">Plataforma</th>
                <th className="py-2 pr-3 font-medium">Destino</th>
                <th className="py-2 pr-3 font-medium">Monto</th>
                <th className="py-2 pr-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(retiros ?? []).map((r) => {
                const plataforma = r.plataformas as unknown as { nombre: string } | null;
                const cuenta = r.cuentas_retiro as unknown as { nombre: string } | null;
                return (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 pl-4">
                      <Link href={`/retiros/${r.id}`} className={linkClass}>
                        #{String(r.numero_correlativo).padStart(4, "0")}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{formatearFecha(r.fecha)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {plataforma?.nombre}
                        {r.dropi_id !== null && <Badge tone="success">Dropi</Badge>}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{cuenta?.nombre ?? r.banco ?? "—"}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatearMoneda(Number(r.monto), pais.codigo)}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={ESTADO_TONO[r.estado as keyof typeof ESTADO_TONO]}>
                        {ESTADO_ETIQUETA[r.estado] ?? r.estado}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(retiros ?? []).length === 0 && <EstadoVacio mensaje="Todavía no hay retiros registrados." />}
        </div>
      </div>
    </main>
  );
}
