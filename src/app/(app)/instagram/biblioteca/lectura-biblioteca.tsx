"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgresoEstimado } from "@/components/ui/progreso-estimado";
import { fieldClass, labelClass } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import { avisarActualizacionInstagram } from "@/lib/instagram/canal";
import { mismaPagina, mismoCopy, type AnuncioBiblioteca, type CapturaParaVincular, type ResultadoLecturaBiblioteca, type ResultadoVinculo } from "@/lib/instagram/biblioteca-lectura";
import { numeroInstagram } from "../def-instagram";
import { guardarLecturaBiblioteca, vincularAnunciosACaptura } from "../biblioteca-actions";
import { VolverAInstagram } from "../volver-a-instagram";

type Estado = { tipo: "inicio" } | { tipo: "confirmar"; d: string } | { tipo: "leyendo" } | { tipo: "sin_lectura" } | { tipo: "listo"; r: ResultadoLecturaBiblioteca };

const caja = "rounded-lg border border-border bg-card px-4 py-3 text-sm";
const PASOS = ["Recibiendo la lectura", "Reconociendo los anuncios", "Contando los del mismo copy", "Guardando en las capturas"];
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-CR")} ${n === 1 ? uno : varios}`;

/**
 * Recibe la lectura de la Biblioteca de anuncios que dejó el marcador en el fragmento de la dirección, la guarda (cuenta los anuncios
 * de la misma página con el mismo copy de cada captura) y muestra qué capturas se completaron. Lo que ninguna captura reconoció se
 * puede vincular a mano. El fragmento se borra de la dirección en cuanto se lee, para que recargar la página no vuelva a guardar lo mismo.
 * Antes de guardar pregunta «¿Guardar la lectura?»: la dirección puede venir de cualquier página, no solo del marcador (auditoría 27 oct 2026).
 */
