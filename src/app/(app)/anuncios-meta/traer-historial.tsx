"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BarraAvance } from "@/components/ui/barra-avance";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { coberturaDe, diasDesdeInicioDeMes, partirTramo, tramoYaTraido, type CoberturaCuenta } from "@/lib/meta-ads/cobertura";
import type { CuentaVista } from "@/lib/meta-ads/datos";
import { tramosDeHistorial } from "@/lib/meta-ads/tramos";
import { coberturaMeta, leerTramoMeta } from "./actions";

const TODAS = "todas";
/** «Último año» cubre los 13 meses del cuadro, desde el día 1 del más viejo, para que ese mes también pueda quedar completo. */
const rangos = (hoy: string) => [
  { dias: 90, etiqueta: "Últimos 3 meses" },
  { dias: 180, etiqueta: "Últimos 6 meses" },
  { dias: diasDesdeInicioDeMes(hoy, 12), etiqueta: "Último año (13 meses completos)" },
  { dias: 1100, etiqueta: "Todo lo que Meta guarda (hasta 3 años)" },
];

const ESPERA_DE_META_MS = 30_000;
const dormir = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
const pideEsperar = (error: string) => /esperar|demasiadas consultas/i.test(error);

/**
 * Trae de Meta el historial de una cuenta de a un mes por vez, de lo más nuevo a lo más viejo, con su barra de avance; se puede detener y lo ya traído queda guardado.
 * Si un mes trae más datos de los que caben en una lectura (o Meta tarda), lo parte en mitades hasta que cabe; si Meta pide esperar, espera y reintenta; y puede saltarse lo que ya se trajo
 * (20 nov 2026: un mes de una cuenta grande se quedaba colgado en el 62 % sin avisar).
 */
