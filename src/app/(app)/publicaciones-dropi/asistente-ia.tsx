"use client";

/* eslint-disable @next/next/no-img-element -- imágenes de Storage */
import { useCallback, useEffect, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { ProgresoEstimado } from "@/components/ui/progreso-estimado";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { SugerenciaIcon } from "@/lib/nav-icons";
import { etiquetaTipoFoto, type TipoIA } from "@/lib/publicaciones/ia/asistente";
import { estadoAsistenteIA, generarFotoIA, obtenerAsistenteIA, planearFotosIA, proponerTextoIA, type AsistenteVista, type EstadoIA, type GuardadoIA, type PlanFotosVista } from "./ia-actions";

const botonClaro = `inline-flex h-9 items-center gap-1.5 rounded-md border border-border-control bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;
const botonOscuro = `inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`;
const botonChico = `inline-flex h-7 items-center rounded-md border border-border-control bg-card px-2 text-xs font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Panama" });

/**
 * «Resolver con IA» en una recomendación de optimización: abre el asistente de esa publicación. Para títulos y descripción, OpenAI
 * investiga el producto (Alibaba, Amazon…) y propone títulos, descripción y ángulos de venta; para fotos, decide cuáles faltan y
 * Gemini las genera. Lo generado se guarda y se sube a Dropi a mano.
 */
export function BotonAsistenteIA({ publicacionId, tipo }: { publicacionId: string; tipo: TipoIA }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className={botonClaro} onClick={() => setAbierto(true)}>
        <SugerenciaIcon aria-hidden="true" className="h-4 w-4" />
        Resolver con IA
      </button>
      {abierto && <PanelAsistente publicacionId={publicacionId} tipo={tipo} alCerrar={() => setAbierto(false)} />}
    </>
  );
}

function Copiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const { mostrarToast } = useToast();
  return (
    <button
      type="button"
      className={botonChico}
      aria-label={`Copiar ${etiqueta}`}
      onClick={() => {
        navigator.clipboard.writeText(texto).then(
          () => mostrarToast("Copiado"),
          () => mostrarToast("No se pudo copiar", "destructive"),
        );
      }}
    >
      Copiar
    </button>
  );
}

function PanelAsistente({ publicacionId, tipo, alCerrar }: { publicacionId: string; tipo: TipoIA; alCerrar: () => void }) {
  const [estado, setEstado] = useState<EstadoIA | null>(null);
  const [vista, setVista] = useState<AsistenteVista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vigente = true;
    Promise.all([estadoAsistenteIA(), obtenerAsistenteIA(publicacionId)])
      .then(([e, v]) => {
        if (!vigente) return;
        setEstado(e);
        if ("error" in v) setError(v.error);
        else setVista(v);
      })
      .catch(() => vigente && setError("No se pudo abrir el asistente."))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [publicacionId]);

  return (
    <Ventana abierto alCerrar={alCerrar} lado="centro" ancho="lg" titulo={<span className="truncate">{tipo === "texto" ? "Asistente de texto" : "Asistente de fotos"}</span>}>
      <div className="flex flex-col gap-4 p-5">
        {cargando && <p className="m-0 text-sm text-muted-foreground">Cargando…</p>}
        {error && (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        )}
        {!cargando && estado && vista && tipo === "texto" && <AsistenteTexto publicacionId={publicacionId} conectado={estado.openai} guardado={vista.texto} />}
        {!cargando && estado && vista && tipo === "fotos" && <AsistenteFotos publicacionId={publicacionId} estado={estado} guardado={vista.fotos} />}
      </div>
    </Ventana>
  );
}

function SinClave({ cual }: { cual: string }) {
  return (
    <p role="status" className="m-0 flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
      Falta conectar {cual}
    </p>
  );
}

// --- Texto -----------------------------------------------------------------------------------------------------------

