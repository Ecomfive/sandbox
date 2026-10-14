"use client";

import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useTransition } from "react";
import { FotoAmpliable, HistorialCompetencia } from "@/components/competencia/piezas-competencia";
import { BotonBarra, CabeceraTarjeta, Indicador } from "@/components/panel/piezas-panel";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatearFechaHora } from "@/lib/formato";
import { marcarAlertasVistas } from "./actions";
import type { AlertaC, CompetidorC, DatosCompetencia, FilaNuestro, ProductoC } from "./def-competencia";

const usd = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);
const num = (n: number | null) => (n === null ? "—" : n.toLocaleString("es-PA"));
const segundos = (ms: number | null) => (ms === null ? "" : ms < 90_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);
/** Cuántos productos de un competidor se ven al abrirlo (el resto, con «Ver todos»). */
const PRIMEROS = 25;

// Cada alerta lleva un punto del color de su tipo junto al título (la regla del sistema: un punto, no una caja).
const TIPO: Record<string, { etiqueta: string; tono: "destructive" | "warning" | "neutral"; punto: string }> = {
  mas_barato: { etiqueta: "Más barato que nosotros", tono: "destructive", punto: "bg-destructive" },
  bajo_precio: { etiqueta: "Bajó precio", tono: "warning", punto: "bg-warning" },
  bajo_stock: { etiqueta: "Bajó stock", tono: "warning", punto: "bg-warning" },
  desaparecio: { etiqueta: "Desapareció", tono: "neutral", punto: "bg-border-control" },
  competidor_nuevo: { etiqueta: "Competidor nuevo", tono: "neutral", punto: "bg-border-control" },
};

// ---------- Datos derivados ----------

/** Cada producto nuestro con los iguales de la competencia (más baratos primero) y la diferencia con el más bajo. */
export function filasNuestras(productos: ProductoC[]): FilaNuestro[] {
  const iguales = new Map<string, ProductoC[]>();
  for (const p of productos) if (p.igualA && p.estado === "activo") iguales.set(p.igualA, [...(iguales.get(p.igualA) ?? []), p]);
  return productos
    .filter((p) => p.esNuestro && p.estado === "activo")
    .map((n) => {
      const lista = (iguales.get(n.id) ?? []).sort((a, b) => (a.precio ?? 1e9) - (b.precio ?? 1e9));
      const precios = lista.map((l) => l.precio).filter((x): x is number => x !== null);
      const minimo = precios.length ? Math.min(...precios) : null;
      return {
        nuestro: n,
        iguales: lista,
        minimo,
        diferencia: minimo !== null && n.precio !== null ? Math.round((minimo - n.precio) * 100) / 100 : null,
        bajo7: lista.reduce((t, l) => t + l.bajo7, 0),
      };
    })
    .sort((a, b) => b.iguales.length - a.iguales.length || a.nuestro.nombre.localeCompare(b.nuestro.nombre));
}

// ---------- Barra de indicadores ----------

/** Los indicadores de arriba, con el borde neón de los dashboards del sistema (en las dos pestañas). */
export function ResumenCompetencia({ datos }: { datos: DatosCompetencia }) {
  const filas = useMemo(() => filasNuestras(datos.productos), [datos.productos]);
  const conCompetencia = filas.filter((f) => f.iguales.length).length;
  const masBaratos = filas.filter((f) => f.diferencia !== null && f.diferencia < 0).length;
  const sinVer = datos.alertas.filter((a) => !a.vista).length;
  const vendido7 = datos.competidores.reduce((t, c) => t + c.bajo7, 0);
  const competencia = datos.productos.filter((p) => !p.esNuestro && p.estado === "activo").length;
  return (
    <section aria-label="Indicadores de la competencia" className="marco-neon overflow-hidden rounded-[10px] border border-border bg-card">
      <div className="flex flex-wrap">
        <Indicador titulo={`Competidores en Dropi ${datos.pais}`} valor={num(datos.competidores.length)} detalle={`${num(competencia)} productos suyos`} />
        <Indicador titulo="Nuestros productos con competencia" valor={`${conCompetencia} de ${filas.length}`} detalle="ECOMFIVE" />
        <Indicador titulo="Venden más barato que nosotros" punto={masBaratos ? "peligro" : undefined} valor={num(masBaratos)} detalle="productos nuestros" />
        <Indicador titulo="Stock vendido por la competencia" valor={num(vendido7)} detalle="unidades en 7 días" />
        <Indicador
          titulo="Novedades sin ver"
          punto={sinVer ? "peligro" : undefined}
          valor={num(sinVer)}
          detalle={datos.ultima ? `última búsqueda ${formatearFechaHora(datos.ultima.inicio)} · ${segundos(datos.ultima.duracionMs)}` : "sin búsquedas"}
        />
      </div>
    </section>
  );
}

