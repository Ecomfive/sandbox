"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ProgresoEstimado } from "@/components/ui/progreso-estimado";
import { useToast } from "@/components/ui/toast";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import { formatearFechaHora } from "@/lib/formato";
import { PERIODOS, type CuentaVista, type Periodo } from "@/lib/meta-ads/datos";
import { leerAhoraMeta } from "./actions";

/**
 * Arriba de cada pestaña de Anuncios Meta: el periodo (Hoy, 7 o 30 días), la cuenta publicitaria (o todas las del país) y «Leer ahora». El periodo y la cuenta viajan en la dirección
 * (`?periodo=` y `?cuenta=`), así que se pueden copiar y mandar.
 */
export function BarraMeta({ periodo, cuentas, cuentaId, escribe, hayToken, desde, hasta, sinPeriodo = false }: { periodo: Periodo; cuentas: CuentaVista[]; cuentaId: string | null; escribe: boolean; hayToken: boolean; desde: string; hasta: string; sinPeriodo?: boolean }) {
  const ruta = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const { mostrarToast } = useToast();
  const [leyendo, empezar] = useTransition();
  const [mensajes, setMensajes] = useState<string[]>([]);
  const con = (clave: string, valor: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (valor === null) p.delete(clave);
    else p.set(clave, valor);
    const t = p.toString();
    return t ? `${ruta}?${t}` : ruta;
  };
  const ultima = cuentas.map((c) => c.ultimaLectura).filter((x): x is string => !!x).sort().pop() ?? null;
  const conError = cuentas.filter((c) => c.activa && c.ultimoError);
  const leer = () =>
    empezar(async () => {
      const r = await leerAhoraMeta(cuentaId ?? undefined);
      if (r.error) {
        mostrarToast(r.error, "destructive");
        return;
      }
      const lecturas = r.lecturas ?? [];
      setMensajes(lecturas.map((l) => `${l.cuenta}: ${l.texto}`));
      mostrarToast(lecturas.every((l) => l.ok) ? "Listo: se leyeron las cuentas." : "Se leyó, pero alguna cuenta tuvo problemas: míralos abajo.", lecturas.every((l) => l.ok) ? "success" : "destructive");
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          {!sinPeriodo && (
          <div role="group" aria-label="Periodo" className="flex overflow-hidden rounded-md border border-border-control">
            {PERIODOS.map((p) => (
              <Link
                key={p.valor}
                href={con("periodo", p.valor === "7" ? null : p.valor)}
                aria-current={p.valor === periodo ? "true" : undefined}
                scroll={false}
                className={`px-3 py-1.5 text-xs font-medium transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${p.valor === periodo ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted"}`}
              >
                {p.etiqueta}
              </Link>
            ))}
          </div>
          )}
          {cuentas.length > 1 && (
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Cuenta publicitaria</span>
              <select className={fieldClassSm} value={cuentaId ?? ""} onChange={(e) => router.push(con("cuenta", e.target.value || null), { scroll: false })}>
                <option value="">Todas ({cuentas.filter((c) => c.activa).length})</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.activa ? "" : " (apagada)"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="m-0 pb-1.5 text-xs text-muted-foreground">
            {sinPeriodo ? `Hasta hoy, ${hasta}` : desde === hasta ? `Hoy, ${hasta}` : `Del ${desde} al ${hasta}`} · hora de Panamá
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 text-xs text-muted-foreground">{ultima ? `Última lectura: ${formatearFechaHora(ultima)}` : "Todavía no se ha leído Meta"}</p>
          {escribe && cuentas.some((c) => c.activa) && (
            <button
              type="button"
              onClick={leer}
              disabled={leyendo || !hayToken}
              title={hayToken ? undefined : "Falta conectar Meta: ver «Cuentas»"}
              className="min-h-9 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              {leyendo ? "Leyendo Meta…" : "Leer ahora"}
            </button>
          )}
        </div>
      </div>
      {leyendo && <ProgresoEstimado compacta etiqueta="Leyendo Meta" estimadoMs={40_000} pasos={["Conectando con Meta", "Leyendo los resultados por día", "Leyendo campañas, anuncios y videos", "Leyendo quién montó qué", "Guardando"]} />}
      {conError.length > 0 && mensajes.length === 0 && !leyendo && (
        <ul role="alert" className="m-0 flex list-none flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2 text-xs">
          {conError.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
              <span>
                <span className="font-medium">{c.nombre}:</span> <span className="text-muted-foreground">{c.ultimoError}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {mensajes.length > 0 && (
        <ul role="status" className="m-0 flex list-none flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          {mensajes.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
