import Link from "next/link";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { mesCorto } from "@/lib/finanzas/eerr";

/**
 * Elegir el rango de meses de una página (`?desde=AAAA-MM&hasta=AAAA-MM`). Es un formulario GET: funciona sin
 * JavaScript y la dirección se puede copiar. Los accesos rápidos de la derecha ponen los últimos 3, 6 o 12 meses.
 */
export function SelectorMeses({
  ruta,
  disponibles,
  ventana,
  conservar = {},
}: {
  ruta: string;
  /** Todos los meses con datos (AAAA-MM-01), del más viejo al más nuevo. */
  disponibles: string[];
  ventana: string[];
  /** Otros filtros de la página que se mantienen al cambiar los meses (entidad, moneda). */
  conservar?: Record<string, string>;
}) {
  if (!disponibles.length || !ventana.length) return null;
  const corto = (m: string) => m.slice(0, 7);
  const ultimo = disponibles[disponibles.length - 1];
  const rapidos = [3, 6, 12]
    .filter((n) => n <= disponibles.length)
    .map((n) => ({ n, desde: disponibles[disponibles.length - n] }));
  const opciones = [...disponibles].reverse();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <form method="get" action={ruta} className="flex flex-wrap items-end gap-2">
        {Object.entries(conservar).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Desde</span>
          <select name="desde" defaultValue={corto(ventana[0])} className={fieldClass}>
            {opciones.map((m) => (
              <option key={m} value={corto(m)}>
                {mesCorto(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Hasta</span>
          <select name="hasta" defaultValue={corto(ventana[ventana.length - 1])} className={fieldClass}>
            {opciones.map((m) => (
              <option key={m} value={corto(m)}>
                {mesCorto(m)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={`rounded-md border border-border-control bg-card px-3 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
          Ver
        </button>
      </form>
      {rapidos.length > 0 && (
        <nav aria-label="Rangos rápidos" className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {rapidos.map(({ n, desde }) => {
            const activo = ventana[0] === desde && ventana[ventana.length - 1] === ultimo;
            return (
              <Link
                key={n}
                href={`${ruta}?${new URLSearchParams({ ...conservar, desde: corto(desde), hasta: corto(ultimo) }).toString()}`}
                aria-current={activo ? "page" : undefined}
                className={`rounded-md px-2.5 py-1 text-sm ${anilloFoco} ${activo ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                {n} meses
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
