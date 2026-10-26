"use client";

// Piezas de Scraping de proveedores que comparten la lista de productos (lista-scraping.tsx) y la de proveedores
// (proveedores/vista-proveedores.tsx): la foto, las marcas de cruce, la ficha de un producto y los formularios de proveedor.

import { useEffect, useState, useTransition } from "react";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { TarjetaEmergente } from "@/components/ui/tarjeta-emergente";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { formatearFechaHora } from "@/lib/formato";
import { CalendarioIcon, CatalogoIcon, HistorialIcon, InteligenciaIcon, ProductoIcon } from "@/lib/nav-icons";
import { ETIQUETA_REFERENCIA } from "@/lib/scraping/cruces";
import { RECOMENDACIONES } from "@/lib/scraping/recomendar";
import { agregarProveedor, obtenerHistorialProducto, pedirBusqueda, registrarDatosProveedor, type EventoProducto } from "./actions";
import { MOTIVO, formatoNumero, formatoPrecio, formatoUsd, nombrePais, type FilaScraping } from "./def-scraping";

export interface ProveedorResumen {
  id: string;
  nombre: string;
  pais: string;
  url: string;
  dropiId: number | null;
}

export interface Registro {
  proveedorId: string;
  fecha: string;
  ordenes: number;
  productos: number;
  dropshippers: number;
  origen: string;
}

export interface BusquedaResumen {
  id: string;
  proveedorId: string;
  inicio: string;
  fin: string | null;
  estado: string;
  vistos: number | null;
  nuevos: number | null;
  desaparecidos: number | null;
  duracionMs: number | null;
}

export const duracion = (ms: number | null) => {
  if (ms === null) return "";
  const s = Math.round(ms / 1000);
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
};

export function Delta({ ahora, antes, formato = formatoNumero }: { ahora: number | null; antes: number | null; formato?: (n: number) => string }) {
  if (ahora === null || antes === null) return null;
  const d = ahora - antes;
  if (d === 0) return <span className="text-xs text-muted-foreground">sin cambio</span>;
  const pct = antes ? ` (${d > 0 ? "+" : ""}${((d / antes) * 100).toFixed(1)} %)` : "";
  return (
    <span className={`text-xs tabular-nums ${d > 0 ? "text-success" : "text-destructive"}`}>
      {d > 0 ? "▲" : "▼"} {formato(Math.abs(d))}
      {pct}
    </span>
  );
}

