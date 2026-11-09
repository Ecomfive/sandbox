import Link from "next/link";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { claseCifra } from "@/components/af4/estilos-af4";
import { anilloFoco } from "@/components/ui/field";
import { diaMes } from "@/lib/af4/fecha";
import { dinero, dineroKpi } from "@/lib/af4/formato";
import type { AlertaTesoreria, Posicion } from "@/lib/finanzas/tesoreria";

const PUNTO_SEVERIDAD = { critica: "bg-destructive", aviso: "bg-warning", info: "bg-accent-foreground" } as const;

/** «hoy», «ayer» o «al 21 oct». */
function cuando(fecha: string | null, hoy: string, antiguedad: number | null): string {
  if (!fecha) return "sin dato";
  if (antiguedad === 0 || fecha === hoy) return "hoy";
  if (antiguedad === 1) return "ayer";
  return `al ${diaMes(fecha)}`;
}

/**
 * La posición de caja del día (Tesorería y Panel financiero): bancos, Yappy, efectivo en repartidores y Dropi, cada uno con
 * la fecha de su dato. Un punto ámbar marca el dato que pasó de `diasViejo` días.
 */
export function PosicionCajaAF4({ posicion, hoy, diasViejo, compacta = false }: { posicion: Posicion; hoy: string; diasViejo: number; compacta?: boolean }) {
  return (
    <MarcoAF4
      id={compacta ? "posicion-caja-panel" : "posicion-caja"}
      titulo="Posición de caja"
      detalle={`USD · ${diaMes(hoy)}`}
      accion={compacta ? <Link href="/tesoreria" className={`rounded text-xs font-medium text-foreground-soft underline-offset-2 hover:underline ${anilloFoco}`}>Ver tesorería</Link> : undefined}
    >
      {posicion.partidas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin saldos cargados.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className={`text-2xl font-semibold tracking-tight ${claseCifra}`}>{dineroKpi(posicion.total)}</p>
          <ul className="flex flex-col divide-y divide-border">
            {posicion.partidas.map((p) => {
              const viejo = p.antiguedad !== null && p.antiguedad > diasViejo;
              return (
                <li key={p.clave} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <Link href={p.href} className={`flex min-w-0 items-center gap-2 rounded hover:underline ${anilloFoco}`}>
                      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${viejo ? "bg-warning" : "bg-success"}`} />
                      <span className="truncate font-medium">{p.etiqueta}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {cuando(p.fecha, hoy, p.antiguedad)}
                        {viejo && <span className="sr-only"> (dato viejo)</span>}
                      </span>
                    </Link>
                    <span className={`shrink-0 ${claseCifra}`}>{dinero(p.monto)}</span>
                  </div>
                  {!compacta && p.detalle.length > 1 && (
                    <ul className="mt-1 flex flex-col gap-0.5 pl-3.5 text-xs text-muted-foreground">
                      {p.detalle.map((x) => (
                        <li key={x.etiqueta} className="flex justify-between gap-3">
                          <span className="truncate">
                            {x.etiqueta} · {cuando(x.fecha, hoy, null)}
                          </span>
                          <span className={claseCifra}>{dinero(x.monto)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </MarcoAF4>
  );
}

/** Lo que pide atención en Tesorería, de lo más grave a lo más leve, con su enlace. */
export function AlertasTesoreriaAF4({ alertas, id = "alertas-tesoreria" }: { alertas: AlertaTesoreria[]; id?: string }) {
  return (
    <MarcoAF4 id={id} titulo="Necesita atención" detalle={alertas.length ? String(alertas.length) : undefined}>
      {alertas.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
          Todo al día
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {alertas.map((a) => (
            <li key={a.clave} className="py-2 first:pt-0 last:pb-0">
              <Link href={a.href} className={`flex items-start gap-2 rounded text-sm hover:underline ${anilloFoco}`}>
                <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO_SEVERIDAD[a.severidad]}`} />
                <span className="min-w-0">
                  <span className="block font-medium">{a.titulo}</span>
                  <span className="block text-xs text-muted-foreground">{a.mensaje}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </MarcoAF4>
  );
}
