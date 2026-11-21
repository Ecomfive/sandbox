"use client";

import { useRef, useState } from "react";
import { BarraAvance } from "@/components/ui/barra-avance";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { lugaresConDesacuerdo, resumirPrueba, veredictoDe, zonaDominante, type PedidoMuestra, type ResultadoPrueba } from "@/lib/confirmacion-ia/prueba-historica";
import { agregarEjemplo, agregarPalabraZona, listarPedidosParaProbar, probarPedidosReales } from "../ia-actions";
import { useZonasPais } from "./zonas-pais";

const TANDA = 5;
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);

/** Una cifra del resumen: número grande y su nombre. */
function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2">
      <span className="text-xs text-muted-foreground">{titulo}</span>
      <span className="text-xl font-semibold tabular-nums">{valor}</span>
      {detalle && <span className="text-xs text-muted-foreground">{detalle}</span>}
    </div>
  );
}

/**
 * «Probar con pedidos reales» (19 nov 2026, pedido de Jhokser, solo administradores): toma pedidos de los últimos días que ya tienen su etiqueta de zona real, les pasa la dirección al mismo
 * análisis del sistema y compara lo que dijo con lo que de verdad se les puso. Los desacuerdos se pueden guardar como dirección de ejemplo o, si un lugar siempre sale de la misma zona, como palabra
 * de zona. No cambia etiquetas ni escribe a nadie; gasta crédito de las IA (dos llamadas por pedido).
 */
