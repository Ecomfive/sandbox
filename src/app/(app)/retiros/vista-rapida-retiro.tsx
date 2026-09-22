"use client";

import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { Ventana } from "@/components/ui/ventana";
import { useToast } from "@/components/ui/toast";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import { ETIQUETA_ESTADO_DROPI, type EstadoDropi } from "@/lib/dropi/emparejar-retiros";
import { AlertaIcon, CheckIcon, CerrarIcon, ConciliarIcon } from "@/lib/nav-icons";
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

const ESTADO_TONO = { abierto: "info", cancelado: "neutral", novedad: "destructive", cerrado: "success" } as const;

const numeroDe = (fila: FilaRetiro) => `#${String(fila.numeroCorrelativo).padStart(4, "0")}`;

type EstadoPaso = "completo" | "actual" | "pendiente" | "error";

/** A qué paso llegó el retiro en su recorrido real (no el `estado` interno de seguimiento):
 * se crea acá, Dropi lo aprueba (o lo rechaza), y por último se recibe el dinero (o hay una
 * diferencia). Un retiro cancelado se queda en "Creado" — no tiene sentido seguir avanzando. */
function pasosDelRetiro(fila: FilaRetiro): { aprobado: EstadoPaso; recibido: EstadoPaso } {
  if (fila.estado === "cancelado") return { aprobado: "pendiente", recibido: "pendiente" };

  const aprobado: EstadoPaso =
    fila.estadoDropi === "aprobado" ? "completo" : fila.estadoDropi === "rechazado" ? "error" : "actual";

  const recibido: EstadoPaso =
    fila.estado === "cerrado" ? "completo" : fila.estado === "novedad" ? "error" : aprobado === "completo" ? "actual" : "pendiente";

  return { aprobado, recibido };
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

/** Los tres pasos del recorrido de un retiro: Creado (siempre, ya existe), Aprobado (por
 * Dropi) y Recibido (el dinero, conciliado). No es el `estado` de seguimiento interno
 * (abierto/novedad/cerrado/cancelado) — ese ya se ve en la insignia del título. */
function BarraPasos({ fila, codigoPais }: { fila: FilaRetiro; codigoPais: string }) {
  const { aprobado, recibido } = pasosDelRetiro(fila);
  const pasos: { etiqueta: string; estado: EstadoPaso; subtexto: string }[] = [
    { etiqueta: "Creado", estado: "completo", subtexto: formatearFecha(fila.fecha) },
    {
      etiqueta: "Aprobado",
      estado: aprobado,
      subtexto:
        fila.estadoDropi && fila.estadoDropi in ETIQUETA_ESTADO_DROPI
          ? ETIQUETA_ESTADO_DROPI[fila.estadoDropi as EstadoDropi]
          : "En espera de Dropi",
    },
    {
      etiqueta: "Recibido",
      estado: recibido,
      subtexto:
        fila.montoRecibido !== null
          ? formatearMoneda(fila.montoRecibido, codigoPais)
          : recibido === "error"
            ? "Diferencia de monto"
            : "Sin registrar",
    },
  ];

  return (
    <div className="flex items-start">
      {pasos.map((paso, i) => (
        <Fragment key={paso.etiqueta}>
          {i > 0 && (
            <div
              aria-hidden="true"
              className={`mt-4 h-0.5 flex-1 ${pasos[i - 1].estado === "completo" ? "bg-success" : "bg-border"}`}
            />
          )}
          <div className="flex w-24 shrink-0 flex-col items-center gap-1 text-center">
            <span
              aria-hidden="true"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${claseNodo(paso.estado)}`}
            >
              {paso.estado === "completo" && <CheckIcon className="h-4 w-4" />}
              {paso.estado === "error" && <CerrarIcon className="h-4 w-4" />}
            </span>
            <span className="text-sm font-semibold">{paso.etiqueta}</span>
            <span className="text-xs text-muted-foreground">{paso.subtexto}</span>
          </div>
        </Fragment>
      ))}
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
 * arriba, junto a Conciliar/Novedad/Abrir/Cancelar/Eliminar, aparecen «Guardar cambios» y «Cancelar». Con cambios sin
 * guardar, cerrar la ficha pide confirmación. Lo que muestra sale de la fila ya cargada, así que se actualiza sola
 * al guardar.
 *
 * **«Conciliar», «Novedad» y «Abrir» no abren una ventana en el medio**: despliegan una sección al final de la misma
 * ficha (`SeccionConciliarRetiro`, `SeccionNovedadRetiro`, `SeccionResolverNovedad`), la ficha baja hasta ella y el foco
 * entra en su primer campo. Solo hay una desplegada a la vez. **El historial (`HistorialGenerico`) es siempre lo último**:
 * con una sección desplegada, queda debajo de ella. «Novedad» solo está en un retiro abierto; al agregarla el retiro
 * pasa a novedad y aparece «Abrir» en su lugar. **«Abrir» no reabre el retiro**: lleva a la nota de la novedad, y ahí el
 * botón «Resuelto» es el que quita la novedad y lo deja abierto.
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
          <div className="flex flex-col gap-4 p-4">
            <BarraPasos fila={fila} codigoPais={codigoPais} />
          </div>

          <FormularioEditarRetiro
            key={`${fila.id}-${version}`}
            fila={fila}
            codigoPais={codigoPais}
            plataformas={plataformas}
            cuentas={cuentas}
            acciones={
              <>
                <BotonAccion
                  icono={ConciliarIcon}
                  tono="oscuro"
                  onClick={() => irAlPanel("conciliar")}
                  aria-expanded={panel === "conciliar"}
                  aria-controls={`panel-retiro-${fila.id}`}
                >
                  Conciliar
                </BotonAccion>
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
                    Abrir
                  </BotonAccion>
                )}
                {fila.estado !== "cancelado" && (
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
              alCancelar={() => setPanel(null)}
              alResuelta={() => alTerminarPanel("Novedad resuelta")}
            />
          )}

          {/* Siempre lo último de la ficha: con Conciliar o Novedad desplegadas, el historial queda debajo de ellas.
              Sin `key`: con una `key={fila.id}` aquí, al conciliar o agregar una novedad la sección se quedaba en
              «Conciliando…» y no se cerraba (el estado pendiente de la acción nunca terminaba). No hace falta: al
              cerrar la ficha `Ventana` desmonta todo, así que cada retiro empieza con su historial nuevo. */}
          <HistorialGenerico id={fila.id} codigoPais={codigoPais} version={versionHistorial} obtener={obtenerActividadRetiro} />
        </div>
      )}
    </Ventana>
  );
}
