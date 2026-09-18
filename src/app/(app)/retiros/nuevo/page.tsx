import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { crearRetiro } from "../actions";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { linkClass } from "@/components/ui/link";

export const dynamic = "force-dynamic";

const hoy = () => new Date().toISOString().slice(0, 10);

export default async function NuevoRetiroPage() {
  await requireModulo("retiros");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [{ data: plataformasPais }, { data: cuentas }] = await Promise.all([
    supabase.from("pais_plataformas").select("plataforma_id, plataformas(id, nombre)").eq("pais_id", pais.id),
    supabase
      .from("cuentas_retiro")
      .select("id, tipo, nombre")
      .eq("pais_id", pais.id)
      .eq("activa", true)
      .order("nombre"),
  ]);

  const plataformas = (plataformasPais ?? [])
    .map((pp) => pp.plataformas as unknown as { id: string; nombre: string } | null)
    .filter((p): p is { id: string; nombre: string } => p !== null)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/retiros" className={linkClass}>
          ← Retiros y wallet
        </Link>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">Crear retiro</h1>
        <p className="mt-1 text-sm text-muted-foreground">{pais.nombre}</p>
      </div>

      <form action={crearRetiro} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
        <input type="hidden" name="pais_id" value={pais.id} />

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Plataforma de origen</label>
          <select name="plataforma_id" required className={fieldClass}>
            {plataformas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Destino (cuenta de retiro)</label>
          {(cuentas ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay cuentas registradas.{" "}
              <Link href="/retiros/cuentas" className={linkClass}>
                Agrega una primero
              </Link>
              .
            </p>
          ) : (
            <select name="cuenta_retiro_id" required className={fieldClass}>
              {(cuentas ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Monto del retiro</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="monto"
              required
              className={`${fieldClass} w-40 tabular-nums`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Comisión</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="comision"
              defaultValue={0}
              className={`${fieldClass} w-32 tabular-nums`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Fecha</label>
            <input type="date" name="fecha" defaultValue={hoy()} required className={fieldClass} />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Notas</label>
          <input type="text" name="notas" className={fieldClass} />
        </div>

        <div>
          <Button type="submit" disabled={(cuentas ?? []).length === 0}>
            Crear retiro
          </Button>
        </div>
      </form>
    </main>
  );
}
