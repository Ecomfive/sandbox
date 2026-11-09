"use client";

import { quedaDespues, repartirFilas, type FilaConteo } from "@/lib/wms/levantamiento";
import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { Badge } from "@/components/ui/badge";
import { VentanaBuscarImagen } from "@/components/buscar-imagen/ventana-buscar-imagen";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { CodigosProducto } from "@/components/ui/codigos-producto";
import { coincideCodigo } from "@/lib/wms/codigos-producto";
import { MiniaturaFoto } from "@/components/ui/miniatura-foto";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { formatearTiempoRelativo } from "@/lib/formato";
import type { Ambito } from "@/lib/imagen/buscar";
import { BuscarIcon, CamaraIcon, MasIcon, PapeleraIcon } from "@/lib/nav-icons";
import { FichaStock } from "../ficha-stock";
import { guardarLevantamiento } from "./actions";
import { ImportarLista } from "./importar-lista";
import { LineasCajas, unidadesFormulario, type LineaCajasForm, type UbicacionConteo } from "./lineas-cajas";

export interface ProductoConteo {
  id: string;
  codigo: string;
  nombre: string;
  clase: string;
  manejaVencimiento: boolean;
  foto: string | null;
  /** El N.º y el código de barras del producto. */
  numero: number | null;
  barras: string | null;
  /** Lo que el sistema tiene hoy en esta bodega. */
  enSistema: number;
  /** Sus lotes con unidades en esta bodega (solo si maneja vencimiento). */
  lotes: { codigo: string; vencimiento: string; cantidad: number }[];
  /** Sus cajas guardadas en esta bodega (migración 0236). */
  cajas: LineaCajasForm[];
}

interface LineaLote {
  codigo: string;
  vencimiento: string;
  cantidad: string;
  /** Lo que se le suma a este lote. */
  sumar: string;
  /** Un lote que el sistema ya tiene en esta bodega (su código y fecha no se cambian aquí). */
  existente: boolean;
}

const AMBITOS_PRODUCTO: Ambito[] = ["producto"];
const ETIQUETA_CLASE: Record<string, string> = { inactivo: "Inactivo", descontinuado: "Descontinuado" };
const sinAcentos = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const numero = (t: string) => (t.trim() === "" ? null : Number(t));
/** Una cantidad escrita, o `null` si está en blanco o no vale. */
const cantidadDe = (t: string | undefined) => {
  const n = numero(t ?? "");
  return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
};
const CLASE_ACCION_FILA = "inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground";

/** Una cifra con signo para la diferencia: verde si sobra, rojo si falta, nada si cuadra. */
function Diferencia({ n }: { n: number | null }) {
  if (n === null) return <span className="text-muted-foreground">—</span>;
  if (n === 0) return <span className="text-muted-foreground tabular-nums">0</span>;
  return <span className={`font-semibold tabular-nums ${n > 0 ? "text-success" : "text-destructive"}`}>{n > 0 ? `+${n}` : n}</span>;
}

/**
 * Levantamiento (conteo físico) de una bodega: una fila por producto con lo que hay en el sistema, lo contado y la
 * diferencia. Solo se guarda lo que se escribió (un producto en blanco no se toca). **Añadir, Restar y Transferir** (7 nov 2026, pedido de Hernán; el «Sumar» de la fila, del 6 nov, pasó a
 * ser la columna Añadir): cada fila tiene sus casillas a la vista y un solo botón guarda todo. Con contado, lo añadido se suma a lo contado; sola, se suma a lo que hay. Restar saca de lo que
 * hay (en Costa Rica, solo un administrador y con motivo). Transferir lleva una cantidad a otro depósito de la lista (un traslado con número por cada destino). Un producto con vencimiento se cuenta
 * por lote: sus lotes con unidades aparecen solos y se agrega una línea por lote nuevo. **Buscar por imagen** (3 nov 2026, pedido de Jhokser): la cámara junto a «Buscar»
 * encuentra el producto con una foto (pegada, arrastrada o subida) y deja en la lista solo lo encontrado, de más a menos parecido, incluso inactivos y descontinuados.
 */
