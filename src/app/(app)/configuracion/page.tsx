import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { crearCuentaRetiro } from "../retiros/cuentas/actions";
import { crearPlataforma } from "./actions";
import { TIPOS_CUENTA } from "../retiros/cuentas/def-cuentas";
import { TablaCuentasConfiguracion } from "../retiros/cuentas/tabla-cuentas";
import { TablaPlataformas } from "./tabla-plataformas";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { FormularioConToast } from "@/components/ui/toast";
import { ConfiguracionIcon } from "@/lib/nav-icons";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  await requireModulo("configuracion");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [{ data: paisPlataformas }, { data: cuentas }] = await Promise.all([
    supabase
      .from("pais_plataformas")
      .select("id, disponible_para_retiro, plataformas(nombre)")
      .eq("pais_id", pais.id),
    supabase
      .from("cuentas_retiro")
      .select("id, numero, tipo, nombre, detalle, activa, comision_tipo, comision_porcentaje, comision_monto_fijo")
      .eq("pais_id", pais.id)
      .order("creado_en", { ascending: false }),
  ]);

  const plataformas = (paisPlataformas ?? [])
    .map((pp) => ({
      id: pp.id,
      disponible: pp.disponible_para_retiro,
      nombre: (pp.plataformas as unknown as { nombre: string } | null)?.nombre ?? "?",
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-10">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <ConfiguracionIcon className="h-5 w-5 text-muted-foreground" />
          Configuración del sistema
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{pais.nombre} — solo visible para administradores.</p>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Plataformas para crear retiros</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Elige qué plataformas aparecen en el botón &quot;+ Crear&quot; de Retiros.
          </p>
        </div>

        <FormularioConToast
          action={crearPlataforma}
          mensajeExito="Plataforma agregada"
          className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4"
        >
          <input type="hidden" name="pais_id" value={pais.id} />
          <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
            <label className={labelClass}>Nombre de la plataforma</label>
            <input type="text" name="nombre" required placeholder="Ej: Boxful" className={fieldClass} />
          </div>
          <Button type="submit">Crear plataforma</Button>
        </FormularioConToast>

        <TablaPlataformas plataformas={plataformas} />
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Cuentas de retiro</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Catálogo de cuentas bancarias, Binance o tarjetas donde se puede recibir un retiro.
          </p>
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
              {TIPOS_CUENTA.map((t) => (
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
            <input type="text" name="detalle" placeholder="Ej: cuenta 04-01-23-00123-4" className={fieldClass} />
          </div>
          <Button type="submit">Agregar cuenta</Button>
        </FormularioConToast>

        <TablaCuentasConfiguracion cuentas={cuentas ?? []} />
      </div>
    </main>
  );
}
