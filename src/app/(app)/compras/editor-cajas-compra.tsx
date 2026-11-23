"use client";

import { FotoAmpliable } from "@/components/ui/foto-ampliable";
import { useEffect, useRef, useState } from "react";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { CerrarIcon } from "@/lib/nav-icons";
import { BUCKET_PROVEEDOR, MAX_BYTES_FOTO, MAX_ETIQUETAS } from "@/lib/proveedor/rutas";
import { supabase } from "@/lib/supabase/client";
import { guardarCajasCompra, obtenerCajasProveedorCompra, prepararSubidaEtiquetaCompra, type CajasProveedorCompra } from "./cajas-proveedor-compra-actions";

/** Lo que queda al guardar: las cajas y cuántas imágenes de etiqueta. */
export interface ResultadoCajasCompra {
  cajas: number;
  etiquetas: number;
}

/**
 * «Cajas y etiqueta» de una compra (16 nov 2026, pedido de Hernán): el equipo anota a mano las cajas («Cartons», un número) y la etiqueta de las cajas (una foto) de los envíos que el proveedor no
 * anotó. Lo que se guarda aquí lo ve el proveedor en su portal, igual que lo que anota él se ve en Compras. Las imágenes suben directo al almacenamiento al elegirlas y el servidor las revisa por
 * su contenido.
 */