export function AsistenteTexto({ publicacionId, conectado, guardado }: { publicacionId: string; conectado: boolean; guardado: AsistenteVista["texto"] }) {
  const [actual, setActual] = useState(guardado);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generar() {
    setError(null);
    setTrabajando(true);
    const r = await proponerTextoIA(publicacionId).catch(() => ({ error: "No se pudo generar. Inténtalo de nuevo." }) as { error: string; guardado?: undefined });
    setTrabajando(false);
    if (r.error) setError(r.error);
    else if (r.guardado) setActual(r.guardado);
  }

  const t = actual?.resultado;
  return (
    <>
      {!conectado && <SinClave cual="OpenAI" />}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={botonOscuro} disabled={!conectado || trabajando} onClick={generar}>
          {t ? "Volver a generar" : "Investigar y proponer"}
        </button>
        {actual && !trabajando && (
          <span className="text-xs text-muted-foreground">
            {actual.por ? `${actual.por} · ` : ""}
            {fechaHora(actual.creadoEn)}
          </span>
        )}
      </div>
      {trabajando && <ProgresoEstimado etiqueta="Generando títulos, descripción y ángulos" estimadoMs={75_000} pasos={["Investigando el producto en internet", "Mirando la foto", "Escribiendo títulos y descripción", "Armando los ángulos de venta"]} />}
      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
      {t && !trabajando && (
        <div className="flex flex-col gap-5">
          {t.titulos.length > 0 && (
            <section className="flex flex-col gap-2" aria-label="Títulos propuestos">
              <h3 className="m-0 text-sm font-semibold">Títulos</h3>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {t.titulos.map((x) => (
                  <li key={x} className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                    <span className="min-w-0 [overflow-wrap:anywhere]">{x}</span>
                    <Copiar texto={x} etiqueta="el título" />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {t.descripcion && (
            <section className="flex flex-col gap-2" aria-label="Descripción propuesta">
              <div className="flex items-center justify-between gap-3">
                <h3 className="m-0 text-sm font-semibold">Descripción</h3>
                <Copiar texto={t.descripcion} etiqueta="la descripción" />
              </div>
              <p className="m-0 max-h-72 overflow-y-auto rounded-md border border-border bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{t.descripcion}</p>
              <span className="text-xs text-muted-foreground tabular-nums">{t.descripcion.length.toLocaleString("es-PA")} caracteres</span>
            </section>
          )}
          {t.angulos.length > 0 && (
            <section className="flex flex-col gap-2" aria-label="Ángulos de venta">
              <h3 className="m-0 text-sm font-semibold">Ángulos de venta</h3>
              <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
                {t.angulos.map((a) => (
                  <li key={a.nombre} className="flex flex-col gap-1 rounded-md border border-border px-3 py-2 text-sm">
                    <span className="font-semibold">{a.nombre}</span>
                    <span className="[overflow-wrap:anywhere]">{a.gancho}</span>
                    {a.paraQuien && <span className="text-xs text-muted-foreground">Para: {a.paraQuien}</span>}
                    {a.objecion && <span className="text-xs text-muted-foreground">Resuelve: {a.objecion}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {t.notas && <p className="m-0 text-sm text-muted-foreground">{t.notas}</p>}
          {t.fuentes.length > 0 && (
            <section aria-label="Páginas consultadas" className="flex flex-col gap-1">
              <h3 className="m-0 text-sm font-semibold">Páginas consultadas</h3>
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs">
                {t.fuentes.map((f) => (
                  <li key={f.url} className="min-w-0 truncate">
                    <a href={f.url} target="_blank" rel="noreferrer noopener" className={`rounded underline underline-offset-2 ${anilloFoco}`}>
                      {f.titulo || f.url}
                    </a>
                    <span className="sr-only"> (se abre en una pestaña nueva)</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

// --- Fotos -----------------------------------------------------------------------------------------------------------

export function AsistenteFotos({ publicacionId, estado, guardado }: { publicacionId: string; estado: EstadoIA; guardado: GuardadoIA<PlanFotosVista> | null }) {
  const [plan, setPlan] = useState<GuardadoIA<PlanFotosVista> | null>(guardado);
  const [planeando, setPlaneando] = useState(false);
  const [generando, setGenerando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ocupado = planeando || generando !== null;

  const generarUna = useCallback(async (iaId: string, i: number) => {
    setGenerando(i);
    const r = await generarFotoIA(iaId, i).catch(() => ({ error: "No se pudo generar la foto. Inténtalo de nuevo." }) as { error: string; url?: undefined });
    setGenerando(null);
    setPlan((p) => {
      if (!p) return p;
      const fotos = p.resultado.fotos.map((f, k) => (k === i ? { ...f, url: r.url ?? f.url, error: r.error ?? null } : f));
      return { ...p, resultado: { ...p.resultado, fotos } };
    });
    return r;
  }, []);

  async function analizar() {
    setError(null);
    setPlaneando(true);
    const r = await planearFotosIA(publicacionId).catch(() => ({ error: "No se pudo analizar. Inténtalo de nuevo." }) as { error: string; guardado?: undefined });
    setPlaneando(false);
    if (r.error || !r.guardado) return setError(r.error ?? "No se pudo analizar.");
    setPlan(r.guardado);
    // Se generan una por una (cada una tarda): si una falla, sigue con las demás y queda anotado en su tarjeta.
    for (let i = 0; i < r.guardado.resultado.fotos.length; i++) await generarUna(r.guardado.id, i);
  }

  const fotos = plan?.resultado.fotos ?? [];
  const hechas = fotos.filter((f) => f.url).length;
  return (
    <>
      {!estado.openai && <SinClave cual="OpenAI (decide qué fotos faltan)" />}
      {!estado.gemini && <SinClave cual="Gemini (genera las fotos)" />}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={botonOscuro} disabled={!estado.openai || !estado.gemini || ocupado} onClick={analizar}>
          {plan ? "Analizar de nuevo y generar" : "Analizar y generar fotos"}
        </button>
        {plan && !ocupado && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {hechas} de {fotos.length} generadas · {fechaHora(plan.creadoEn)}
          </span>
        )}
      </div>
      {planeando && <ProgresoEstimado etiqueta="Analizando qué fotos faltan" estimadoMs={45_000} pasos={["Mirando la foto del producto", "Revisando cómo lo muestran otros vendedores", "Decidiendo qué fotos faltan"]} />}
      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
      {plan && !planeando && (
        <div className="flex flex-col gap-3">
          {plan.resultado.analisis && <p className="m-0 text-sm text-muted-foreground">{plan.resultado.analisis}</p>}
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
            {fotos.map((f, i) => (
              <li key={f.tipo} className="flex flex-col gap-2 rounded-lg border border-border p-2">
                <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                  {f.url ? (
                    <img src={f.url} alt={`${f.titulo}: foto generada`} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">{generando === i ? "Generando…" : f.error ? "No se pudo generar" : "Sin generar"}</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{f.titulo}</span>
                    {f.titulo !== etiquetaTipoFoto(f.tipo) && <span className="block text-xs text-muted-foreground">{etiquetaTipoFoto(f.tipo)}</span>}
                  </span>
                  <span className="flex shrink-0 gap-1.5">
                    {f.url && (
                      <a href={f.url} target="_blank" rel="noreferrer noopener" download className={botonChico}>
                        Descargar
                      </a>
                    )}
                    <button type="button" className={botonChico} disabled={!estado.gemini || ocupado} onClick={() => generarUna(plan.id, i)}>
                      {f.url ? "Rehacer" : "Generar"}
                    </button>
                  </span>
                </div>
                {f.error && !f.url && (
                  <p role="alert" className="m-0 text-xs text-destructive">
                    {f.error}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