export function LecturaBiblioteca({ puedeEscribir }: { puedeEscribir: boolean }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "inicio" });
  // Al llegar la respuesta la barra se completa un instante antes de mostrar el resultado.
  const [terminado, setTerminado] = useState(false);
  const iniciada = useRef(false);

  function guardar(d: string) {
    setEstado({ tipo: "leyendo" });
    void guardarLecturaBiblioteca(d)
      .catch((): ResultadoLecturaBiblioteca => ({ error: "No se pudo guardar la lectura." }))
      .then(async (r) => {
        setTerminado(true);
        // Las capturas que ya estaban abiertas en otra pestaña se actualizan solas.
        if (!r.error) avisarActualizacionInstagram();
        await esperar(450);
        setEstado({ tipo: "listo", r });
      });
  }

  useEffect(() => {
    if (iniciada.current) return;
    iniciada.current = true;
    const d = window.location.hash.match(/[#&]d=([A-Za-z0-9_-]+)/)?.[1];
    window.history.replaceState(null, "", window.location.pathname);
    // Sin nada que guardar (no llegó nada o no hay permiso) se muestra al instante.
    void Promise.resolve().then(() => setEstado(d && puedeEscribir ? { tipo: "confirmar", d } : { tipo: "sin_lectura" }));
  }, [puedeEscribir]);

  if (estado.tipo === "inicio") return null;
  if (estado.tipo === "confirmar") {
    const { d } = estado;
    return (
      <div className="flex flex-col gap-3">
        <p className={`${caja} m-0`}>Llegó una lectura de la Biblioteca de anuncios. ¿Guardarla en las capturas de Instagram?</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => guardar(d)}>
            Guardar lectura
          </Button>
          <VolverAInstagram />
        </div>
      </div>
    );
  }
  if (estado.tipo === "leyendo") return <ProgresoEstimado pasos={PASOS} estimadoMs={5000} terminado={terminado} etiqueta="Guardando la lectura de la Biblioteca" />;
  if (estado.tipo === "sin_lectura") {
    return (
      <div className="flex flex-col gap-3">
        <p className={`${caja} m-0 text-muted-foreground`}>{puedeEscribir ? "No llegó ninguna lectura. Abre la Biblioteca desde la ficha de una captura y pulsa el marcador." : "Tu rol solo puede ver Instagram: no puede guardar lecturas de la Biblioteca."}</p>
        <VolverAInstagram />
      </div>
    );
  }

  const { r } = estado;
  if (r.error) {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className={`${caja} m-0 text-destructive`}>
          {r.error}
        </p>
        <VolverAInstagram />
      </div>
    );
  }

  const actualizadas = r.actualizadas ?? [];
  const omitidas = r.omitidas ?? [];
  const hayParaVincular = (r.sinVincular?.length ?? 0) > 0 && (r.capturas?.length ?? 0) > 0;
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="m-0 text-sm">
        Se leyeron {plural(r.leidos ?? 0, "anuncio", "anuncios")}
        {r.resultados ? ` de ~${r.resultados.toLocaleString("es-CR")} resultados` : ""}.
      </p>
      {r.parcial && (
        <p className={`${caja} m-0`}>
          <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full bg-warning align-middle" />
          La Biblioteca tiene más anuncios de los que se cargaron: baja la página hasta el final y pulsa el marcador otra vez.
        </p>
      )}
      {actualizadas.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {actualizadas.map((a) => (
            <li key={a.numero} className={`${caja} flex flex-wrap items-center gap-x-3 gap-y-1`}>
              <span className="font-medium tabular-nums">{numeroInstagram(a.numero)}</span>
              {a.pagina && <span className="text-muted-foreground">{a.pagina}</span>}
              <Badge tone="info">{`${plural(a.total, "anuncio", "anuncios")} con el mismo copy`}</Badge>
              <span className="text-muted-foreground">{plural(a.activos, "activo", "activos")}</span>
              {a.destinoNuevo && <Badge tone="success">Página de destino guardada</Badge>}
            </li>
          ))}
        </ul>
      ) : (
        omitidas.length === 0 && !hayParaVincular && <p className={`${caja} m-0 text-muted-foreground`}>Ninguna captura de Instagram coincide con los anuncios que se leyeron.</p>
      )}
      {omitidas.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {omitidas.map((o) => (
            <li key={o.numero} className={caja}>
              <span className="mr-2 font-medium tabular-nums">{numeroInstagram(o.numero)}</span>
              {o.motivo}
            </li>
          ))}
        </ul>
      )}
      {hayParaVincular && <VincularAMano anuncios={r.sinVincular ?? []} capturas={r.capturas ?? []} sinNingunaCoincidencia={actualizadas.length === 0 && omitidas.length === 0} />}
      <VolverAInstagram />
    </div>
  );
}

/**
 * Vincular a mano: los anuncios que ninguna captura reconoció se eligen y se asignan a una captura, que toma de ellos cuántos son,
 * cuántos están activos, desde cuándo circulan y la página de destino. Al marcar uno se marcan también los de la misma página y el mismo
 * copy (se pueden desmarcar). Sirve cuando el nombre de la cuenta en Instagram no es el de la página en la Biblioteca.
 */
