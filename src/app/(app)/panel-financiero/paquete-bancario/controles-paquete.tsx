import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { mesMedio } from "@/lib/af4/fecha";
import type { Entidad } from "@/lib/finanzas/entidades";
import { SECCIONES_PAQUETE, type SeccionPaquete } from "@/lib/finanzas/paquete-bancario";
import type { Papel } from "./estilo-paquete";
import { RUTA_PAQUETE } from "./parametros";

/**
 * Qué paquete se arma: corte (el último mes cerrado por defecto), entidad, hoja y secciones. Es un formulario GET: la
 * dirección queda con lo elegido y se puede compartir o recargar.
 */
export function ControlesPaquete({
  corte,
  cortes,
  cerrados,
  entidad,
  entidades,
  secciones,
  permitidas,
  papel,
}: {
  corte: string;
  cortes: string[];
  cerrados: string[];
  entidad: string;
  entidades: Entidad[];
  secciones: SeccionPaquete[];
  permitidas: SeccionPaquete[];
  papel: Papel;
}) {
  return (
    <form method="get" action={RUTA_PAQUETE} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" data-sin-imprimir>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Fecha de corte</span>
          <select name="corte" defaultValue={corte.slice(0, 7)} className={fieldClassSm}>
            {cortes.map((c) => (
              <option key={c} value={c.slice(0, 7)}>
                {mesMedio(c)}
                {cerrados.includes(c) ? " · cerrado" : ""}
              </option>
            ))}
          </select>
        </label>
        {entidades.length > 1 && (
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Entidad</span>
            <select name="entidad" defaultValue={entidad} className={fieldClassSm}>
              <option value="consolidado">Consolidado</option>
              {entidades.map((e) => (
                <option key={e.codigo} value={e.codigo}>
                  {e.razon_social}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Hoja</span>
          <select name="papel" defaultValue={papel} className={fieldClassSm}>
            <option value="a4">A4</option>
            <option value="carta">Carta</option>
          </select>
        </label>
        <button type="submit" className={`inline-flex h-8 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:opacity-90 ${anilloFoco}`}>
          Armar paquete
        </button>
      </div>
      <fieldset className="m-0 flex flex-wrap gap-x-4 gap-y-1.5 border-0 p-0">
        <legend className="sr-only">Secciones</legend>
        {SECCIONES_PAQUETE.filter((s) => permitidas.includes(s.clave)).map((s) => (
          <label key={s.clave} className="inline-flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              name="secciones"
              value={s.clave}
              defaultChecked={secciones.includes(s.clave)}
              disabled={s.clave === "limitaciones"}
              className={`h-4 w-4 accent-[var(--foreground)] ${anilloFoco}`}
            />
            {s.etiqueta}
          </label>
        ))}
      </fieldset>
    </form>
  );
}
