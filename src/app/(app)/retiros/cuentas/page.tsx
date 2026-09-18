import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { crearCuentaRetiro } from "./actions";
import { ActivaToggle } from "./activa-toggle";
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

const etiquetaTipo = (valor: string) => TIPOS.find((t) => t.valor === valor)?.etiqueta ?? valor;

export default async function CuentasRetiroPage() {
  await requireModulo("retiros");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: cuentas } = await supabase
    .from("cuentas_retiro")
    .select("id, tipo, nombre, detalle, activa")
    .eq("pais_id", pais.id)
    .order("creado_en", { ascending: false });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <div>
        <Link href="/retiros" className={linkClass}>
          ← Retiros y wallet
        </Link>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">Cuentas de retiro</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pais.nombre} — catálogo de cuentas bancarias, Binance o tarjetas donde se puede recibir
          un retiro. Se seleccionan como destino al crear un retiro.
        </p>
      </div>

      <FormularioConToast
        action={crearCuentaRetiro}
        mensajeExito="Cuenta agregada"
        className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4"
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
          <label className={labelClass}>Detalle</label>
          <input
            type="text"
            name="detalle"
            placeholder="Ej: cuenta 04-01-23-00123-4"
            className={fieldClass}
          />
        </div>
        <Button type="submit">Agregar cuenta</Button>
      </FormularioConToast>

      <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-muted-foreground">
              <th className="py-2 pr-3 pl-4 font-medium">Tipo</th>
              <th className="py-2 pr-3 font-medium">Nombre</th>
              <th className="py-2 pr-3 font-medium">Detalle</th>
              <th className="py-2 pr-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {(cuentas ?? []).map((c) => (
              <tr key={c.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-3 pl-4">{etiquetaTipo(c.tipo)}</td>
                <td className="py-2 pr-3 font-medium">{c.nombre}</td>
                <td className="py-2 pr-3 text-muted-foreground">{c.detalle}</td>
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