function VincularAMano({ anuncios, capturas, sinNingunaCoincidencia }: { anuncios: AnuncioBiblioteca[]; capturas: CapturaParaVincular[]; sinNingunaCoincidencia: boolean }) {
  const [restantes, setRestantes] = useState(anuncios);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [capturaId, setCapturaId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vinculadas, setVinculadas] = useState<(ResultadoVinculo & { numero: number })[]>([]);

  function alternar(a: AnuncioBiblioteca) {
    setMarcados((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(a.id)) {
        nuevo.delete(a.id);
        return nuevo;
      }
      nuevo.add(a.id);
      for (const otro of restantes) if (mismaPagina(a.pagina, otro.pagina) && mismoCopy(a.copy, otro.copy)) nuevo.add(otro.id);
      return nuevo;
    });
  }

  async function vincular() {
    const elegidos = restantes.filter((a) => marcados.has(a.id));
    if (guardando || elegidos.length === 0 || !capturaId) return;
    setGuardando(true);
    setError(null);
    const r: ResultadoVinculo = await vincularAnunciosACaptura(capturaId, elegidos).catch(() => ({ error: "No se pudo vincular." }));
    setGuardando(false);
    if (r.error || r.numero === undefined) {
      setError(r.error ?? "No se pudo vincular.");
      return;
    }
    setVinculadas((v) => [...v, { ...r, numero: r.numero as number }]);
    setRestantes((actual) => actual.filter((a) => !marcados.has(a.id)));
    setMarcados(new Set());
    setCapturaId("");
  }

  const puedeVincular = !guardando && marcados.size > 0 && capturaId !== "";
  return (
    <section aria-labelledby="titulo-vincular" className="flex flex-col gap-3">
      <h2 id="titulo-vincular" className="m-0 text-sm font-semibold">
        {sinNingunaCoincidencia ? "Ninguna captura coincide: vincular a mano" : "Vincular a mano"}
      </h2>
      {vinculadas.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {vinculadas.map((v, i) => (
            <li key={i} role="status" className={`${caja} flex flex-wrap items-center gap-x-3 gap-y-1`}>
              <span className="font-medium tabular-nums">{numeroInstagram(v.numero)}</span>
              <Badge tone="info">{plural(v.total ?? 0, "anuncio vinculado", "anuncios vinculados")}</Badge>
              <span className="text-muted-foreground">{plural(v.activos ?? 0, "activo", "activos")}</span>
              {v.destinoNuevo && <Badge tone="success">Página de destino guardada</Badge>}
            </li>
          ))}
        </ul>
      )}
      {restantes.length > 0 ? (
        <>
          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className={`${labelClass} mb-1`}>Anuncios leídos</legend>
            <ul className="m-0 flex max-h-96 list-none flex-col gap-2 overflow-y-auto p-0">
              {restantes.map((a) => (
                <li key={a.id}>
                  <label className={`${caja} flex cursor-pointer items-start gap-3 hover:bg-muted`}>
                    <input type="checkbox" checked={marcados.has(a.id)} onChange={() => alternar(a)} className="mt-0.5 accent-[var(--primario)]" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">{a.pagina ?? "Sin nombre de página"}</span>
                        <Badge tone={a.activo ? "success" : "neutral"}>{a.activo ? "Activo" : "Inactivo"}</Badge>
                        {a.cantidad > 1 && <Badge tone="info">{`${a.cantidad} anuncios`}</Badge>}
                        {a.desde && <span className="text-xs text-muted-foreground">{`desde el ${formatearFecha(a.desde)}`}</span>}
                      </span>
                      <span className="line-clamp-2 break-words text-muted-foreground">{a.copy || "Sin texto"}</span>
                      {a.destino && <span className="truncate text-xs text-muted-foreground">{a.destino}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Captura de Instagram</span>
            <select value={capturaId} onChange={(e) => setCapturaId(e.target.value)} className={fieldClass}>
              <option value="">Elige una captura</option>
              {capturas.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${numeroInstagram(c.numero)}${c.pagina ? ` · ${c.pagina}` : ""}${c.copy ? ` · ${c.copy.slice(0, 60)}` : ""}`}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p role="alert" className="m-0 text-sm text-destructive">
              {error}
            </p>
          )}
          {guardando && <ProgresoEstimado compacta pasos={["Vinculando los anuncios"]} estimadoMs={1500} etiqueta="Vinculando los anuncios a la captura" />}
          <Button type="button" onClick={() => void vincular()} disabled={!puedeVincular} className="self-start">
            {guardando ? "Vinculando…" : `Vincular${marcados.size > 0 ? ` ${plural(marcados.size, "anuncio", "anuncios")}` : ""}`}
          </Button>
        </>
      ) : (
        <p className={`${caja} m-0 text-muted-foreground`}>Todos los anuncios leídos ya están vinculados.</p>
      )}
    </section>
  );
}
