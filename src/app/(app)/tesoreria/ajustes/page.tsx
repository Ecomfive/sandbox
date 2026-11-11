import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { FormularioConToast } from "@/components/ui/toast";
import { requireModulo } from "@/lib/auth";
import { cargarConfigTesoreria, cargarReglas, SIN_MIGRACION_TESORERIA } from "@/lib/finanzas/cargar-tesoreria";
import { CATEGORIAS_PAGO, etiquetaPrioridad } from "@/lib/finanzas/pagos";
import type { ConfigTesoreria } from "@/lib/finanzas/tesoreria";
import { createServiceClient } from "@/lib/supabase/server";
import { guardarConfigTesoreria } from "../actions";
import { AvisoTesoreria } from "../aviso";
import { TablaReglas } from "./reglas";

export const metadata = { title: "Ajustes de Tesorería" };

export const dynamic = "force-dynamic";

const CAMPOS: { clave: keyof ConfigTesoreria; etiqueta: string; ejemplo: string; decimal?: boolean }[] = [
  { clave: "dropiUmbral", etiqueta: "Pedir retiro de Dropi desde (USD)", ejemplo: "Ej: 500", decimal: true },
  { clave: "dropiDias", etiqueta: "O cada cuántos días desde el último retiro", ejemplo: "Ej: 7" },
  { clave: "efectivoDias", etiqueta: "Alerta del efectivo en repartidores (días)", ejemplo: "Ej: 7" },
  { clave: "toleranciaDeposito", etiqueta: "Diferencia tolerada en un depósito (USD)", ejemplo: "Ej: 1", decimal: true },
  { clave: "saldoDias", etiqueta: "Saldo bancario viejo después de (días)", ejemplo: "Ej: 3" },
  { clave: "lineaDias", etiqueta: "Avisar la renovación de una línea (días antes)", ejemplo: "Ej: 30" },
];

export default async function AjustesTesoreriaPage() {
  const usuario = await requireModulo("tesoreria");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Tesorería" />;
  const supabase = createServiceClient();
  const [config, reglas] = await Promise.all([cargarConfigTesoreria(supabase), cargarReglas(supabase)]);
  const puedeEscribir = !usuario.modulosSoloLectura.includes("tesoreria");
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Ajustes de Tesorería" imprimir={false} />
      <MarcoAF4 id="ajustes-tesoreria" titulo="Umbrales y alertas" className="max-w-5xl">
        <FormularioConToast action={guardarConfigTesoreria} mensajeExito="Ajustes guardados" className="flex flex-col gap-4">
          <fieldset disabled={!puedeEscribir} className="grid gap-4 sm:grid-cols-2">
            {CAMPOS.map((c) => (
              <label key={c.clave} className="flex flex-col gap-1">
                <span className={labelClass}>{c.etiqueta}</span>
                <input name={c.clave} inputMode={c.decimal ? "decimal" : "numeric"} defaultValue={String(config[c.clave])} placeholder={c.ejemplo} className={`${fieldClass} w-full`} />
              </label>
            ))}
          </fieldset>
          {puedeEscribir && (
            <button type="submit" className={`inline-flex h-9 items-center self-start rounded-md bg-foreground px-4 text-sm font-medium text-background ${anilloFoco}`}>
              Guardar ajustes
            </button>
          )}
        </FormularioConToast>
      </MarcoAF4>
      <section aria-labelledby="titulo-prioridades" className="flex flex-col gap-2">
        <h2 id="titulo-prioridades" className="text-sm font-semibold">
          Prioridades de pago
        </h2>
        <p className="text-xs text-muted-foreground">{CATEGORIAS_PAGO.map((c) => `${c.etiqueta}: ${etiquetaPrioridad(c.prioridad).toLowerCase()}`).join(" · ")}</p>
        {reglas ? <TablaReglas filas={reglas.map((r) => ({ id: r.id, ...r.regla }))} puedeEscribir={puedeEscribir} /> : <AvisoTesoreria>{SIN_MIGRACION_TESORERIA}</AvisoTesoreria>}
      </section>
    </Pagina>
  );
}
