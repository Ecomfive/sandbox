"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { pedirExtension, type AvanceLector, type SesionDropi } from "@/lib/dropi-actualizar/extension";
import { CUENTAS, GRUPOS, LECTORES, LECTORES_PAIS, PARTES, archivoSubido, diasPrimeraLectura, lectoresDe, sesionValida, type ClaveLector, type ClaveParte } from "@/lib/dropi-actualizar/partes";
import { archivosSubidos, empezarActualizacion, marcarPartesConError, procesarParte, subidasDeLector, terminarActualizacion } from "./actions";
import type { Corrida, UltimaParte } from "./datos";

type EstadoExtension = "buscando" | "lista" | "no_instalada" | "recargar";
/** Los países que se actualizan desde aquí con la cuenta de proveedor. */
type PaisProveedor = "pa" | "cr";
const PAISES: PaisProveedor[] = ["pa", "cr"];

/** Costa Rica llegó a la extensión en la 0.3.0 (28 oct 2026): una anterior no sabe de ese país y no responde por él. */
const VERSION_PARA: Record<PaisProveedor, string> = { pa: "0.0.0", cr: "0.3.0" };
/** «0.2.3» es anterior a «0.3.0». */
const versionAnterior = (tiene: string | null, pide: string) => {
  if (!tiene) return false;
  const a = tiene.split(".").map(Number);
  const b = pide.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  return false;
};
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
  /** El país cuya sesión falta (la pestaña queda al frente y se avisa), o null. */
  esperandoSesion: PaisProveedor | null;
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
  if (lector.startsWith("proveedor")) {
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
 * Costa Rica (28 oct 2026): su propia tarjeta y sus propias partes; cada lector usa la pestaña y la sesión de su país. Cada país se
 * actualiza por separado (Hernán: los dos juntos es mucha carga y tarda mucho más), con su botón; no hay «Actualizar todo».
 */
export function PanelActualizarDropi({ disponible, corridas, ultima }: { disponible: boolean; corridas: Corrida[]; ultima: Partial<Record<ClaveParte, UltimaParte>> }) {
  const router = useRouter();
  const [extension, setExtension] = useState<EstadoExtension>("buscando");
  const [version, setVersion] = useState<string | null>(null);
  const [sesiones, setSesiones] = useState<Record<PaisProveedor, SesionDropi | null>>({ pa: null, cr: null });
  /** Por qué no se pudo revisar la sesión de un país (la extensión no respondió); antes se callaba y la tarjeta quedaba en «Revisando…». */
  const [fallos, setFallos] = useState<Record<PaisProveedor, string | null>>({ pa: null, cr: null });
  const [corriendo, setCorriendo] = useState<Corriendo | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [elegidos, setElegidos] = useState<ClaveLector[]>([...LECTORES_PAIS.pa, ...LECTORES_PAIS.cr]);
  const [error, setError] = useState<string | null>(null);
  const detener = useRef(false);
  // Mientras arranca (antes de que el servidor responda) los botones ya no sirven: un doble clic arrancaba dos.
  const arrancando = useRef(false);
  const [empezando, setEmpezando] = useState(false);
  const retomada = useRef(false);

  const revisarSesion = useCallback(async (pais: PaisProveedor, abrir: boolean) => {
    try {
      const s = await pedirExtension<SesionDropi>({ tipo: "sesion", pais, abrir }, abrir ? 45000 : 10000);
      setSesiones((x) => ({ ...x, [pais]: s }));
      setFallos((x) => ({ ...x, [pais]: null }));
      return s;
    } catch (e) {
      setFallos((x) => ({ ...x, [pais]: e instanceof Error ? e.message : "La extensión no respondió." }));
      throw e;
    }
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
          for (const p of PAISES) await revisarSesion(p, false).catch(() => null);
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
  const ponerAvance = (avance: string, esperandoSesion: PaisProveedor | null = null) => setCorriendo((c) => (c ? { ...c, avance, esperandoSesion } : c));

  /** Espera a que la pestaña del país tenga la sesión de proveedor: si falta, la pone al frente y avisa. */
  async function asegurarSesion(pais: PaisProveedor): Promise<boolean> {
    let mostrada = false;
    while (!detener.current) {
      const s = await revisarSesion(pais, true).catch(() => null);
      if (sesionValida(pais, s) === "ok") {
        ponerAvance(`Sesión de Dropi ${CUENTAS[pais].nombre} lista.`);
        return true;
      }
      if (!mostrada) {
        await pedirExtension({ tipo: "mostrar", pais }).catch(() => null);
        mostrada = true;
      }
      ponerAvance(`Esperando que inicies sesión en Dropi ${CUENTAS[pais].nombre}…`, pais);
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
    setCorriendo({ id: r.id, pedidas: partes, pasos: Object.fromEntries(partes.map((p) => [p, { estado: "espera", detalle: "En espera" }])), avance: "Revisando la sesión de Dropi…", esperandoSesion: null, terminado: null });
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
      const yaLeido = retomando && LECTORES[lector].archivos.every((a) => subidos.includes(archivoSubido(lector, a)));
      const pais = LECTORES[lector].pais as PaisProveedor;
      try {
        if (!yaLeido) {
          // Al retomar: ¿la pestaña de Dropi sigue leyendo? Entonces se espera sin lanzar otra lectura.
          const previo = retomando ? await pedirExtension<AvanceLector | null>({ tipo: "avance", lector }).catch(() => null) : null;
          if (!previo || previo.fin) {
            if (!(await asegurarSesion(pais))) break;
            let subida = subidas[lector];
            if (!subida) {
              const s = await subidasDeLector(id, lector).catch(() => ({ error: "No se pudo preparar la subida.", subida: undefined }));
              if (s.error || !s.subida) throw new Error(s.error ?? "No se pudo preparar la subida.");
              subida = s.subida;
            }
            for (const p of suyas) ponerPaso(p, { estado: "leyendo", detalle: "Leyendo en Dropi…" });
            // La primera vez que se leen los pedidos de un país, desde su fecha de arranque (Costa Rica: 1 de septiembre).
            const primera = lector.startsWith("proveedor") && !ultima[pais === "pa" ? "pedidos" : "pedidos_cr"] ? diasPrimeraLectura(pais) : null;
            await pedirExtension({ tipo: "lanzar", lector, subida, dias: primera }, 45000);
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
    setCorriendo((c) => (c ? { ...c, avance: "", esperandoSesion: null, terminado: fin.estado ?? "con_fallos" } : c));
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
      setCorriendo({ id: c.id, pedidas: c.pedidas, pasos, avance: `Retomando la actualización de las ${hora(c.inicio)}…`, esperandoSesion: null, terminado: null });
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

  const estadoDe = (p: PaisProveedor) => {
    const s = sesiones[p];
    return s ? (s.pestana ? sesionValida(p, s) : "sin_pestana") : null;
  };
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
            Trae de Dropi los pedidos, la cartera, los retiros, el stock y las ventas, de un país a la vez. Solo lee: no crea ni cambia nada en Dropi ni en tus
            publicaciones (la primera vez de un país crea sus publicaciones).
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
              {PAISES.map((p, i) => (
                <button key={p} type="button" className={i === 0 ? botonPrincipal : botonSecundario} onClick={() => void actualizar(LECTORES_PAIS[p])} disabled={extension !== "lista"}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12a9 9 0 1 1-3-6.7" />
                    <path d="M21 3v6h-6" />
                  </svg>
                  Actualizar {CUENTAS[p].nombre}
                </button>
              ))}
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
        <div className="flex flex-col gap-3">
          {PAISES.map((p) => {
            const suyos = elegidos.filter((l) => LECTORES[l].pais === p);
            return (
              <fieldset key={p} className="m-0 flex flex-wrap items-end gap-4 rounded-2xl border border-border bg-card px-5 py-4">
                <legend className="sr-only">Qué actualizar de {CUENTAS[p].nombre}</legend>
                <span className="flex min-h-11 w-28 items-center text-sm font-semibold">{CUENTAS[p].nombre}</span>
                {GRUPOS.filter((g) => LECTORES[g.lector].pais === p).map((g) => (
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
                <button type="button" className={botonPrincipal} disabled={!suyos.length} onClick={() => void actualizar(suyos)}>
                  Actualizar lo elegido de {CUENTAS[p].nombre}
                </button>
              </fieldset>
            );
          })}
        </div>
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
            <span className="font-semibold">Falta iniciar sesión en Dropi {CUENTAS[corriendo.esperandoSesion].nombre}</span>
            <span>
              Te dejamos la pestaña de Dropi al frente. Entra con la {CUENTAS[corriendo.esperandoSesion].cuenta} (con el código de dos pasos) y la actualización sigue sola.
            </span>
          </div>
          <button type="button" className={botonPrincipal} onClick={() => void pedirExtension({ tipo: "mostrar", pais: corriendo.esperandoSesion! }).catch(() => null)}>
            Ir a la pestaña de {CUENTAS[corriendo.esperandoSesion].nombre}
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PAISES.map((p) => (
          <TarjetaCuenta
            key={p}
            sigla={p.toUpperCase()}
            titulo={CUENTAS[p].nombre}
            detalle={`${CUENTAS[p].origen.replace("https://", "")} · ${CUENTAS[p].cuenta}`}
            cuenta={CUENTAS[p].cuenta}
            estado={estadoDe(p)}
            vence={sesiones[p]?.vence ?? null}
            fallo={fallos[p]}
            extensionVieja={extension === "lista" && versionAnterior(version, VERSION_PARA[p]) ? { tiene: version ?? "", pide: VERSION_PARA[p] } : null}
            origen={CUENTAS[p].origen}
            alAbrir={
              extension === "lista"
                ? () =>
                    void pedirExtension({ tipo: "mostrar", pais: p }, 10000)
                      .then(() => revisarSesion(p, false))
                      .catch((e) => setFallos((x) => ({ ...x, [p]: e instanceof Error ? e.message : "La extensión no respondió." })))
                : undefined
            }
            alRevisar={extension === "lista" ? () => void revisarSesion(p, false).catch(() => null) : undefined}
            que={p === "cr" && !ultima.stock_cr ? "Pedidos (desde el 1 de septiembre), cartera, retiros, stock y ventas · la primera vez crea sus publicaciones" : "Pedidos, cartera, retiros, stock y ventas"}
          />
        ))}
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
                    {c.pedidas.length < PARTES.length
                      ? ` · ${c.pedidas
                          .map((p) => {
                            const x = PARTES.find((y) => y.clave === p);
                            return x ? `${x.etiqueta.split(" (")[0]} ${x.pais.toUpperCase()}` : p;
                          })
                          .join(", ")}`
                      : ""}
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
  cuenta,
  estado,
  vence,
  que,
  alAbrir,
  alRevisar,
  fallo = null,
  extensionVieja = null,
  origen,
}: {
  sigla: string;
  titulo: string;
  detalle: string;
  cuenta: string;
  estado: ReturnType<typeof sesionValida> | "sin_pestana" | null;
  vence: string | null;
  que: string;
  alAbrir?: () => void;
  alRevisar?: () => void;
  /** Por qué no se pudo revisar (la extensión no respondió). */
  fallo?: string | null;
  /** La extensión es anterior a la que pide este país. */
  extensionVieja?: { tiene: string; pide: string } | null;
  /** La página de Dropi del país, para abrirla aunque la extensión no responda. */
  origen: string;
}) {
  const chip: Record<string, [string, string]> = {
    ok: ["Sesión activa", "bg-success/10 text-success"],
    sin_sesion: ["Sin sesión", "bg-destructive/10 text-destructive"],
    vencida: ["Sesión vencida", "bg-destructive/10 text-destructive"],
    otra_cuenta: ["Otra cuenta", "bg-warning/10 text-warning"],
    sin_pestana: ["Dropi no está abierto", "bg-muted text-muted-foreground"],
  };
  const sinRespuesta = !!(extensionVieja || fallo) && estado !== "ok";
  const [texto, clase] = sinRespuesta ? ["Sin respuesta", "bg-destructive/10 text-destructive"] : estado ? chip[estado] : ["Revisando…", "bg-muted text-muted-foreground"];
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
          {extensionVieja && estado !== "ok"
            ? `Tu extensión «Ecomfive · Dropi» es la ${extensionVieja.tiene} y ${titulo} necesita la ${extensionVieja.pide}: en chrome://extensions pulsa «Recargar» en ella y después recarga esta página.`
            : fallo && estado !== "ok"
              ? `${fallo} Recarga la extensión en chrome://extensions y esta página. Mientras tanto puedes abrir Dropi ${titulo} con el enlace.`
              : estado === "ok" && vence
            ? `Vence ${fechaHora(vence)}.`
            : estado === "otra_cuenta"
              ? `La pestaña tiene otra cuenta: entra con la ${cuenta}.`
              : estado === "sin_pestana"
                ? "Se abre solo al actualizar."
                : estado
                  ? `Inicia sesión con la ${cuenta}.`
                  : ""}
        </span>
        <span className="flex gap-2">
          {alRevisar && (
            <button type="button" className={botonSecundario} onClick={alRevisar}>
              Revisar
            </button>
          )}
          {sinRespuesta ? (
            // Sin respuesta de la extensión, el botón igual abre Dropi del país (en una pestaña nueva) para iniciar sesión.
            <a href={`${origen}/dashboard/home`} target="_blank" rel="noreferrer" className={botonSecundario}>
              Abrir Dropi {titulo}
            </a>
          ) : (
            alAbrir &&
            estado !== "ok" && (
              <button type="button" className={botonSecundario} onClick={alAbrir}>
                Abrir Dropi {titulo}
              </button>
            )
          )}

        </span>
      </div>
      <span className="text-xs text-muted-foreground">{que}</span>
    </div>
  );
}
