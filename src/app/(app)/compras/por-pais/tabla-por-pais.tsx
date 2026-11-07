"use client";

/* eslint-disable @next/next/no-img-element -- fotos de Storage */
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { SelectorTipoProducto } from "@/components/tabla/selector-tipo-producto";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { usePuedeAbrir } from "@/components/modulos-contexto";
import { Bandera } from "@/components/paises/bandera";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { TarjetaEmergente } from "@/components/ui/tarjeta-emergente";
import { Ventana } from "@/components/ui/ventana";
import { formatearFecha } from "@/lib/formato";
import { CalendarioIcon, EstadoIcon, InventarioIcon, MundoIcon } from "@/lib/nav-icons";
import { accionesPorPais, ESTADOS_EXISTE, ETIQUETA_ESTADO_PAIS, estadoDeCelda, paisesPorDecidir, type CeldaPais, type Decision, type EstadoPais } from "@/lib/producto/por-pais";
import type { NombreFilas } from "@/lib/tabla/pie";
import { ComprasProducto } from "@/app/(app)/producto/compras-producto";
import { FichaProductoEmbebida } from "@/app/(app)/producto/ficha-producto-embebida";
import { decidirProductoPais } from "./actions";
import { TableroPorPais } from "./tablero-por-pais";
import { DEF_POR_PAIS, detalleCelda, type FilaPorPais, type PaisColumna } from "./def-por-pais";

const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };

/** El color del punto de cada estado (un punto, no una caja: regla del sistema). */
const PUNTO: Record<EstadoPais, string> = {
  publicado: "bg-success",
  comprado: "bg-azul",
  stock: "bg-success",
  enviar: "bg-aviso",
  descartado: "bg-destructive",
  descontinuado: "bg-muted-foreground",
  archivado: "border border-muted-foreground bg-transparent",
  no: "border border-dashed border-muted-foreground bg-transparent",
};

/** Lo que dice la casilla debajo del estado: las unidades disponibles en el país (bodegas + plataformas), las compradas o el motivo. */
function subtitulo(c: CeldaPais): string {
  const referencial = c.unidadesReferencial > 0 ? ` · ${c.unidadesReferencial.toLocaleString("es")} ref.` : "";
  const disponibles = (c.unidadesDisponibles > 0 ? `${c.unidadesDisponibles.toLocaleString("es")} u. disponibles` : "Sin stock real") + referencial;
  if (c.estado === "publicado" || c.estado === "stock") return disponibles;
  if (c.estado === "comprado") return c.unidadesDisponibles > 0 ? disponibles : `${c.unidadesCompradas.toLocaleString("es")} u. compradas`;
  if (c.estado === "descartado") return c.decision?.motivo ?? "";
  if (c.estado === "enviar" && c.decision?.en) return `desde ${formatearFecha(c.decision.en)}`;
  return "";
}

/** La foto llena la casilla, como en Compras, y al pasar el cursor se ve en grande (la misma tarjeta flotante de Compras). */
function FotoCelda({ foto, nombre }: { foto: string | null; nombre: string }) {
  return (
    <div className="absolute inset-y-1.5 left-2 aspect-square max-w-[calc(100%-1rem)]">
      {foto ? (
        <TarjetaEmergente
          clase="rounded-lg border border-border bg-card p-1.5 shadow-lg"
          claseEnvoltura="h-full w-full"
          contenido={<img src={foto} alt={`Foto de ${nombre}`} className="max-h-72 max-w-72 rounded-md object-contain" />}
        >
          <img src={foto} alt={`Foto de ${nombre}`} loading="lazy" className="h-full w-full rounded-md border border-border object-cover" />
        </TarjetaEmergente>
      ) : (
        <div role="img" aria-label="Sin foto" className="h-full w-full rounded-md border border-dashed border-border-control" />
      )}
    </div>
  );
}

interface Abierta {
  id: string;
  pais: string;
}

/**
 * «Producto › Por país»: cada producto con una casilla por país que dice si ya existe ahí (publicado, comprado o con stock) o todavía
 * no. Pulsar una casilla abre lo que hay en ese país y, donde no existe, «Enviar» o «Descartar» con su motivo.
 */