export function TraerHistorial({ cuentas, hoy, alTerminar }: { cuentas: CuentaVista[]; hoy: string; alTerminar?: () => void }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const activas = cuentas.filter((c) => c.activa);
  const opciones = rangos(hoy);
  const [cuentaId, setCuentaId] = useState(activas.length > 1 ? TODAS : (activas[0]?.id ?? ""));
  const [dias, setDias] = useState(opciones[2].dias);
  const [saltar, setSaltar] = useState(true);
  const [avance, setAvance] = useState<{ hecho: number; total: number; texto: string; terminado: boolean; unidad: string } | null>(null);
  const [segundos, setSegundos] = useState(0);
  const parar = useRef(false);
  const [deteniendo, setDeteniendo] = useState(false);
  const corriendo = !!avance && !avance.terminado;
  // Un reloj para que se vea que sigue vivo: cuántos segundos lleva el tramo de ahora.
  useEffect(() => {
    if (!corriendo) return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [corriendo, avance?.texto]);
  if (!activas.length) return <p className="m-0 text-sm text-muted-foreground">Agrega una cuenta para poder traer su historial.</p>;

  const traer = async () => {
    const tramos = tramosDeHistorial(hoy, dias);
    const objetivos = cuentaId === TODAS ? activas : activas.filter((c) => c.id === cuentaId);
    const total = tramos.length * objetivos.length;
    const unidad = objetivos.length > 1 ? "tramos" : "meses";
    parar.current = false;
    setDeteniendo(false);
    let filas = 0;
    let hechos = 0;
    let saltados = 0;
    const poner = (texto: string) => {
      setSegundos(0);
      setAvance({ hecho: hechos, total, texto, terminado: false, unidad });
    };
    poner("Revisando lo que ya se trajo…");
    const coberturas = new Map<string, CoberturaCuenta>();
    if (saltar) {
      const c = await coberturaMeta().catch(() => ({ error: "No se pudo revisar." }));
      if ("cuentas" in c) for (const x of c.cuentas ?? []) coberturas.set(x.id, coberturaDe(x.bruta));
    }

    /** Lee un tramo de una cuenta; si no cabe o Meta tarda, lo parte en dos y lee cada mitad (la más nueva primero). */
    const leer = async (cuenta: CuentaVista, t: { desde: string; hasta: string }, partes: number): Promise<{ filas: number; error?: string; detenido?: boolean }> => {
      let esperas = 0;
      const quien = objetivos.length > 1 ? `${cuenta.nombre} · ` : "";
      for (;;) {
        if (parar.current) return { filas: 0, detenido: true };
        poner(`${quien}Leyendo del ${t.desde} al ${t.hasta}…${partes > 1 ? ` (parte de un mes que se leyó en ${partes} pedazos)` : ""}`);
        let r: Awaited<ReturnType<typeof leerTramoMeta>>;
        try {
          r = await leerTramoMeta(cuenta.id, t.desde, t.hasta);
        } catch {
          r = { error: "La lectura tardó más de lo permitido.", partir: true };
        }
        if (!r.error) return { filas: r.filas ?? 0 };
        if (pideEsperar(r.error) && esperas < 3) {
          esperas++;
          poner(`${quien}Meta pidió esperar (demasiadas consultas): reintentando el ${t.desde} al ${t.hasta} en 30 s…`);
          await dormir(ESPERA_DE_META_MS);
          continue;
        }
        const mitades = r.partir || pideEsperar(r.error) ? partirTramo(t) : null;
        if (!mitades) return { filas: 0, error: r.error };
        let suma = 0;
        for (const m of mitades) {
          const dentro = await leer(cuenta, m, partes + 1);
          if (dentro.error || dentro.detenido) return { filas: suma + dentro.filas, error: dentro.error, detenido: dentro.detenido };
          suma += dentro.filas;
        }
        return { filas: suma };
      }
    };

    for (const cuenta of objetivos) {
      const cobertura = coberturas.get(cuenta.id);
      for (const t of tramos) {
        if (parar.current) break;
        if (cobertura && tramoYaTraido(t, cobertura)) {
          hechos++;
          saltados++;
          continue;
        }
        const r = await leer(cuenta, t, 1);
        filas += r.filas;
        if (r.detenido) break;
        if (r.error) {
          mostrarToast(`Se detuvo en ${cuenta.nombre}, tramo ${t.desde} a ${t.hasta}: ${r.error}`, "destructive");
          setAvance(null);
          router.refresh();
          alTerminar?.();
          return;
        }
        hechos++;
      }
      if (parar.current) break;
    }
    setAvance({ hecho: hechos, total, texto: "", terminado: true, unidad });
    const aparte = saltados ? ` (${saltados} ya estaban traídos)` : "";
    mostrarToast(parar.current ? `Detenido: se trajeron ${hechos} de ${total} ${unidad}${aparte}. Lo traído queda guardado.` : `Historial listo: ${total} ${unidad}${aparte}, ${filas} filas de resultados.`, "success");
    router.refresh();
    alTerminar?.();
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {activas.length > 1 && (
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Cuenta</span>
            <select className={fieldClassSm} value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} disabled={corriendo}>
              <option value={TODAS}>Todas las cuentas</option>
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
            {opciones.map((r) => (
              <option key={r.dias} value={r.dias}>
                {r.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-9 items-center gap-2 text-xs">
          <input type="checkbox" checked={saltar} onChange={(e) => setSaltar(e.target.checked)} disabled={corriendo} className="h-4 w-4" />
          <span>Saltar lo que ya se trajo</span>
        </label>
        <button type="button" onClick={traer} disabled={corriendo || !cuentaId} className="min-h-9 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50">
          {corriendo ? "Trayendo el historial…" : "Traer historial"}
        </button>
      </div>
      {avance && (
        <BarraAvance
          hecho={avance.hecho}
          total={avance.total}
          texto={avance.terminado ? "" : `${avance.texto} · ${segundos} s`}
          unidad={avance.unidad}
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
