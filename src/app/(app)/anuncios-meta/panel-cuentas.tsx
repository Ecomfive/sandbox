"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { ProgresoEstimado } from "@/components/ui/progreso-estimado";
import { ChevronRightIcon } from "@/lib/nav-icons";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatearFechaHora } from "@/lib/formato";
import type { CuentaVista, TopeVista } from "@/lib/meta-ads/datos";
import { CPA_TOPE_PREDETERMINADO } from "@/lib/meta-ads/metricas";
import { filtrarProductos } from "@/lib/meta-ads/topes";
import { claveDeProducto, etiquetasDeNombre, NOMBRE_ETAPA, NOMBRE_PUJA } from "@/lib/meta-ads/nombre";
import { guardarCuentaMeta, guardarTopeMeta, probarConexionMeta } from "./actions";
import { CoberturaHistorial } from "./cobertura-historial";
import { TraerHistorial } from "./traer-historial";

const boton = "min-h-9 rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";
const botonOscuro = `${boton} bg-foreground text-background hover:opacity-90`;
const botonClaro = `${boton} border border-border-control bg-card hover:bg-muted`;

/** Una tarjeta del panel. Con `plegado` definido es desplegable: el título pasa a ser un botón que la abre o la cierra y, cerrada, deja a la vista solo `resumen`. */
function Bloque({ id, titulo, derecha, children, plegado, alAlternar, resumen }: { id: string; titulo: string; derecha?: React.ReactNode; children: React.ReactNode; plegado?: boolean; alAlternar?: () => void; resumen?: string }) {
  const plegable = plegado !== undefined && !!alAlternar;
  return (
    <section aria-labelledby={id} className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 border-b border-border bg-muted px-4 py-1 text-xs font-medium text-muted-foreground" style={plegable && plegado ? { borderBottomWidth: 0 } : undefined}>
        <h2 id={id} className="m-0 text-xs font-medium">
          {plegable ? (
            <button type="button" onClick={alAlternar} aria-expanded={!plegado} aria-controls={`${id}-contenido`} className="-mx-1 flex min-h-8 items-center gap-1.5 rounded px-1 text-xs font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
              <ChevronRightIcon aria-hidden="true" className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${plegado ? "" : "rotate-90"}`} />
              {titulo}
              {plegado && resumen && <span className="font-normal">· {resumen}</span>}
            </button>
          ) : (
            titulo
          )}
        </h2>
        {derecha}
      </div>
      {(!plegable || !plegado) && (
        <div id={`${id}-contenido`} className="flex flex-col gap-4 p-4">
          {children}
        </div>
      )}
    </section>
  );
}

function Conexion({ hayToken, escribe, alAgregar }: { hayToken: boolean; escribe: boolean; alAgregar: (c: { id: string; nombre: string }) => void }) {
  const [probando, empezar] = useTransition();
  const [r, setR] = useState<{ ok: boolean; mensaje: string; cuentas: { id: string; nombre: string }[] } | null>(null);
  return (
    <Bloque id="conexion" titulo="Conexión con Meta" derecha={<Badge tone={hayToken ? "success" : "warning"}>{hayToken ? "Acceso configurado" : "Falta el acceso"}</Badge>}>
      {hayToken ? (
        <p className="m-0 text-sm">El servidor tiene el acceso a Meta. Solo lee: nada de lo que se hace aquí crea, pausa ni cambia una campaña.</p>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <p className="m-0 font-medium">Para conectar Meta hay que hacer esto una sola vez:</p>
          <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
            <li>En el Business Manager de Meta (Configuración del negocio › Usuarios › Usuarios del sistema), crear un usuario del sistema con rol de empleado.</li>
            <li>Asignarle las cuentas publicitarias con permiso «Ver rendimiento» (si alguna es de otro negocio, que su dueño la comparta con el nuestro como socio).</li>
            <li>Generar un token de ese usuario con los permisos <code>ads_read</code> y <code>read_insights</code> (la app de Meta debe estar en modo «Activo»).</li>
            <li>Guardarlo en Vercel como <code>META_ADS_ACCESS_TOKEN</code> (nunca en el código ni en el chat) y volver a desplegar.</li>
            <li>Aquí abajo: «Probar conexión», agregar cada cuenta con su ID <code>act_…</code> y pulsar «Leer ahora».</li>
          </ol>
        </div>
      )}
      {escribe && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={botonClaro}
            disabled={probando || !hayToken}
            onClick={() =>
              empezar(async () => {
                setR(await probarConexionMeta());
              })
            }
          >
            {probando ? "Probando…" : "Probar conexión"}
          </button>
        </div>
      )}
      {probando && <ProgresoEstimado compacta etiqueta="Probando la conexión con Meta" estimadoMs={6000} pasos={["Conectando con Meta", "Revisando el acceso", "Buscando las cuentas publicitarias"]} />}
      {r && !probando && (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 text-sm">
          <p className={`m-0 ${r.ok ? "" : "text-destructive"}`}>{r.mensaje}</p>
          {r.cuentas.length > 0 && (
            <ul role="list" className="m-0 flex list-none flex-col divide-y divide-border p-0">
              {r.cuentas.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span>
                    {c.nombre} <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
                  </span>
                  {escribe && (
                    <button type="button" className={botonClaro} onClick={() => alAgregar(c)}>
                      Usar en el formulario
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Bloque>
  );
}

function Cuentas({ cuentas, escribe, pais, borrador }: { cuentas: CuentaVista[]; escribe: boolean; pais: string; borrador: { id: string; nombre: string } | null }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [guardando, empezar] = useTransition();
  const [editando, setEditando] = useState<CuentaVista | null>(null);
  const [nombre, setNombre] = useState("");
  const [actId, setActId] = useState("");
  const [tienda, setTienda] = useState("");
  const [activa, setActiva] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [claveBorrador, setClaveBorrador] = useState<string | null>(null);
  // Un «Usar en el formulario» de la prueba de conexión llena el formulario una sola vez.
  if (borrador && claveBorrador !== borrador.id) {
    setClaveBorrador(borrador.id);
    setEditando(null);
    setNombre(borrador.nombre);
    setActId(borrador.id);
    setTienda("");
    setActiva(true);
    setAbierto(true);
  }
  const nueva = () => {
    setEditando(null);
    setNombre("");
    setActId("");
    setTienda("");
    setActiva(true);
    setAbierto(true);
  };
  const editar = (c: CuentaVista) => {
    setEditando(c);
    setNombre(c.nombre);
    setActId(c.actId);
    setTienda(c.tienda ?? "");
    setActiva(c.activa);
    setAbierto(true);
  };
  const guardar = () =>
    empezar(async () => {
      const r = await guardarCuentaMeta({ id: editando?.id, nombre, actId, tienda, activa });
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(editando ? "Cuenta guardada." : "Cuenta agregada: pulsa «Leer ahora» para traer sus campañas.");
        setAbierto(false);
        router.refresh();
      }
    });
  return (
    <Bloque id="cuentas" titulo={`Cuentas publicitarias de ${pais}`} derecha={escribe && !abierto ? <button type="button" className="text-xs font-medium underline underline-offset-2" onClick={nueva}>Agregar cuenta</button> : undefined}>
      {cuentas.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">Todavía no hay cuentas. Agrega las que usa cada tienda (por ejemplo, las 3 o 4 de Oferfy): cada una con su ID <code>act_…</code>, que sale en el Administrador de anuncios.</p>
      ) : (
        <ul role="list" className="m-0 flex list-none flex-col divide-y divide-border p-0">
          {cuentas.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {c.nombre}
                  <Badge tone={c.activa ? "success" : "neutral"}>{c.activa ? "Se lee" : "Apagada"}</Badge>
                  {c.ultimoError && <Badge tone="destructive">Con problema</Badge>}
                </span>
                <span className="text-xs text-muted-foreground">
                  <span className="font-mono">{c.actId}</span>
                  {c.tienda ? ` · ${c.tienda}` : ""}
                  {c.ultimaLectura ? ` · última lectura ${formatearFechaHora(c.ultimaLectura)}` : " · todavía sin leer"}
                </span>
                {c.ultimoError && <span className="text-xs text-destructive">{c.ultimoError}</span>}
              </span>
              {escribe && (
                <button type="button" className={botonClaro} onClick={() => editar(c)}>
                  Editar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {escribe && abierto && (
        <form
          className="flex flex-col gap-3 rounded-lg border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            guardar();
          }}
        >
          <p className="m-0 text-sm font-medium">{editando ? "Editar cuenta" : "Agregar cuenta"}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Nombre *</span>
              <input className={fieldClassSm} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} required placeholder="Ej: Oferfy · cuenta 1" />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>ID de la cuenta *</span>
              <input className={`${fieldClassSm} font-mono`} value={actId} onChange={(e) => setActId(e.target.value)} readOnly={!!editando} required placeholder="act_1234567890" />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Tienda</span>
              <input className={fieldClassSm} value={tienda} onChange={(e) => setTienda(e.target.value)} maxLength={80} placeholder="Ej: Oferfy" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} className="h-4 w-4" />
            Leer esta cuenta
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={botonOscuro} disabled={guardando || nombre.trim().length < 2 || actId.trim().length < 5}>
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Agregar cuenta"}
            </button>
            <button type="button" className={botonClaro} onClick={() => setAbierto(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </Bloque>
  );
}

function Topes({ topes, productos, escribe }: { topes: TopeVista[]; productos: string[]; escribe: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [guardando, empezar] = useTransition();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [nuevo, setNuevo] = useState("");
  const [nuevoValor, setNuevoValor] = useState("");
  // Cerrada de entrada: la lista de productos es larga y casi nunca se toca.
  const [plegado, setPlegado] = useState(true);
  const [buscar, setBuscar] = useState("");
  const [soloSinDefinir, setSoloSinDefinir] = useState(false);
  const todas = (() => {
    const mapa = new Map<string, { producto: string; tope: number | null }>();
    for (const t of topes) mapa.set(t.clave, { producto: t.producto, tope: t.tope });
    for (const p of productos) if (!mapa.has(claveDeProducto(p))) mapa.set(claveDeProducto(p), { producto: p, tope: null });
    return [...mapa.values()].sort((a, b) => a.producto.localeCompare(b.producto, "es"));
  })();
  const filas = filtrarProductos(soloSinDefinir ? todas.filter((f) => f.tope === null) : todas, buscar);
  const guardar = (producto: string, texto: string) =>
    empezar(async () => {
      const r = await guardarTopeMeta(producto, Number(texto.replace(",", ".")));
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast("CPA tope guardado.");
        setValores((v) => {
          const { [producto]: _quitado, ...resto } = v;
          void _quitado;
          return resto;
        });
        router.refresh();
      }
    });
  return (
    <Bloque id="topes" titulo="CPA tope por producto" plegado={plegado} alAlternar={() => setPlegado((x) => !x)} resumen={`${todas.filter((f) => f.tope !== null).length} de ${todas.length} definidos`}>
      <p className="m-0 text-sm text-muted-foreground">Lo máximo que se puede pagar por una compra sin perder. Con él se calcula el resultado estimado de cada campaña. Hasta que se defina, se usa ${CPA_TOPE_PREDETERMINADO}.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Buscar producto</span>
          <input type="search" className={fieldClassSm} value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Ej: colageno, aceite calabaza" autoComplete="off" />
        </label>
        <label className="flex min-h-9 items-center gap-2 text-xs">
          <input type="checkbox" checked={soloSinDefinir} onChange={(e) => setSoloSinDefinir(e.target.checked)} className="h-4 w-4" />
          <span>Solo los sin definir</span>
        </label>
        <p role="status" className="m-0 min-h-9 content-center text-xs tabular-nums text-muted-foreground">
          {filas.length === todas.length ? `${todas.length} productos` : `${filas.length} de ${todas.length} productos`}
        </p>
      </div>
      {todas.length === 0 && !escribe ? (
        <p className="m-0 text-sm text-muted-foreground">Todavía no hay productos en las campañas.</p>
      ) : filas.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">Ningún producto coincide con lo que escribiste.</p>
      ) : (
        <ul role="list" className="m-0 flex list-none flex-col divide-y divide-border p-0">
          {filas.map((f) => {
            const v = valores[f.producto] ?? (f.tope === null ? "" : String(f.tope));
            const cambio = valores[f.producto] !== undefined && Number(v.replace(",", ".")) !== f.tope;
            return (
              <li key={f.producto} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2">
                <span className="text-sm font-medium">
                  {f.producto}
                  {f.tope === null && <span className="ml-2 text-xs font-normal text-muted-foreground">sin definir (usa ${CPA_TOPE_PREDETERMINADO})</span>}
                </span>
                {escribe ? (
                  <span className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-sm">
                      <span className="sr-only">CPA tope de {f.producto}, en dólares</span>$
                      <input inputMode="decimal" className={`${fieldClassSm} w-24 tabular-nums`} value={v} onChange={(e) => setValores((x) => ({ ...x, [f.producto]: e.target.value }))} placeholder="Ej: 3.50" />
                    </label>
                    <button type="button" className={botonClaro} disabled={guardando || !cambio || v.trim() === ""} onClick={() => guardar(f.producto, v)}>
                      Guardar
                    </button>
                  </span>
                ) : (
                  <span className="text-sm tabular-nums">{f.tope === null ? "—" : `$${f.tope.toFixed(2)}`}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {escribe && (
        <form
          className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            guardar(nuevo.trim(), nuevoValor);
            setNuevo("");
            setNuevoValor("");
          }}
        >
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <span className={labelClassSm}>Otro producto</span>
            <input className={fieldClassSm} value={nuevo} onChange={(e) => setNuevo(e.target.value)} maxLength={120} placeholder="Ej: Faja moldeadora" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>CPA tope ($)</span>
            <input inputMode="decimal" className={`${fieldClassSm} w-28 tabular-nums`} value={nuevoValor} onChange={(e) => setNuevoValor(e.target.value)} placeholder="Ej: 3.50" />
          </label>
          <button type="submit" className={botonClaro} disabled={guardando || nuevo.trim().length < 2 || nuevoValor.trim() === ""}>
            Agregar
          </button>
        </form>
      )}
    </Bloque>
  );
}

function ProbadorDeNombres() {
  const [nombre, setNombre] = useState("SHAMPOO ANTICASPA HOEGOA | ALL PA | CBO TEST | V6 AL V10 | ARIANNY");
  const e = etiquetasDeNombre(nombre);
  const filas: [string, string][] = [
    ["Producto", e.producto ?? "—"],
    ["Audiencia y país", e.mercado ?? "—"],
    ["Tanda de videos", e.videos ?? "—"],
    ["La montó", e.persona ?? "—"],
    ["Ángulo", e.angulo ?? "—"],
    ["Etapa", e.etapa ? NOMBRE_ETAPA[e.etapa] : "—"],
    ["CBO o ABO", e.estructura ?? "—"],
    ["Puja", e.puja ? NOMBRE_PUJA[e.puja] : "—"],
  ];
  return (
    <Bloque id="nombres" titulo="Cómo se leen los nombres de las campañas">
      <p className="m-0 text-sm text-muted-foreground">
        Meta no guarda el producto, la etapa ni quién montó la campaña: salen del nombre. El formato del equipo es <span className="font-medium text-foreground">PRODUCTO | ALL PA | CBO TEST | RT V1 AL V5 | PERSONA</span> (producto, audiencia y país, estructura y etapa, tanda de videos y quién la montó). El ángulo no va en el nombre. Si algo no se lee bien, se corrige en la ficha de la campaña.
      </p>
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>Prueba un nombre</span>
        <input className={`${fieldClassSm} w-full`} value={nombre} onChange={(ev) => setNombre(ev.target.value)} maxLength={200} />
      </label>
      <dl className="m-0 grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
        {filas.map(([t, v]) => (
          <div key={t} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{t}</dt>
            <dd className="m-0 break-words text-sm font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </Bloque>
  );
}

/** «Cuentas»: la conexión con Meta, las cuentas publicitarias que se leen, el CPA tope de cada producto y cómo se leen los nombres de las campañas. */
export function PanelCuentas({ cuentas, topes, productos, escribe, hayToken, pais, hoy }: { cuentas: CuentaVista[]; topes: TopeVista[]; productos: string[]; escribe: boolean; hayToken: boolean; pais: string; hoy: string }) {
  const [borrador, setBorrador] = useState<{ id: string; nombre: string } | null>(null);
  const [versionCobertura, setVersionCobertura] = useState(0);
  return (
    <div className="flex flex-col gap-6">
      <Conexion hayToken={hayToken} escribe={escribe} alAgregar={setBorrador} />
      <Cuentas cuentas={cuentas} escribe={escribe} pais={pais} borrador={borrador} />
      {escribe && hayToken && (
        <Bloque id="historial" titulo="Historial">
          <p className="m-0 text-sm text-muted-foreground">Al agregar una cuenta solo se leen sus últimos 30 días. Aquí se trae lo anterior (hasta 3 años, lo que Meta guarda), un mes por vez, para ver campañas y videos de más tiempo.</p>
          <TraerHistorial cuentas={cuentas} hoy={hoy} alTerminar={() => setVersionCobertura((v) => v + 1)} />
          <CoberturaHistorial hoy={hoy} version={versionCobertura} />
        </Bloque>
      )}
      <Topes topes={topes} productos={productos} escribe={escribe} />
      <ProbadorDeNombres />
    </div>
  );
}
