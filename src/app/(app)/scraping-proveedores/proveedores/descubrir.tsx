"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { pedirExtension, type AvanceLector, type SesionDropi } from "@/lib/dropi-actualizar/extension";
import { sesionValida } from "@/lib/dropi-actualizar/partes";
import { formatearFechaHora } from "@/lib/formato";
import { CDN_FOTOS_DROPI } from "@/lib/publicaciones/republicar-dropi";
import { formatoNumero } from "../def-scraping";
import { empezarDescubrir, fallarDescubrir, procesarDescubrir, seguirProveedor } from "./descubrir-actions";

export interface ProveedorDescubiertoVista {
  dropiId: number;
  nombre: string;
  productos: number;
  nuevos30: number;
  stock: number;
  ventas: number | null;
  conVentas: number;
  destacados: { nombre: string; foto: string | null; ventas: number | null; creado: string | null }[];
  seguido: boolean;
}

export interface LecturaDescubrir {
  estado: "corriendo" | "lista" | "fallida";
  productos: number | null;
  proveedores: number | null;
  conAnterior: boolean;
  error: string | null;
  inicio: string;
  fin: string | null;
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const foto = (f: string | null) => (!f ? null : /^https?:\/\//i.test(f) ? f : `${CDN_FOTOS_DROPI}/${encodeURI(f)}`);
const VERSION_MINIMA = [0, 2, 0];
const versionVieja = (v: string) => {
  const p = v.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((p[i] ?? 0) !== VERSION_MINIMA[i]) return (p[i] ?? 0) < VERSION_MINIMA[i];
  return false;
};

function Seguir({ p }: { p: ProveedorDescubiertoVista }) {
  const [pendiente, iniciar] = useTransition();
  const { mostrarToast } = useToast();
  if (p.seguido) return <span className="text-xs font-semibold text-success">Ya lo sigues</span>;
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() =>
        iniciar(async () => {
          const r = await seguirProveedor("mx", p.dropiId, p.nombre).catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
          mostrarToast(r.error ?? `Ahora sigues a ${p.nombre}: su primera búsqueda quedó pedida`, r.error ? "destructive" : "success");
        })
      }
      className={`inline-flex min-h-9 items-center rounded-lg border border-primario bg-primario-suave px-3 text-xs font-semibold text-primario hover:bg-primario hover:text-white disabled:opacity-50 ${anilloFoco}`}
    >
      {pendiente ? "Un momento…" : "Seguir"}
    </button>
  );
}

/**
 * «Descubrir proveedores» (26 oct 2026, primero México): con todo el catálogo de Dropi del país (lo lee la extensión «Ecomfive ·
 * Dropi» con la sesión de dropshipper), los proveedores que conviene seguir como referentes, de más a menos interesantes: los que
 * más bajaron su stock desde la lectura anterior, los que más publican novedades y los más grandes. «Seguir» lo suma a la lista.
 */