/** Línea pequeña del stock en cada búsqueda (verde si terminó arriba de donde empezó, roja si abajo). */
export function Linea({ valores, ancho = 90, alto = 26 }: { valores: number[]; ancho?: number; alto?: number }) {
  if (valores.length < 2) return <span className="text-xs text-muted-foreground">—</span>;
  const min = Math.min(...valores);
  const rango = Math.max(...valores) - min || 1;
  const puntos = valores.map((v, i) => [(i / (valores.length - 1)) * (ancho - 4) + 2, alto - 3 - ((v - min) / rango) * (alto - 6)]);
  const d = puntos.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ");
  const color = valores[valores.length - 1] >= valores[0] ? "var(--success)" : "var(--destructive)";
  return (
    <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

export function Foto({ fila, grande = false }: { fila: FilaScraping; grande?: boolean }) {
  const tam = grande ? "h-16 w-16" : "h-10 w-10";
  if (!fila.foto)
    return (
      <span className={`${tam} flex shrink-0 items-center justify-center rounded-md border border-dashed border-border-control text-[10px] text-muted-foreground`}>
        {fila.estado === "privado" ? "Privado" : "Sin foto"}
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element -- fotos de Dropi (CloudFront), sin optimizar
  const img = <img src={fila.foto} alt="" loading="lazy" className={`${tam} shrink-0 rounded-md border border-border object-cover`} />;
  if (grande) return img;
  // Al pasar el cursor (o con el foco) se ve grande, como en Selección y Test productos.
  return (
    <TarjetaEmergente
      clase="rounded-lg border border-border bg-card p-1.5 shadow-lg"
      contenido={
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fila.foto} alt="" className="max-h-80 max-w-80 rounded-md object-contain" />
      }
    >
      {img}
    </TarjetaEmergente>
  );
}

/** Las marcas de cruce de un producto: prioridad, ya testeado o en Producto, y su fila en Selección. */
export function Marcas({ fila }: { fila: FilaScraping }) {
  if (!fila.repetidoEn.length && !fila.yaVisto && !fila.seleccion) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {fila.repetidoEn.length > 0 && (
        <Tooltip texto={`También en: ${fila.repetidoEn.join(", ")}`}>
          <span tabIndex={0} className="rounded-[5px] bg-destructive-soft px-1.5 py-0.5 text-[11px] font-semibold text-destructive">
            Prioridad · {fila.repetidoEn.length + 1} fuentes
          </span>
        </Tooltip>
      )}
      {fila.yaVisto && (
        <Tooltip texto={fila.yaVisto.motivo}>
          <span tabIndex={0} className="rounded-[5px] bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {ETIQUETA_REFERENCIA[fila.yaVisto.tipo]}
          </span>
        </Tooltip>
      )}
      {fila.seleccion && (
        <span className="rounded-[5px] bg-azul-soft px-1.5 py-0.5 text-[11px] font-medium text-azul">
          En Selección · SEL-{String(fila.seleccion.numero).padStart(4, "0")}
        </span>
      )}
    </span>
  );
}

export function EstadoProducto({ fila }: { fila: FilaScraping }) {
  if (fila.estado === "desaparecido") return <Badge tone="destructive">Desapareció · {MOTIVO[fila.motivo ?? "desconocido"]}</Badge>;
  if (fila.estado === "privado")
    return fila.vinculo?.seguro ? <Badge tone="warning">Privado · vinculado</Badge> : fila.vinculo ? <Badge tone="warning">Privado · posible pareja</Badge> : <Badge>Privado · sin pareja</Badge>;
  if (fila.movimientos.includes("nuevo")) return <Badge tone="azul">Nuevo</Badge>;
  return <Badge tone="success">Activo</Badge>;
}

const ETIQUETA_EVENTO: Record<string, string> = {
  primera_vez: "Primera vez que lo vimos",
  precio: "Cambió el precio",
  stock: "Cambió el stock",
  desaparecio: "Desapareció",
  reaparecio: "Volvió a aparecer",
  privatizado: "Lo hicieron privado",
  publicado: "Lo publicaron",
  vinculado: "Vinculado a un producto con foto",
};

/** Una celda de cambio: «antes → ahora» y la diferencia en color (verde si sube, rojo si baja). */
function CeldaCambio({ antes, ahora, formato }: { antes: number | null; ahora: number | null; formato: (n: number | null) => string }) {
  if (ahora === null && antes === null) return <span className="text-muted-foreground">—</span>;
  if (antes === null) return <span>{formato(ahora)}</span>;
  return (
    <span className="flex flex-col">
      <span className="whitespace-nowrap">
        <span className="text-muted-foreground">{formato(antes)} → </span>
        {formato(ahora)}
      </span>
      {ahora !== null && <Delta ahora={ahora} antes={antes} formato={(n) => formato(n)} />}
    </span>
  );
}

/** La ficha de un producto: la recomendación y por qué, sus datos, sus privados y su historial. */
export function FichaProducto({
  fila,
  puedeEnviar,
  alCerrar,
  alEnviar,
}: {
  fila: FilaScraping | null;
  puedeEnviar: boolean;
  alCerrar: () => void;
  alEnviar: (ids: string[]) => void;
}) {
  const [eventos, setEventos] = useState<EventoProducto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!fila) return;
    let vigente = true;
    setEventos(null);
    setError(null);
    obtenerHistorialProducto(fila.id).then((r) => {
      if (!vigente) return;
      if (r.error) setError(r.error);
      else setEventos(r.eventos ?? []);
    });
    return () => {
      vigente = false;
    };
  }, [fila]);

  const pais = fila?.pais ?? "mx";
  const precio = (n: number | null) => formatoPrecio(n, pais);
  const rec = fila ? RECOMENDACIONES.find((r) => r.valor === fila.recomendacion) : null;
  const titulo = (e: EventoProducto) =>
    e.evento === "stock" && e.stock !== null && e.stockAntes !== null
      ? e.stock > e.stockAntes
        ? "Subió el stock"
        : "Bajó el stock"
      : e.evento === "precio" && e.precio !== null && e.precioAntes !== null
        ? e.precio > e.precioAntes
          ? "Subió el precio"
          : "Bajó el precio"
        : (ETIQUETA_EVENTO[e.evento] ?? e.evento);

  return (
    <Ventana abierto={!!fila} alCerrar={alCerrar} titulo={fila?.nombre ?? ""} lado="derecha" ancho="lg">
      {fila && (
        <div className="flex flex-col divide-y divide-border p-5">
          {rec && (
            <Seccion icono={InteligenciaIcon} titulo="Recomendación">
              <div className="flex flex-col gap-2 rounded-xl bg-muted/60 px-4 py-3">
                <span className="w-fit rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: rec.color }}>
                  {rec.etiqueta}
                </span>
                <p className="m-0 text-sm leading-relaxed">{fila.porQue}</p>
                <p className="m-0 text-xs text-muted-foreground">
                  {fila.proveedor} · {nombrePais(fila.pais)} · ventas estimadas: {formatoNumero(fila.ventas30)} u. en 30 días, {formatoNumero(fila.ventas7)} en 7 (lo que bajó el stock)
                </p>
              </div>
            </Seccion>
          )}
          {(fila.yaVisto || fila.parecidos.length > 0) && (
            <Seccion icono={CatalogoIcon} titulo={fila.yaVisto ? "Ya lo tenemos" : "Se parece a algo nuestro"}>
              <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-md border border-border p-0 text-sm">
                {fila.yaVisto && (
                  <li className="flex flex-col gap-0.5 px-3 py-2">
                    <span className="font-semibold">
                      Igual · {ETIQUETA_REFERENCIA[fila.yaVisto.tipo]}: {fila.yaVisto.nombre}
                    </span>
                    <span className="text-xs text-muted-foreground">{fila.yaVisto.motivo}</span>
                  </li>
                )}
                {fila.parecidos.map((p) => (
                  <li key={`${p.tipo}-${p.nombre}`} className="flex flex-col gap-0.5 px-3 py-2">
                    <span className="font-medium">
                      Parecido · {ETIQUETA_REFERENCIA[p.tipo]}: {p.nombre}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {p.detalle} · {p.porFoto ? "foto parecida" : `${Math.round(p.parecido * 100)} % del nombre`}
                    </span>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}
          <Seccion icono={ProductoIcon} titulo="Producto">
            <div className="flex items-start gap-3">
              <Foto fila={fila} grande />
              <div className="flex min-w-0 flex-col items-start gap-1 text-sm">
                <EstadoProducto fila={fila} />
                <span className="text-muted-foreground">
                  ID Dropi {fila.dropiId}
                  {fila.sku ? ` · ${fila.sku}` : ""}
                  {fila.categoria ? ` · ${fila.categoria}` : ""}
                </span>
                {fila.vinculo && (
                  <span>
                    {fila.vinculo.seguro ? "Vinculado a" : "Posible pareja:"} «{fila.vinculo.nombre}» ({fila.vinculo.parecido} % por nombre)
                  </span>
                )}
                <Marcas fila={fila} />
                {fila.yaVisto && <span className="text-xs text-muted-foreground">{fila.yaVisto.motivo}</span>}
                {fila.repetidoEn.length > 0 && <span className="text-xs text-muted-foreground">También se vende en: {fila.repetidoEn.join(", ")}.</span>}
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Precio</dt>
                <dd className="font-semibold tabular-nums">{precio(fila.precio)}</dd>
                {pais !== "pa" && <dd className="text-xs text-muted-foreground tabular-nums">{formatoUsd(fila.precioUsd)}</dd>}
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Sugerido</dt>
                <dd className="font-semibold tabular-nums">{precio(fila.precioSugerido)}</dd>
                {pais !== "pa" && <dd className="text-xs text-muted-foreground tabular-nums">{formatoUsd(fila.precioSugeridoUsd)}</dd>}
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Stock</dt>
                <dd className="font-semibold tabular-nums">{fila.estado === "desaparecido" ? "—" : formatoNumero(fila.stock)}</dd>
              </div>
            </dl>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Stock en cada búsqueda (4 semanas)</p>
              <Linea valores={fila.serie} ancho={360} alto={64} />
            </div>
            {puedeEnviar && !fila.seleccion && fila.estado !== "desaparecido" && (
              <div>
                <Button type="button" onClick={() => alEnviar([fila.id])}>
                  Enviar a Selección
                </Button>
              </div>
            )}
          </Seccion>

          {fila.privados.length > 0 && (
            <Seccion icono={CatalogoIcon} titulo={`Privados de este producto (${fila.privados.length})`}>
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border text-sm">
                {fila.privados.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{p.nombre}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.seguro ? "Vinculado" : "Posible pareja"} · {p.parecido} % del nombre
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end tabular-nums">
                      {precio(p.precio)}
                      <span className="text-xs text-muted-foreground">{formatoNumero(p.stock)} en stock</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}

          <Seccion icono={HistorialIcon} titulo="Historial">
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!eventos && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {eventos && (
              <ContenedorTabla ariaLabel={`Historial de ${fila.nombre}`}>
                <table className="tabla-datos w-full text-sm">
                  <thead>
                    <tr className={claseFilaEncabezado}>
                      <th className={claseEncabezadoColumna}>Fecha</th>
                      <th className={claseEncabezadoColumna}>Evento</th>
                      <th className={claseEncabezadoColumna}>Precio</th>
                      <th className={claseEncabezadoColumna}>Stock</th>
                      <th className={claseEncabezadoColumna}>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventos.map((e, i) => (
                      <tr key={i} className="border-b border-border align-top last:border-0">
                        <td className={`${claseCeldaColumna} whitespace-nowrap`}>{formatearFechaHora(e.fecha)}</td>
                        <td className={`${claseCeldaColumna} font-medium`}>{titulo(e)}</td>
                        <td className={`${claseCeldaColumna} tabular-nums`}>
                          {e.evento === "precio" ? (
                            <CeldaCambio antes={e.precioAntes} ahora={e.precio} formato={precio} />
                          ) : e.precio !== null ? (
                            precio(e.precio)
                          ) : e.precioAntes !== null ? (
                            <span className="text-muted-foreground">{precio(e.precioAntes)}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={`${claseCeldaColumna} tabular-nums`}>
                          {e.evento === "stock" ? (
                            <CeldaCambio antes={e.stockAntes} ahora={e.stock} formato={formatoNumero} />
                          ) : e.stock !== null ? (
                            formatoNumero(e.stock)
                          ) : e.stockAntes !== null ? (
                            <span className="text-muted-foreground">tenía {formatoNumero(e.stockAntes)}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={`${claseCeldaColumna} text-muted-foreground`}>{e.detalle ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ContenedorTabla>
            )}
          </Seccion>
        </div>
      )}
    </Ventana>
  );
}

function CamposCifras({ faltante, invalido, prefijo }: { faltante: string | null; invalido: (id: string) => true | undefined; prefijo: string }) {
  const campos = [
    ["ordenes", "Órdenes", "Ej: 390186"],
    ["productos", "Productos", "Ej: 1436"],
    ["dropshippers", "Dropshippers", "Ej: 2065"],
  ] as const;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {campos.map(([nombre, etiqueta, ejemplo]) => (
        <Campo key={nombre} etiqueta={etiqueta} id={`${prefijo}-${nombre}`} obligatorio faltante={faltante}>
          <input
            id={`${prefijo}-${nombre}`}
            name={nombre}
            inputMode="numeric"
            pattern="[0-9.,\s]*"
            required
            aria-invalid={invalido(`${prefijo}-${nombre}`)}
            placeholder={ejemplo}
            className={`${fieldClass} w-full tabular-nums`}
          />
        </Campo>
      ))}
    </div>
  );
}

export function AgregarProveedor() {
  return (
    <FichaCrear titulo="Agregar proveedor" etiquetaBoton="Agregar proveedor" etiquetaCrear="Agregar y pedir la primera búsqueda" action={agregarProveedor} mensajeExito="Proveedor agregado. Su primera búsqueda quedó pedida.">
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={ProductoIcon} titulo="Proveedor">
            <Campo etiqueta="Nombre del proveedor" id="prov-nombre" obligatorio faltante={faltante}>
              <input id="prov-nombre" name="nombre" required data-enfocar aria-invalid={invalido("prov-nombre")} placeholder="Ej: MODA EJEMPLO IMPORTACIONES" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Enlace del proveedor en Dropi" id="prov-url" obligatorio faltante={faltante}>
              <input id="prov-url" name="url" type="url" required aria-invalid={invalido("prov-url")} placeholder="Ej: https://app.dropi.mx/dashboard/provider/1234/MODA" className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
          <Seccion icono={CalendarioIcon} titulo="Cifras de hoy">
            <CamposCifras faltante={faltante} invalido={invalido} prefijo="prov" />
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}

/** Las cifras de hoy del proveedor (órdenes, productos y dropshippers que muestra Dropi), escritas a mano. */
export function AnotarCifras({ proveedor }: { proveedor: ProveedorResumen }) {
  return (
    <FichaCrear
      titulo="Anotar cifras del proveedor"
      etiquetaCrear="Guardar datos de hoy"
      action={registrarDatosProveedor}
      mensajeExito="Datos guardados"
      ocultos={{ proveedor_id: proveedor.id }}
      boton={(abrir) => (
        <Button type="button" variant="secondary" onClick={abrir}>
          Anotar cifras
        </Button>
      )}
    >
      {({ faltante, invalido }) => (
        <Seccion icono={CalendarioIcon} titulo={proveedor.nombre}>
          <CamposCifras faltante={faltante} invalido={invalido} prefijo="act" />
        </Seccion>
      )}
    </FichaCrear>
  );
}

export function BuscarAhora({ proveedorId, pedida }: { proveedorId: string; pedida: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const { mostrarToast } = useToast();
  return (
    <Button
      type="button"
      disabled={pendiente || pedida}
      onClick={() =>
        iniciar(async () => {
          const r = await pedirBusqueda(proveedorId);
          mostrarToast(r.error ?? "Búsqueda pedida", r.error ? "destructive" : "success");
        })
      }
    >
      {pedida ? "Búsqueda pedida" : pendiente ? "Pidiendo…" : "Buscar ahora"}
    </Button>
  );
}
