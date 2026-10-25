"use client";

/* eslint-disable @next/next/no-img-element -- foto de Storage */
import Link from "next/link";
import { useState, type ComponentType } from "react";
import { anilloFoco } from "@/components/ui/field";
import { numeroPublicacion } from "@/lib/publicaciones/publicacion";
import { DECISIONES, TIPOS_RECOMENDACION, type GrupoRecomendacion, type Recomendacion, type TipoRecomendacion } from "@/lib/publicaciones/recomendaciones";

const GRUPOS: { id: GrupoRecomendacion; etiqueta: string }[] = [
  { id: "precio", etiqueta: "Precio y combo" },
  { id: "optimizacion", etiqueta: "Optimización en Dropi" },
];
import type { DecisionVista } from "../def-publicaciones";
import { LineaDecision, ProveedorTareas, TareaRecomendacion, TarjetaRecomendacion } from "../recomendacion-publicacion";
import { COLORES, type Color } from "../tablero-acciones";
import { AnalisisCompetenciaIcon, EtiquetaIcon, LapizIcon, ListaIcon, MargenIcon, MarketingIcon, ProductoIcon, SinFotoIcon } from "@/lib/nav-icons";

/** El ícono y el color de la tarjeta de cada tipo (los mismos tonos del tablero de Publicaciones). */
const ASPECTO: Record<TipoRecomendacion, { icono: ComponentType<{ className?: string }>; color: Color }> = {
  combo_x2: { icono: ProductoIcon, color: "violeta" },
  subir_precio: { icono: MargenIcon, color: "verde" },
  igualar_precio: { icono: AnalisisCompetenciaIcon, color: "rojo" },
  optimizar_titulo: { icono: LapizIcon, color: "azul" },
  mas_fotos: { icono: SinFotoIcon, color: "verde" },
  agregar_video: { icono: MarketingIcon, color: "violeta" },
  mejorar_descripcion: { icono: ListaIcon, color: "ambar" },
  precio_sugerido: { icono: EtiquetaIcon, color: "ambar" },
};

