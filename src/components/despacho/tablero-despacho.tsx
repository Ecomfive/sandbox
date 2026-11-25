"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent } from "react";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { archivarFila, cambiarCelda, comentarFila, crearFila, detalleFila, moverFila, restaurarFila, subirComprobante, type DetalleFila } from "@/app/(app)/despacho-ciudad/actions";
import { colorDe, diaTexto, ETIQUETAS, GRUPOS_DEVOLUCION, grupoPorAsesores, sumasGrupo, textoSobre, type Columna } from "@/lib/despacho/etiquetas";
import type { Clase, FilaTablero } from "@/lib/despacho/datos";
import { FechaHora } from "@/components/ui/fecha-hora";
import { VisorArchivos } from "./visor-archivos";
import { MenuDesplegable, TituloGrupoMenu, claseOpcionMenu } from "@/components/ui/menu-desplegable";
import { AgruparIcon, BuscarIcon, FiltroIcon, PersonaIcon } from "@/lib/nav-icons";

type Agrupar = "dia" | "courier" | "tienda";
type CampoNumero = "por_cobrar" | "cobrado" | "coste_envio";
type CampoTexto = "numero" | "comentario" | "obs_asesores";

const VALOR_ETIQUETA: Record<Columna, keyof FilaTablero> = {
  tienda: "tienda",
  courier: "courier",
  estado: "estado",
  edo_pago: "edoPago",
  forma_pago: "formaPago",
  turno: "turno",
  estado_asesores: "estadoAsesores",
};
const VALOR_NUMERO: Record<CampoNumero, keyof FilaTablero> = { por_cobrar: "porCobrar", cobrado: "cobrado", coste_envio: "costeEnvio" };
const VALOR_TEXTO: Record<CampoTexto, keyof FilaTablero> = { numero: "numero", comentario: "comentario", obs_asesores: "obsAsesores" };

const plata = (n: number) => `$${n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Los viajes que se hacen después de la entrega original (en Monday van en «Forma de pago»): cada uno es otro pago al mensajero. */
const TIPOS_VIAJE = ["CAMBIO", "RETIRO", "COMPLEMENTO"];
// La barra como la de Monday (24 nov 2026, pedido de despacho: «tantos botones pierden a la gente nueva»): Buscar, Repartidor, Filtrar y Agrupar, cada uno
// con su menú; lo que se está filtrando sale abajo en etiquetas que se quitan con ✕.
const ESTADOS_FILTRO = [
  ["ENTREGADO", "Entregados"],
  ["FALLIDO", "Fallidos"],
  ["RECOLECTADO", "Recolectados"],
  ["POSPUESTO", "Pospuestos"],
  ["DESINTEGRADO", "Desintegrados"],
  ["SIN", "Sin estado"],
] as const;
const CAMBIOS_FILTRO = [
  ["TODOS", "Cambios, retiros y complementos"],
  ["CAMBIO", "Cambios"],
  ["RETIRO", "Retiros"],
  ["COMPLEMENTO", "Complementos"],
] as const;
const AGRUPAR_OPCIONES = [
  ["dia", "Día"],
  ["courier", "Repartidor"],
  ["tienda", "Tienda"],
] as const;
const botonBarra = (activo: boolean) =>
  `inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium whitespace-nowrap ${activo ? "border-primario bg-primario-suave text-primario" : "border-border bg-card text-foreground-soft hover:bg-muted"}`;
const Marca = ({ activa, radio = false }: { activa: boolean; radio?: boolean }) => (
  <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center border text-[10px] font-bold ${radio ? "rounded-full" : "rounded"} ${activa ? "border-primario bg-primario text-white" : "border-border-control"}`}>
    {activa ? (radio ? "●" : "✓") : ""}
  </span>
);

const COLOR_DIA = ["#8a35c9", "#037f4c", "#007eb5", "#ff6d3b", "#9d50dd", "#fdab3d", "#df2f4a"];

const th = "sticky top-0 z-[1] border-b border-border bg-muted px-2 py-2 text-left text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap text-muted-foreground uppercase";
const td = "relative h-[38px] border-r border-b border-border/60 bg-card p-0 whitespace-nowrap";

/**
 * El tablero de Envíos Delivery o de Devoluciones (15 nov 2026), con las funciones de Monday: vista por repartidor (o por tienda en devoluciones), grupos
 * que se abren y se cierran, etiquetas de colores que se cambian con un toque, celdas que se escriben, filas que se arrastran a otro día o grupo, sumas
 * al pie, búsqueda y filtros, y el panel de cada fila con sus actualizaciones, su actividad y el comprobante.
 */
