"use client";

import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { Ventana } from "@/components/ui/ventana";
import { useToast } from "@/components/ui/toast";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import { AlertaIcon, CheckIcon, CerrarIcon, ConciliarIcon } from "@/lib/nav-icons";
import { ESTADO_TONO } from "@/lib/retiros/estados";
import { ESTADO_ETIQUETA } from "./filtros";
import type { FilaRetiro } from "./tabla-retiros";
import type { Cuenta, Plataforma } from "./crear-retiro-panel";
import { obtenerActividadRetiro } from "./actividad";
import { CancelarRetiroBoton } from "./cancelar-retiro-boton";
import { EliminarRetiroBoton } from "./eliminar-retiro-boton";
import { FormularioEditarRetiro } from "./formulario-editar-retiro";
import { SeccionConciliarRetiro } from "./seccion-conciliar-retiro";
import { SeccionNovedadRetiro } from "./seccion-novedad-retiro";
import { SeccionResolverNovedad } from "./seccion-resolver-novedad";

const numeroDe = (fila: FilaRetiro) => `#${String(fila.numeroCorrelativo).padStart(4, "0")}`;

type EstadoPaso = "completo" | "actual" | "pendiente" | "error";

/** La novedad ya se resolvió (modelo de la migración 0048, o el estado antiguo «novedad_resuelta»). */
const resuelta = (fila: FilaRetiro) => fila.novedadResuelta || fila.estado === "novedad_resuelta";

/** El 3.º y 4.º paso de la barra: se recibe el dinero y por último se consolida. */
function pasosDelRetiro(fila: FilaRetiro): { recibido: EstadoPaso; consolidado: EstadoPaso } {
  // Una novedad resuelta a mano no trae monto: su Recibido se da por hecho con la fecha que se escribió al resolverla.
  const recibido: EstadoPaso =
    fila.montoRecibido !== null
      ? fila.estado === "novedad"
        ? "error"
        : "completo"
      : resuelta(fila) && fila.fechaRecibido
        ? "completo"
        : "actual";

  const consolidado: EstadoPaso = fila.consolidado ? "completo" : recibido === "completo" ? "actual" : "pendiente";

  return { recibido, consolidado };
}

function claseNodo(estado: EstadoPaso): string {
  switch (estado) {
    case "completo":
      return "border-success bg-success text-white";
    case "error":
      return "border-destructive bg-destructive text-white";
    case "actual":
      return "border-foreground bg-card text-foreground";
    default:
      return "border-border bg-card text-muted-foreground";
  }
}

/** La barra **siempre tiene cuatro pasos fijos**, cada uno con su fecha debajo (igual que Creado):
 * Creado, la decisión de Dropi (Aprobado, Rechazado o Cancelado — el único que cambia, según
 * `estado_dropi`), Recibido y Consolidado. No es el `estado` de seguimiento interno
 * (abierto/novedad/cerrado/cancelado/novedad_resuelta) — ese se ve en la insignia del título, y
 * Novedad/Novedad resuelta ya no van acá: se ven en el dato «Consolidación», con
 * `estadoConsolidacion()` (`src/lib/retiros/estados.ts`). Mientras Dropi no ha decidido, el segundo
 * paso queda «En espera» sin fecha; los tres primeros pasos no detienen a los siguientes — los
 * cuatro se muestran siempre, aunque el segundo sea Rechazado o Cancelado. **Recibido** usa su propia
 * `fecha_recibido` (se escribe a mano al conciliar, puede ser otro día que hoy), distinta de la de
 * **Consolidado** (`fecha_cierre`: cuándo se hizo la conciliación en el sistema). */
