"use client";

import { useState } from "react";
import { useIdioma } from "@/components/proveedor/idioma-contexto";
import { botonNormal, botonPrincipal } from "@/components/proveedor/piezas-proveedor";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import type { PedidoPortal } from "@/lib/proveedor/datos";
import type { EtiquetaPedido } from "@/lib/proveedor/etiquetas-datos";
import { BUCKET_PROVEEDOR, MAX_ETIQUETAS } from "@/lib/proveedor/rutas";
import { supabase } from "@/lib/supabase/client";
import { CerrarIcon } from "@/lib/nav-icons";
import { guardarCajasPedido, marcarEnviado, prepararSubidaEtiqueta } from "./actions";

/** Lo que devuelve el panel al terminar: las cajas y las etiquetas que quedaron y, si fue «Marcar enviado», la fecha en que salió. */
export interface ResultadoCajas {
  cajas: number;
  etiquetas: EtiquetaPedido[];
  fechaEnvio?: string;
}

/**
 * Las cajas («Cartons») de un envío y la imagen de la etiqueta de las cajas (16 nov 2026, pedido de Hernán). Dos usos: «Marcar enviado» (fecha de salida, cajas y etiqueta de una vez)
 * y «Cajas y etiqueta» de un pedido ya enviado (anotar o corregir). Las imágenes suben directo al almacenamiento al elegirlas; el servidor las revisa por su contenido.
 */
export function PanelCajas({
  p,
  modo,
  existentes,
  hoy,
  alCerrar,
  alTerminar,
}: {
  p: PedidoPortal;
  modo: "enviar" | "editar";
  existentes: EtiquetaPedido[];
  hoy: string;
  alCerrar: () => void;
  alTerminar: (r: ResultadoCajas) => void;
}) {
  const { t, idioma, tr, error: errorEn } = useIdioma();
  const { mostrarToast } = useToast();
  const [cajas, setCajas] = useState(p.cajas ? String(p.cajas) : "");
  const [fechaEnvio, setFechaEnvio] = useState(hoy);
  const [quitar, setQuitar] = useState<string[]>([]);
  const [nuevas, setNuevas] = useState<{ ruta: string; preview: string }[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quedan = existentes.filter((e) => !quitar.includes(e.ruta));
  const total = quedan.length + nuevas.length;

  async function elegir(archivos: FileList | null) {
    if (!archivos?.length) return;
    setError(null);
    setSubiendo(true);
    let cuenta = total;
    for (const archivo of Array.from(archivos)) {
      if (cuenta >= MAX_ETIQUETAS) {
        setError(t.maxEtiquetas(MAX_ETIQUETAS));
        break;
      }
      if (!archivo.type.startsWith("image/")) {
        setError(t.errorImagen);
        continue;
      }
      if (archivo.size > 10 * 1024 * 1024) {
        setError(t.errorPesoFoto);
        continue;
      }
      const permiso = await prepararSubidaEtiqueta(p.id, archivo.name);
      if ("error" in permiso) {
        setError(errorEn(permiso.error));
        break;
      }
      const { error: errorSubida } = await supabase.storage.from(BUCKET_PROVEEDOR).uploadToSignedUrl(permiso.ruta, permiso.token, archivo, { contentType: archivo.type });
      if (errorSubida) {
        setError(t.errorSubida);
        continue;
      }
      cuenta += 1;
      setNuevas((xs) => [...xs, { ruta: permiso.ruta, preview: URL.createObjectURL(archivo) }]);
    }
    setSubiendo(false);
  }

  async function guardar() {
    setError(null);
    if (!/^\d+$/.test(cajas.trim()) || Number(cajas) < 1) return setError(t.errorCajas);
    setGuardando(true);
    const rutasNuevas = nuevas.map((n) => n.ruta);
    if (modo === "enviar") {
      const r = await marcarEnviado(p.id, fechaEnvio, cajas.trim(), rutasNuevas);
      setGuardando(false);
      if (r.error || !r.fechaEnvio || r.cajas == null) return setError(errorEn(r.error ?? "No se pudo marcar el envío."));
      return alTerminar({ cajas: r.cajas, etiquetas: r.etiquetas ?? [], fechaEnvio: r.fechaEnvio });
    }
    const r = await guardarCajasPedido(p.id, { cajas: cajas.trim(), nuevas: rutasNuevas, quitar });
    setGuardando(false);
    if (r.error || r.cajas == null) return setError(errorEn(r.error ?? "No se pudieron guardar las cajas."));
    mostrarToast(t.cajasGuardadas);
    alTerminar({ cajas: r.cajas, etiquetas: r.etiquetas ?? [] });
  }

  const nombre = tr(p.producto);
  const ocupado = subiendo || guardando;
  return (
    <Ventana abierto alCerrar={() => !ocupado && alCerrar()} lado="derecha" ancho="md" titulo={<span className="text-base font-semibold">{nombre}</span>}>
      <div className="flex flex-col gap-4 p-4" lang={idioma === "zh" ? "zh-CN" : "es"}>
        {modo === "enviar" && (
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t.fechaDeEnvio}</span>
            <input type="date" value={fechaEnvio} max={hoy} onChange={(e) => setFechaEnvio(e.target.value)} className={fieldClass} />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t.cajasCartons}</span>
          <input type="number" min={1} step={1} inputMode="numeric" data-enfocar value={cajas} onChange={(e) => setCajas(e.target.value)} placeholder={t.ejemploCajas} className={fieldClass} />
        </label>
        <div className="flex flex-col gap-2">
          <span className={labelClass}>{t.etiquetaCajas}</span>
          {total > 0 && (
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {[...quedan.map((e) => ({ ruta: e.ruta, url: e.url, nueva: false })), ...nuevas.map((n) => ({ ruta: n.ruta, url: n.preview, nueva: true }))].map((e, i) => (
                <li key={e.ruta} className="relative">
                  <a href={e.url} target="_blank" rel="noopener noreferrer" aria-label={t.verEtiqueta(i + 1)} className={`block overflow-hidden rounded-md border border-border bg-card ${anilloFoco}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- la etiqueta es una dirección firmada del almacenamiento privado */}
                    <img src={e.url} alt="" className="h-24 w-24 object-contain" />
                  </a>
                  <button
                    type="button"
                    aria-label={t.quitarEtiqueta}
                    disabled={ocupado}
                    onClick={() => (e.nueva ? setNuevas((xs) => xs.filter((x) => x.ruta !== e.ruta)) : setQuitar((xs) => [...xs, e.ruta]))}
                    className={`absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full border border-border-control bg-card text-muted-foreground shadow-sm hover:bg-muted ${anilloFoco}`}
                  >
                    <CerrarIcon className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={ocupado || total >= MAX_ETIQUETAS}
            aria-label={t.agregarEtiqueta}
            onChange={(e) => {
              void elegir(e.target.files);
              e.target.value = "";
            }}
            className="text-[13px]"
          />
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {subiendo ? t.subiendoEtiqueta : nuevas.length ? t.etiquetaLista : t.maxEtiquetas(MAX_ETIQUETAS)}
          </span>
        </div>
        {error && (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={botonNormal} disabled={ocupado} onClick={alCerrar}>
            {t.cancelar}
          </button>
          <button type="button" className={botonPrincipal} disabled={ocupado} onClick={() => void guardar()}>
            {guardando ? t.guardando : modo === "enviar" ? t.confirmarEnvio : t.guardarCorreccion}
          </button>
        </div>
      </div>
    </Ventana>
  );
}
