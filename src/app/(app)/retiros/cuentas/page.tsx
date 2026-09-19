import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { ActivaToggle } from "./activa-toggle";
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

/** Solo lectura: la comisión sugerida ya no se edita acá — se edita desde "Modificar". */
function etiquetaComision(tipo: string | null, porcentaje: number | null, montoFijo: number | null) {
  if (tipo === "porcentaje" && porcentaje != null) return `${porcentaje}%`;
  if (tipo === "monto_fijo" && montoFijo != null) return `$${montoFijo.toFixed(2)}`;
  if (tipo === "ambos" && porcentaje != null && montoFijo != null) return `${porcentaje}% + $${montoFijo.toFixed(2)}`;
  return "—";
}

export default async function CuentasRetiroPage() {
  await requireModulo("retiros");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: cuentas } = await supabase
    .from("cuentas_retiro")
    .select("id, numero, tipo, nombre, detalle, activa, comision_tipo, comision_porcentaje, comision_monto_fijo")
    .eq("pais_id", pais.id)
    .order("numero", { ascending: true });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <div>
        <Link href="/retiros" className={linkClass}>
          ← Conciliación de Retiros
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Cuentas destino</h1>
          <VentanaCuentaRetiro paisId={pais.id} />
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[50rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-muted-foreground">
              <th className="py-2 pr-3 pl-4 font-medium">#</th>
              <th className="py-2 pr-3 font-medium">Tipo</th>
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
                <td className="py-2 pr-3 pl-4 font-semibold text-muted-foreground">
                  {c.numero != null ? `#${c.numero}` : "—"}
                </td>
                <td className="py-2 pr-3">{etiquetaTipo(c.tipo)}</td>
                <td className="py-2 pr-3 font-medium">{c.nombre}</td>
                <td className="py-2 pr-3 text-muted-foreground">{c.detalle || "—"}</td>
                <td className="py-2 pr-3 text-muted-foreground">
                  {etiquetaComision(c.comision_tipo, c.comision_porcentaje, c.comision_monto_fijo)}
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