function BarraPasos({ fila, codigoPais }: { fila: FilaRetiro; codigoPais: string }) {
  const fecha = (iso: string | null) => (iso ? formatearFecha(iso) : null);
  const { recibido, consolidado } = pasosDelRetiro(fila);

  const decision: { etiqueta: string; estado: EstadoPaso; subtexto: string } =
    fila.estadoDropi === "aprobado"
      ? { etiqueta: "Aprobado", estado: "completo", subtexto: fecha(fila.fechaAprobado) ?? "—" }
      : fila.estadoDropi === "rechazado"
        ? { etiqueta: "Rechazado", estado: "error", subtexto: fecha(fila.fechaRechazo) ?? "—" }
        : fila.estadoDropi === "cancelado"
          ? { etiqueta: "Cancelado", estado: "error", subtexto: fecha(fila.fechaCanceladoDropi) ?? "—" }
          : { etiqueta: "En espera", estado: "actual", subtexto: "Dropi" };

  const pasos: { etiqueta: string; estado: EstadoPaso; subtexto: string }[] = [
    { etiqueta: "Creado", estado: "completo", subtexto: formatearFecha(fila.fecha) },
    decision,
    {
      etiqueta: "Recibido",
      estado: recibido,
      subtexto:
        fila.montoRecibido !== null
          ? [formatearMoneda(fila.montoRecibido, codigoPais), fecha(fila.fechaRecibido)].filter(Boolean).join(" · ")
          : recibido === "error"
            ? "Diferencia de monto"
            : (recibido === "completo" && fecha(fila.fechaRecibido)) || "Sin registrar",
    },
    {
      etiqueta: "Consolidado",
      estado: consolidado,
      subtexto: fila.consolidado ? (fecha(fila.fechaCierre) ?? "Consolidado") : "Pendiente",
    },
  ];

  return (
    <div role="group" aria-label="Etapa">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Etapa</p>
      <div className="flex items-start">
      {pasos.map((paso, i) => (
        <Fragment key={paso.etiqueta}>
          {i > 0 && (
            <div
              aria-hidden="true"
              className={`mt-[7px] h-px flex-1 ${pasos[i - 1].estado === "completo" ? "bg-success" : "bg-border"}`}
            />
          )}
          <div className="flex w-16 shrink-0 flex-col items-center gap-1 text-center">
            <span
              aria-hidden="true"
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${claseNodo(paso.estado)}`}
            >
              {paso.estado === "completo" && <CheckIcon className="h-2 w-2" />}
              {paso.estado === "error" && <CerrarIcon className="h-2 w-2" />}
            </span>
            <span className="text-xs font-medium leading-tight">{paso.etiqueta}</span>
            <span className="text-[11px] leading-tight text-muted-foreground">{paso.subtexto}</span>
          </div>
        </Fragment>
      ))}
      </div>
    </div>
  );
}

/** Qué sección de abajo está desplegada: la que pide lo necesario para conciliar, la de la nota de una novedad nueva o
 * la de una novedad que ya tiene el retiro (su nota y el botón «Resuelto»). */
type PanelAbajo = "conciliar" | "novedad" | "resolver";

/**
 * Ficha de un retiro: el panel a la derecha que se abre al pulsar su fila, con su barra de pasos, sus acciones y
 * sus datos, sin salir de la tabla — reemplaza a la página completa que había antes en `/retiros/[id]`. **La
 * ficha ya es el formulario** (no hay un botón «Modificar», ver `FormularioEditarRetiro`): se cambia un campo y
 * arriba, junto a Conciliar/Novedad/Ver novedad/Cancelar/Eliminar, aparecen «Guardar cambios» y «Cancelar». Con cambios
 * sin guardar, cerrar la ficha pide confirmación. Lo que muestra sale de la fila ya cargada, así que se actualiza sola
 * al guardar.
 *
 * **«Conciliar», «Novedad» y «Ver novedad» no abren una ventana en el medio**: despliegan una sección al final de la
 * misma ficha (`SeccionConciliarRetiro`, `SeccionNovedadRetiro`, `SeccionResolverNovedad`), la ficha baja hasta ella y
 * el foco entra en su primer campo. Solo hay una desplegada a la vez. **El historial (`HistorialGenerico`) es siempre
 * lo último**: con una sección desplegada, queda debajo de ella. «Novedad» solo está en un retiro abierto (no exige
 * texto: se puede crear rápido, sin nota, y escribirla después); al agregarla el retiro pasa a «novedad» y aparece
 * «Ver novedad» en su lugar, sin el botón Conciliar. **«Ver novedad» no resuelve nada por sí solo**: lleva a la nota
 * de la novedad (editable ahí mismo) y a su botón «Resolver», que es lo único que la quita — y, a diferencia de
 * antes, el retiro ya no vuelve a «abierto»: queda en el estado aparte «Novedad resuelta». Ni la novedad ni su
 * resolución aparecen en la barra de pasos (siempre son los mismos cuatro, ver `BarraPasos`): se ven en el dato
 * «Consolidación» (`estadoConsolidacion()`), que pasa de «Pendiente» a «Novedad resuelta» al resolverla — y a
 * «Consolidado» si el retiro llega a conciliarse por el camino normal en vez de por una novedad.
 */
export function VistaRapidaRetiro({
  fila,
  codigoPais,
  paisId,
  plataformas,
  cuentas,
  alCerrar,
}: {
  /** El retiro que se ve; null = cerrada. */
  fila: FilaRetiro | null;
  codigoPais: string;
  paisId: string;
  plataformas: Plataforma[];
  cuentas: Cuenta[];
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [guardando, setGuardando] = useState(false);
  // De qué retiro hay cambios sin guardar (el id, para que no sobreviva a otro retiro).
  const [sinGuardarId, setSinGuardarId] = useState<string | null>(null);
  // Sube al cancelar: con otra `key` el formulario se monta de nuevo con los datos del retiro y suelta lo escrito.
  const [version, setVersion] = useState(0);
  const [panel, setPanel] = useState<PanelAbajo | null>(null);
  // Sube al conciliar o agregar una novedad, para que el historial de la ficha se vuelva a pedir.
  const [versionHistorial, setVersionHistorial] = useState(0);
  const sinGuardar = !!fila && sinGuardarId === fila.id;

  /** Pide confirmación si se van a perder cambios; devuelve si se puede seguir. */
  function puedeDescartar() {
    return !sinGuardar || confirm("Hay cambios sin guardar. ¿Descartarlos?");
  }

  function cerrar() {
    if (guardando || !puedeDescartar()) return;
    setSinGuardarId(null);
    setPanel(null);
    alCerrar();
  }

  function alGuardar() {
    setGuardando(false);
    setSinGuardarId(null);
    mostrarToast("Cambios guardados");
  }

  function alCancelarEdicion() {
    setSinGuardarId(null);
    setVersion((v) => v + 1);
  }

  /** Despliega la sección de abajo, baja hasta ella (sin movimiento suave si la persona pidió menos animación) y
   * pone el foco en su primer campo. El botón de la fila queda arriba, sin foco: la ficha ya no lo necesita. */
  function irAlPanel(cual: PanelAbajo) {
    if (!fila) return;
    setPanel(cual);
    const id = `panel-retiro-${fila.id}`;
    requestAnimationFrame(() => {
      const seccion = document.getElementById(id);
      if (!seccion) return;
      const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      seccion.scrollIntoView({ block: "start", behavior: reducido ? "auto" : "smooth" });
      seccion
        .querySelector<HTMLElement>("input:not([type=hidden]):not([readonly]), textarea, [data-foco-panel]")
        ?.focus({ preventScroll: true });
    });
  }

  function alTerminarPanel(mensaje: string) {
    setPanel(null);
    setVersionHistorial((v) => v + 1);
    mostrarToast(mensaje);
  }

  return (
    <Ventana
      abierto={fila !== null}
      alCerrar={cerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        fila && (
          <>
            Retiro {numeroDe(fila)}
            <Badge tone={ESTADO_TONO[fila.estado as keyof typeof ESTADO_TONO] ?? "neutral"}>
              {ESTADO_ETIQUETA[fila.estado] ?? fila.estado}
            </Badge>
          </>
        )
      }
    >
      {fila && (
        <div className="flex flex-1 flex-col">
          <FormularioEditarRetiro
            key={`${fila.id}-${version}`}
            fila={fila}
            codigoPais={codigoPais}
            plataformas={plataformas}
            cuentas={cuentas}
            pasos={<BarraPasos fila={fila} codigoPais={codigoPais} />}
            acciones={
              <>
                {/* Un cancelado o una novedad resuelta no siguen el flujo normal: su ciclo ya terminó. */}
                {!resuelta(fila) && fila.estado !== "cancelado" && (
                  <BotonAccion
                    icono={ConciliarIcon}
                    tono="oscuro"
                    onClick={() => irAlPanel("conciliar")}
                    aria-expanded={panel === "conciliar"}
                    aria-controls={`panel-retiro-${fila.id}`}
                  >
                    Conciliar
                  </BotonAccion>
                )}
                {fila.estado === "abierto" && (
                  <BotonAccion
                    icono={AlertaIcon}
                    tono="alerta"
                    onClick={() => irAlPanel("novedad")}
                    aria-expanded={panel === "novedad"}
                    aria-controls={`panel-retiro-${fila.id}`}
                  >
                    Novedad
                  </BotonAccion>
                )}
                {fila.estado === "novedad" && (
                  <BotonAccion
                    icono={CheckIcon}
                    tono="exito"
                    onClick={() => irAlPanel("resolver")}
                    aria-expanded={panel === "resolver"}
                    aria-controls={`panel-retiro-${fila.id}`}
                  >
                    Ver novedad
                  </BotonAccion>
                )}
                {(fila.estado === "abierto" || fila.estado === "novedad") && fila.estadoDropi !== "cancelado" && (
                  <CancelarRetiroBoton id={fila.id} correlativo={fila.numeroCorrelativo} />
                )}
                <EliminarRetiroBoton id={fila.id} correlativo={fila.numeroCorrelativo} variante="boton" />
              </>
            }
            alGuardar={alGuardar}
            alCancelar={alCancelarEdicion}
            alCambiarGuardando={setGuardando}
            alModificar={() => setSinGuardarId(fila.id)}
          />

          {panel === "conciliar" && (
            <SeccionConciliarRetiro
              key={fila.id}
              id={fila.id}
              paisId={paisId}
              codigoPais={codigoPais}
              aRecibir={fila.aRecibir}
              soporteNumero={fila.soporteNumero}
              montoRecibido={fila.montoRecibido}
              fechaRecibido={fila.fechaRecibido}
              alCancelar={() => setPanel(null)}
              alConciliado={() => alTerminarPanel("Retiro conciliado")}
            />
          )}
          {panel === "novedad" && fila.estado === "abierto" && (
            <SeccionNovedadRetiro
              key={fila.id}
              id={fila.id}
              alCancelar={() => setPanel(null)}
              alAgregada={() => alTerminarPanel("Novedad agregada")}
            />
          )}
          {panel === "resolver" && fila.estado === "novedad" && (
            <SeccionResolverNovedad
              id={fila.id}
              codigoPais={codigoPais}
              fechaRecibido={fila.fechaRecibido}
              alCancelar={() => setPanel(null)}
              alNotaGuardada={() => setVersionHistorial((v) => v + 1)}
              alResuelta={() => alTerminarPanel("Novedad resuelta")}
            />
          )}

          {/* Siempre lo último de la ficha: con Conciliar o Novedad desplegadas, el historial queda debajo de ellas.
              Sin `key`: con una `key={fila.id}` aquí, al conciliar o agregar una novedad la sección se quedaba en
              «Conciliando…» y no se cerraba (el estado pendiente de la acción nunca terminaba). No hace falta: al
              cerrar la ficha `Ventana` desmonta todo, así que cada retiro empieza con su historial nuevo. */}
          <HistorialGenerico
            id={fila.id}
            codigoPais={codigoPais}
            version={versionHistorial}
            titulo="Historial"
            obtener={obtenerActividadRetiro}
          />
        </div>
      )}
    </Ventana>
  );
}
