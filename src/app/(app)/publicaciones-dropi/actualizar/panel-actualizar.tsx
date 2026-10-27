"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { pedirExtension, type AvanceLector, type SesionDropi } from "@/lib/dropi-actualizar/extension";
import { CUENTAS, GRUPOS, LECTORES, PARTES, lectoresDe, sesionValida, type ClaveLector, type ClaveParte } from "@/lib/dropi-actualizar/partes";
import { archivosSubidos, empezarActualizacion, marcarPartesConError, procesarParte, subidasDeLector, terminarActualizacion } from "./actions";
import type { Corrida, UltimaParte } from "./datos";

type EstadoExtension = "buscando" | "lista" | "no_instalada" | "recargar";
type EstadoPaso = "espera" | "leyendo" | "procesando" | "listo" | "error";
interface Paso {
  estado: EstadoPaso;
  detalle: string;
}
interface Corriendo {
  id: string;
  pedidas: ClaveParte[];
  pasos: Partial<Record<ClaveParte, Paso>>;
  /** Lo que muestra la barra: «Leyendo pedidos: 4.200…». */
  avance: string;
  esperandoSesion: boolean;
  terminado: string | null;
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const n = (x: unknown) => Number(x ?? 0).toLocaleString("es-PA");
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });
const boton = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 ${anilloFoco}`;
const botonSecundario = `${boton} border border-border-control bg-card hover:bg-muted`;
const botonPrincipal = `${boton} bg-foreground text-background hover:bg-foreground/85`;
// Lo mismo que usa el servidor: una que lleva más de 40 minutos «corriendo» ya no se retoma ni bloquea.
const VIGENCIA_MS = 40 * 60000;

/** Lo que dice la barra mientras un lector trabaja en la pestaña de Dropi. */
function textoAvance(lector: ClaveLector, a: AvanceLector | null): string {
  if (!a) return "Arrancando en la pestaña de Dropi…";
  if (lector === "proveedor") {
    if (a.fase === "pedidos") return `Leyendo pedidos en Dropi: ${n(a.pedidos)}…`;
    if (a.fase === "cartera") return `Leyendo la cartera: ${n(a.cartera)} movimientos…`;
    if (a.fase === "retiros") return "Leyendo los retiros…";
    if (a.fase === "stock") return `Leyendo el stock: ${n(a.productos)} productos…`;
    if (a.fase === "subida") return "Pasando lo leído al sistema…";
    return "Leyendo en Dropi…";
  }
  if (a.fase === "productos") return `Listando los productos: ${n(a.productos)}…`;
  if (a.productos) return `Leyendo las ventas: producto ${n(a.hechos)} de ${n(a.productos)}…`;
  return "Leyendo las ventas en Dropi…";
}

/**
 * El panel «Actualizar Dropi» (boceto aprobado el 26 oct 2026): las cuentas de Dropi con su sesión, qué se actualiza y cuándo fue
 * la última vez, y el botón que lo corre con la extensión «Ecomfive · Dropi». Mientras corre: el avance de cada parte y, si falta
 * iniciar sesión, la pestaña de Dropi al frente y un aviso; al entrar, sigue sola. La que manda es esta página: si se recarga (o se
 * recarga la extensión) a medias, al volver la retoma sola con la barra y lo que está haciendo (27 oct 2026, pedido de Hernán).
 */
export function PanelActualizarDropi({ disponible, corridas, ultima }: { disponible: boolean; corridas: Corrida[]; ultima: Partial<Record<ClaveParte, UltimaParte>> }) {
  const router = useRouter();
  const [extension, setExtension] = useState<EstadoExtension>("buscando");
  const [version, setVersion] = useState<string | null>(null);
  const [sesionPa, setSesionPa] = useState<SesionDropi | null>(null);
  const [corriendo, setCorriendo] = useState<Corriendo | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [elegidos, setElegidos] = useState<ClaveLector[]>(["proveedor", "ventas"]);
  const [error, setError] = useState<string | null>(null);
  const detener = useRef(false);
  // Mientras arranca (antes de que el servidor responda) los botones ya no sirven: un doble clic arrancaba dos.
  const arrancando = useRef(false);
  const [empezando, setEmpezando] = useState(false);
  const retomada = useRef(false);

  const revisarSesion = useCallback(async (abrir: boolean) => {
    const s = await pedirExtension<SesionDropi>({ tipo: "sesion", pais: "pa", abrir }, abrir ? 45000 : 10000);
    setSesionPa(s);
    return s;
  }, []);

  // ¿Está la extensión? (el puente puede tardar un instante en cargar: se pregunta unas veces).
  useEffect(() => {
    let vivo = true;
    void (async () => {
      for (let i = 0; i < 4 && vivo; i++) {
        try {
          const r = await pedirExtension<{ version: string }>({ tipo: "hola" }, 1500);
          if (!vivo) return;
          setVersion(r.version);
          setExtension("lista");
          await revisarSesion(false).catch(() => null);
          return;
        } catch (e) {
          // La extensión se recargó con esta página abierta: el puente viejo ya no llega a ella.
          if (e instanceof Error && e.message === "EXTENSION_ACTUALIZADA") {
            if (vivo) setExtension("recargar");
            return;
          }
          await esperar(500);
        }
      }
      if (vivo) setExtension("no_instalada");
    })();
    return () => {
      vivo = false;
    };
  }, [revisarSesion]);

  const ponerPaso = (clave: ClaveParte, paso: Paso) => setCorriendo((c) => (c ? { ...c, pasos: { ...c.pasos, [clave]: paso } } : c));
  const ponerAvance = (avance: string, esperandoSesion = false) => setCorriendo((c) => (c ? { ...c, avance, esperandoSesion } : c));

  /** Espera a que la pestaña de Panamá tenga la sesión de ECOMFIVE: si falta, la pone al frente y avisa. */
  async function asegurarSesion(): Promise<boolean> {
    let mostrada = false;
    while (!detener.current) {
      const s = await revisarSesion(true).catch(() => null);
      if (sesionValida("pa", s) === "ok") {
        ponerAvance("Sesión de Dropi Panamá lista.");
        return true;
      }
      if (!mostrada) {
        await pedirExtension({ tipo: "mostrar", pais: "pa" }).catch(() => null);
        mostrada = true;
      }
      ponerAvance("Esperando que inicies sesión en Dropi Panamá…", true);
      await esperar(3000);
    }
    return false;
  }

  async function actualizar(lectores: ClaveLector[]) {
    if (arrancando.current || (corriendo && !corriendo.terminado)) return;
    arrancando.current = true;
    setEmpezando(true);
    setError(null);
    detener.current = false;
    const partes = PARTES.filter((p) => lectores.includes(p.lector)).map((p) => p.clave);
    const r = await empezarActualizacion(partes).catch(() => ({ error: "No se pudo empezar la actualización.", id: undefined, subidas: undefined }));
    setEmpezando(false);
    if (r.error || !r.id || !r.subidas) {
      arrancando.current = false;
      return setError(r.error ?? "No se pudo empezar la actualización.");
    }
    setCorriendo({ id: r.id, pedidas: partes, pasos: Object.fromEntries(partes.map((p) => [p, { estado: "espera", detalle: "En espera" }])), avance: "Revisando la sesión de Dropi…", esperandoSesion: false, terminado: null });
    await correr(r.id, partes, r.subidas, [], false);
  }

  /**
   * Corre (o retoma) una actualización: por cada lector, lee en Dropi con la extensión y guarda cada parte. Al retomar se saltan las
   * partes que ya quedaron guardadas; si la extensión ya subió lo leído, se guarda sin volver a leer; si la pestaña de Dropi sigue
   * leyendo, se espera; y si no, se vuelve a lanzar la lectura con direcciones de subida nuevas.
   */
  async function correr(id: string, partes: ClaveParte[], subidas: Partial<Record<ClaveLector, Record<string, string>>>, hechas: ClaveParte[], retomando: boolean) {
    for (const lector of lectoresDe(partes)) {
      if (detener.current) break;
      const suyas = PARTES.filter((p) => p.lector === lector && partes.includes(p.clave) && !hechas.includes(p.clave)).map((p) => p.clave);
      if (!suyas.length) continue;
      let fallo: string | null = null;
      // Al retomar: ¿la extensión ya subió todo lo de este lector? Entonces solo falta guardarlo.
      const subidos = retomando ? ((await archivosSubidos(id).catch(() => null))?.archivos ?? []) : [];
      const yaLeido = retomando && LECTORES[lector].archivos.every((a) => subidos.includes(a));
      try {
        if (!yaLeido) {
          // Al retomar: ¿la pestaña de Dropi sigue leyendo? Entonces se espera sin lanzar otra lectura.
          const previo = retomando ? await pedirExtension<AvanceLector | null>({ tipo: "avance", lector }).catch(() => null) : null;
          if (!previo || previo.fin) {
            if (!(await asegurarSesion())) break;
            let subida = subidas[lector];
            if (!subida) {
              const s = await subidasDeLector(id, lector).catch(() => ({ error: "No se pudo preparar la subida.", subida: undefined }));
              if (s.error || !s.subida) throw new Error(s.error ?? "No se pudo preparar la subida.");
              subida = s.subida;
            }
            for (const p of suyas) ponerPaso(p, { estado: "leyendo", detalle: "Leyendo en Dropi…" });
            await pedirExtension({ tipo: "lanzar", lector, subida }, 45000);
          } else {
            for (const p of suyas) ponerPaso(p, { estado: "leyendo", detalle: "Leyendo en Dropi…" });
            ponerAvance(textoAvance(lector, previo));
          }
          fallo = await esperarLector(lector);
        }
      } catch (e) {
        fallo = e instanceof Error ? e.message : String(e);
      }
      if (fallo) {
        const sesion = /401|sesi[oó]n/i.test(fallo);
        for (const p of suyas) ponerPaso(p, { estado: "error", detalle: sesion ? "La sesión de Dropi venció en medio: vuelve a pulsar «Actualizar»." : fallo });
        await marcarPartesConError(id, suyas, fallo).catch(() => null);
        continue;
      }
      for (const p of suyas) {
        ponerPaso(p, { estado: "procesando", detalle: "Guardando en el sistema…" });
        ponerAvance(`Guardando ${PARTES.find((x) => x.clave === p)?.etiqueta.toLowerCase()}…`);
        const res = await procesarParte(id, p).catch(() => ({ error: "No se pudo guardar (tardó demasiado o se cortó).", resumen: undefined, avisos: undefined }));
        ponerPaso(p, res.error ? { estado: "error", detalle: res.error } : { estado: "listo", detalle: res.resumen ?? "Listo" });
      }
    }
    const fin = await terminarActualizacion(id, detener.current).catch(() => ({ estado: undefined }));
    setCorriendo((c) => (c ? { ...c, avance: "", esperandoSesion: false, terminado: fin.estado ?? "con_fallos" } : c));
    arrancando.current = false;
    router.refresh();
  }

  /** Espera a que el lector termine en la pestaña de Dropi, mostrando lo que va leyendo. Devuelve el error o null. */
  async function esperarLector(lector: ClaveLector): Promise<string | null> {
    let perdido = 0;
    for (;;) {
      await esperar(3000);
      if (detener.current) return "Detenida.";
      const a = await pedirExtension<AvanceLector | null>({ tipo: "avance", lector }).catch(() => null);
      // Sin respuesta de la pestaña durante un minuto (se cerró o se recargó Dropi): se corta en vez de esperar para siempre.
      perdido = a ? 0 : perdido + 1;
      if (perdido >= 20) return "Se perdió la pestaña de Dropi mientras se leía: vuelve a pulsar «Actualizar».";
      if (a) ponerAvance(textoAvance(lector, a));
      if (a?.fin) return a.error ?? null;
    }
  }

  // Al abrir la página con una actualización todavía en curso (se recargó a medias), se retoma: barra, lo que hace y lo que falta.
  useEffect(() => {
    if (extension !== "lista" || retomada.current || arrancando.current) return;
    const c = corridas.find((x) => x.estado === "corriendo" && Date.now() - new Date(x.inicio).getTime() < VIGENCIA_MS);
    if (!c) return;
    retomada.current = true;
    arrancando.current = true;
    detener.current = false;
    const hechas = c.pedidas.filter((p) => c.partes[p]?.estado === "listo" || c.partes[p]?.estado === "error");
    const pasos = Object.fromEntries(
      c.pedidas.map((p): [ClaveParte, Paso] => {
        const x = c.partes[p];
        if (x?.estado === "listo") return [p, { estado: "listo", detalle: x.resumen ?? "Listo" }];
        if (x?.estado === "error") return [p, { estado: "error", detalle: x.error ?? "No se pudo" }];
        return [p, { estado: "espera", detalle: "En espera" }];
      }),
    );
    void Promise.resolve().then(() => {
      setCorriendo({ id: c.id, pedidas: c.pedidas, pasos, avance: `Retomando la actualización de las ${hora(c.inicio)}…`, esperandoSesion: false, terminado: null });
      void correr(c.id, c.pedidas, {}, hechas, true);
    });
    // `correr` usa el estado más reciente por sus propios setters; solo importa que la extensión ya respondió.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extension, corridas]);

  // Mientras corre, cerrar o recargar la página la interrumpe: el navegador pregunta antes.
  const enMarcha = !!corriendo && !corriendo.terminado;
  useEffect(() => {
    if (!enMarcha) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [enMarcha]);

  if (!disponible)
    return (
      <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
        Falta correr en Supabase la migración 0154 para usar «Actualizar datos».
      </p>
    );

  const estadoPa = sesionPa ? (sesionPa.pestana ? sesionValida("pa", sesionPa) : "sin_pestana") : null;
  const ocupado = empezando || (!!corriendo && !corriendo.terminado);
  const hechos = corriendo ? corriendo.pedidas.filter((p) => ["listo", "error"].includes(corriendo.pasos[p]?.estado ?? "")).length : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-3xl flex-col gap-1">
          <Link href="/publicaciones-dropi" className="w-fit text-sm text-muted-foreground hover:text-foreground">
            ← Gestión de IDs Dropi
          </Link>
          <h1 className="m-0 text-2xl font-bold">{ocupado ? "Actualizando datos…" : "Actualizar datos"}</h1>
          <p className="m-0 text-sm text-muted-foreground">
            Trae de Dropi los pedidos, la cartera, los retiros, el stock y las ventas. Solo lee: no crea ni cambia nada en Dropi ni en tus publicaciones.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ocupado ? (
            <button type="button" className={botonSecundario} onClick={() => (detener.current = true)}>
              Detener
            </button>
          ) : (
            <>
              <button type="button" className={botonSecundario} aria-expanded={eligiendo} onClick={() => setEligiendo((v) => !v)} disabled={extension !== "lista"}>
                Elegir qué actualizar
              </button>
              <button type="button" className={botonPrincipal} onClick={() => void actualizar(["proveedor", "ventas"])} disabled={extension !== "lista"}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-3-6.7" />
                  <path d="M21 3v6h-6" />
                </svg>
                Actualizar todo
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {extension === "recargar" && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-warning/40 bg-warning/10 px-5 py-4 text-sm">
          <span>
            <span className="font-semibold">La extensión «Ecomfive · Dropi» se actualizó.</span> Recarga esta página para seguir.
          </span>
          <button type="button" className={botonPrincipal} onClick={() => window.location.reload()}>
            Recargar
          </button>
        </div>
      )}

      {extension === "no_instalada" && (
        <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-warning/40 bg-warning/10 px-5 py-4 text-sm">
          <span className="font-semibold">Falta la extensión «Ecomfive · Dropi» en este Chrome.</span>
          <span>
            Se instala una vez: en Chrome abre <code className="rounded bg-muted px-1">chrome://extensions</code>, activa «Modo de desarrollador», pulsa «Cargar
            descomprimida» y elige la carpeta <code className="rounded bg-muted px-1">extension/ecomfive-dropi</code> del sistema. Después vuelve a cargar esta página.
          </span>
        </div>
      )}

      {eligiendo && !ocupado && (
        <fieldset className="m-0 flex flex-wrap items-end gap-4 rounded-2xl border border-border bg-card px-5 py-4">
          <legend className="sr-only">Qué actualizar</legend>
          {GRUPOS.map((g) => (
            <label key={g.lector} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 accent-foreground"
                checked={elegidos.includes(g.lector)}
                onChange={(e) => setElegidos((x) => (e.target.checked ? [...x, g.lector] : x.filter((y) => y !== g.lector)))}
              />
              <span className="flex flex-col">
                <span className="font-semibold">{g.etiqueta}</span>
                <span className="text-xs text-muted-foreground">{g.detalle}</span>
              </span>
            </label>
          ))}
          <button type="button" className={botonPrincipal} disabled={!elegidos.length} onClick={() => void actualizar(elegidos)}>
            Actualizar lo elegido
          </button>
        </fieldset>
      )}

      {corriendo && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {hechos} de {corriendo.pedidas.length} partes
            </span>
            <span aria-live="polite">{corriendo.terminado ? `Terminó: ${corriendo.terminado === "listo" ? "todo al día" : corriendo.terminado === "detenido" ? "detenida" : "con fallos"}` : corriendo.avance}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={corriendo.pedidas.length} aria-valuenow={hechos}>
            <div className="h-full rounded-full bg-foreground transition-[width]" style={{ width: `${(hechos / Math.max(1, corriendo.pedidas.length)) * 100}%` }} />
          </div>
        </div>
      )}

      {corriendo?.esperandoSesion && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-warning/50 bg-warning/10 px-5 py-4">
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Falta iniciar sesión en Dropi Panamá</span>
            <span>Te dejamos la pestaña de Dropi al frente. Entra con la {CUENTAS.pa.cuenta} (con el código de dos pasos) y la actualización sigue sola.</span>
          </div>
          <button type="button" className={botonPrincipal} onClick={() => void pedirExtension({ tipo: "mostrar", pais: "pa" }).catch(() => null)}>
            Ir a la pestaña de Panamá
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <TarjetaCuenta
          sigla="PA"
          titulo={CUENTAS.pa.nombre}
          detalle={`app.dropi.pa · ${CUENTAS.pa.cuenta}`}
          estado={estadoPa}
          vence={sesionPa?.vence ?? null}
          alAbrir={extension === "lista" ? () => void pedirExtension({ tipo: "mostrar", pais: "pa" }).then(() => revisarSesion(false)).catch(() => null) : undefined}
          alRevisar={extension === "lista" ? () => void revisarSesion(false).catch(() => null) : undefined}
          que="Pedidos, cartera, retiros, stock y ventas"
        />
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-card px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-sm font-bold">MX</span>
            <div className="flex flex-col">
              <span className="font-semibold">México y competencia de Panamá</span>
              <span className="text-sm text-muted-foreground">Siguiente etapa</span>
            </div>
          </div>
          <span className="text-sm text-muted-foreground">Los proveedores de Scraping (México) y la competencia del catálogo de Panamá siguen por ahora con la tarea programada de las 5:00.</span>
        </div>
      </div>

      <section aria-labelledby="que-se-actualiza" className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <h2 id="que-se-actualiza" className="m-0 text-base font-semibold">
            Qué se actualiza
          </h2>
          {extension === "lista" && <span className="text-xs text-muted-foreground">Extensión «Ecomfive · Dropi» {version} conectada</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="px-5 py-2.5 font-semibold">
                  Parte
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  País
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Dónde se ve
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  {corriendo ? "Ahora" : "Última vez"}
                </th>
                <th scope="col" className="px-5 py-2.5 font-semibold">
                  Resultado
                </th>
              </tr>
            </thead>
            <tbody>
              {PARTES.map((p) => {
                const paso = corriendo?.pasos[p.clave];
                const u = ultima[p.clave];
                return (
                  <tr key={p.clave} className="border-t border-border">
                    <td className="px-5 py-3 font-semibold">{p.etiqueta}</td>
                    <td className="px-3 py-3">{p.pais.toUpperCase()}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      <Link href={p.ruta} className="hover:text-foreground hover:underline">
                        {p.donde}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{paso ? <EtiquetaPaso estado={paso.estado} /> : u ? `${fechaHora(u.fecha)}${u.porTarea ? " · tarea" : ""}` : "—"}</td>
                    <td className="px-5 py-3">
                      {paso ? (
                        <span className={paso.estado === "error" ? "text-destructive" : ""}>{paso.detalle}</span>
                      ) : u ? (
                        <span className={u.estado === "error" ? "text-destructive" : ""}>{u.detalle || (u.estado === "listo" ? "Listo" : "Error")}</span>
                      ) : (
                        <span className="text-muted-foreground">Todavía no se actualizó desde aquí</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="historial" className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-5 py-4">
        <h2 id="historial" className="m-0 text-base font-semibold">
          Historial
        </h2>
        {corridas.length === 0 ? (
          <span className="text-sm text-muted-foreground">Todavía no se usó «Actualizar datos».</span>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
            {corridas.slice(0, 10).map((c) => {
              const listas = c.pedidas.filter((p) => c.partes[p]?.estado === "listo").length;
              const minutos = c.fin ? Math.max(1, Math.round((new Date(c.fin).getTime() - new Date(c.inicio).getTime()) / 60000)) : null;
              return (
                <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                  <span>
                    {fechaHora(c.inicio)} · {c.origen === "automatica" ? "automática" : c.quien}
                    {c.pedidas.length < PARTES.length ? ` · ${c.pedidas.map((p) => PARTES.find((x) => x.clave === p)?.etiqueta.split(" (")[0]).join(", ")}` : ""}
                  </span>
                  <span className={c.estado === "listo" ? "text-success" : c.estado === "corriendo" ? "text-muted-foreground" : "text-warning"}>
                    {c.estado === "corriendo" ? `En curso desde las ${hora(c.inicio)}` : c.estado === "detenido" ? "Detenida" : `${listas} de ${c.pedidas.length} partes`}
                    {minutos ? ` · ${minutos} min` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function EtiquetaPaso({ estado }: { estado: EstadoPaso }) {
  const t: Record<EstadoPaso, [string, string]> = {
    espera: ["En espera", "text-muted-foreground"],
    leyendo: ["Leyendo en Dropi", "text-foreground"],
    procesando: ["Guardando", "text-foreground"],
    listo: ["Listo", "text-success font-semibold"],
    error: ["No se pudo", "text-destructive font-semibold"],
  };
  return <span className={t[estado][1]}>{t[estado][0]}</span>;
}

function TarjetaCuenta({
  sigla,
  titulo,
  detalle,
  estado,
  vence,
  que,
  alAbrir,
  alRevisar,
}: {
  sigla: string;
  titulo: string;
  detalle: string;
  estado: ReturnType<typeof sesionValida> | "sin_pestana" | null;
  vence: string | null;
  que: string;
  alAbrir?: () => void;
  alRevisar?: () => void;
}) {
  const chip: Record<string, [string, string]> = {
    ok: ["Sesión activa", "bg-success/10 text-success"],
    sin_sesion: ["Sin sesión", "bg-destructive/10 text-destructive"],
    vencida: ["Sesión vencida", "bg-destructive/10 text-destructive"],
    otra_cuenta: ["Otra cuenta", "bg-warning/10 text-warning"],
    sin_pestana: ["Dropi no está abierto", "bg-muted text-muted-foreground"],
  };
  const [texto, clase] = estado ? chip[estado] : ["Revisando…", "bg-muted text-muted-foreground"];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FFE9DB] text-sm font-bold text-[#9A3412]">{sigla}</span>
          <div className="flex flex-col">
            <span className="font-semibold">{titulo}</span>
            <span className="text-sm text-muted-foreground">{detalle}</span>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${clase}`}>
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
          {texto}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>
          {estado === "ok" && vence
            ? `Vence ${fechaHora(vence)}.`
            : estado === "otra_cuenta"
              ? "La pestaña tiene otra cuenta: entra con la de ECOMFIVE."
              : estado === "sin_pestana"
                ? "Se abre solo al actualizar."
                : estado
                  ? "Inicia sesión con la cuenta de ECOMFIVE."
                  : ""}
        </span>
        <span className="flex gap-2">
          {alRevisar && (
            <button type="button" className={botonSecundario} onClick={alRevisar}>
              Revisar
            </button>
          )}
          {alAbrir && estado !== "ok" && (
            <button type="button" className={botonSecundario} onClick={alAbrir}>
              Abrir Dropi {sigla === "PA" ? "Panamá" : sigla}
            </button>
          )}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">{que}</span>
    </div>
  );
}
