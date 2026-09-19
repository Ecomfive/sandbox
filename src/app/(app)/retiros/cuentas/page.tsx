import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { crearCuentaRetiro } from "./actions";
import { ActivaToggle } from "./activa-toggle";
import { TextoEditable } from "./texto-editable";
import { TipoEditable } from "./tipo-editable";
import { ComisionEditable } from "./comision-editable";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { linkClass } from "@/components/ui/link";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { FormularioConToast } from "@/components/ui/toast";

export const dynamic = "force-dynamic";

const TIPOS = [
  { valor: "banco", etiqueta: "Banco" },
  { valor: "binance", etiqueta: "Binance" },
  { valor: "tarjeta", etiqueta: "Tarjeta" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

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
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Cuentas de retiro</h1>
      </div>

      <FormularioConToast
        action={crearCuentaRetiro}
        mensajeExito="Cuenta agregada"
        className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4"
      >
        <input type="hidden" name="pais_id" value={pais.id} />
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Tipo</label>
          <select name="tipo" required defaultValue="banco" className={fieldClass}>
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <label className={labelClass}>Nombre</label>
          <input
            type="text"
            name="nombre"
            required
            placeholder="Ej: Banco General - Ahorros"
            className={fieldClass}
          />
        </div>
        <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <label className={labelClass}>Cuenta</label>
          <input
            type="text"
            name="detalle"
            placeholder="Ej: cuenta 04-01-23-00123-4"
            className={fieldClass}
          />
        </div>
        <Button type="submit">Agregar cuenta</Button>
      </FormularioConToast>

      <div className="min-w-0 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-muted-foreground">
              <th className="py-2 pr-3 pl-4 font-medium">Tipo</th>
              <th className="py-2 pr-3 font-medium">Nombre</th>
              <th className="py-2 pr-3 font-medium">Cuenta</th>
              <th className="py-2 pr-3 font-medium">Comisión sugerida</th>
              <th className="py-2 pr-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {(cuentas ?? []).map((c) => (
              <tr key={c.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-3 pl-4">
                  <TipoEditable id={c.id} tipo={c.tipo} />
                </td>
                <td className="py-2 pr-3 font-medium">
                  <TextoEditable id={c.id} campo="nombre" valor={c.nombre} />
                </td>
                <td className="py-2 pr-3 text-muted-foreground">
                  <TextoEditable id={c.id} campo="detalle" valor={c.detalle ?? ""} placeholder="Sin cuenta" />
                </td>
                <td className="py-2 pr-3">
                  <ComisionEditable id={c.id} comisionTipo={c.comision_tipo} comisionValor={c.comision_valor} />
                </td>
                <td className="py-2 pr-3">
                  <ActivaToggle id={c.id} activa={c.activa} />
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
