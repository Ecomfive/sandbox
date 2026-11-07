"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Segmentado } from "@/components/panel/piezas-panel";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { CodigosProducto } from "@/components/ui/codigos-producto";
import { MiniaturaFoto } from "@/components/ui/miniatura-foto";
import { CampoSkuMaestro, ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { formatearTiempoRelativo } from "@/lib/formato";
import { supabase } from "@/lib/supabase/client";
import { ETIQUETA_ESTADO_NOVEDAD, ETIQUETA_TIPO_NOVEDAD, RESULTADOS, type EstadoNovedad, type TipoNovedad } from "@/lib/wms/novedades";
import { crearNovedad, prepararFotoNovedad, resolverNovedad } from "./actions";

export interface NovedadVista {
  id: string;
  numero: string;
  tipo: TipoNovedad;
  estado: EstadoNovedad;
  cantidad: number;
  plataforma: string;
  codigo: string;
  /** El N.º y el código de barras del producto. */
  numeroProducto: number | null;
  barras: string | null;
  nombre: string;
  foto: string | null;
  referencia: string | null;
  nota: string | null;
  evidencia: string | null;
  retornoOficina: boolean;
  creadoPor: string;
  creadoEn: string;
  resueltoPor: string | null;
  resueltoEn: string | null;
  notaResolucion: string | null;
  /** Por qué esta persona no la puede resolver, o `null` si puede. */
  noPuede: string | null;
}

const TONO_ESTADO: Record<EstadoNovedad, "neutral" | "success" | "warning" | "destructive"> = { por_revisar: "warning", baja: "neutral", reclamo: "destructive", vuelve: "success", no_vuelve: "neutral" };
const OPCIONES_TIPO = (["danado", "devolucion"] as const).map((v) => ({ valor: v, etiqueta: ETIQUETA_TIPO_NOVEDAD[v] }));

/** Reportar un dañado o una devolución: un dañado necesita foto o que el producto vuelva a la oficina. */
function NuevaNovedad({ plataformas, productos }: { plataformas: { id: string; nombre: string }[]; productos: OpcionSkuMaestro[] }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [abierta, setAbierta] = useState(false);
  const [tipo, setTipo] = useState<TipoNovedad>("danado");
  const [bodega, setBodega] = useState("");
  const [sku, setSku] = useState<OpcionSkuMaestro | null>(null);
  const [cantidad, setCantidad] = useState("1");
  const [referencia, setReferencia] = useState("");
  const [nota, setNota] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [retorno, setRetorno] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const falta = !bodega ? "Elige la plataforma." : !sku ? "Elige el producto." : !(Number(cantidad) > 0) ? "Escribe cuántas unidades son." : tipo === "danado" && !archivo && !retorno ? "Sube la foto o marca que vuelve a la oficina." : null;
  const cerrar = () => {
    setAbierta(false);
    setSku(null);
    setCantidad("1");
    setReferencia("");
    setNota("");
    setArchivo(null);
    setRetorno(false);
    setError(null);
  };
  const guardar = () => {
    setError(null);
    empezar(async () => {
      let foto: string | null = null;
      if (archivo && tipo === "danado") {
        const permiso = await prepararFotoNovedad(archivo.name);
        if ("error" in permiso) return setError(permiso.error);
        const { error: fallo } = await supabase.storage.from("wms-productos").uploadToSignedUrl(permiso.ruta, permiso.token, archivo, { contentType: archivo.type });
        if (fallo) return setError("No se pudo subir la foto.");
        foto = permiso.ruta;
      }
      const r = await crearNovedad({ tipo, bodega, sku: sku?.id, cantidad, referencia, nota, foto, retornoOficina: tipo === "danado" && retorno });
      if (r.error) return setError(r.error);
      mostrarToast(`${r.numero} registrada`);
      cerrar();
      router.refresh();
    });
  };

  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} aria-haspopup="dialog" className={`inline-flex min-h-10 items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 ${anilloFoco}`}>
        Reportar novedad
      </button>
      {abierta && (
        <Ventana abierto alCerrar={cerrar} titulo="Reportar novedad" ancho="md">
          <form
            className="flex flex-col gap-4 p-5 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (!falta && !pendiente) guardar();
            }}
          >
            <Segmentado etiqueta="Qué pasó" valor={tipo} alCambiar={setTipo} opciones={OPCIONES_TIPO} />
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Plataforma</span>
              <select value={bodega} onChange={(e) => setBodega(e.target.value)} className={`${fieldClass} w-full`}>
                <option value="" disabled>
                  Elige la plataforma
                </option>
                {plataformas.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1">
              <span className={labelClassSm}>Producto</span>
              <ProveedorSkusMaestros opciones={productos}>
                <CampoSkuMaestro valor={sku?.id ?? null} alCambiar={setSku} etiquetaAria="Producto de la novedad" placeholder="Busca por SKU o nombre" claseContenedor="w-full" />
              </ProveedorSkusMaestros>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Unidades</span>
                <input type="number" min={1} step={1} inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={`${fieldClass} w-full tabular-nums`} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Pedido o guía (opcional)</span>
                <input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={120} autoComplete="off" className={`${fieldClass} w-full`} />
              </label>
            </div>
            {tipo === "danado" && (
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1">
                  <span className={labelClassSm}>Foto del daño</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="text-sm" />
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={retorno} onChange={(e) => setRetorno(e.target.checked)} />
                  <span>Vuelve a la oficina</span>
                </label>
              </div>
            )}
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Nota (opcional)</span>
              <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} autoComplete="off" placeholder="Qué pasó" className={`${fieldClass} w-full`} />
            </label>
            {error && (
              <p role="alert" className="m-0 text-destructive">
                {error}
              </p>
            )}
            {falta && <p className="m-0 text-xs text-muted-foreground">Falta: {falta}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={pendiente || !!falta} className={`inline-flex min-h-10 items-center rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:bg-muted disabled:text-muted-foreground ${anilloFoco}`}>
                {pendiente ? "Un momento..." : "Guardar"}
              </button>
              <button type="button" onClick={cerrar} className={`inline-flex min-h-10 items-center rounded-md border border-border bg-card px-4 py-2 font-medium hover:bg-muted ${anilloFoco}`}>
                Cancelar
              </button>
            </div>
          </form>
        </Ventana>
      )}
    </>
  );
}

