import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { getSerieInventario, getSerieFinanzas } from "@/lib/dashboard/queries";
import { InventarioChart } from "@/components/charts/inventario-chart";
import { FinanzasChart } from "@/components/charts/finanzas-chart";
import { requireModulo } from "@/lib/auth";

export const dynamic = "force-dynamic";

function DepartmentCard({
  titulo,
  children,
  enlaces,
}: {
  titulo: string;
  children: React.ReactNode;
  enlaces: { href: string; label: string }[];
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">{titulo}</h2>
        <div className="flex gap-3">
          {enlaces.map((e) => (
            <Link key={e.href} href={e.href} className="text-xs text-accent hover:text-accent-hover">
              {e.label}
            </Link>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

function ProntoCard({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">{titulo}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Pronto</span>
      </div>
      <p className="flex h-[200px] items-center justify-center text-center text-sm text-muted-foreground">
        {descripcion}
      </p>
    </div>
  );
}

export default async function Home() {
  await requireModulo("dashboard");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [serieInventario, serieFinanzas, { data: dropshippers }] = await Promise.all([
    getSerieInventario(supabase, pais.id),
    getSerieFinanzas(supabase, pais.id),
    supabase.from("dropshippers").select("estado").eq("pais_id", pais.id),
  ]);

  const hayInventario = serieInventario.some((p) => p.entradas > 0 || p.salidas > 0);

  const totalDropshippers = dropshippers?.length ?? 0;
  const activosDropshippers = (dropshippers ?? []).filter((d) => d.estado === "activo").length;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <h1 className="text-lg font-semibold tracking-tight">Dashboard operativo</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {pais.nombre} — panorama por departamento
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DepartmentCard
          titulo="Operaciones"
          enlaces={[
            { href: "/inventario", label: "Inventario" },
            { href: "/alertas", label: "Alertas" },
          ]}
        >
          <p className="mb-2 text-xs text-muted-foreground">
            Entradas vs. salidas de inventario, últimos 14 días
          </p>
          {hayInventario ? (
            <InventarioChart datos={serieInventario} />
          ) : (
            <p className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              Aún no hay movimientos de inventario en los últimos 14 días.
            </p>
          )}
        </DepartmentCard>

        <DepartmentCard
          titulo="Finanzas"
          enlaces={[
            { href: "/extractos", label: "Extractos" },
            { href: "/conciliaciones", label: "Conciliación" },
          ]}
        >
          <p className="mb-2 text-xs text-muted-foreground">
            Diferencia banco vs. plataforma reportada, por mes
          </p>
          {serieFinanzas.length > 0 ? (
            <FinanzasChart datos={serieFinanzas} />
          ) : (
            <p className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              Todavía no hay conciliaciones registradas.
            </p>
          )}
        </DepartmentCard>

        <ProntoCard
          titulo="Inteligencia competitiva"
          descripcion="Crecimiento de proveedores y análisis de competencia — próximamente."
        />
        <DepartmentCard
          titulo="CRM Dropshippers"
          enlaces={[{ href: "/crm-dropshippers", label: "Ver panel" }]}
        >
          <p className="mb-2 text-xs text-muted-foreground">Directorio de dropshippers</p>
          {totalDropshippers > 0 ? (
            <div className="flex h-[200px] flex-col items-center justify-center gap-1">
              <p className="text-3xl font-semibold tabular-nums">{totalDropshippers}</p>
              <p className="text-sm text-muted-foreground">
                {activosDropshippers} activo{activosDropshippers === 1 ? "" : "s"}
              </p>
            </div>
          ) : (
            <p className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              Todavía no hay dropshippers registrados.
            </p>
          )}
        </DepartmentCard>
      </div>
    </main>
  );
}
