"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CAMPOS_MONDAY, COLUMNA_NOMBRE, ETIQUETA_GRUPO, GRUPOS_ESTADO, sugerirMapeo, type ColumnaTablero, type GrupoEstado, type MapeoColumnas } from "@/lib/monday/columnas";
import { asignarTextoCausa, guardarCausa, guardarConfigMonday, guardarReglaEstado, leerColumnasMonday, leerMondayAhora } from "./actions";

const botonBorde = `inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;
const botonOscuro = `inline-flex h-8 items-center rounded-lg bg-foreground px-3 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-50 ${anilloFoco}`;

function AvisoError({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="m-0 flex items-start gap-1.5 text-xs text-destructive">
      <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
      {texto}
    </p>
  );
}

/** «Leer ahora» (quien puede modificar Usuarios y roles). */
export function LeerMondayAhora() {
  const [enviando, startTransition] = useTransition();
  const router = useRouter();
  const { mostrarToast } = useToast();
  return (
    <button
      type="button"
      disabled={enviando}
      aria-busy={enviando}
      onClick={() =>
        startTransition(async () => {
          const r = await leerMondayAhora();
          if (r.error) return mostrarToast(r.error, "destructive");
          mostrarToast(r.resumen ?? "Monday leído");
          router.refresh();
        })
      }
      className={botonBorde}
    >
      {enviando ? "Leyendo…" : "Leer ahora"}
    </button>
  );
}

/** El tablero y el mapeo de sus columnas a los datos del portal. */
export function ConfigTablero({ tableroId, mapeo }: { tableroId: string | null; mapeo: MapeoColumnas }) {
  const [id, setId] = useState(tableroId ?? "");
  const [columnas, setColumnas] = useState<ColumnaTablero[] | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [elegido, setElegido] = useState<MapeoColumnas>(mapeo);
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const router = useRouter();
  const { mostrarToast } = useToast();

  const leer = () =>
    startTransition(async () => {
      setError(null);
      const r = await leerColumnasMonday(id);
      if (r.error || !r.columnas) return setError(r.error ?? "No se pudo leer el tablero.");
      setColumnas(r.columnas);
      setNombre(r.nombre ?? null);
      // Si no había mapeo (o era de otro tablero), se sugiere por los títulos.
      const ids = new Set([COLUMNA_NOMBRE, ...r.columnas.map((c) => c.id)]);
      const valido = Object.values(elegido).length > 0 && Object.values(elegido).every((v) => !v || ids.has(v));
      if (!valido) setElegido(sugerirMapeo(r.columnas));
    });
  const guardar = () =>
    startTransition(async () => {
      setError(null);
      const r = await guardarConfigMonday(id, elegido);
      if (r.error) return setError(r.error);
      mostrarToast("Tablero de Monday guardado");
      router.refresh();
    });

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex w-56 flex-col gap-1">
          <span className={labelClassSm}>Id del tablero</span>
          <input value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={20} placeholder="Ej: 1234567890" className={fieldClassSm} />
        </label>
        <button type="button" onClick={leer} disabled={enviando || !id} className={botonBorde}>
          {enviando && !columnas ? "Leyendo…" : "Leer columnas"}
        </button>
        {nombre && <span className="text-sm text-muted-foreground">{nombre}</span>}
      </div>
      {columnas && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CAMPOS_MONDAY.map((c) => (
              <label key={c.clave} className="flex flex-col gap-1">
                <span className={labelClassSm}>
                  {c.etiqueta}
                  {c.obligatorio ? " *" : ""}
                </span>
                <select value={elegido[c.clave] ?? ""} onChange={(e) => setElegido({ ...elegido, [c.clave]: e.target.value || undefined })} className={fieldClassSm}>
                  <option value="">{c.obligatorio ? "Elegir…" : "Sin columna"}</option>
                  {c.clave === "pedido" && <option value={COLUMNA_NOMBRE}>Nombre del ítem</option>}
                  {columnas
                    .filter((x) => x.id !== COLUMNA_NOMBRE)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.titulo} ({x.tipo})
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
          <span>
            <button type="button" onClick={guardar} disabled={enviando} aria-busy={enviando} className={botonOscuro}>
              {enviando ? "Guardando…" : "Guardar tablero"}
            </button>
          </span>
        </>
      )}
      <AvisoError texto={error} />
    </div>
  );
}

/** Cada etiqueta de estado que trae el tablero y su grupo (se cambia al elegir). */
export function EstadosTablero({ estados, puedeEditar }: { estados: { etiqueta: string; grupo: GrupoEstado; pedidos: number }[]; puedeEditar: boolean }) {
  const [enviando, startTransition] = useTransition();
  const router = useRouter();
  const { mostrarToast } = useToast();
  return (
    <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3">
      {estados.map((e) => (
        <li key={e.etiqueta} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
          <span className="min-w-0 truncate">
            {e.etiqueta} <span className="text-xs text-muted-foreground">· {e.pedidos.toLocaleString("en-US")}</span>
          </span>
          {puedeEditar ? (
            <select
              aria-label={`Grupo del estado ${e.etiqueta}`}
              value={e.grupo}
              disabled={enviando}
              onChange={(ev) =>
                startTransition(async () => {
                  const r = await guardarReglaEstado(e.etiqueta, ev.target.value);
                  if (r.error) return mostrarToast(r.error, "destructive");
                  mostrarToast(`${e.etiqueta}: ${ETIQUETA_GRUPO[ev.target.value as GrupoEstado]}`);
                  router.refresh();
                })
              }
              className={`${fieldClassSm} w-36`}
            >
              {GRUPOS_ESTADO.map((g) => (
                <option key={g} value={g}>
                  {ETIQUETA_GRUPO[g]}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-muted-foreground">{ETIQUETA_GRUPO[e.grupo]}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

interface CausaFila {
  codigo: string;
  nombre: string;
  palabras: string[];
  orden: number;
  activo: boolean;
}

function FormCausa({ causa, alGuardar }: { causa: CausaFila | null; alGuardar: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const { mostrarToast } = useToast();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const r = await guardarCausa(datos);
          if (r.error) return setError(r.error);
          mostrarToast(causa ? `${causa.nombre}: guardada` : "Causa creada");
          alGuardar();
        });
      }}
      className="flex flex-wrap items-end gap-2 border-b border-border px-4 py-2.5 last:border-b-0"
    >
      {causa && <input type="hidden" name="codigo" value={causa.codigo} />}
      <label className="flex w-56 flex-col gap-1">
        <span className={labelClassSm}>Causa</span>
        <input name="nombre" defaultValue={causa?.nombre ?? ""} maxLength={80} required placeholder="Ej: Cliente de viaje" className={fieldClassSm} />
      </label>
      <label className="flex min-w-64 flex-1 flex-col gap-1">
        <span className={labelClassSm}>Palabras clave</span>
        <input name="palabras" defaultValue={causa?.palabras.join(", ") ?? ""} maxLength={1000} placeholder="Ej: de viaje, fuera del país" className={fieldClassSm} />
      </label>
      <label className="flex w-20 flex-col gap-1">
        <span className={labelClassSm}>Orden</span>
        <input name="orden" type="number" min={1} max={998} defaultValue={causa?.orden ?? 100} className={fieldClassSm} />
      </label>
      {causa && (
        <label className="flex w-28 flex-col gap-1">
          <span className={labelClassSm}>Estado</span>
          <select name="activo" defaultValue={causa.activo ? "si" : "no"} className={fieldClassSm}>
            <option value="si">Activa</option>
            <option value="no">Inactiva</option>
          </select>
        </label>
      )}
      <button type="submit" disabled={enviando} aria-busy={enviando} className={causa ? botonBorde : botonOscuro}>
        {enviando ? "Guardando…" : causa ? "Guardar" : "Agregar"}
      </button>
      <AvisoError texto={error} />
    </form>
  );
}

/** El catálogo de causas (editable) y los textos que no reconoció ninguna, para asignarlos a mano. */
export function CatalogoCausas({ causas, sinCausa, puedeEditar }: { causas: CausaFila[]; sinCausa: { texto: string; pedidos: number }[]; puedeEditar: boolean }) {
  const router = useRouter();
  const [enviando, startTransition] = useTransition();
  const { mostrarToast } = useToast();
  const refrescar = () => router.refresh();
  if (!puedeEditar) {
    return (
      <ul className="m-0 list-none p-0">
        {causas.map((c) => (
          <li key={c.codigo} className="border-b border-border px-4 py-2.5 text-sm last:border-b-0">
            <span className="font-medium">{c.nombre}</span>
            {!c.activo && <span className="text-muted-foreground"> · inactiva</span>}
            <span className="block text-xs text-muted-foreground">{c.palabras.join(", ") || "Sin palabras clave"}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="flex flex-col">
      {causas.map((c) => (
        <FormCausa key={`${c.codigo}-${c.nombre}-${c.palabras.join("|")}-${c.activo}-${c.orden}`} causa={c} alGuardar={refrescar} />
      ))}
      <FormCausa causa={null} alGuardar={refrescar} />
      {sinCausa.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <h3 className="m-0 mb-2 flex items-center gap-2 text-sm font-semibold">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
            Textos en «Otra causa»
          </h3>
          <ul className="m-0 grid list-none gap-2 p-0 lg:grid-cols-2">
            {sinCausa.map((t) => (
              <li key={t.texto} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {t.texto} <span className="text-xs text-muted-foreground">· {t.pedidos}</span>
                </span>
                <select
                  aria-label={`Causa de «${t.texto}»`}
                  defaultValue=""
                  disabled={enviando}
                  onChange={(e) => {
                    const codigo = e.target.value;
                    if (!codigo) return;
                    startTransition(async () => {
                      const r = await asignarTextoCausa(t.texto, codigo);
                      if (r.error) return mostrarToast(r.error, "destructive");
                      mostrarToast("Texto asignado");
                      refrescar();
                    });
                  }}
                  className={`${fieldClassSm} w-52`}
                >
                  <option value="">Asignar a…</option>
                  {causas
                    .filter((c) => c.activo && c.codigo !== "otro")
                    .map((c) => (
                      <option key={c.codigo} value={c.codigo}>
                        {c.nombre}
                      </option>
                    ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