// ---------- Novedades ----------

function Novedades({ alertas, alAbrir, puedeEscribir, busquedas }: { alertas: AlertaC[]; alAbrir: (a: AlertaC) => void; puedeEscribir: boolean; busquedas: number }) {
  const [verVistas, setVerVistas] = useState(false);
  const [todas, setTodas] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const { mostrarToast } = useToast();
  const router = useRouter();
  const sinVer = alertas.filter((a) => !a.vista);
  const lista = verVistas ? alertas : sinVer;
  const visibles = todas ? lista : lista.slice(0, 6);
  const marcar = (ids?: string[]) =>
    iniciar(async () => {
      const r = await marcarAlertasVistas(ids);
      if (r.error) return mostrarToast(r.error, "destructive");
      router.refresh();
    });

  return (
    <section aria-labelledby="titulo-novedades" className="rounded-[10px] border border-border bg-card">
      <CabeceraTarjeta id="titulo-novedades" titulo={`Novedades${sinVer.length ? ` · ${sinVer.length} sin ver` : ""}`}>
        <span className="flex items-center gap-2">
          <button type="button" aria-pressed={verVistas} onClick={() => setVerVistas(!verVistas)} className={`rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground ${anilloFoco}`}>
            {verVistas ? "Solo sin ver" : "Ver también las vistas"}
          </button>
          {puedeEscribir && sinVer.length > 0 && (
            <BotonBarra disabled={pendiente} onClick={() => marcar()} className="!h-7 !text-xs">
              Marcar todas como vistas
            </BotonBarra>
          )}
        </span>
      </CabeceraTarjeta>
      {!visibles.length ? (
        <p className="px-3.5 py-3 text-sm text-muted-foreground">
          {busquedas > 1 ? "Sin novedades: ningún cambio de precio o stock en los productos iguales a los nuestros ni competidores nuevos." : "Las novedades empiezan en la segunda búsqueda: la primera solo guarda cómo está todo hoy."}
        </p>
      ) : (
        <ul className="flex flex-col">
          {visibles.map((a) => {
            const t = TIPO[a.tipo] ?? TIPO.competidor_nuevo;
            return (
              <li key={a.id} className={`flex flex-wrap items-center gap-3 border-b border-border px-3.5 py-2 last:border-0 ${a.vista ? "opacity-70" : ""}`}>
                <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${t.punto}`} />
                <button type="button" onClick={() => alAbrir(a)} className={`flex min-w-0 flex-1 flex-col text-left hover:underline ${anilloFoco}`}>
                  <span className="text-sm font-medium">{a.titulo}</span>
                  {a.detalle && <span className="text-xs text-muted-foreground">{a.detalle}</span>}
                </button>
                <Badge tone={t.tono}>{t.etiqueta}</Badge>
                <span className="text-xs whitespace-nowrap text-muted-foreground">{formatearFechaHora(a.fecha)}</span>
                {puedeEscribir && !a.vista && (
                  <button type="button" disabled={pendiente} onClick={() => marcar([a.id])} className={`rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground ${anilloFoco}`}>
                    Vista
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {lista.length > 6 && (
        <button type="button" onClick={() => setTodas(!todas)} className={`w-full border-t border-border px-3.5 py-2 text-left text-xs text-primario hover:bg-muted ${anilloFoco}`}>
          {todas ? "Ver menos" : `Ver las ${lista.length} novedades`}
        </button>
      )}
    </section>
  );
}

// ---------- Un competidor (se abre en su sitio) ----------

function ProductosDelCompetidor({ productos, nuestros, busqueda }: { productos: ProductoC[]; nuestros: Map<string, ProductoC>; busqueda: string }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [todos, setTodos] = useState(false);
  const orden = useMemo(
    () =>
      productos
        .filter((p) => !busqueda || p.nombre.toLowerCase().includes(busqueda))
        .sort((a, b) => Number(!!b.igualA) - Number(!!a.igualA) || b.bajo7 - a.bajo7 || b.bajo30 - a.bajo30 || (b.stock ?? 0) - (a.stock ?? 0)),
    [productos, busqueda],
  );
  const visibles = todos ? orden : orden.slice(0, PRIMEROS);
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className={claseFilaEncabezado}>
              <th className={claseEncabezadoColumna}>Producto</th>
              <th className={`${claseEncabezadoColumna} text-right`}>Su precio</th>
              <th className={claseEncabezadoColumna}>Igual a nuestro</th>
              <th className={`${claseEncabezadoColumna} text-right`}>Stock</th>
              <th className={`${claseEncabezadoColumna} text-right`}>Vendido 7 d</th>
              <th className={`${claseEncabezadoColumna} text-right`}>30 d</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => {
              const n = p.igualA ? nuestros.get(p.igualA) : undefined;
              const dif = n && n.precio !== null && p.precio !== null ? Math.round((p.precio - n.precio) * 100) / 100 : null;
              const ab = abierto === p.id;
              return (
                <Fragment key={p.id}>
                  <tr className="border-b border-border align-middle last:border-0 hover:bg-muted/50">
                    <td className={claseCeldaColumna}>
                      <span className="flex min-w-[15rem] items-center gap-2.5">
                        <FotoAmpliable url={p.foto} nombre={p.nombre} tam="h-9 w-9" />
                        <span className="flex min-w-0 flex-col">
                          <span className="font-medium">{p.nombre}</span>
                          <button
                            type="button"
                            aria-expanded={ab}
                            onClick={() => setAbierto(ab ? null : p.id)}
                            className={`self-start rounded text-xs text-primario hover:underline ${anilloFoco}`}
                          >
                            {ab ? "Ocultar historial" : "Ver historial"}
                          </button>
                        </span>
                      </span>
                    </td>
                    <td className={`${claseCeldaColumna} text-right font-medium tabular-nums ${dif !== null && dif < 0 ? "text-destructive" : ""}`}>{usd(p.precio)}</td>
                    <td className={claseCeldaColumna}>
                      {n ? (
                        <span className="flex flex-col items-start gap-0.5">
                          <span className="text-xs">
                            {n.nombre} · <span className="tabular-nums">{usd(n.precio)}</span>
                          </span>
                          {dif !== null && dif < 0 && <Badge tone="destructive">Más barato por {usd(-dif)}</Badge>}
                          {dif !== null && dif > 0 && <Badge tone="success">Nosotros más baratos</Badge>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={`${claseCeldaColumna} text-right tabular-nums`}>{num(p.stock)}</td>
                    <td className={`${claseCeldaColumna} text-right tabular-nums ${p.bajo7 ? "text-destructive" : "text-muted-foreground"}`}>{p.bajo7 ? `−${num(p.bajo7)}` : "0"}</td>
                    <td className={`${claseCeldaColumna} text-right tabular-nums ${p.bajo30 ? "text-destructive" : "text-muted-foreground"}`}>{p.bajo30 ? `−${num(p.bajo30)}` : "0"}</td>
                  </tr>
                  {ab && (
                    <tr className="border-b border-border bg-muted/40">
                      <td colSpan={6} className="px-4 py-3">
                        <HistorialCompetencia productoId={p.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {orden.length > PRIMEROS && (
        <button type="button" onClick={() => setTodos(!todos)} className={`self-start rounded px-1.5 py-0.5 text-xs text-primario hover:underline ${anilloFoco}`}>
          {todos ? "Ver menos" : `Ver los ${orden.length} productos`}
        </button>
      )}
    </div>
  );
}

function TarjetaCompetidor({
  c,
  productos,
  nuestros,
  abierto,
  alAlternar,
  busqueda,
}: {
  c: CompetidorC & { igualesN: number; baratos: number; cambiosHoy: number; nuevo: boolean };
  productos: ProductoC[];
  nuestros: Map<string, ProductoC>;
  abierto: boolean;
  alAlternar: () => void;
  busqueda: string;
}) {
  return (
    <article id={`competidor-${c.id}`} className={`overflow-hidden rounded-[10px] border bg-card ${abierto ? "border-primario shadow-[0_0_0_1px_var(--primario)]" : "border-border"}`}>
      <button
        type="button"
        aria-expanded={abierto}
        onClick={alAlternar}
        className={`grid w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-3 px-3.5 py-3 text-left hover:bg-muted sm:grid-cols-[18px_minmax(0,1.5fr)_repeat(4,minmax(0,1fr))] ${anilloFoco}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-4 w-4 text-muted-foreground transition-transform motion-reduce:transition-none ${abierto ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m9 6 6 6-6 6" />
        </svg>
        <span className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{c.nombre}</span>
            {c.nuevo && <Badge>Nuevo</Badge>}
          </span>
          <span className="text-xs text-muted-foreground">{c.cambiosHoy ? `${c.cambiosHoy} ${c.cambiosHoy === 1 ? "cambio" : "cambios"} en la última búsqueda` : "sin cambios en la última búsqueda"}</span>
        </span>
        <Dato titulo="Productos" valor={num(c.productos)} />
        <Dato titulo="Iguales a los nuestros" valor={num(c.igualesN)} extra={c.baratos ? <Badge tone="destructive">{c.baratos} más baratos</Badge> : null} />
        <Dato titulo="Vendido 7 d" valor={num(c.bajo7)} />
        <Dato titulo="Vendido 30 d" valor={num(c.bajo30)} />
      </button>
      {abierto && (
        <div className="flex flex-col gap-2 border-t border-border bg-muted/50 px-3.5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Los iguales a los nuestros primero; luego lo que más vendió.</span>
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-primario underline-offset-2 hover:underline">
              Abrir su página en Dropi ↗
            </a>
          </div>
          <ProductosDelCompetidor productos={productos} nuestros={nuestros} busqueda={busqueda} />
        </div>
      )}
    </article>
  );
}

function Dato({ titulo, valor, extra }: { titulo: string; valor: string; extra?: React.ReactNode }) {
  return (
    <span className="hidden min-w-0 flex-col sm:flex">
      <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{titulo}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold tabular-nums">{valor}</span>
        {extra}
      </span>
    </span>
  );
}

// ---------- La pantalla ----------

type Orden = "vendido" | "iguales" | "productos";

/**
 * Análisis de competencia en una sola pantalla: las novedades arriba, un buscador y filtros de un toque, y la lista de
 * competidores; cada uno se abre en su sitio con sus productos (los iguales a los nuestros primero, con el precio frente al
 * nuestro) y cada producto despliega su historial.
 */
export function VistaCompetidores({ datos, puedeEscribir }: { datos: DatosCompetencia; puedeEscribir: boolean }) {
  const [abierto, setAbierto] = useState<number | null>(null);
  const [texto, setTexto] = useState("");
  const [soloIguales, setSoloIguales] = useState(false);
  const [soloBaratos, setSoloBaratos] = useState(false);
  const [soloCambios, setSoloCambios] = useState(false);
  const [orden, setOrden] = useState<Orden>("vendido");
  const busqueda = texto.trim().toLowerCase();

  const nuestros = useMemo(() => new Map(datos.productos.filter((p) => p.esNuestro).map((p) => [p.id, p])), [datos.productos]);
  const porCompetidor = useMemo(() => {
    const m = new Map<number, ProductoC[]>();
    for (const p of datos.productos) if (!p.esNuestro && p.estado === "activo") m.set(p.proveedorId, [...(m.get(p.proveedorId) ?? []), p]);
    return m;
  }, [datos.productos]);
  const ultimaFecha = datos.ultima?.inicio ?? null;
  const cambiosHoy = useMemo(() => {
    const m = new Map<string, number>();
    if (!ultimaFecha) return m;
    for (const b of datos.bitacora) if (b.fecha >= ultimaFecha && !b.esNuestro) m.set(b.proveedor, (m.get(b.proveedor) ?? 0) + 1);
    return m;
  }, [datos.bitacora, ultimaFecha]);
  const nuevos = useMemo(
    () => new Set(datos.alertas.filter((a) => a.tipo === "competidor_nuevo").map((a) => a.titulo.replace(/^Competidor nuevo:\s*/, ""))),
    [datos.alertas],
  );

  const competidores = useMemo(() => {
    const filas = datos.competidores.map((c) => {
      const prods = porCompetidor.get(c.id) ?? [];
      const iguales = prods.filter((p) => p.igualA);
      const baratos = iguales.filter((p) => {
        const n = nuestros.get(p.igualA!);
        return n && n.precio !== null && p.precio !== null && p.precio < n.precio;
      }).length;
      return { ...c, igualesN: iguales.length, baratos, cambiosHoy: cambiosHoy.get(c.nombre) ?? 0, nuevo: nuevos.has(c.nombre) };
    });
    return filas
      .filter(
        (c) =>
          (!soloIguales || c.igualesN > 0) &&
          (!soloBaratos || c.baratos > 0) &&
          (!soloCambios || c.cambiosHoy > 0) &&
          (!busqueda || c.nombre.toLowerCase().includes(busqueda) || (porCompetidor.get(c.id) ?? []).some((p) => p.nombre.toLowerCase().includes(busqueda))),
      )
      .sort((a, b) =>
        orden === "vendido" ? b.bajo7 - a.bajo7 || b.bajo30 - a.bajo30 || b.productos - a.productos : orden === "iguales" ? b.igualesN - a.igualesN || b.bajo7 - a.bajo7 : b.productos - a.productos,
      );
  }, [datos.competidores, porCompetidor, nuestros, cambiosHoy, nuevos, soloIguales, soloBaratos, soloCambios, busqueda, orden]);

  // Una novedad abre su competidor (y lo lleva a la vista).
  const abrirNovedad = (a: AlertaC) => {
    const prov =
      a.tipo === "competidor_nuevo"
        ? datos.competidores.find((c) => c.nombre === a.titulo.replace(/^Competidor nuevo:\s*/, ""))?.id
        : datos.productos.find((p) => p.id === a.productoId)?.proveedorId;
    if (prov === undefined) return;
    setTexto("");
    setSoloIguales(false);
    setSoloBaratos(false);
    setSoloCambios(false);
    setAbierto(prov);
    requestAnimationFrame(() => document.getElementById(`competidor-${prov}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  return (
    <div className="flex flex-col gap-4">
      <Novedades alertas={datos.alertas} alAbrir={abrirNovedad} puedeEscribir={puedeEscribir} busquedas={datos.busquedas} />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar un competidor o un producto"
          aria-label="Buscar un competidor o un producto"
          className={`${fieldClass} min-w-0 flex-[1_1_16rem]`}
        />
        <BotonBarra activo={soloIguales} onClick={() => setSoloIguales(!soloIguales)}>
          Venden productos nuestros
        </BotonBarra>
        <BotonBarra activo={soloBaratos} onClick={() => setSoloBaratos(!soloBaratos)}>
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-destructive" />
          Más baratos que nosotros
        </BotonBarra>
        <BotonBarra activo={soloCambios} onClick={() => setSoloCambios(!soloCambios)}>
          Con cambios en la última búsqueda
        </BotonBarra>
        <select aria-label="Ordenar competidores" value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className={`h-[34px] rounded-lg border border-border-control bg-card px-2 text-[13px] ${anilloFoco}`}>
          <option value="vendido">Más vendido (7 días)</option>
          <option value="iguales">Más productos iguales a los nuestros</option>
          <option value="productos">Más productos</option>
        </select>
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {competidores.length} de {datos.competidores.length} competidores
      </p>
      <div className="flex flex-col gap-2">
        {competidores.map((c) => (
          <TarjetaCompetidor
            key={c.id}
            c={c}
            productos={porCompetidor.get(c.id) ?? []}
            nuestros={nuestros}
            abierto={abierto === c.id}
            alAlternar={() => setAbierto(abierto === c.id ? null : c.id)}
            busqueda={busqueda && !c.nombre.toLowerCase().includes(busqueda) ? busqueda : ""}
          />
        ))}
        {!competidores.length && <p className="rounded-[10px] border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Ningún competidor con estos filtros.</p>}
      </div>
    </div>
  );
}