export function DescubrirProveedores({ lectura, proveedores, puedeLeer, puedeSeguir }: { lectura: LecturaDescubrir | null; proveedores: ProveedorDescubiertoVista[]; puedeLeer: boolean; puedeSeguir: boolean }) {
  const router = useRouter();
  const [cuantos, setCuantos] = useState(30);
  const [extension, setExtension] = useState<"buscando" | "lista" | "vieja" | "no_instalada">("buscando");
  const [avance, setAvance] = useState<string | null>(null);
  const [esperandoSesion, setEsperandoSesion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ocupado = useRef(false);

  useEffect(() => {
    if (!puedeLeer) return;
    let vivo = true;
    void (async () => {
      for (let i = 0; i < 4 && vivo; i++) {
        try {
          const r = await pedirExtension<{ version: string }>({ tipo: "hola" }, 1500);
          if (vivo) setExtension(versionVieja(r.version) ? "vieja" : "lista");
          return;
        } catch {
          await esperar(500);
        }
      }
      if (vivo) setExtension("no_instalada");
    })();
    return () => {
      vivo = false;
    };
  }, [puedeLeer]);

  async function leer() {
    if (ocupado.current) return;
    ocupado.current = true;
    setError(null);
    setAvance("Preparando…");
    const r = await empezarDescubrir("mx").catch(() => ({ error: "No se pudo empezar la lectura.", id: undefined, subida: undefined }));
    if (r.error || !r.id || !r.subida) {
      ocupado.current = false;
      setAvance(null);
      return setError(r.error ?? "No se pudo empezar la lectura.");
    }
    const id = r.id;
    try {
      // La sesión de dropshipper de México: si falta, la pestaña de Dropi México al frente y se espera.
      let mostrada = false;
      for (;;) {
        const s = await pedirExtension<SesionDropi>({ tipo: "sesion", pais: "mx", abrir: true }, 45000).catch(() => null);
        if (sesionValida("mx", s) === "ok") break;
        if (!mostrada) {
          await pedirExtension({ tipo: "mostrar", pais: "mx" }).catch(() => null);
          mostrada = true;
        }
        setEsperandoSesion(true);
        setAvance("Esperando que inicies sesión en Dropi México…");
        await esperar(3000);
      }
      setEsperandoSesion(false);
      await pedirExtension({ tipo: "lanzar", lector: "catalogo_mx", subida: r.subida }, 45000);
      let a: AvanceLector & { paginas?: number } = { fin: null, error: null, resultado: null };
      for (;;) {
        await esperar(3000);
        a = (await pedirExtension<(AvanceLector & { paginas?: number }) | null>({ tipo: "avance", lector: "catalogo_mx" }).catch(() => null)) ?? a;
        setAvance(a.fase === "subida" ? "Pasando lo leído al sistema…" : `Leyendo el catálogo de Dropi México: ${formatoNumero(a.productos ?? 0)} productos…`);
        if (a.fin) break;
      }
      if (a.error) throw new Error(a.error);
      setAvance("Buscando a los proveedores que conviene seguir…");
      const p = await procesarDescubrir(id);
      if (p.error) throw new Error(p.error);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(/Lector desconocido/.test(m) ? "La extensión está desactualizada: en chrome://extensions pulsa «Recargar» en «Ecomfive · Dropi» y vuelve a intentar." : m);
      await fallarDescubrir(id, m).catch(() => null);
    }
    setEsperandoSesion(false);
    setAvance(null);
    ocupado.current = false;
    router.refresh();
  }

  const corriendoAqui = avance !== null;
  return (
    <section aria-labelledby="descubrir" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex max-w-3xl flex-col gap-1">
          <h2 id="descubrir" className="m-0 text-lg font-bold">
            Descubrir proveedores
          </h2>
          <p className="m-0 text-sm text-muted-foreground">Del catálogo completo de Dropi de cada país: los proveedores que más mueven stock y más publican novedades. Síguelos con un clic.</p>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-9 items-center rounded-full border border-primario bg-primario px-4 text-sm font-semibold text-white">México</span>
          {puedeLeer && (
            <button
              type="button"
              onClick={() => void leer()}
              disabled={corriendoAqui || extension !== "lista"}
              className={`inline-flex min-h-10 items-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}
            >
              {corriendoAqui ? "Leyendo…" : "Leer el catálogo de México"}
            </button>
          )}
        </span>
      </div>

      {puedeLeer && extension === "no_instalada" && <p className="m-0 text-sm text-warning">Para leer el catálogo hace falta la extensión «Ecomfive · Dropi» en este Chrome.</p>}
      {puedeLeer && extension === "vieja" && <p className="m-0 text-sm text-warning">La extensión está desactualizada: en chrome://extensions pulsa «Recargar» en «Ecomfive · Dropi» y vuelve a cargar esta página.</p>}
      {avance && (
        <p role="status" aria-live="polite" className={`m-0 rounded-lg px-4 py-3 text-sm ${esperandoSesion ? "bg-warning-soft text-warning" : "bg-muted"}`}>
          {avance}
          {esperandoSesion ? " Te dejamos la pestaña de Dropi México al frente: entra con la cuenta de dropshipper y sigue sola." : " Puede tardar varios minutos: no cierres la pestaña de Dropi."}
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}

      {lectura && (
        <p className="m-0 text-xs text-muted-foreground">
          {lectura.estado === "lista"
            ? `Última lectura: ${formatearFechaHora(lectura.fin ?? lectura.inicio)} · ${formatoNumero(lectura.productos)} productos de ${formatoNumero(lectura.proveedores)} proveedores.${lectura.conAnterior ? " Ventas estimadas: lo que bajó el stock desde la lectura anterior." : " Las ventas estimadas se ven desde la segunda lectura (comparan con esta)."}`
            : lectura.estado === "fallida"
              ? `La última lectura falló (${formatearFechaHora(lectura.inicio)}): ${lectura.error ?? "sin detalle"}`
              : `Hay una lectura en curso desde ${formatearFechaHora(lectura.inicio)}.`}
        </p>
      )}

      {proveedores.length === 0 ? (
        <p className="m-0 rounded-lg bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">{puedeLeer ? "Todavía no se leyó el catálogo: pulsa «Leer el catálogo de México»." : "Todavía no se leyó el catálogo."}</p>
      ) : (
        <ContenedorTabla ariaLabel="Proveedores descubiertos en el catálogo de Dropi México">
          <table className="tabla-datos w-full min-w-[900px] text-sm">
            <thead>
              <tr className={claseFilaEncabezado}>
                <th className={claseEncabezadoColumna}>Proveedor</th>
                <th className={`${claseEncabezadoColumna} text-right`}>Ventas estimadas</th>
                <th className={`${claseEncabezadoColumna} text-right`}>Nuevos · 30 días</th>
                <th className={`${claseEncabezadoColumna} text-right`}>Productos</th>
                <th className={`${claseEncabezadoColumna} text-right`}>Stock</th>
                <th className={claseEncabezadoColumna}>
                  <span className="sr-only">Seguir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {proveedores.slice(0, cuantos).map((p) => (
                <tr key={p.dropiId} className="border-b border-border last:border-0">
                  <td className={claseCeldaColumna}>
                    <span className="flex flex-col gap-1.5">
                      <span className="font-semibold">{p.nombre}</span>
                      {p.destacados.length > 0 && (
                        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {p.destacados.map((d) => (
                            <span key={d.nombre} className="inline-flex max-w-[16rem] items-center gap-1.5">
                              {/* eslint-disable-next-line @next/next/no-img-element -- fotos de Dropi (CloudFront), sin optimizar */}
                              {foto(d.foto) ? <img src={foto(d.foto)!} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded border border-border object-cover" /> : null}
                              <span className="truncate">
                                {d.nombre}
                                {d.ventas ? ` · ${formatoNumero(d.ventas)} u.` : ""}
                              </span>
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className={`${claseCeldaColumna} text-right tabular-nums`}>
                    {p.ventas === null ? <span className="text-muted-foreground">—</span> : <span className={`font-semibold ${p.ventas ? "text-success" : "text-muted-foreground"}`}>{formatoNumero(p.ventas)}</span>}
                  </td>
                  <td className={`${claseCeldaColumna} text-right tabular-nums ${p.nuevos30 ? "font-semibold text-azul" : "text-muted-foreground"}`}>{formatoNumero(p.nuevos30)}</td>
                  <td className={`${claseCeldaColumna} text-right tabular-nums`}>{formatoNumero(p.productos)}</td>
                  <td className={`${claseCeldaColumna} text-right tabular-nums text-muted-foreground`}>{formatoNumero(p.stock)}</td>
                  <td className={`${claseCeldaColumna} text-right`}>{puedeSeguir ? <Seguir p={p} /> : p.seguido ? <span className="text-xs text-success">Ya lo sigues</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {proveedores.length > cuantos && (
            <button type="button" onClick={() => setCuantos((n) => n + 30)} className={`w-full border-t border-border px-4 py-2.5 text-left text-xs font-medium text-azul hover:bg-muted/50 ${anilloFoco}`}>
              Ver 30 más (quedan {proveedores.length - cuantos})
            </button>
          )}
        </ContenedorTabla>
      )}
    </section>
  );
}