export function TableroDespacho({
  clase,
  filas: iniciales,
  puedeEscribir: puedeArchivar,
  hoy,
  archivados = false,
  mostrarHoy = true,
}: {
  clase: Clase;
  filas: FilaTablero[];
  puedeEscribir: boolean;
  hoy: string;
  /** Si el grupo de hoy sale aunque esté vacío (no, cuando se mira un día o un rango del pasado para un cierre). */
  mostrarHoy?: boolean;
  /** La vista de archivados: nada se edita, solo se restaura desde el panel. */
  archivados?: boolean;
}) {
  const puedeEscribir = puedeArchivar && !archivados;
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [guardando, empezar] = useTransition();
  const [filas, setFilas] = useState(iniciales);
  // Cuando el servidor manda filas nuevas (tras guardar), reemplazan a las de pantalla.
  const [previas, setPrevias] = useState(iniciales);
  if (previas !== iniciales) {
    setPrevias(iniciales);
    setFilas(iniciales);
  }
  const esCiudad = clase === "ciudad";
  const [vista, setVista] = useState<string>(esCiudad ? "TODOS" : "KENKU");
  // Varios estados a la vez (24 nov 2026, pedido de Soporte para los cierres de pago a los mensajeros: «Entregados» y «Fallidos» juntos); vacío = todos.
  const [estados, setEstados] = useState<string[]>([]);
  const alternarEstado = (id: string) => setEstados((es) => (id === "" ? [] : es.includes(id) ? es.filter((x) => x !== id) : [...es, id]));
  const [tienda, setTienda] = useState("");
  const [tipo, setTipo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [agrupar, setAgrupar] = useState<Agrupar>("dia");
  const [cerrados, setCerrados] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);

  /** Cambio en pantalla al instante; si el servidor no lo acepta, se avisa y se vuelve a leer. */
  const guardar = (itemId: string, local: Partial<FilaTablero>, accion: () => Promise<{ error?: string }>) => {
    setFilas((fs) => fs.map((f) => (f.itemId === itemId ? { ...f, ...local, editadoEn: new Date().toISOString() } : f)));
    setMenu(null);
    empezar(async () => {
      const r = await accion();
      if (r.error) mostrarToast(r.error, "destructive");
      router.refresh();
    });
  };
  const etiqueta = (f: FilaTablero, col: Columna, nombre: string) => {
    const local: Partial<FilaTablero> = { [VALOR_ETIQUETA[col]]: nombre || null } as Partial<FilaTablero>;
    const mover = col === "estado_asesores" && !esCiudad ? grupoPorAsesores(nombre) : null;
    if (mover) local.grupo = mover;
    guardar(f.itemId, local, () => cambiarCelda(f.itemId, col, nombre));
  };

  // Como en Monday, lo que anotan los demás aparece solo: cada 20 s se vuelve a leer, salvo mientras alguien escribe en una celda, tiene una lista
  // abierta, arrastra una fila o se está guardando un cambio (para no borrarle lo que está haciendo). Con la pestaña oculta no se lee.
  const quieto = useRef(true);
  useEffect(() => {
    quieto.current = !menu && !arrastrando && !guardando;
  }, [menu, arrastrando, guardando]);
  useEffect(() => {
    if (archivados) return;
    const id = setInterval(() => {
      const foco = document.activeElement;
      const escribiendo = foco instanceof HTMLInputElement || foco instanceof HTMLTextAreaElement || foco instanceof HTMLSelectElement;
      if (document.visibilityState === "visible" && quieto.current && !escribiendo) router.refresh();
    }, 20_000);
    return () => clearInterval(id);
  }, [router, archivados]);

  const tiendas = useMemo(() => {
    const presentes = new Set(filas.map((f) => f.tienda).filter(Boolean) as string[]);
    return [...ETIQUETAS.tienda.opciones.map((o) => o.nombre).filter((n) => presentes.has(n)), ...[...presentes].filter((p) => !ETIQUETAS.tienda.opciones.some((o) => o.nombre === p))];
  }, [filas]);

  const vistas = useMemo(() => {
    if (!esCiudad) return ETIQUETAS.tienda.opciones.map((o) => o.nombre).filter((t) => t === "KENKU" || filas.some((f) => f.tienda === t));
    const presentes = new Set(filas.map((f) => f.courier).filter(Boolean) as string[]);
    return ["TODOS", ...ETIQUETAS.courier.opciones.map((o) => o.nombre).filter((n) => presentes.has(n)), ...[...presentes].filter((p) => !ETIQUETAS.courier.opciones.some((o) => o.nombre === p))];
  }, [filas, esCiudad]);

  const visibles = useMemo(() => {
    const q = normal(busqueda.trim());
    return filas.filter(
      (f) =>
        (esCiudad ? vista === "TODOS" || f.courier === vista : f.tienda === vista) &&
        (!estados.length || estados.some((e) => (e === "SIN" ? !f.estado : f.estado === e))) &&
        (!tienda || f.tienda === tienda) &&
        (!tipo || (tipo === "TODOS" ? TIPOS_VIAJE.includes(f.formaPago ?? "") : f.formaPago === tipo)) &&
        (!q || normal(`${f.numero ?? ""} ${f.comentario ?? ""} ${f.obsAsesores ?? ""}`).includes(q)),
    );
  }, [filas, vista, estados, tienda, tipo, busqueda, esCiudad]);

  const grupos = useMemo(() => {
    const modo: Agrupar | "grupo" = esCiudad ? agrupar : "grupo";
    const claveDe = (f: FilaTablero) => (modo === "grupo" ? f.grupo : modo === "dia" ? (f.dia ?? "Sin día") : ((modo === "courier" ? f.courier : f.tienda) ?? "Sin asignar"));
    let claves: string[];
    if (modo === "grupo") claves = GRUPOS_DEVOLUCION.map((g) => g.nombre);
    else if (modo === "dia") claves = [...new Set([...(mostrarHoy ? [hoy] : []), ...visibles.map(claveDe)])].sort().reverse();
    else claves = [...new Set(visibles.map(claveDe))].sort();
    return claves.map((k, i) => {
      const lista = visibles.filter((f) => claveDe(f) === k).sort((a, b) => a.posicion - b.posicion || (a.numero ?? "").localeCompare(b.numero ?? ""));
      const color =
        modo === "grupo" ? (GRUPOS_DEVOLUCION.find((g) => g.nombre === k)?.color ?? "#8a35c9") : modo === "dia" ? COLOR_DIA[i % COLOR_DIA.length] : (colorDe(modo, k) ?? "#9ca3af");
      return { clave: k, titulo: modo === "dia" ? `${diaTexto(k === "Sin día" ? null : k)}${k === hoy ? " · hoy" : ""}` : k, color, filas: lista, sumas: sumasGrupo(lista) };
    });
  }, [visibles, agrupar, esCiudad, hoy, mostrarHoy]);

  const soltar = (destino: string) => (e: DragEvent) => {
    e.preventDefault();
    const id = arrastrando;
    setArrastrando(null);
    if (!id || !puedeEscribir) return;
    const f = filas.find((x) => x.itemId === id);
    if (!f) return;
    if (!esCiudad) return f.grupo !== destino && guardar(id, { grupo: destino }, () => moverFila(id, destino));
    if (agrupar === "dia") return f.dia !== destino && destino !== "Sin día" && guardar(id, { dia: destino }, () => moverFila(id, destino));
    if (destino !== "Sin asignar") etiqueta(f, agrupar, destino);
  };

  const agregar = () =>
    empezar(async () => {
      const r = await crearFila(clase, esCiudad ? hoy : GRUPOS_DEVOLUCION[0].nombre, { courier: esCiudad && vista !== "TODOS" ? vista : null, tienda: esCiudad ? null : vista });
      if (r.error) mostrarToast(r.error, "destructive");
      router.refresh();
    });

  // El resumen de lo que se ve con todos los filtros juntos: para el cierre y el pago de cada mensajero.
  const resumen = sumasGrupo(visibles);
  const fallidos = visibles.filter((f) => f.estado === "FALLIDO").length;
  const hayFiltros = estados.length > 0 || !!tienda || !!tipo || !!busqueda || (esCiudad && vista !== "TODOS");
  const limpiar = () => {
    setEstados([]);
    setTienda("");
    setTipo("");
    setBusqueda("");
    if (esCiudad) setVista("TODOS");
  };
  const cuantosFiltros = estados.length + (tienda ? 1 : 0) + (tipo ? 1 : 0);
  // Lo que se está filtrando, en etiquetas que se quitan con ✕ (como los filtros de Monday).
  const activos: { clave: string; texto: string; quitar: () => void }[] = [
    ...(esCiudad && vista !== "TODOS" ? [{ clave: "vista", texto: `Repartidor: ${vista}`, quitar: () => setVista("TODOS") }] : []),
    ...(busqueda.trim() ? [{ clave: "busqueda", texto: `Buscar: «${busqueda.trim()}»`, quitar: () => setBusqueda("") }] : []),
    ...(estados.length
      ? [{ clave: "estados", texto: `Estado: ${estados.map((e) => ESTADOS_FILTRO.find(([id]) => id === e)?.[1] ?? e).join(", ")}`, quitar: () => setEstados([]) }]
      : []),
    ...(tienda ? [{ clave: "tienda", texto: `Tienda: ${tienda}`, quitar: () => setTienda("") }] : []),
    ...(tipo ? [{ clave: "tipo", texto: CAMBIOS_FILTRO.find(([id]) => id === tipo)?.[1] ?? tipo, quitar: () => setTipo("") }] : []),
  ];
  const filaSel = filas.find((f) => f.itemId === sel) ?? null;

  const pill = (f: FilaTablero, col: Columna) => {
    const valor = f[VALOR_ETIQUETA[col]] as string | null;
    const color = colorDe(col, valor);
    const abierto = menu === `${f.itemId}:${col}`;
    return (
      <>
        <button
          type="button"
          disabled={!puedeEscribir}
          onClick={() => setMenu(abierto ? null : `${f.itemId}:${col}`)}
          aria-haspopup="listbox"
          aria-expanded={abierto}
          aria-label={`${ETIQUETAS[col].titulo}: ${valor ?? "vacío"}`}
          className={`block h-[38px] w-full px-2 text-xs font-semibold tracking-wide ${anilloFoco} ${puedeEscribir ? "cursor-pointer" : "cursor-default"}`}
          style={color ? { background: color, color: textoSobre(color) } : { background: "var(--muted)", color: "var(--muted-foreground)" }}
        >
          {valor ?? ""}
        </button>
        {abierto && (
          <div role="listbox" aria-label={ETIQUETAS[col].titulo} className="absolute top-10 left-0 z-30 grid min-w-48 gap-1 rounded-lg border border-border bg-card p-2 shadow-lg">
            {ETIQUETAS[col].opciones.map((o) => (
              <button key={o.nombre} type="button" role="option" aria-selected={o.nombre === valor} onClick={() => etiqueta(f, col, o.nombre)} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${anilloFoco}`} style={{ background: o.color, color: textoSobre(o.color) }}>
                {o.nombre}
              </button>
            ))}
            <button type="button" onClick={() => etiqueta(f, col, "")} className={`rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground-soft ${anilloFoco}`}>
              Dejar vacío
            </button>
          </div>
        )}
      </>
    );
  };

  const celda = (f: FilaTablero, campo: CampoNumero | CampoTexto, etiquetaAria: string, derecha = false) => {
    const esNum = campo in VALOR_NUMERO;
    const actual = f[(esNum ? VALOR_NUMERO[campo as CampoNumero] : VALOR_TEXTO[campo as CampoTexto]) as keyof FilaTablero] as string | number | null;
    const texto = actual === null || actual === undefined ? "" : String(actual);
    return (
      <input
        key={`${f.itemId}:${campo}:${texto}`}
        defaultValue={texto}
        readOnly={!puedeEscribir}
        inputMode={esNum ? "decimal" : undefined}
        aria-label={`${etiquetaAria} de ${f.numero ?? "la fila"}`}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v === texto) return;
          const local = esNum ? { [VALOR_NUMERO[campo as CampoNumero]]: v === "" ? null : Number(v.replace(",", ".")) } : { [VALOR_TEXTO[campo as CampoTexto]]: v || null };
          guardar(f.itemId, local as Partial<FilaTablero>, () => cambiarCelda(f.itemId, campo, v));
        }}
        className={`h-[38px] w-full border-0 bg-transparent px-2 text-[13px] focus:outline-2 focus:-outline-offset-2 focus:outline-primario ${derecha ? "text-right tabular-nums" : ""}`}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {puedeEscribir && (
          <button type="button" onClick={agregar} className={`boton-neon min-h-9 rounded-md px-3.5 text-[13px] font-medium text-white ${anilloFoco}`}>
            + {esCiudad ? "Agregar pedido" : "Agregar devolución"}
          </button>
        )}
        <label className="relative flex min-w-[12rem] flex-1 items-center sm:max-w-xs">
          <span className="sr-only">Buscar</span>
          <BuscarIcon aria-hidden="true" className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar pedido o comentario" className={`${fieldClass} w-full pl-8`} />
        </label>
        <MenuDesplegable
          etiqueta={esCiudad ? "Repartidor" : "Tienda"}
          alineacion="izquierda"
          claseMenu="w-64 max-h-[60vh] overflow-y-auto"
          claseBoton={botonBarra(esCiudad && vista !== "TODOS")}
          contenidoBoton={
            <>
              <PersonaIcon aria-hidden="true" className="h-4 w-4" />
              {esCiudad ? (vista === "TODOS" ? "Repartidor" : vista) : `Tienda: ${vista}`}
              <span aria-hidden="true">▾</span>
            </>
          }
        >
          {(cerrar) =>
            vistas.map((v) => (
              <button
                key={v}
                type="button"
                role="menuitemradio"
                aria-checked={vista === v}
                onClick={() => {
                  setVista(v);
                  cerrar(true);
                }}
                className={claseOpcionMenu}
              >
                <Marca activa={vista === v} radio />
                {v === "TODOS" ? "Todos (consolidado)" : v}
              </button>
            ))
          }
        </MenuDesplegable>
        <MenuDesplegable
          etiqueta="Filtrar"
          alineacion="izquierda"
          claseMenu="w-80 max-h-[70vh] overflow-y-auto"
          claseBoton={botonBarra(cuantosFiltros > 0)}
          contenidoBoton={
            <>
              <FiltroIcon aria-hidden="true" className="h-4 w-4" />
              Filtrar{cuantosFiltros ? ` · ${cuantosFiltros}` : ""}
              <span aria-hidden="true">▾</span>
            </>
          }
        >
          {() => (
            <>
              <TituloGrupoMenu>Estado (uno o varios)</TituloGrupoMenu>
              {ESTADOS_FILTRO.map(([id, nombre]) => (
                <button key={id} type="button" role="menuitemcheckbox" aria-checked={estados.includes(id)} onClick={() => alternarEstado(id)} className={claseOpcionMenu}>
                  <Marca activa={estados.includes(id)} />
                  {nombre}
                </button>
              ))}
              {esCiudad && (
                <>
                  <TituloGrupoMenu>Tienda</TituloGrupoMenu>
                  {["", ...tiendas].map((t) => (
                    <button key={t || "todas"} type="button" role="menuitemradio" aria-checked={tienda === t} onClick={() => setTienda(t)} className={claseOpcionMenu}>
                      <Marca activa={tienda === t} radio />
                      {t || "Todas"}
                    </button>
                  ))}
                  <TituloGrupoMenu>Cambios, retiros y complementos</TituloGrupoMenu>
                  {[["", "Todos los pedidos"] as const, ...CAMBIOS_FILTRO].map(([id, nombre]) => (
                    <button key={id || "todos"} type="button" role="menuitemradio" aria-checked={tipo === id} onClick={() => setTipo(id)} className={claseOpcionMenu}>
                      <Marca activa={tipo === id} radio />
                      {nombre}
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </MenuDesplegable>
        {esCiudad && (
          <MenuDesplegable
            etiqueta="Agrupar por"
            alineacion="izquierda"
            claseMenu="w-52"
            claseBoton={botonBarra(agrupar !== "dia")}
            contenidoBoton={
              <>
                <AgruparIcon aria-hidden="true" className="h-4 w-4" />
                Agrupar: {AGRUPAR_OPCIONES.find(([id]) => id === agrupar)?.[1]}
                <span aria-hidden="true">▾</span>
              </>
            }
          >
            {(cerrar) =>
              AGRUPAR_OPCIONES.map(([id, nombre]) => (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={agrupar === id}
                  onClick={() => {
                    setAgrupar(id);
                    cerrar(true);
                  }}
                  className={claseOpcionMenu}
                >
                  <Marca activa={agrupar === id} radio />
                  {nombre}
                </button>
              ))
            }
          </MenuDesplegable>
        )}
        {hayFiltros && (
          <button type="button" onClick={limpiar} className={`min-h-9 rounded-md px-2.5 text-[13px] font-medium text-primario underline-offset-2 hover:underline ${anilloFoco}`}>
            Limpiar filtros
          </button>
        )}
      </div>

      {activos.length > 0 && (
        <ul aria-label="Filtros puestos" className="m-0 -mt-2 flex list-none flex-wrap gap-1.5 p-0">
          {activos.map((a) => (
            <li key={a.clave}>
              <button type="button" onClick={a.quitar} aria-label={`Quitar el filtro ${a.texto}`} className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border border-primario/40 bg-primario-suave px-3 text-xs font-medium text-primario hover:bg-primario/15 ${anilloFoco}`}>
                {a.texto}
                <span aria-hidden="true">✕</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-primario/30 bg-primario-suave px-3 py-2 text-[13px]" aria-live="polite">
        <span>
          <b>{resumen.pedidos}</b> pedidos
        </span>
        <span>
          <b>{resumen.entregados}</b> entregados
        </span>
        <span>
          <b>{fallidos}</b> fallidos
        </span>
        <span>
          <b>{plata(resumen.cobrado)}</b> cobrado
        </span>
        <span>
          <b>{plata(resumen.porCobrar)}</b> por cobrar
        </span>
        <span>
          <b>{plata(resumen.costeEnvio)}</b> coste de envío
        </span>
      </p>

      <div className="grid grid-cols-1 items-start gap-4 min-[1300px]:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-5">
          {grupos.map((g) => {
            const abierto = !cerrados[g.clave];
            return (
              <section key={g.clave} aria-label={g.titulo} onDragOver={(e) => e.preventDefault()} onDrop={soltar(g.clave)} className={`flex flex-col gap-1.5 rounded-xl ${arrastrando ? "outline-2 outline-offset-4 outline-primario/30 outline-dashed" : ""}`}>
                <div className="flex items-center gap-3">
                  <button type="button" aria-expanded={abierto} onClick={() => setCerrados((c) => ({ ...c, [g.clave]: abierto }))} className={`text-base font-bold ${anilloFoco}`} style={{ color: g.color }}>
                    {abierto ? "▾" : "▸"} {g.titulo}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {g.filas.length} pedido{g.filas.length === 1 ? "" : "s"}
                  </span>
                </div>
                {abierto && (
                  <div className="overflow-x-auto rounded-[10px] border border-border bg-card" style={{ borderLeft: `4px solid ${g.color}` }}>
                    <table className="w-full border-separate border-spacing-0 text-[13px]">
                      <thead>
                        <tr>
                          <th scope="col" className={`${th} min-w-32`}>Pedido</th>
                          {esCiudad && <th scope="col" className={`${th} min-w-24`}>Tienda</th>}
                          <th scope="col" className={`${th} min-w-24`}>Actualizado</th>
                          <th scope="col" className={`${th} min-w-36`}>Repartidor</th>
                          <th scope="col" className={`${th} min-w-28`}>Estado</th>
                          <th scope="col" className={`${th} min-w-24`}>Edo. pago</th>
                          {esCiudad && <th scope="col" className={`${th} min-w-28`}>Forma de pago</th>}
                          <th scope="col" className={`${th} min-w-24 text-right`}>$ Por cobrar</th>
                          {esCiudad && <th scope="col" className={`${th} min-w-24 text-right`}>$ Cobrado</th>}
                          <th scope="col" className={`${th} min-w-24`}>Comprobante</th>
                          <th scope="col" className={`${th} min-w-48`}>Comentario</th>
                          <th scope="col" className={`${th} min-w-20 text-right`}>Coste envío</th>
                          {esCiudad ? (
                            <th scope="col" className={`${th} min-w-32`}>Cambio / retiro / turno</th>
                          ) : (
                            <>
                              <th scope="col" className={`${th} min-w-32`}>Estado asesores</th>
                              <th scope="col" className={`${th} min-w-52`}>Observaciones asesores</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {g.filas.map((f) => (
                          <tr key={f.itemId} draggable={puedeEscribir} onDragStart={() => setArrastrando(f.itemId)} onDragEnd={() => setArrastrando(null)} className={sel === f.itemId ? "[&>td]:bg-primario-suave" : "hover:[&>td]:bg-muted/60"}>
                            <td className={td} style={{ borderLeft: `4px solid ${g.color}` }}>
                              <div className="flex items-center gap-1 pr-1">
                                {puedeEscribir && (
                                  <span aria-hidden="true" className="cursor-grab pl-1 text-muted-foreground">
                                    ⋮⋮
                                  </span>
                                )}
                                <div className="min-w-0 flex-1 font-semibold">
                                  {celda(f, "numero", "Número de pedido")}
                                </div>
                                {/* Marcado por el repartidor desde su panel (24 nov 2026): se ve aquí al instante. */}
                                {f.desdePanel && (
                                  <span title={f.marcadoEn ? `Marcado desde su panel el ${new Date(f.marcadoEn).toLocaleString("es-PA", { timeZone: "America/Panama", dateStyle: "short", timeStyle: "short" })}` : "Marcado desde su panel"} className="shrink-0 rounded-full bg-primario-suave px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-[#5b2386]">
                                    desde su panel
                                  </span>
                                )}
                                <button type="button" onClick={() => setSel(f.itemId)} className={`rounded px-1.5 py-1 text-xs font-medium text-primario hover:bg-primario-suave ${anilloFoco}`} aria-label={`Abrir ${f.numero ?? "la fila"}`}>
                                  Abrir
                                </button>
                              </div>
                            </td>
                            {esCiudad && (
                              <td className={td}>
                                {pill(f, "tienda")}
                              </td>
                            )}
                            <td className={`${td} px-2 text-xs text-muted-foreground`}>{f.editadoEn || f.actualizado ? <FechaHora iso={(f.editadoEn ?? f.actualizado)!} /> : "—"}</td>
                            <td className={td}>
                              {pill(f, "courier")}
                            </td>
                            <td className={td}>
                              {pill(f, "estado")}
                            </td>
                            <td className={td}>
                              {pill(f, "edo_pago")}
                            </td>
                            {esCiudad && (
                              <td className={td}>
                                {pill(f, "forma_pago")}
                              </td>
                            )}
                            <td className={td}>
                              {celda(f, "por_cobrar", "$ Por cobrar", true)}
                            </td>
                            {esCiudad && (
                              <td className={td}>
                                {celda(f, "cobrado", "$ Cobrado", true)}
                              </td>
                            )}
                            <td className={td}>
                              <button type="button" onClick={() => setSel(f.itemId)} className={`h-[38px] w-full px-2 text-left text-xs ${f.comprobantes ? "font-semibold text-primario" : "text-muted-foreground"} ${anilloFoco}`}>
                                {f.comprobantes ? `Ver (${f.comprobantes})` : puedeEscribir ? "+ Subir" : "—"}
                              </button>
                            </td>
                            <td className={td}>
                              {celda(f, "comentario", "Comentario")}
                            </td>
                            <td className={td}>
                              {celda(f, "coste_envio", "Coste envío", true)}
                            </td>
                            {esCiudad ? (
                              <td className={td}>
                                {pill(f, "turno")}
                              </td>
                            ) : (
                              <>
                                <td className={td}>
                                  {pill(f, "estado_asesores")}
                                </td>
                                <td className={td}>
                                  {celda(f, "obs_asesores", "Observaciones asesores")}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                        {!g.filas.length && (
                          <tr>
                            <td colSpan={esCiudad ? 13 : 12} className="px-3 py-4 text-center text-xs text-muted-foreground">
                              {puedeEscribir ? "Sin pedidos: arrastra uno aquí o agrega uno nuevo." : "Sin pedidos."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={esCiudad ? 7 : 5} className="bg-muted px-3 py-2 text-xs text-muted-foreground">
                            {g.sumas.entregados} de {g.sumas.pedidos} entregados
                          </td>
                          <td className="bg-muted px-2 py-2 text-right text-xs font-semibold tabular-nums">{plata(g.sumas.porCobrar)}</td>
                          {esCiudad && <td className="bg-muted px-2 py-2 text-right text-xs font-semibold tabular-nums">{plata(g.sumas.cobrado)}</td>}
                          <td colSpan={2} className="bg-muted" />
                          <td className="bg-muted px-2 py-2 text-right text-xs font-semibold tabular-nums">{plata(g.sumas.costeEnvio)}</td>
                          <td colSpan={esCiudad ? 1 : 2} className="bg-muted" />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
        {filaSel && <PanelFila key={filaSel.itemId} fila={filaSel} puedeEscribir={puedeEscribir} puedeArchivar={puedeArchivar} archivada={archivados} alCerrar={() => setSel(null)} />}
      </div>
      {menu && <button type="button" aria-label="Cerrar la lista" onClick={() => setMenu(null)} className="fixed inset-0 z-20 cursor-default bg-transparent" />}
    </div>
  );
}

/** El panel de una fila: comprobantes (subir y ver), actualizaciones del equipo, el registro de quién cambió qué, y archivar o restaurar la fila. */
function PanelFila({
  fila,
  puedeEscribir,
  puedeArchivar,
  archivada,
  alCerrar,
}: {
  fila: FilaTablero;
  puedeEscribir: boolean;
  puedeArchivar: boolean;
  archivada: boolean;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const router = useRouter();
  const [detalle, setDetalle] = useState<DetalleFila | null>(null);
  const [texto, setTexto] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const archivarORestaurar = () =>
    empezar(async () => {
      const r = archivada ? await restaurarFila(fila.itemId) : await archivarFila(fila.itemId);
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast(archivada ? "Fila restaurada: vuelve a su tablero." : "Fila archivada: la encuentras en «Archivados».", "success");
      alCerrar();
      router.refresh();
    });
  const [ocupado, empezar] = useTransition();
  const archivo = useRef<HTMLInputElement>(null);
  const cargar = () =>
    detalleFila(fila.itemId).then((d) => {
      if ("error" in d) mostrarToast(d.error, "destructive");
      else setDetalle(d);
    });
  useEffect(() => {
    let vivo = true;
    detalleFila(fila.itemId).then((d) => vivo && !("error" in d) && setDetalle(d));
    return () => {
      vivo = false;
    };
  }, [fila.itemId, fila.editadoEn]);
  return (
    <aside aria-label={`Pedido ${fila.numero ?? ""}`} className="flex w-full flex-col gap-4 rounded-2xl border border-border bg-card p-4 min-[1300px]:sticky min-[1300px]:top-4 min-[1300px]:w-[380px]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-lg font-bold">Pedido {fila.numero ?? "sin número"}</h2>
        <button type="button" onClick={alCerrar} className={`rounded-md border border-border px-3 py-1.5 text-sm ${anilloFoco}`}>
          Cerrar
        </button>
      </div>
      <p className="m-0 text-[13px] text-muted-foreground">{[fila.tienda, fila.courier, fila.estado ?? "sin estado", fila.dia ? diaTexto(fila.dia) : fila.grupo].filter(Boolean).join(" · ")}</p>
      {!fila.ordenId && fila.numero && <p className="m-0 rounded-md bg-warning-soft px-3 py-2 text-xs">No se encontró este pedido en el sistema: revisa el número y la tienda.</p>}

      <section className="flex flex-col gap-2" aria-labelledby="t-comp">
        <h3 id="t-comp" className="m-0 text-[13px] font-semibold">
          Comprobante
        </h3>
        {detalle?.comprobantes.length ? (
          <VisorArchivos archivos={detalle.comprobantes} titulo="Comprobante" />
        ) : (
          <p className="m-0 text-xs text-muted-foreground">{detalle ? "Sin comprobante." : "Cargando…"}</p>
        )}
        {puedeEscribir && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const datos = new FormData(e.currentTarget);
              empezar(async () => {
                const r = await subirComprobante(fila.itemId, datos);
                if (r.error) mostrarToast(r.error, "destructive");
                else {
                  if (archivo.current) archivo.current.value = "";
                  mostrarToast("Comprobante subido.", "success");
                  await cargar();
                  router.refresh();
                }
              });
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <label className="text-xs text-muted-foreground">
              <span className="sr-only">Foto o PDF del comprobante</span>
              <input ref={archivo} type="file" name="archivo" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" required className="max-w-[14rem] text-xs" />
            </label>
            <button type="submit" disabled={ocupado} className={`rounded-md border border-border px-3 py-1.5 text-xs font-medium ${anilloFoco}`}>
              Subir
            </button>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="t-notas">
        <h3 id="t-notas" className="m-0 text-[13px] font-semibold">
          Actualizaciones
        </h3>
        {puedeEscribir && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              empezar(async () => {
                const r = await comentarFila(fila.itemId, texto);
                if (r.error) mostrarToast(r.error, "destructive");
                else {
                  setTexto("");
                  await cargar();
                }
              });
            }}
            className="flex flex-col gap-1.5"
          >
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Escribe una actualización
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={2000} className={`${fieldClass} resize-y`} />
            </label>
            <button type="submit" disabled={ocupado || !texto.trim()} className={`boton-neon self-start rounded-md px-3 py-1.5 text-xs font-medium text-white ${anilloFoco}`}>
              Publicar
            </button>
          </form>
        )}
        {detalle?.notas.map((n) => (
          <div key={n.id} className="rounded-lg border border-border/70 p-2.5 text-[13px]">
            <div className="text-xs font-semibold">
              {n.autor} <span className="font-normal text-muted-foreground">· <FechaHora iso={n.cuando} /></span>
            </div>
            <p className="m-0 mt-1 whitespace-pre-line">{n.texto}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-1" aria-labelledby="t-act">
        <h3 id="t-act" className="m-0 text-[13px] font-semibold">
          Registro de actividad
        </h3>
        {detalle?.actividad.length ? (
          detalle.actividad.map((a) => (
            <p key={a.id} className="m-0 border-b border-border/50 py-1 text-xs">
              {a.texto} <span className="text-muted-foreground">· {a.autor}, <FechaHora iso={a.cuando} /></span>
            </p>
          ))
        ) : (
          <p className="m-0 text-xs text-muted-foreground">{fila.origen === "monday" && !fila.editadoEn ? "Viene de Monday: todavía no se cambió en el sistema." : "Sin cambios registrados."}</p>
        )}
      </section>

      {puedeArchivar && (
        <section className="flex flex-col gap-2 border-t border-border pt-3" aria-label={archivada ? "Restaurar" : "Archivar"}>
          {archivada ? (
            <>
              <p className="m-0 text-xs text-muted-foreground">Esta fila está archivada: no cuenta en el pedido ni en Cobros.</p>
              <button type="button" disabled={ocupado} onClick={archivarORestaurar} className={`boton-neon self-start rounded-md px-3 py-1.5 text-xs font-medium text-white ${anilloFoco}`}>
                Restaurar al tablero
              </button>
            </>
          ) : confirmar ? (
            <>
              <p className="m-0 text-xs">¿Archivar esta fila? Sale del tablero y deja de contar en el pedido y en Cobros. No se borra: la puedes restaurar desde «Archivados».</p>
              <div className="flex gap-2">
                <button type="button" disabled={ocupado} onClick={archivarORestaurar} className={`rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white ${anilloFoco}`}>
                  Sí, archivar
                </button>
                <button type="button" onClick={() => setConfirmar(false)} className={`rounded-md border border-border px-3 py-1.5 text-xs ${anilloFoco}`}>
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmar(true)} className={`self-start rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground-soft hover:bg-muted ${anilloFoco}`}>
              Archivar fila
            </button>
          )}
        </section>
      )}
    </aside>
  );
}
