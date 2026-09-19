import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { ActivaToggle } from "./activa-toggle";
import { ComisionEditable } from "./comision-editable";
import { VentanaCuentaRetiro } from "./ventana-cuenta-retiro";
import { EliminarCuentaBoton } from "./eliminar-cuenta-boton";
import { linkClass } from "@/components/ui/link";
import { EstadoVacio } from "@/components/ui/estado-vacio";

export const dynamic = "force-dynamic";

const TIPOS = [
  { valor: "banco", etiqueta: "Banco" },
  { valor: "binance", etiqueta: "Binance" },
  { valor: "tarjeta", etiqueta: "Tarjeta" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

const etiquetaTipo = (valor: string) => TIPOS.find((t) => t.valor === valor)?.etiqueta ?? valor;

export default async function CuentasRetiroPage() {
  await requireModulo("retiros");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: cuentas } = await supabase
    .from("cuentas_retiro")
    .select("id, tipo, nombre, detalle, activa, comision_tipo, comision_valor")
    .eq("pais_id", pais.id)
    .order("creado_en", { ascending: false });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <div>
        <Link href="/retiros" className={linkClass}>
          ← Conciliación de Retiros
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Cuentas de retiro</h1>
          <VentanaCuentaRetiro paisId={pais.id} />
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-muted-foreground">
              <th className="py-2 pr-3 pl-4 font-medium">Tipo</th>
              <th className="py-2 pr-3 font-medium">Nombre</th>
              <th className="py-2 pr-3 font-medium">Cuenta</th>
              <th className="py-2 pr-3 font-medium">Comisión sugerida</th>
              <th className="py-2 pr-3 font-medium">Estado</th>
              <th className="py-2 pr-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(cuentas ?? []).map((c) => (
              <tr key={c.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-3 pl-4">{etiquetaTipo(c.tipo)}</td>
                <td className="py-2 pr-3 font-medium">{c.nombre}</td>
                <td className="py-2 pr-3 text-muted-foreground">{c.detalle || "—"}</td>
                <td className="py-2 pr-3">
                  <ComisionEditable id={c.id} comisionTipo={c.comision_tipo} comisionValor={c.comision_valor} />
                </td>
                <td className="py-2 pr-3">
                  <ActivaToggle id={c.id} activa={c.activa} />
                </td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-1">
                    <VentanaCuentaRetiro paisId={pais.id} cuenta={c} />
                    <EliminarCuentaBoton id={c.id} nombre={c.nombre} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(cuentas ?? []).length === 0 && (
          <EstadoVacio mensaje="Todavía no hay cuentas de retiro registradas." />
        )}
      </div>
    </main>
  );
}
