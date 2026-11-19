"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { BarraAvance } from "@/components/ui/barra-avance";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { CuentaVista } from "@/lib/meta-ads/datos";
import { tramosDeHistorial } from "@/lib/meta-ads/tramos";
import { leerTramoMeta } from "./actions";

const RANGOS = [
  { dias: 90, etiqueta: "Últimos 3 meses" },
  { dias: 180, etiqueta: "Últimos 6 meses" },
  { dias: 365, etiqueta: "Último año" },
  { dias: 1100, etiqueta: "Todo lo que Meta guarda (hasta 3 años)" },
];

/** Trae de Meta el historial de una cuenta de a un mes por vez, de lo más nuevo a lo más viejo, con su barra de avance; se puede detener y lo ya traído queda guardado. */
export function TraerHistorial({ cuentas, hoy }: { cuentas: CuentaVista[]; hoy: string }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const activas = cuentas.filter((c) => c.activa);
  const [cuentaId, setCuentaId] = useState(activas[0]?.id ?? "");
  const [dias, setDias] = useState(365);
  const [avance, setAvance] = useState<{ hecho: number; total: number; texto: string; terminado: boolean } | null>(null);
  const parar = useRef(false);
  const [deteniendo, setDeteniendo] = useState(false);
  if (!activas.length) return <p className="m-0 text-sm text-muted-foreground">Agrega una cuenta para poder traer su historial.</p>;
  const corriendo = !!avance && !avance.terminado;
  const traer = async () => {
    const tramos = tramosDeHistorial(hoy, dias);
    parar.current = false;
    setDeteniendo(false);
    let filas = 0;
    let hechos = 0;
    for (const t of tramos) {
      if (parar.current) break;
      setAvance({ hecho: hechos, total: tramos.length, texto: `Leyendo del ${t.desde} al ${t.hasta}…`, terminado: false });
      const r = await leerTramoMeta(cuentaId, t.desde, t.hasta);
      if (r.error) {
        mostrarToast(`Se detuvo en el tramo ${t.desde} a ${t.hasta}: ${r.error}`, "destructive");
        setAvance(null);
        router.refresh();
        return;
      }
      filas += r.filas ?? 0;
      hechos++;
    }
    setAvance({ hecho: hechos, total: tramos.length, texto: "", terminado: true });
    mostrarToast(parar.current ? `Detenido: se trajeron ${hechos} de ${tramos.length} meses (${filas} filas). Lo traído queda guardado.` : `Historial listo: ${tramos.length} meses, ${filas} filas de resultados.`, "success");
    router.refresh();
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {activas.length > 1 && (
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Cuenta</span>
            <select className={fieldClassSm} value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} disabled={corriendo}>
              {activas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Hasta cuándo</span>
          <select className={fieldClassSm} value={dias} onChange={(e) => setDias(Number(e.target.value))} disabled={corriendo}>
            {RANGOS.map((r) => (
              <option key={r.dias} value={r.dias}>
                {r.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={traer} disabled={corriendo || !cuentaId} className="min-h-9 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50">
          {corriendo ? "Trayendo el historial…" : "Traer historial"}
        </button>
      </div>
      {avance && (
        <BarraAvance
          hecho={avance.hecho}
          total={avance.total}
          texto={avance.texto}
          unidad="meses"
          etiqueta="Avance del historial"
          terminado={avance.terminado}
          deteniendo={deteniendo}
          alDetener={() => {
            parar.current = true;
            setDeteniendo(true);
          }}
        />
      )}
    </div>
  );
}
