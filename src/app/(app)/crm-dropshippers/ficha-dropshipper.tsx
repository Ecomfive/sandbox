"use client";

import { Badge } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { anilloFoco } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import {
  AlertaIcon,
  EstadoIcon,
  FlechaAbajoIcon,
  FlechaArribaIcon,
  HistorialIcon,
  PedidoIcon,
  PersonaIcon,
  EnlaceIcon,
  EtiquetaIcon,
} from "@/lib/nav-icons";
import { obtenerHistorialDropshipper } from "./actions";
import {
  etiquetaAntiguedad,
  etiquetaCanal,
  etiquetaEstado,
  etiquetaEstadoCaso,
  etiquetaNivel,
  etiquetaTipoCaso,
  etiquetaUltimoPedido,
  montoCorto,
  type FilaCaso,
  type FilaDropshipper,
} from "./def-crm";

export const toneEstado: Record<string, "neutral" | "success" | "info"> = {
  prospecto: "info",
  activo: "success",
  inactivo: "neutral",
};

function BotonNavegar({ texto, icono: Icono, activo, alHacerClic }: { texto: string; icono: typeof FlechaArribaIcon; activo: boolean; alHacerClic: () => void }) {
  return (
    <Tooltip texto={texto}>
      <button
        type="button"
        aria-label={texto}
        aria-disabled={!activo}
        onClick={() => activo && alHacerClic()}
        className={`flex h-9 w-9 items-center justify-center border border-border bg-card text-foreground ${anilloFoco} !rounded-md ${
          activo ? "hover:bg-muted" : "cursor-default opacity-40"
        }`}
      >
        <Icono className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Pedidos de los últimos seis meses (el último, el mes en curso, en oscuro). */
function GraficaPedidos({ serie, hoy }: { serie: number[]; hoy: string }) {
  const mesActual = Number(hoy.slice(5, 7)) - 1;
  const maximo = Math.max(...serie, 1);
  return (
    <figure className="m-0">
      <div role="img" aria-label={`Pedidos de los últimos seis meses: ${serie.join(", ")}`} className="flex h-20 items-end gap-2">
        {serie.map((v, i) => (
          <div key={i} className="flex h-full flex-1 flex-col justify-end">
            <div className={`w-full rounded-sm ${i === serie.length - 1 ? "bg-foreground" : "bg-accent"}`} style={{ height: `${Math.max(4, (v / maximo) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-1 flex gap-2 text-[11px] text-muted-foreground">
        {serie.map((_, i) => (
          <span key={i} className="flex-1 text-center">
            {MESES_CORTOS[(mesActual - (serie.length - 1 - i) + 12) % 12]}
          </span>
        ))}
      </div>
    </figure>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

/**
 * Ficha lateral de un dropshipper: cabecera con insignias y acciones, desempeño, datos, casos abiertos, la conversación
 * de WhatsApp (fase 2, con Chatwoot) y su actividad. Las flechas pasan al anterior o siguiente, en el orden en que se
 * ven las filas. En modo demo las acciones solo avisan que aún no guardan nada y la conversación y la actividad son
 * ejemplos fijos.
 */
export function FichaDropshipper({
  dropshipper,
  casos,
  orden,
  alIr,
  alCerrar,
  codigoPais,
  hoy,
  demo,
}: {
  dropshipper: FilaDropshipper | null;
  casos: FilaCaso[];
  orden: string[];
  alIr: (id: string) => void;
  alCerrar: () => void;
  codigoPais: string;
  hoy: string;
  demo: boolean;
}) {
  const { mostrarToast } = useToast();
  const d = dropshipper;
  const posicion = d ? orden.indexOf(d.id) : -1;
  const anterior = posicion > 0 ? orden[posicion - 1] : null;
  const siguiente = posicion >= 0 && posicion < orden.length - 1 ? orden[posicion + 1] : null;
  const abiertos = d ? casos.filter((c) => c.dropshipperId === d.id && c.estado !== "resuelto") : [];
  const avisoDemo = () => mostrarToast("Esta acción se activa cuando el CRM use datos reales.", "info");

  return (
    <Ventana
      abierto={d !== null}
      alCerrar={alCerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        d && (
          <>
            <span>{d.nombre}</span>
            <span className="text-xs font-normal text-muted-foreground tabular-nums">{d.codigo}</span>
            <Badge tone={toneEstado[d.estado] ?? "neutral"}>{etiquetaEstado(d.estado)}</Badge>
            <Badge tone={d.nivel === "vip" ? "warning" : "neutral"}>{etiquetaNivel(d.nivel)}</Badge>
          </>
        )
      }
      navegacion={
        <>
          <BotonNavegar texto="Dropshipper anterior" icono={FlechaArribaIcon} activo={!!anterior} alHacerClic={() => anterior && alIr(anterior)} />
          <BotonNavegar texto="Dropshipper siguiente" icono={FlechaAbajoIcon} activo={!!siguiente} alHacerClic={() => siguiente && alIr(siguiente)} />
        </>
      }
    >
      {d && (
        <div className="flex flex-1 flex-col">
          <div className="flex flex-wrap gap-2 border-b border-border px-5 py-4">
            <BotonAccion icono={AlertaIcon} onClick={avisoDemo}>Nuevo caso</BotonAccion>
            <BotonAccion icono={PedidoIcon} onClick={avisoDemo}>Agregar pedido</BotonAccion>
            <BotonAccion icono={EtiquetaIcon} onClick={avisoDemo}>Nota</BotonAccion>
            <BotonAccion icono={EnlaceIcon} onClick={avisoDemo} disabled={!d.telefono}>WhatsApp</BotonAccion>
          </div>

          <div className="flex flex-col divide-y divide-border px-5 py-5">
            <Seccion icono={EstadoIcon} titulo="Desempeño del mes">
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Pedidos", d.pedidosMes ? String(d.pedidosMes) : "—"],
                  ["Ventas", d.ventasMes ? montoCorto(d.ventasMes, codigoPais) : "—"],
                  ["Último pedido", etiquetaUltimoPedido(d.ultimoPedido, hoy)],
                ].map(([titulo, valor]) => (
                  <div key={titulo} className="min-w-0 rounded-lg border border-border px-3 py-2">
                    <p className="text-xs text-muted-foreground">{titulo}</p>
                    <p className="truncate text-sm font-semibold tabular-nums">{valor}</p>
                  </div>
                ))}
              </div>
              {d.pedidosPorMes.length > 0 && d.pedidosMes > 0 ? (
                <GraficaPedidos serie={d.pedidosPorMes} hoy={hoy} />
              ) : (
                <p className="text-xs text-muted-foreground">Todavía no tiene pedidos registrados este mes.</p>
              )}
              {d.ventasMes > 0 && <p className="text-xs text-muted-foreground tabular-nums">Ventas exactas: {formatearMoneda(d.ventasMes, codigoPais)}</p>}
            </Seccion>

            <Seccion icono={PersonaIcon} titulo="Datos">
              <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                <Dato etiqueta="Tienda">{d.tienda ?? "—"}</Dato>
                <Dato etiqueta="Teléfono"><span className="tabular-nums">{d.telefono ?? "—"}</span></Dato>
                {d.email && <Dato etiqueta="Correo">{d.email}</Dato>}
                <Dato etiqueta="Ciudad">{d.ciudad ?? "—"}</Dato>
                <Dato etiqueta="Ingreso">{d.ingreso ? formatearFecha(d.ingreso) : "—"}</Dato>
                <Dato etiqueta="Responsable">{d.responsable ?? "Sin asignar"}</Dato>
                <Dato etiqueta="Etiquetas">
                  {d.etiquetas.length ? (
                    <span className="flex flex-wrap gap-1">
                      {d.etiquetas.map((e) => (
                        <Badge key={e}>{e}</Badge>
                      ))}
                    </span>
                  ) : (
                    "—"
                  )}
                </Dato>
                {d.notas && <Dato etiqueta="Notas">{d.notas}</Dato>}
              </dl>
            </Seccion>

            {abiertos.length > 0 && (
              <Seccion icono={AlertaIcon} titulo="Casos abiertos">
                <ul className="-my-1 flex flex-col">
                  {abiertos.map((c) => (
                    <li key={c.id} className="flex items-start gap-2.5 border-b border-border py-2 last:border-0">
                      <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${c.prioridad === "alta" ? "bg-destructive" : "bg-warning"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{c.titulo}</p>
                        <p className="text-xs text-muted-foreground">
                          {etiquetaTipoCaso(c.tipo)} · {etiquetaEstadoCaso(c.estado)}
                          {c.numeroPedido ? ` · ${c.numeroPedido}` : ""} · {etiquetaCanal(c.canal)}
                        </p>
                      </div>
                      <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{etiquetaAntiguedad(c.horasAbierto)}</span>
                    </li>
                  ))}
                </ul>
              </Seccion>
            )}

            <Seccion icono={EnlaceIcon} titulo="Conversación">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>WhatsApp Business, desde Chatwoot</span>
                <Badge tone="warning">Próximamente</Badge>
              </div>
              {demo ? (
                <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted p-3 text-sm">
                  <p className="max-w-[85%] self-start rounded-xl border border-border bg-card px-3 py-1.5">
                    Hola, el pedido #48213 llegó sin el cargador. <span className="block text-[11px] text-muted-foreground">10:12 · ejemplo</span>
                  </p>
                  <p className="max-w-[85%] self-end rounded-xl bg-foreground px-3 py-1.5 text-background">
                    Hola {d.nombre.split(" ")[0]}, ya lo revisamos. Te enviamos la pieza hoy. <span className="block text-[11px] opacity-70">10:31 · {d.responsable ?? "Equipo"}</span>
                  </p>
                  <p className="max-w-[85%] self-start rounded-xl border border-border bg-card px-3 py-1.5">
                    Perfecto, gracias. <span className="block text-[11px] text-muted-foreground">10:33 · ejemplo</span>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Cuando se conecte Chatwoot, aquí aparecerá el historial de WhatsApp de este dropshipper.</p>
              )}
            </Seccion>

            <Seccion icono={HistorialIcon} titulo="Actividad">
              {demo ? (
                <ul className="flex flex-col gap-2 text-sm">
                  {[
                    ["Estado: Prospecto → Activo", "hace 5 meses · Andrea"],
                    [`Nota agregada por ${d.responsable ?? "el equipo"}`, "hace 3 semanas"],
                    [`Nivel: Regular → ${etiquetaNivel(d.nivel)}`, "hace 2 meses · Andrea"],
                  ].map(([texto, cuando]) => (
                    <li key={texto} className="flex gap-2.5">
                      <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                      <span>
                        {texto}
                        <span className="block text-xs text-muted-foreground">{cuando} · ejemplo</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <HistorialGenerico id={d.id} codigoPais={codigoPais} obtener={obtenerHistorialDropshipper} />
              )}
            </Seccion>
          </div>
        </div>
      )}
    </Ventana>
  );
}