/** Una tarjeta del tablero de tipos, como las de Publicaciones: ícono, nombre y el número grande; pulsarla filtra (y otra vez, quita). */
function TarjetaTipo({ tipo, etiqueta, valor, activa, alPulsar }: { tipo: TipoRecomendacion; etiqueta: string; valor: number; activa: boolean; alPulsar: () => void }) {
  const { icono: Icono, color } = ASPECTO[tipo];
  const c = COLORES[color];
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={alPulsar}
      className={`group flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${anilloFoco} ${
        activa ? `ring-2 ${c.activa}` : "border-border"
      }`}
    >
      <span className="flex items-center gap-3">
        <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.icono}`}>
          <Icono className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 text-xs leading-tight font-medium tracking-wide text-muted-foreground uppercase hyphens-auto">{etiqueta}</span>
      </span>
      <span className={`text-3xl leading-none font-semibold tabular-nums ${valor ? c.numero : "text-muted-foreground"}`}>{valor.toLocaleString("es-PA")}</span>
      <span className="sr-only">{activa ? "Filtrando la lista." : `Filtrar: ${etiqueta.toLowerCase()}`}</span>
    </button>
  );
}

export interface PublicacionResumen {
  id: string;
  numero: number | null;
  nombre: string;
  fotoUrl: string | null;
  sku: string | null;
}

/** Una recomendación que nadie decidió todavía, de una publicación. */
export interface Sugerida {
  rec: Recomendacion;
  publicacionId: string;
  responsableSugerido: string | null;
}

type Vista = "pendientes" | "por_hacer" | "hechas";

const chip = (activo: boolean) =>
  `inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors ${anilloFoco} ${activo ? "border-foreground bg-foreground text-background" : "border-border-control bg-card hover:bg-muted"}`;

/** La foto, el número y el nombre de la publicación, con enlace a su ficha. */
function Producto({ p, compacto = false }: { p: PublicacionResumen | undefined; compacto?: boolean }) {
  if (!p) return null;
  const tam = compacto ? "h-10 w-10" : "h-14 w-14";
  return (
    <Link href={`/publicaciones-dropi?abrir=${p.id}`} className={`flex min-w-0 items-center gap-3 rounded-lg ${compacto ? "" : "sm:w-44 sm:shrink-0 sm:flex-col sm:items-start"} ${anilloFoco}`}>
      {p.fotoUrl ? <img src={p.fotoUrl} alt="" className={`${tam} shrink-0 rounded-lg border border-border object-cover`} /> : <span aria-hidden="true" className={`${tam} shrink-0 rounded-lg border border-dashed border-border-control`} />}
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground tabular-nums">{numeroPublicacion(p.numero)}</span>
        <span className="text-sm font-medium [overflow-wrap:anywhere] hover:underline">{p.nombre}</span>
        {p.sku && !compacto && <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{p.sku}</span>}
      </span>
    </Link>
  );
}

const Vacio = ({ texto }: { texto: string }) => <p className="m-0 rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">{texto}</p>;

/**
 * Las recomendaciones del país en tres vistas: Pendientes (lo que el sistema sugiere y nadie decidió), Por hacer (las aceptadas, con
 * su responsable y plazo, las atrasadas primero) y Hechas (a mano o detectadas por el sistema). A la derecha, cómo se decide cada
 * tipo y las últimas decisiones con su porqué.
 */
export function PanelRecomendaciones({
  sugeridas,
  decisiones,
  publicacionDe,
  puedeDecidir,
  faltaMigracion,
  verInicial,
  contexto,
}: {
  sugeridas: Sugerida[];
  decisiones: DecisionVista[];
  publicacionDe: Record<string, PublicacionResumen>;
  puedeDecidir: boolean;
  faltaMigracion: boolean;
  verInicial: Vista;
  contexto: { personas: { id: string; nombre: string }[]; yo: string; conTareas: boolean };
}) {
  const [vista, setVista] = useState<Vista>(verInicial);
  const [tipo, setTipo] = useState<TipoRecomendacion | null>(null);
  const [soloMias, setSoloMias] = useState(false);
  const abiertas = decisiones
    .filter((d) => d.estado === "por_hacer" || d.estado === "atrasada")
    .sort((a, b) => (a.estado === b.estado ? (a.plazo ?? "").localeCompare(b.plazo ?? "") : a.estado === "atrasada" ? -1 : 1));
  const hechas = decisiones.filter((d) => d.estado === "hecha").sort((a, b) => (b.hechaEn ?? "").localeCompare(a.hechaEn ?? ""));
  const atrasadas = abiertas.filter((d) => d.estado === "atrasada").length;
  const pasa = (t: string) => !tipo || t === tipo;
  const delTipo = <T extends { tipo: string }>(l: T[]) => l.filter((x) => pasa(x.tipo));
  const pendientesVisibles = sugeridas.filter((t) => pasa(t.rec.tipo));
  const abiertasVisibles = delTipo(abiertas).filter((d) => !soloMias || d.responsableId === contexto.yo);
  const VISTAS: { id: Vista; etiqueta: string; n: number }[] = [
    { id: "pendientes", etiqueta: "Pendientes", n: sugeridas.length },
    { id: "por_hacer", etiqueta: "Por hacer", n: abiertas.length },
    { id: "hechas", etiqueta: "Hechas", n: hechas.length },
  ];
  const cuenta = (t: TipoRecomendacion) => (vista === "pendientes" ? sugeridas.filter((x) => x.rec.tipo === t).length : (vista === "por_hacer" ? abiertas : hechas).filter((x) => x.tipo === t).length);

  return (
    <ProveedorTareas {...contexto}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Recomendaciones" className="flex min-w-0 flex-col gap-4">
          <div role="tablist" aria-label="Qué ver" className="flex flex-wrap gap-1 border-b border-border">
            {VISTAS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={vista === v.id}
                onClick={() => setVista(v.id)}
                className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${anilloFoco} ${vista === v.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {v.etiqueta}
                <span className="tabular-nums">({v.n})</span>
                {v.id === "por_hacer" && atrasadas > 0 && <span role="img" aria-label={`${atrasadas} atrasadas`} className="h-2 w-2 rounded-full bg-destructive" />}
              </button>
            ))}
          </div>

          {GRUPOS.map((g) => (
            <section key={g.id} aria-label={g.etiqueta} className="flex flex-col gap-2">
              <h2 className="m-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.etiqueta}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
                {TIPOS_RECOMENDACION.filter((t) => t.grupo === g.id).map((t) => (
                  <TarjetaTipo key={t.valor} tipo={t.valor} etiqueta={t.etiqueta} valor={cuenta(t.valor)} activa={tipo === t.valor} alPulsar={() => setTipo(tipo === t.valor ? null : t.valor)} />
                ))}
              </div>
            </section>
          ))}
          {vista === "por_hacer" && (
            <div>
              <button type="button" aria-pressed={soloMias} className={chip(soloMias)} onClick={() => setSoloMias(!soloMias)}>
                Mis tareas
              </button>
            </div>
          )}

          {faltaMigracion && (
            <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
              Para guardar decisiones falta correr en Supabase la migración 0127.
            </p>
          )}
          {!faltaMigracion && !contexto.conTareas && vista !== "pendientes" && (
            <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
              Para las tareas falta correr en Supabase la migración 0128.
            </p>
          )}

          {vista === "pendientes" &&
            (pendientesVisibles.length === 0 ? (
              <Vacio texto="No hay recomendaciones pendientes." />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {pendientesVisibles.map((t) => (
                  <li key={`${t.publicacionId}-${t.rec.tipo}`} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-start sm:gap-4">
                    <Producto p={publicacionDe[t.publicacionId]} />
                    <div className="min-w-0 flex-1">
                      <TarjetaRecomendacion publicacionId={t.publicacionId} rec={t.rec} puedeDecidir={puedeDecidir} responsableSugerido={t.responsableSugerido} />
                    </div>
                  </li>
                ))}
              </ul>
            ))}

          {vista === "por_hacer" &&
            (abiertasVisibles.length === 0 ? (
              <Vacio texto={soloMias ? "No tienes tareas por hacer." : "No hay tareas por hacer."} />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {abiertasVisibles.map((d) => (
                  <li key={d.id}>
                    <TareaRecomendacion d={d} puedeMarcar={puedeDecidir && contexto.conTareas} producto={<Producto p={publicacionDe[d.publicacionId]} compacto />} />
                  </li>
                ))}
              </ul>
            ))}

          {vista === "hechas" &&
            (delTipo(hechas).length === 0 ? (
              <Vacio texto="Todavía no hay tareas hechas." />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {delTipo(hechas)
                  .slice(0, 100)
                  .map((d) => (
                    <li key={d.id}>
                      <TareaRecomendacion d={d} puedeMarcar={false} producto={<Producto p={publicacionDe[d.publicacionId]} compacto />} />
                    </li>
                  ))}
              </ul>
            ))}
        </section>

        <aside aria-labelledby="decisiones-t" className="flex min-w-0 flex-col gap-4">
          <h2 id="decisiones-t" className="m-0 text-base font-semibold">
            Decisiones
          </h2>
          <table className="w-full border-collapse overflow-hidden rounded-xl border border-border bg-card text-sm">
            <caption className="sr-only">Decisiones por tipo de recomendación</caption>
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Tipo
                </th>
                {DECISIONES.map((d) => (
                  <th key={d.valor} scope="col" className="px-2 py-2 text-right font-medium">
                    {d.etiqueta}s
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {TIPOS_RECOMENDACION.map((t) => (
                <tr key={t.valor}>
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    {t.etiqueta}
                  </th>
                  {DECISIONES.map((d) => (
                    <td key={d.valor} className="px-2 py-2 text-right tabular-nums">
                      {decisiones.filter((x) => x.tipo === t.valor && x.decision === d.valor).length}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {decisiones.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">Todavía no se ha decidido ninguna.</p>
          ) : (
            <ul className="m-0 list-none divide-y divide-border rounded-xl border border-border bg-card px-3 py-1">
              {decisiones.slice(0, 30).map((d) => (
                <LineaDecision key={d.id} d={d} producto={publicacionDe[d.publicacionId]?.nombre} />
              ))}
            </ul>
          )}
        </aside>
      </div>
    </ProveedorTareas>
  );
}