export function EditorCajasCompra({ compraId, titulo, alCerrar, alGuardar }: { compraId: string; titulo: string; alCerrar: () => void; alGuardar: (r: ResultadoCajasCompra) => void }) {
  const { mostrarToast } = useToast();
  const [datos, setDatos] = useState<CajasProveedorCompra | null | "cargando">("cargando");
  const [cajas, setCajas] = useState("");
  const [quitar, setQuitar] = useState<string[]>([]);
  const [nuevas, setNuevas] = useState<{ ruta: string; preview: string }[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vigente = true;
    obtenerCajasProveedorCompra(compraId)
      .then((r) => {
        if (!vigente) return;
        setDatos(r);
        setCajas(r?.cajas != null ? String(r.cajas) : "");
      })
      .catch(() => vigente && setDatos(null));
    return () => {
      vigente = false;
    };
  }, [compraId]);

  const existentes = datos && datos !== "cargando" ? datos.etiquetas.filter((e) => !quitar.includes(e.ruta)) : [];
  const total = existentes.length + nuevas.length;

  async function subir(archivos: FileList | null) {
    if (!archivos?.length) return;
    setError(null);
    setSubiendo(true);
    let cupo = MAX_ETIQUETAS - total;
    for (const archivo of Array.from(archivos)) {
      if (cupo <= 0) {
        setError(`Una compra lleva hasta ${MAX_ETIQUETAS} imágenes de etiqueta.`);
        break;
      }
      if (!archivo.type.startsWith("image/")) {
        setError("La etiqueta debe ser una imagen (JPG, PNG, WebP o GIF).");
        continue;
      }
      if (archivo.size > MAX_BYTES_FOTO) {
        setError("Una imagen pesa más de 10 MB.");
        continue;
      }
      const permiso = await prepararSubidaEtiquetaCompra(compraId, archivo.name);
      if ("error" in permiso) {
        setError(permiso.error);
        break;
      }
      const { error: errorSubida } = await supabase.storage.from(BUCKET_PROVEEDOR).uploadToSignedUrl(permiso.ruta, permiso.token, archivo, { contentType: archivo.type });
      if (errorSubida) {
        setError("No se pudo subir la imagen. Inténtalo de nuevo.");
        continue;
      }
      cupo -= 1;
      setNuevas((xs) => [...xs, { ruta: permiso.ruta, preview: URL.createObjectURL(archivo) }]);
    }
    setSubiendo(false);
    if (entrada.current) entrada.current.value = "";
  }

  async function guardar() {
    setError(null);
    const n = cajas.trim();
    if (n && (!/^\d+$/.test(n) || Number(n) < 1)) return setError("Las cajas deben ser un número entero mayor que cero.");
    if (!n && !(datos && datos !== "cargando" && datos.cajas != null)) return setError("Escribe cuántas cajas lleva el envío.");
    setGuardando(true);
    const r = await guardarCajasCompra(compraId, { cajas: n, nuevas: nuevas.map((x) => x.ruta), quitar });
    setGuardando(false);
    if (r.error || r.cajas == null || !r.etiquetas) return setError(r.error ?? "No se pudo guardar.");
    mostrarToast("Cajas y etiqueta guardadas: el proveedor también las ve.");
    alGuardar({ cajas: r.cajas, etiquetas: r.etiquetas.length });
    alCerrar();
  }

  return (
    <Ventana abierto alCerrar={() => !guardando && !subiendo && alCerrar()} ancho="md" titulo={<span className="text-base font-semibold">Cajas y etiqueta · {titulo}</span>}>
      <div className="flex flex-col gap-4 p-4">
        {datos === "cargando" ? (
          <p className="m-0 text-sm text-muted-foreground">Cargando…</p>
        ) : !datos ? (
          <p className="m-0 text-sm text-muted-foreground">Esta compra no es de un proveedor con portal, o no tienes acceso: no lleva cajas ni etiqueta.</p>
        ) : (
          <>
            <label className="flex flex-col gap-1 sm:max-w-48">
              <span className={labelClass}>Cajas (Cartons)</span>
              <input type="number" inputMode="numeric" min={1} step={1} value={cajas} onChange={(e) => setCajas(e.target.value)} placeholder="Ej: 20" className={`${fieldClass} tabular-nums`} data-enfocar />
            </label>
            <div className="flex flex-col gap-2">
              <p className={`${labelClass} m-0`}>Etiqueta de las cajas (foto)</p>
              {total > 0 && (
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {existentes.map((e, i) => (
                    <li key={e.ruta} className="relative">
                      <FotoAmpliable src={e.url} alt={`Etiqueta de las cajas ${i + 1}`} className="h-24 w-24 rounded-md border border-border bg-card object-contain" />
                      <button type="button" aria-label={`Quitar la etiqueta ${i + 1}`} onClick={() => setQuitar((xs) => [...xs, e.ruta])} className={`absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card shadow-sm ${anilloFoco}`}>
                        <CerrarIcon className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                  {nuevas.map((n, i) => (
                    <li key={n.ruta} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local de la imagen recién elegida */}
                      <img src={n.preview} alt={`Etiqueta nueva ${i + 1}`} className="h-24 w-24 rounded-md border border-border bg-card object-contain" />
                      <button type="button" aria-label={`Quitar la etiqueta nueva ${i + 1}`} onClick={() => setNuevas((xs) => xs.filter((x) => x.ruta !== n.ruta))} className={`absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card shadow-sm ${anilloFoco}`}>
                        <CerrarIcon className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <input ref={entrada} id="etiqueta-cajas-archivo" type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void subir(e.target.files)} disabled={subiendo || total >= MAX_ETIQUETAS} />
                <label htmlFor="etiqueta-cajas-archivo" className={`inline-flex min-h-10 cursor-pointer items-center rounded-md border border-border-control bg-card px-3 text-sm font-medium hover:bg-muted has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring`}>
                  {subiendo ? "Subiendo…" : total === 0 ? "Subir la foto de la etiqueta" : "Agregar otra imagen"}
                </label>
              </div>
              <p className="m-0 text-xs text-muted-foreground">Hasta {MAX_ETIQUETAS} imágenes (JPG, PNG, WebP o GIF, de hasta 10 MB).</p>
            </div>
            {error && (
              <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={guardando || subiendo} onClick={alCerrar} className={`rounded-md border border-border-control bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
                Cancelar
              </button>
              <button type="button" disabled={guardando || subiendo} onClick={guardar} className={`rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-50 ${anilloFoco}`}>
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </>
        )}
      </div>
    </Ventana>
  );
}