/** La salida de una novedad: pide confirmar el resultado y una nota opcional. */
function Resolver({ n, alTerminar }: { n: NovedadVista; alTerminar: () => void }) {
  const { mostrarToast } = useToast();
  const [elegido, setElegido] = useState<EstadoNovedad | null>(null);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const confirmar = () =>
    empezar(async () => {
      const r = await resolverNovedad(n.id, elegido, nota);
      if (r.error) return setError(r.error);
      mostrarToast(`${n.numero}: ${elegido ? ETIQUETA_ESTADO_NOVEDAD[elegido] : ""}`);
      alTerminar();
    });
  if (n.noPuede) return <p className="m-0 text-xs text-muted-foreground">{n.noPuede}</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {RESULTADOS[n.tipo].map((r) => (
          <button
            key={r.valor}
            type="button"
            aria-pressed={elegido === r.valor}
            disabled={pendiente}
            onClick={() => setElegido(r.valor)}
            className={`min-h-9 rounded-md border px-3 text-sm ${elegido === r.valor ? "border-foreground bg-foreground text-background" : "border-border-control bg-card hover:bg-muted"} ${anilloFoco}`}
          >
            {r.boton}
          </button>
        ))}
      </div>
      {elegido && (
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label={`Nota de ${n.numero}`} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Nota (opcional)" className={`${fieldClass} min-w-0 flex-1 basis-56`} />
          <button type="button" disabled={pendiente} onClick={confirmar} className={`inline-flex min-h-9 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background ${anilloFoco}`}>
            {pendiente ? "Guardando…" : "Confirmar"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Dañados y devoluciones en las plataformas, registrados a mano. Un dañado lleva foto o retorno a la oficina y lo confirma quien autoriza, nunca quien lo reportó: baja, o reclamo por
 * posible robo. Una devolución vuelve al inventario de la plataforma o no. Nada cambia un stock: el cuadro de la plataforma lo tiene en cuenta.
 */
export function Novedades({ filas, plataformas, productos, puedeEscribir }: { filas: NovedadVista[]; plataformas: { id: string; nombre: string }[]; productos: OpcionSkuMaestro[]; puedeEscribir: boolean }) {
  const router = useRouter();
  const porRevisar = filas.filter((f) => f.estado === "por_revisar");
  const resueltas = filas.filter((f) => f.estado !== "por_revisar");
  const fila = (f: NovedadVista) => (
    <li key={f.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
      <MiniaturaFoto url={f.foto} nombre={f.nombre} />
      <div className="flex min-w-0 flex-1 basis-72 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{f.numero}</span>
          <Badge tone={f.tipo === "danado" ? "destructive" : "neutral"}>{ETIQUETA_TIPO_NOVEDAD[f.tipo]}</Badge>
          <Badge tone={TONO_ESTADO[f.estado]}>{ETIQUETA_ESTADO_NOVEDAD[f.estado]}</Badge>
        </div>
        <p className="m-0 text-sm">
          <span className="font-medium tabular-nums">{f.cantidad.toLocaleString("es-PA")} u.</span> · {f.codigo} · {f.plataforma}
        </p>
        <CodigosProducto numero={f.numeroProducto} barras={f.barras} />
        <p className="m-0 text-xs text-muted-foreground">
          {f.creadoPor} · {formatearTiempoRelativo(f.creadoEn)}
          {f.referencia ? ` · ${f.referencia}` : ""}
          {f.retornoOficina ? " · Vuelve a la oficina" : ""}
          {f.nota ? ` · ${f.nota}` : ""}
        </p>
        {f.evidencia && (
          <a href={f.evidencia} target="_blank" rel="noreferrer" className="w-fit text-xs underline underline-offset-2">
            Ver foto
          </a>
        )}
        {f.resueltoPor && (
          <p className="m-0 text-xs text-muted-foreground">
            Resolvió {f.resueltoPor}
            {f.resueltoEn ? ` · ${formatearTiempoRelativo(f.resueltoEn)}` : ""}
            {f.notaResolucion ? ` · ${f.notaResolucion}` : ""}
          </p>
        )}
      </div>
      {f.estado === "por_revisar" && (
        <div className="min-w-0 basis-72">
          <Resolver n={f} alTerminar={() => router.refresh()} />
        </div>
      )}
    </li>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-3xl text-sm text-muted-foreground">Lo que llega dañado a una plataforma y las devoluciones de clientes. Aquí no cambia ningún stock: el cuadro de la plataforma resta las bajas.</p>
        {puedeEscribir && <NuevaNovedad plataformas={plataformas} productos={productos} />}
      </div>
      <section aria-label="Por revisar" className="flex flex-col gap-2">
        <h2 className="m-0 text-sm font-semibold">Por revisar ({porRevisar.length})</h2>
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card p-0">
          {porRevisar.length ? porRevisar.map(fila) : <li className="px-4 py-6 text-center text-sm text-muted-foreground">No hay novedades por revisar.</li>}
        </ul>
      </section>
      {resueltas.length > 0 && (
        <section aria-label="Resueltas" className="flex flex-col gap-2">
          <h2 className="m-0 text-sm font-semibold">Resueltas ({resueltas.length})</h2>
          <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card p-0">{resueltas.map(fila)}</ul>
        </section>
      )}
    </div>
  );
}