export function ProbarHistorico({ tiendas, tiendaElegida }: { tiendas: { id: string; nombre: string }[]; tiendaElegida: string | null }) {
  const { mostrarToast } = useToast();
  const { nombres } = useZonasPais();
  const [tiendaId, setTiendaId] = useState(tiendaElegida ?? "");
  const [dias, setDias] = useState(60);
  const [max, setMax] = useState(40);
  const [sinTendencia, setSinTendencia] = useState(true);
  const [corriendo, setCorriendo] = useState(false);
  const [deteniendo, setDeteniendo] = useState(false);
  const [total, setTotal] = useState(0);
  const [disponibles, setDisponibles] = useState<number | null>(null);
  const [resultados, setResultados] = useState<ResultadoPrueba[]>([]);
  const [omitidos, setOmitidos] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [guardados, setGuardados] = useState<Set<string>>(() => new Set());
  const parar = useRef(false);

  async function correr() {
    setError(null);
    setResultados([]);
    setOmitidos(0);
    setGuardados(new Set());
    parar.current = false;
    setDeteniendo(false);
    setCorriendo(true);
    try {
      const m = await listarPedidosParaProbar({ tiendaId: tiendaId || null, dias, max });
      if ("error" in m) return setError(m.error);
      setTotal(m.pedidos.length);
      setDisponibles(m.disponibles);
      for (let i = 0; i < m.pedidos.length && !parar.current; i += TANDA) {
        const r = await probarPedidosReales(m.pedidos.slice(i, i + TANDA).map((p: PedidoMuestra) => p.id), { sinTendencia }).catch(() => ({ error: "Se cortó la conexión. Vuelve a probar." }));
        if ("error" in r) return setError(r.error);
        setResultados((x) => [...x, ...r.resultados]);
        setOmitidos((x) => x + r.omitidos);
      }
    } finally {
      setCorriendo(false);
      setDeteniendo(false);
    }
  }

  const resumen = resultados.length ? resumirPrueba(resultados) : null;
  const desacuerdos = resultados.filter((r) => veredictoDe(r) !== "acerto");
  const lugares = lugaresConDesacuerdo(resultados);
  const hechos = resultados.length + omitidos;

  async function guardarEjemplo(r: ResultadoPrueba) {
    const res = await agregarEjemplo({ ciudad: r.ciudad ?? "", direccion: r.direccion, completa: true, falta: null, zona: r.real, tiendaId: r.tiendaId });
    if (res.error) return mostrarToast(res.error, "destructive");
    setGuardados((x) => new Set(x).add(`e-${r.id}`));
    mostrarToast("Guardado como ejemplo.");
  }
  async function guardarPalabra(lugar: string, zona: "ciudad" | "interior") {
    const res = await agregarPalabraZona(lugar, zona);
    if (res.error) return mostrarToast(res.error, "destructive");
    setGuardados((x) => new Set(x).add(`p-${lugar.toLowerCase()}`));
    mostrarToast(`«${lugar}» agregada como palabra de zona.`);
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!corriendo) void correr();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Tienda</span>
          <select value={tiendaId} onChange={(e) => setTiendaId(e.target.value)} disabled={corriendo} className={fieldClassSm}>
            <option value="">Todas</option>
            {tiendas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Pedidos de los últimos</span>
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} disabled={corriendo} className={fieldClassSm}>
            <option value={2}>2 días (solo los nuevos)</option>
            <option value={3}>3 días</option>
            <option value={7}>7 días</option>
            <option value={30}>30 días</option>
            <option value={60}>60 días</option>
            <option value={90}>90 días</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Cuántos</span>
          <select value={max} onChange={(e) => setMax(Number(e.target.value))} disabled={corriendo} className={fieldClassSm}>
            {[20, 40, 80, 150, 300].map((n) => (
              <option key={n} value={n}>
                {n} pedidos
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-9 items-center gap-2 text-sm">
          <input type="checkbox" checked={sinTendencia} onChange={(e) => setSinTendencia(e.target.checked)} disabled={corriendo} />
          Sin la tendencia de la tienda
        </label>
        <button type="submit" disabled={corriendo} className={`min-h-9 rounded-md bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50 ${anilloFoco}`}>
          {corriendo ? "Probando…" : resultados.length ? "Probar otra vez" : "Probar"}
        </button>
      </form>

      {error && (
        <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {(corriendo || (total > 0 && hechos < total)) && total > 0 && (
        <BarraAvance
          hecho={hechos}
          total={total}
          texto={`Analizando pedidos… (${resultados.length} listos)`}
          etiqueta="Prueba con pedidos reales"
          unidad="pedidos"
          alDetener={() => {
            parar.current = true;
            setDeteniendo(true);
          }}
          deteniendo={deteniendo}
        />
      )}

      {resumen && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Cifra titulo="Acierta" valor={pct(resumen.precision)} detalle={`${resumen.acerto} de ${resumen.acerto + resumen.fallo} que decidió`} />
            <Cifra titulo="Decidió" valor={pct(resumen.cobertura)} detalle={`${resumen.sinDecision} sin decidir (dato o revisar)`} />
            <Cifra titulo="Se equivocó" valor={String(resumen.fallo)} detalle={`de ${resumen.total} pedidos probados`} />
            <Cifra titulo="Disponibles" valor={disponibles === null ? "—" : disponibles.toLocaleString("es-PA")} detalle={`pedidos con zona real en ${dias} días`} />
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Zona real</th>
                  <th className="px-3 py-2 text-right font-medium">Dijo {nombres.ciudad}</th>
                  <th className="px-3 py-2 text-right font-medium">Dijo {nombres.interior}</th>
                  <th className="px-3 py-2 text-right font-medium">No decidió</th>
                </tr>
              </thead>
              <tbody>
                {(["ciudad", "interior"] as const).map((z) => (
                  <tr key={z} className="border-t border-border">
                    <th scope="row" className="px-3 py-2 font-medium">
                      {nombres[z]}
                    </th>
                    <td className={`px-3 py-2 text-right tabular-nums ${z === "ciudad" ? "font-semibold" : "text-destructive"}`}>{resumen.matriz[z].ciudad}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${z === "interior" ? "font-semibold" : "text-destructive"}`}>{resumen.matriz[z].interior}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{resumen.matriz[z].sinDecision}</td>
                  </tr>
                ))}
                {resumen.porTienda.map((t) => (
                  <tr key={t.tienda} className="border-t border-border text-muted-foreground">
                    <th scope="row" className="px-3 py-2 font-normal">
                      {t.tienda}
                    </th>
                    <td colSpan={3} className="px-3 py-2 text-right tabular-nums">
                      acertó {t.acerto} · se equivocó {t.fallo} · sin decidir {t.sinDecision}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border text-muted-foreground">
                  <th scope="row" className="px-3 py-2 font-normal">
                    Quién decidió
                  </th>
                  <td colSpan={3} className="px-3 py-2 text-right tabular-nums">
                    palabra de zona {resumen.porQuien.regla.acerto}/{resumen.porQuien.regla.total} · las IA {resumen.porQuien.ia.acerto}/{resumen.porQuien.ia.total}
                    {resumen.unaSolaIA.total > 0 && ` (una sola IA: ${resumen.unaSolaIA.acerto}/${resumen.unaSolaIA.total})`}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {lugares.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-semibold">Lugares donde más falla</h3>
          <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0 text-sm">
            {lugares.slice(0, 15).map((l) => {
              const dominante = zonaDominante(l);
              const hecho = guardados.has(`p-${l.lugar.toLowerCase()}`);
              return (
                <li key={l.lugar} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
                  <span className="min-w-0">
                    <b>{l.lugar}</b>
                    <span className="text-muted-foreground">
                      {" "}
                      · {l.fallos} de {l.total} mal o sin decidir · real: {l.ciudad} {nombres.ciudad}, {l.interior} {nombres.interior}
                    </span>
                  </span>
                  {dominante ? (
                    <button type="button" disabled={hecho} onClick={() => void guardarPalabra(l.lugar, dominante)} className={`min-h-8 rounded-md border border-border-control bg-card px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-60 ${anilloFoco}`}>
                      {hecho ? "Agregada" : `Agregar «${l.lugar}» → ${nombres[dominante]}`}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Mixto: no es una palabra de zona</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {desacuerdos.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-semibold">Pedidos donde no coincidió ({desacuerdos.length})</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Pedido</th>
                  <th className="px-3 py-2 font-medium">Ciudad y dirección</th>
                  <th className="px-3 py-2 font-medium">Real</th>
                  <th className="px-3 py-2 font-medium">El sistema dijo</th>
                  <th className="px-3 py-2 font-medium">Ejemplo</th>
                </tr>
              </thead>
              <tbody>
                {desacuerdos.map((r) => {
                  const v = veredictoDe(r);
                  const hecho = guardados.has(`e-${r.id}`);
                  return (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="px-3 py-2">
                        <b>{r.numero ?? "—"}</b>
                        <span className="block text-xs text-muted-foreground">{r.tienda}</span>
                      </td>
                      <td className="max-w-[22rem] px-3 py-2">
                        <b>{r.ciudad ?? "(sin ciudad)"}</b>
                        <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{r.direccion}</span>
                      </td>
                      <td className="px-3 py-2 font-medium">{nombres[r.real]}</td>
                      <td className="max-w-[20rem] px-3 py-2">
                        <span className={v === "fallo" ? "font-medium text-destructive" : "font-medium"}>
                          {r.estado === "listo" && r.zona && r.zona !== "adelantado" ? nombres[r.zona] : r.estado === "falta_dato" ? "Falta un dato" : r.estado === "revisar" ? "Para revisar" : r.estado === "adelantado" ? "Pago por adelantado" : "No se pudo"}
                          {r.zonaPor === "regla" ? " · palabra de zona" : r.zonaPor === "ia" ? " · IA" : ""}
                        </span>
                        <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{r.falta ? `Falta: ${r.falta}. ` : ""}{r.motivo}</span>
                        {r.modelos.length > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            {r.modelos.map((m) => `${m.proveedor}: ${m.ok ? `${m.zona ?? "?"}${m.completa === false ? " (incompleta)" : ""}` : "falló"}`).join(" · ")}
                          </span>
                        )}
                        {r.reglas.length > 0 && <span className="block text-xs text-muted-foreground">Palabras: {r.reglas.join(", ")}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" disabled={hecho || !r.ciudad} onClick={() => void guardarEjemplo(r)} className={`min-h-8 rounded-md border border-border-control bg-card px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-60 ${anilloFoco}`}>
                          {hecho ? "Guardado" : "Guardar como ejemplo"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="m-0 text-xs text-muted-foreground">La zona «real» es la etiqueta que tiene el pedido en Shopify: la puso el equipo o iComfly y también puede tener errores. Revisa antes de guardar un ejemplo.</p>
        </div>
      )}
    </div>
  );
}