export function Levantamiento({
  bodegas,
  bodegaElegida,
  ubicaciones,
  productos,
  ultimo,
  puedeEscribir,
  puedeRestar,
  restarPideMotivo,
  codigoPais,
}: {
  bodegas: { id: string; nombre: string }[];
  bodegaElegida: string;
  ubicaciones: UbicacionConteo[];
  productos: ProductoConteo[];
  ultimo: { fecha: string; referencia: string | null; productos: number } | null;
  puedeEscribir: boolean;
  /** Si esta persona puede restar a mano: donde toda salida va con remisión (Costa Rica) es de un administrador. */
  puedeRestar: boolean;
  /** Si restar pide motivo (en la Referencia). */
  restarPideMotivo: boolean;
  /** El país que se está viendo: la ficha muestra sus compras. */
  codigoPais: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { mostrarToast } = useToast();
  const [pendiente, startTransition] = useTransition();
  const [contados, setContados] = useState<Record<string, string>>({});
  const [lotes, setLotes] = useState<Record<string, LineaLote[]>>({});
  // Las cajas que se tocaron; un producto sin tocar conserva las suyas.
  const [cajas, setCajas] = useState<Record<string, LineaCajasForm[]>>({});
  const [buscar, setBuscar] = useState("");
  const [verTodos, setVerTodos] = useState(false);
  // Los productos que encontró la foto, de más a menos parecido (null = sin filtro por imagen).
  const [porImagen, setPorImagen] = useState<string[] | null>(null);
  const [imagenAbierta, setImagenAbierta] = useState(false);
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Lo que se añade, lo que se resta y lo que se transfiere (cantidad y depósito de destino) en cada fila.
  const [sumas, setSumas] = useState<Record<string, string>>({});
  const [restas, setRestas] = useState<Record<string, string>>({});
  const [traslados, setTraslados] = useState<Record<string, { cantidad: string; destino: string }>>({});
  // La ficha del producto (7 nov 2026, pedido de Hernán): al tocar su nombre, para ver lo último que pasó y dejar notas.
  const [ficha, setFicha] = useState<string | null>(null);
  const productoFicha = ficha ? productos.find((p) => p.id === ficha) : undefined;

  const lineasDe = (p: ProductoConteo): LineaLote[] =>
    lotes[p.id] ?? p.lotes.map((l) => ({ codigo: l.codigo, vencimiento: l.vencimiento, cantidad: "", sumar: "", existente: true }));
  const cambiarLinea = (p: ProductoConteo, i: number, cambio: Partial<LineaLote>) =>
    setLotes((x) => ({ ...x, [p.id]: lineasDe(p).map((l, j) => (j === i ? { ...l, ...cambio } : l)) }));

  // Lo contado de cada producto (null si no se tocó).
  const contadoDe = (p: ProductoConteo): number | null => {
    if (!p.manejaVencimiento) {
      // Con cajas, lo contado es lo que suman (7 nov 2026, pedido de Yanixia).
      const enCajas = cajas[p.id] ? unidadesFormulario(cajas[p.id]) : 0;
      if (enCajas > 0) return enCajas;
      return cantidadDe(contados[p.id]);
    }
    const ls = lotes[p.id];
    if (!ls || !ls.some((l) => l.cantidad.trim() !== "")) return null;
    return ls.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
  };

  // Con cajas no se suma: las cajas deben dar lo que queda en la bodega, así que lo que entra es otra línea de cajas.
  const cajasMandan = (p: ProductoConteo) => unidadesFormulario(cajas[p.id] ?? []) > 0;
  // Lo que se suma a cada producto (null si nada).
  const sumarDe = (p: ProductoConteo): number | null => {
    if (cajasMandan(p)) return null;
    const n = p.manejaVencimiento ? (lotes[p.id] ?? []).reduce((s, l) => s + (cantidadDe(l.sumar) ?? 0), 0) : cantidadDe(sumas[p.id]);
    return n ? n : null;
  };
  // Lo que se resta y lo que se transfiere de cada producto (null si nada). Con cajas en edición no: las cajas deben dar lo que queda.
  const restarDe = (p: ProductoConteo): number | null => (cajasMandan(p) ? null : (cantidadDe(restas[p.id]) || null));
  const transferirDe = (p: ProductoConteo): number | null => (cajasMandan(p) ? null : (cantidadDe(traslados[p.id]?.cantidad) || null));
  // Lo que sale de la bodega en esta fila.
  const saleDe = (p: ProductoConteo) => (restarDe(p) ?? 0) + (transferirDe(p) ?? 0);
  const cambiarTraslado = (p: ProductoConteo, cambio: Partial<{ cantidad: string; destino: string }>) =>
    setTraslados((x) => {
      const nuevo = { cantidad: x[p.id]?.cantidad ?? "", destino: x[p.id]?.destino ?? "", ...cambio };
      const y = { ...x };
      if (nuevo.cantidad === "" && nuevo.destino === "") delete y[p.id];
      else y[p.id] = nuevo;
      return y;
    });
  const escribirRestar = (p: ProductoConteo, valor: string) =>
    setRestas((x) => {
      const y = { ...x };
      if (valor === "") delete y[p.id];
      else y[p.id] = valor;
      return y;
    });

  const visibles = useMemo(() => {
    const q = sinAcentos(buscar.trim());
    const orden = porImagen ? new Map(porImagen.map((id, i) => [id, i])) : null;
    const lista = productos.filter((p) => {
      if (orden && !orden.has(p.id)) return false;
      if (q && !coincideCodigo(q, `${p.codigo} ${p.nombre}`, p)) return false;
      if (verTodos || q || orden) return true;
      return p.clase === "fisico" || p.enSistema !== 0 || contados[p.id] !== undefined || lotes[p.id] !== undefined || cajas[p.id] !== undefined || sumas[p.id] !== undefined || restas[p.id] !== undefined || traslados[p.id] !== undefined;
    });
    return orden ? lista.sort((a, b) => (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0)) : lista;
  }, [productos, buscar, verTodos, porImagen, contados, lotes, cajas, sumas, restas, traslados]);

  const contadosTotal = productos.filter((p) => contadoDe(p) !== null);
  const conDiferencia = contadosTotal.filter((p) => quedaDespues(contadoDe(p), sumarDe(p), p.enSistema, saleDe(p)) !== p.enSistema).length;
  const conSuma = productos.filter((p) => sumarDe(p) !== null);
  const unidadesPorSumar = conSuma.reduce((s, p) => s + (sumarDe(p) ?? 0), 0);
  const conResta = productos.filter((p) => restarDe(p) !== null);
  const unidadesPorRestar = conResta.reduce((s, p) => s + (restarDe(p) ?? 0), 0);
  const conTraslado = productos.filter((p) => transferirDe(p) !== null);
  const unidadesPorTransferir = conTraslado.reduce((s, p) => s + (transferirDe(p) ?? 0), 0);
  const hayQueGuardar = contadosTotal.length > 0 || conSuma.length > 0 || conResta.length > 0 || conTraslado.length > 0 || Object.keys(cajas).length > 0;
  // Para cuadrar: lo que se lleva contado y lo que el sistema tiene hoy en esta bodega (aquí no hay compuestos).
  const unidadesContadas = contadosTotal.reduce((s, p) => s + (contadoDe(p) ?? 0), 0);
  const unidadesEnSistema = productos.reduce((s, p) => s + p.enSistema, 0);
  const nombreBodega = bodegas.find((b) => b.id === bodegaElegida)?.nombre ?? "";

  const guardar = () => {
    setError(null);
    // Transferir: la cantidad y el depósito van juntos.
    const sinDestino = conTraslado.find((p) => !traslados[p.id]?.destino);
    if (sinDestino) return setError(`Elige el depósito al que se transfiere ${sinDestino.codigo}.`);
    if (conResta.length > 0 && restarPideMotivo && !referencia.trim()) return setError("Para restar, escribe el motivo en «Referencia».");
    const filas = productos.map(
      (p): FilaConteo =>
        p.manejaVencimiento
          ? {
              sku: p.id,
              lotes: (lotes[p.id] ?? []).map((l) => ({
                codigo: l.codigo,
                vencimiento: l.existente ? null : l.vencimiento || null,
                contado: l.cantidad.trim() === "" ? null : Number(l.cantidad) || 0,
                sumar: cajasMandan(p) ? null : cantidadDe(l.sumar),
              })),
            }
          : { sku: p.id, contado: contadoDe(p), sumar: sumarDe(p) },
    );
    const { contados: items, sumas: porSumar } = repartirFilas(filas);
    const cajasTocadas = Object.entries(cajas).map(([sku, lineas]) => ({
      sku,
      lineas: lineas.map((l) => ({ ubicacion: l.ubicacion, cajas: l.cajas, por_caja: l.porCaja, observacion: l.observacion })),
    }));
    const aRestar = conResta.map((p) => ({ sku: p.id, cantidad: restarDe(p) }));
    const aTransferir = conTraslado.map((p) => ({ sku: p.id, cantidad: transferirDe(p), destino: traslados[p.id].destino }));
    startTransition(async () => {
      const r = await guardarLevantamiento(bodegaElegida, referencia, items, porSumar, cajasTocadas, aRestar, aTransferir);
      if (r.error) {
        setError(r.error);
        // Lo que ya quedó guardado se suelta; solo sigue escrito lo que falta.
        const h = r.hecho;
        if (h && (h.contados || h.sumas || h.restas || h.trasladados.length)) {
          if (h.contados) {
            // Lo contado ya quedó guardado, con lo que se le añadía.
            const guardados = new Set(items.map((i) => i.sku));
            const sinGuardados = <T,>(x: Record<string, T>) => Object.fromEntries(Object.entries(x).filter(([id]) => !guardados.has(id)));
            setContados({});
            setCajas({});
            setSumas(sinGuardados);
            setLotes(sinGuardados);
          }
          if (h.sumas) {
            setSumas({});
            setLotes((x) => Object.fromEntries(Object.entries(x).map(([id, ls]) => [id, ls.map((l) => ({ ...l, sumar: "" }))] as const).filter(([, ls]) => ls.some((l) => l.cantidad.trim() !== ""))));
          }
          if (h.restas) setRestas({});
          if (h.trasladados.length) setTraslados((x) => Object.fromEntries(Object.entries(x).filter(([id]) => !h.trasladados.includes(id))));
          router.refresh();
        }
        return;
      }
      const guardado = items.length > 0 || cajasTocadas.length > 0 ? `Levantamiento de ${nombreBodega} guardado: ${r.productos} productos, ${r.ajustes} con diferencia${r.cajas ? `, cajas de ${r.cajas}` : ""}` : "";
      const cuantos = (n: number) => `${n} ${n === 1 ? "producto" : "productos"}`;
      const otras = [
        r.sumados ? `añadido a ${cuantos(r.sumados)}` : "",
        r.restados ? `restado a ${cuantos(r.restados)}` : "",
        r.traslados?.length ? `transferido en ${r.traslados.join(", ")}` : "",
      ].filter(Boolean);
      const resto = otras.join(" · ");
      mostrarToast(guardado ? [guardado, resto].filter(Boolean).join(" · ") : `${resto.charAt(0).toUpperCase()}${resto.slice(1)} en ${nombreBodega}`);
      setContados({});
      setLotes({});
      setCajas({});
      setSumas({});
      setRestas({});
      setTraslados({});
      setReferencia("");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground">Bodega</span>
          <select
            value={bodegaElegida}
            onChange={(e) => router.replace(`${pathname}?bodega=${e.target.value}`)}
            disabled={pendiente}
            className={`${fieldClassSm} min-w-48`}
          >
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
        </label>
        {puedeEscribir && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">Referencia (opcional)</span>
            <input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={120} placeholder="Ej: Conteo inicial" className={`${fieldClassSm} w-56`} />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground">Buscar</span>
          <span className="relative">
            <BuscarIcon className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Código o nombre" className={`${fieldClassSm} w-56 pl-8`} />
          </span>
        </label>
        <Tooltip texto="Buscar por imagen">
          <button
            type="button"
            aria-label="Buscar por imagen"
            onClick={() => setImagenAbierta(true)}
            className={`inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-border-control bg-card hover:bg-muted ${anilloFoco}`}
          >
            <CamaraIcon aria-hidden="true" className="h-4 w-4" />
          </button>
        </Tooltip>
        {porImagen && (
          <button
            type="button"
            onClick={() => setPorImagen(null)}
            aria-label={`Quitar el filtro por imagen (${porImagen.length} productos)`}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border border-foreground bg-foreground px-3 text-sm font-medium text-background ${anilloFoco}`}
          >
            Por imagen ({porImagen.length}) <span aria-hidden="true">×</span>
          </button>
        )}
        {puedeEscribir && (
          <ImportarLista
            productos={productos}
            deshabilitado={pendiente}
            alAplicar={(cantidades, comoSuma) => {
              const escritas = Object.fromEntries(Object.entries(cantidades).map(([id, n]) => [id, String(n)]));
              if (!comoSuma) return setContados((x) => ({ ...x, ...escritas }));
              setSumas((x) => ({ ...x, ...escritas }));
            }}
          />
        )}
        <button
          type="button"
          aria-pressed={verTodos}
          onClick={() => setVerTodos((v) => !v)}
          className={`min-h-9 rounded-md border px-3 text-sm ${verTodos ? "border-foreground bg-foreground text-background" : "border-border-control bg-card hover:bg-muted"}`}
        >
          Ver inactivos y descontinuados
        </button>
        {ultimo && (
          <p className="text-xs text-muted-foreground">
            Último levantamiento: {formatearTiempoRelativo(ultimo.fecha)}
            {ultimo.referencia ? ` · ${ultimo.referencia}` : ""} · {ultimo.productos} productos
          </p>
        )}
      </div>

      <VentanaBuscarImagen abierta={imagenAbierta} alCerrar={() => setImagenAbierta(false)} ambitoPropio="producto" ambitos={AMBITOS_PRODUCTO} alFiltrar={(ids) => setPorImagen(ids)} />

      <ContenedorTabla ariaLabel={`Levantamiento de ${nombreBodega}`}>
        <table className="tabla-datos w-full min-w-[78rem] border-collapse text-sm">
          <thead>
            <tr className={claseFilaEncabezado}>
              <th scope="col" className={claseEncabezadoColumna}>
                Foto
              </th>
              <th scope="col" className={claseEncabezadoColumna}>
                Producto
              </th>
              <th scope="col" className={`${claseEncabezadoColumna} text-right`}>
                En sistema
              </th>
              <th scope="col" className={claseEncabezadoColumna}>
                Contado
              </th>
              <th scope="col" className={claseEncabezadoColumna}>
                Añadir
              </th>
              <th scope="col" className={claseEncabezadoColumna}>
                Restar
              </th>
              <th scope="col" className={claseEncabezadoColumna}>
                Transferir
              </th>
              <th scope="col" className={`${claseEncabezadoColumna} text-right`}>
                Diferencia
              </th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  {porImagen ? "Ningún producto de esta bodega coincide con la imagen." : "No hay productos con ese nombre."}
                </td>
              </tr>
            )}
            {visibles.map((p) => {
              const contado = contadoDe(p);
              const sumar = sumarDe(p);
              const restar = restarDe(p);
              const transferir = transferirDe(p);
              const sale = saleDe(p);
              const queda = quedaDespues(contado, sumar, p.enSistema, sale);
              const dif = contado === null && sumar === null && restar === null && transferir === null ? null : queda - p.enSistema;
              const conCajas = cajasMandan(p);
              const tieneCajas = p.cajas.length > 0;
              const traslado = traslados[p.id];
              const destinos = bodegas.filter((b) => b.id !== bodegaElegida);
              return (
                <tr key={p.id} className="border-b border-border align-top">
                  <td className={claseCeldaColumna}>
                    <MiniaturaFoto url={p.foto} nombre={p.nombre} />
                  </td>
                  <td className={claseCeldaColumna}>
                    <button
                      type="button"
                      onClick={() => setFicha(p.id)}
                      aria-label={`Abrir la ficha de ${p.codigo}`}
                      className={`block cursor-pointer rounded-sm text-left hover:underline ${anilloFoco}`}
                    >
                      <span className="block font-medium">{p.nombre}</span>
                      <span className="block text-xs text-muted-foreground">{p.codigo}</span>
                    </button>
                    <CodigosProducto numero={p.numero} barras={p.barras} className="block" />
                    {ETIQUETA_CLASE[p.clase] && (
                      <span className="mt-1 inline-block">
                        <Badge tone="neutral">{ETIQUETA_CLASE[p.clase]}</Badge>
                      </span>
                    )}
                  </td>
                  <td className={`${claseCeldaColumna} text-right tabular-nums ${p.enSistema < 0 ? "text-destructive" : p.enSistema === 0 ? "text-muted-foreground" : ""}`}>{p.enSistema}</td>
                  <td className={claseCeldaColumna}>
                    {!p.manejaVencimiento ? (
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        aria-label={`Contado de ${p.codigo}`}
                        disabled={!puedeEscribir || pendiente || conCajas}
                        value={conCajas ? String(unidadesFormulario(cajas[p.id] ?? [])) : (contados[p.id] ?? "")}
                        onChange={(e) =>
                          setContados((x) => {
                            const y = { ...x };
                            if (e.target.value === "") delete y[p.id];
                            else y[p.id] = e.target.value;
                            return y;
                          })
                        }
                        placeholder="—"
                        className={`${fieldClassSm} w-28 text-right tabular-nums`}
                      />
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {lineasDe(p).map((l, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-1.5">
                            <input
                              aria-label={`Lote de ${p.codigo}`}
                              value={l.codigo}
                              readOnly={l.existente}
                              disabled={!puedeEscribir || pendiente}
                              onChange={(e) => cambiarLinea(p, i, { codigo: e.target.value })}
                              placeholder="Lote"
                              maxLength={80}
                              className={`${fieldClassSm} w-28 ${l.existente ? "bg-muted" : ""}`}
                            />
                            <input
                              type="date"
                              aria-label={`Vencimiento del lote de ${p.codigo}`}
                              value={l.vencimiento}
                              readOnly={l.existente}
                              disabled={!puedeEscribir || pendiente}
                              onChange={(e) => cambiarLinea(p, i, { vencimiento: e.target.value })}
                              className={`${fieldClassSm} w-36 ${l.existente ? "bg-muted" : ""}`}
                            />
                            <input
                              type="number"
                              min="0"
                              step="1"
                              inputMode="numeric"
                              aria-label={`Contado del lote ${l.codigo || "nuevo"} de ${p.codigo}`}
                              disabled={!puedeEscribir || pendiente}
                              value={l.cantidad}
                              onChange={(e) => cambiarLinea(p, i, { cantidad: e.target.value })}
                              placeholder={l.existente ? "0" : "—"}
                              className={`${fieldClassSm} w-20 text-right tabular-nums`}
                            />
                            <input
                              type="number"
                              min="0"
                              step="1"
                              inputMode="numeric"
                              aria-label={`Añadir al lote ${l.codigo || "nuevo"} de ${p.codigo}`}
                              disabled={!puedeEscribir || pendiente || conCajas}
                              value={l.sumar}
                              onChange={(e) => cambiarLinea(p, i, { sumar: e.target.value })}
                              placeholder="+ Añadir"
                              className={`${fieldClassSm} w-24 text-right tabular-nums`}
                            />
                            {!l.existente && (
                              <button
                                type="button"
                                aria-label={`Quitar el lote nuevo de ${p.codigo}`}
                                onClick={() => setLotes((x) => ({ ...x, [p.id]: lineasDe(p).filter((_, j) => j !== i) }))}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <PapeleraIcon className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        ))}
                        {puedeEscribir && (
                          <button
                            type="button"
                            disabled={pendiente}
                            onClick={() => setLotes((x) => ({ ...x, [p.id]: [...lineasDe(p), { codigo: "", vencimiento: "", cantidad: "", sumar: "", existente: false }] }))}
                            className={CLASE_ACCION_FILA}
                          >
                            <MasIcon className="h-3.5 w-3.5" aria-hidden="true" /> Agregar lote
                          </button>
                        )}
                      </div>
                    )}
                    {conCajas && (sumas[p.id] !== undefined || restas[p.id] !== undefined || traslados[p.id] !== undefined) && (
                      <p className="m-0 mt-1 text-xs text-warning">Con cajas, lo que entra se agrega como otra línea de cajas y lo que sale se resta de ellas.</p>
                    )}
                    {!conCajas && tieneCajas && !cajas[p.id] && (sumas[p.id] !== undefined || restas[p.id] !== undefined) && (
                      <p className="m-0 mt-1 text-xs text-warning">Tiene cajas: lo que se añade o se resta queda suelto, fuera de ellas.</p>
                    )}
                    <LineasCajas
                      codigo={p.codigo}
                      lineas={cajas[p.id] ?? p.cajas}
                      ubicaciones={ubicaciones}
                      deshabilitado={!puedeEscribir || pendiente}
                      alCambiar={(lineas) => setCajas((x) => ({ ...x, [p.id]: lineas }))}
                    />
                  </td>
                  <td className={claseCeldaColumna}>
                    {p.manejaVencimiento ? (
                      <span className="text-xs text-muted-foreground">En cada lote</span>
                    ) : (
                      <span className="relative inline-block">
                        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm font-semibold text-success">
                          +
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          aria-label={`Añadir a ${p.codigo}`}
                          disabled={!puedeEscribir || pendiente || conCajas}
                          value={sumas[p.id] ?? ""}
                          onChange={(e) =>
                            setSumas((x) => {
                              const y = { ...x };
                              if (e.target.value === "") delete y[p.id];
                              else y[p.id] = e.target.value;
                              return y;
                            })
                          }
                          placeholder="—"
                          className={`${fieldClassSm} w-24 pl-6 text-right tabular-nums`}
                        />
                      </span>
                    )}
                  </td>
                  <td className={claseCeldaColumna}>
                    {puedeRestar || !puedeEscribir ? (
                      <span className="relative inline-block">
                        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm font-semibold text-destructive">
                          −
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          aria-label={`Restar a ${p.codigo}`}
                          disabled={!puedeEscribir || pendiente || conCajas}
                          value={restas[p.id] ?? ""}
                          onChange={(e) => escribirRestar(p, e.target.value)}
                          placeholder="—"
                          className={`${fieldClassSm} w-24 pl-6 text-right tabular-nums`}
                        />
                      </span>
                    ) : (
                      <Tooltip texto="Solo un administrador resta a mano; usa Transferir">
                        <span className="relative inline-block">
                          <input type="number" aria-label={`Restar a ${p.codigo} (solo administradores)`} disabled placeholder="—" className={`${fieldClassSm} w-24 text-right`} />
                        </span>
                      </Tooltip>
                    )}
                  </td>
                  <td className={claseCeldaColumna}>
                    {tieneCajas || conCajas ? (
                      <span className="text-xs text-muted-foreground">Con cajas: usa «Nuevo traslado»</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          aria-label={`Cantidad a transferir de ${p.codigo}`}
                          disabled={!puedeEscribir || pendiente || destinos.length === 0}
                          value={traslado?.cantidad ?? ""}
                          onChange={(e) => cambiarTraslado(p, { cantidad: e.target.value })}
                          placeholder="Cant."
                          className={`${fieldClassSm} w-20 text-right tabular-nums`}
                        />
                        <select
                          aria-label={`Depósito de destino de ${p.codigo}`}
                          disabled={!puedeEscribir || pendiente || destinos.length === 0}
                          value={traslado?.destino ?? ""}
                          onChange={(e) => cambiarTraslado(p, { destino: e.target.value })}
                          className={`${fieldClassSm} w-36`}
                        >
                          <option value="">Depósito…</option>
                          {destinos.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </td>
                  <td className={`${claseCeldaColumna} text-right`}>
                    <Diferencia n={dif} />
                    {(sumar !== null || sale > 0) && <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">Quedará {queda.toLocaleString("es-PA")}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ContenedorTabla>

      {puedeEscribir && (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
          <p className="text-sm">
            <strong className="tabular-nums">{contadosTotal.length}</strong> productos contados · <strong className="tabular-nums">{unidadesContadas.toLocaleString("es-PA")}</strong> unidades contadas ·{" "}
            <strong className="tabular-nums">{conDiferencia}</strong> con diferencia · <strong className="tabular-nums">{unidadesEnSistema.toLocaleString("es-PA")}</strong> unidades en el sistema
            {conSuma.length > 0 && (
              <>
                {" "}
                · <strong className="tabular-nums">{unidadesPorSumar.toLocaleString("es-PA")}</strong> por añadir en <strong className="tabular-nums">{conSuma.length}</strong> {conSuma.length === 1 ? "producto" : "productos"}
              </>
            )}
            {conResta.length > 0 && (
              <>
                {" "}
                · <strong className="tabular-nums">{unidadesPorRestar.toLocaleString("es-PA")}</strong> por restar en <strong className="tabular-nums">{conResta.length}</strong> {conResta.length === 1 ? "producto" : "productos"}
              </>
            )}
            {conTraslado.length > 0 && (
              <>
                {" "}
                · <strong className="tabular-nums">{unidadesPorTransferir.toLocaleString("es-PA")}</strong> por transferir en <strong className="tabular-nums">{conTraslado.length}</strong> {conTraslado.length === 1 ? "producto" : "productos"}
              </>
            )}
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={guardar}
            disabled={pendiente || !hayQueGuardar}
            className="ml-auto min-h-10 rounded-md bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground"
          >
            {pendiente ? "Guardando…" : `Guardar levantamiento de ${nombreBodega}`}
          </button>
        </div>
      )}
      {/* Solo para consultar y dejar notas: lo que entra o sale se anota en el levantamiento. */}
      <FichaStock
        sku={productoFicha && { ...productoFicha, tipo: "simple" }}
        bodegasPropias={[]}
        bodegasExternas={[]}
        ubicaciones={[]}
        puedeEscribir={false}
        puedeComentar={puedeEscribir}
        codigoPais={codigoPais}
        alCerrar={() => setFicha(null)}
        alCambiar={() => router.refresh()}
      />
    </div>
  );
}