export function TablaPorPais({ filas: iniciales, paises, puedeEscribir, codigoPaisBarra }: { filas: FilaPorPais[]; paises: PaisColumna[]; puedeEscribir: boolean; codigoPaisBarra: string }) {
  const [filas, setFilas] = useState(iniciales);
  const [abierta, setAbierta] = useState<Abierta | null>(null);
  // El nombre del producto abre su ficha de Producto aquí mismo, encima de la tabla (como desde Gestión de IDs Dropi).
  const [productoAbierto, setProductoAbierto] = useState<string | null>(null);
  const abreProducto = usePuedeAbrir("producto");

  const columnas = useMemo<ColumnaTabla<FilaPorPais>[]>(
    () => [
      {
        id: "foto",
        label: "Foto",
        ocultable: true,
        clase: "relative w-20 min-w-20",
        render: (f) => <FotoCelda foto={f.foto} nombre={f.nombre} />,
      },
      {
        id: "producto",
        label: "Producto",
        ocultable: false,
        render: (f) => (
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{f.nombre}</span>
            <span className="truncate text-xs text-muted-foreground">
              {f.numero ? `N.º ${f.numero} · ` : ""}
              {f.codigo}
              {f.barras ? ` · ${f.barras}` : ""}
            </span>
          </span>
        ),
      },
      {
        id: "creado",
        label: "Creado",
        ocultable: true,
        descripcion: "El día en que se creó el producto en Producto.",
        clase: "whitespace-nowrap tabular-nums text-muted-foreground",
        render: (f) => (f.creado ? formatearFecha(f.creado) : "—"),
      },
      ...paises.map<ColumnaTabla<FilaPorPais>>((p) => ({
        id: `pais_${p.codigo}`,
        label: p.nombre,
        ocultable: true,
        render: (f) => {
          const c = f.celdas[p.codigo];
          if (!c) return null;
          const sub = subtitulo(c);
          return (
            <button
              type="button"
              onClick={() => setAbierta({ id: f.id, pais: p.codigo })}
              aria-label={`${f.nombre} en ${p.nombre}: ${detalleCelda(c)}. Ver detalle`}
              className={`flex w-full min-w-[8.5rem] flex-col items-start gap-0.5 rounded-md px-2 py-1 text-left hover:bg-muted ${anilloFoco}`}
            >
              <span className="inline-flex items-center gap-1.5 text-sm">
                <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[c.estado]}`} />
                <span className={ESTADOS_EXISTE.includes(c.estado) ? "font-medium" : "text-muted-foreground"}>{ETIQUETA_ESTADO_PAIS[c.estado]}</span>
              </span>
              {sub && <span className="max-w-[11rem] truncate pl-3.5 text-xs text-muted-foreground">{sub}</span>}
            </button>
          );
        },
      })),
      {
        id: "cuantos",
        label: "Existe en",
        ocultable: true,
        descripcion: "En cuántos de los países se publicó, se compró o tiene stock.",
        clase: "tabular-nums text-muted-foreground",
        render: (f) => `${f.existeEn.length} de ${paises.length}`,
      },
    ],
    [paises],
  );

  const iconos = useMemo<Record<string, IconoComp>>(
    () => ({ creado: CalendarioIcon, accion: EstadoIcon, decidir: MundoIcon, falta: MundoIcon, existe: MundoIcon, cuantos: MundoIcon, tipo: InventarioIcon, clase: EstadoIcon, nombre: InventarioIcon, codigo: InventarioIcon, ...Object.fromEntries(paises.map((p) => [`pais_${p.codigo}`, MundoIcon])) }),
    [paises],
  );

  const fila = abierta ? filas.find((f) => f.id === abierta.id) : undefined;
  const pais = abierta ? paises.find((p) => p.codigo === abierta.pais) : undefined;

  function alDecidir(id: string, codigo: string, decision: CeldaPais["decision"]) {
    setFilas((todas) =>
      todas.map((f) => {
        if (f.id !== id) return f;
        const celda = { ...f.celdas[codigo], decision };
        const celdas = { ...f.celdas, [codigo]: { ...celda, estado: estadoDeCelda(celda) } };
        return { ...f, celdas, acciones: accionesPorPais(celdas, f.clase), porDecidir: paisesPorDecidir(celdas, f.clase) };
      }),
    );
  }

  return (
    <>
      <SelectorTipoProducto
        def={DEF_POR_PAIS}
        cuentas={{ todos: filas.length, simple: filas.filter((f) => f.tipo !== "combo").length, pack: filas.filter((f) => f.tipo === "combo").length }}
      />
      <TableroPorPais filas={filas} paises={paises} />
      <TablaDatos
        def={DEF_POR_PAIS}
        filas={filas}
        columnas={columnas}
        iconos={iconos}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        anchoMinimo="60rem"
        fijarEncabezado
        abrirFila={abreProducto ? { etiqueta: (f) => `Abrir la ficha de ${f.nombre}`, alAbrir: (f) => setProductoAbierto(f.id), columna: "producto", soloColumna: true } : undefined}
        ariaLabel="Productos por país"
        vacio="No hay productos."
      />
      <Ventana abierto={!!fila && !!pais} alCerrar={() => setAbierta(null)} titulo={fila && pais ? `${fila.nombre} en ${pais.nombre}` : ""} ancho="xl">
        {fila && pais && <DetalleCelda key={`${fila.id}-${pais.codigo}`} fila={fila} pais={pais} puedeEscribir={puedeEscribir} esPaisBarra={pais.codigo === codigoPaisBarra} alDecidir={alDecidir} />}
      </Ventana>
      <FichaProductoEmbebida productoId={productoAbierto} alCerrar={() => setProductoAbierto(null)} />
    </>
  );
}

function DetalleCelda({
  fila,
  pais,
  puedeEscribir,
  esPaisBarra,
  alDecidir,
}: {
  fila: FilaPorPais;
  pais: PaisColumna;
  puedeEscribir: boolean;
  esPaisBarra: boolean;
  alDecidir: (id: string, codigo: string, decision: CeldaPais["decision"]) => void;
}) {
  const c = fila.celdas[pais.codigo];
  const { mostrarToast } = useToast();
  const [motivo, setMotivo] = useState(c.decision?.motivo ?? "");
  const [pendiente, empezar] = useTransition();
  const abreDropi = usePuedeAbrir("publicaciones-dropi");
  const abreDrop = usePuedeAbrir("publicaciones-drop");
  const existe = ESTADOS_EXISTE.includes(c.estado);

  function decidir(decision: Decision | null) {
    empezar(async () => {
      const r = await decidirProductoPais(fila.id, pais.codigo, decision, motivo);
      if ("error" in r) {
        mostrarToast(r.error, "destructive");
        return;
      }
      alDecidir(fila.id, pais.codigo, decision ? { decision, motivo: motivo.trim() || null, por: r.por, en: r.en } : null);
      mostrarToast(decision === "enviar" ? `Marcado para enviar a ${pais.nombre}.` : decision === "descartado" ? `Descartado en ${pais.nombre}.` : "Decisión quitada.");
    });
  }

  const titulo = (texto: string) => <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{texto}</h3>;

  return (
    <div className="@container flex flex-col gap-5">
      <p className="m-0 inline-flex items-center gap-2 text-sm">
        <Bandera codigo={pais.codigo} className="h-3.5 w-5" />
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${PUNTO[c.estado]}`} />
        <span className="font-medium">{ETIQUETA_ESTADO_PAIS[c.estado]}</span>
        <span className="text-muted-foreground">
          · {fila.codigo}
          {fila.creado ? ` · creado el ${formatearFecha(fila.creado)}` : ""}
        </span>
      </p>

      <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-1.5">
            {titulo("Publicaciones")}
            {c.publicaciones.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">Sin publicaciones en {pais.nombre}.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                {c.publicaciones.map((p) => {
                  const texto = `${p.plataforma === "drop" ? "Drop" : "Dropi"} ${p.id}`;
                  const puede = esPaisBarra && (p.plataforma === "drop" ? abreDrop : abreDropi);
                  return (
                    <li key={`${p.plataforma}-${p.ref}`} className="flex items-center gap-2">
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${p.activa ? "bg-success" : "border border-muted-foreground"}`} />
                      {puede ? (
                        <Link href={`/publicaciones-${p.plataforma}?abrir=${p.ref}`} className={`rounded font-medium hover:underline ${anilloFoco}`}>
                          {texto}
                        </Link>
                      ) : (
                        <span className="font-medium">{texto}</span>
                      )}
                      <span className="text-muted-foreground">
                    {p.activa ? "activa" : "archivada"}
                    {p.activa && p.stock !== null ? ` · ${p.stock.toLocaleString("es")} u.` : ""}
                    {p.activa && p.stockReferencial ? ` · ${p.stockReferencial.toLocaleString("es")} u. referenciales` : ""}
                  </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-1.5">
            {titulo(`Stock disponible en ${pais.nombre}: ${c.unidadesDisponibles.toLocaleString("es")} u.`)}
            {c.unidadesPlataformas > 0 && <p className="m-0 text-sm text-muted-foreground">En la bodega de Dropi o en Drop: {c.unidadesPlataformas.toLocaleString("es")} u. (la última lectura)</p>}
            {c.unidadesReferencial > 0 && (
              <p className="m-0 text-sm text-muted-foreground">
                Referencial: {c.unidadesReferencial.toLocaleString("es")} u. en la bodega del proveedor en Dropi. No es stock real y no se suma; lo real de nuestras bodegas
                sale del inventario del sistema.
              </p>
            )}
            {c.stock.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">Sin unidades en las bodegas del sistema de {pais.nombre}.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm tabular-nums">
                {c.stock.map((s) => (
                  <li key={s.bodega}>
                    <span className="font-medium">{s.bodega}</span> <span className="text-muted-foreground">· {s.unidades.toLocaleString("es")} u.</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {c.descontinuado && <p className="m-0 text-sm text-muted-foreground">Está descontinuado en {pais.nombre} (se cambia en la ficha del producto).</p>}

          {!existe && !c.descontinuado && (
            <section className="flex flex-col gap-2 border-t border-border pt-4">
              {titulo("Decisión")}
              {c.decision && (
                <p className="m-0 text-sm">
                  <span className="font-medium">{c.decision.decision === "enviar" ? "Enviar" : "Descartado"}</span>
                  <span className="text-muted-foreground">
                    {c.decision.por ? ` · ${c.decision.por}` : ""} · {formatearFecha(c.decision.en)}
                  </span>
                </p>
              )}
              {puedeEscribir ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className={labelClass}>Motivo (obligatorio para descartar)</span>
                    <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} rows={2} placeholder="Ej: ya está saturado en Dropi de este país" className={fieldClass} />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pendiente || c.decision?.decision === "enviar"}
                      onClick={() => decidir("enviar")}
                      className={`inline-flex min-h-10 items-center rounded-md bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}
                    >
                      Enviar a {pais.nombre}
                    </button>
                    <button
                      type="button"
                      disabled={pendiente || motivo.trim().length < 3}
                      onClick={() => decidir("descartado")}
                      className={`inline-flex min-h-10 items-center rounded-md border border-border-control bg-card px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
                    >
                      {c.decision?.decision === "descartado" ? "Guardar motivo" : "Descartar"}
                    </button>
                    {c.decision && (
                      <button type="button" disabled={pendiente} onClick={() => decidir(null)} className={`inline-flex min-h-10 items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 ${anilloFoco}`}>
                        Quitar decisión
                      </button>
                    )}
                  </div>
                </>
              ) : (
                !c.decision && <p className="m-0 text-sm text-muted-foreground">Sin decidir.</p>
              )}
            </section>
          )}
        </div>

        <section className="flex flex-col gap-2 @3xl:border-l @3xl:border-border @3xl:pl-6">
          {titulo(`Compras para ${pais.nombre}`)}
          <ComprasProducto id={fila.id} pais={pais.codigo} />
        </section>
      </div>
    </div>
  );
}
