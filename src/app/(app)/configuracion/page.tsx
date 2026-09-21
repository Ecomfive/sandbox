import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
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

export const metadata = { title: "Configuración" };

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
    <Pagina ancho="angosta" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Configuración del sistema" oculto>
        {pais.nombre} — solo visible para administradores.
      </EncabezadoPagina>

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
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
            <span className={labelClass}>Nombre de la plataforma</span>
            <input type="text" name="nombre" required placeholder="Ej: Boxful" className={fieldClass} />
          </label>
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
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Tipo</span>
            <select name="tipo" required defaultValue="banco" className={fieldClass}>
              {TIPOS_CUENTA.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
            <span className={labelClass}>Nombre</span>
            <input
              type="text"
              name="nombre"
              required
              placeholder="Ej: Banco General - Ahorros"
              className={fieldClass}
            />
          </label>
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
            <span className={labelClass}>Detalle</span>
            <input type="text" name="detalle" placeholder="Ej: cuenta 04-01-23-00123-4" className={fieldClass} />
          </label>
          <Button type="submit">Agregar cuenta</Button>
        </FormularioConToast>

        <TablaCuentasConfiguracion cuentas={cuentas ?? []} />
      </div>
    </Pagina>
  );
}
