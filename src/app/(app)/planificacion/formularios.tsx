"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass, labelClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { EtiquetaIcon } from "@/lib/nav-icons";
import { CAMPOS_MOTORES, CAMPOS_SUPUESTOS, TIPOS_ESCENARIO, type Motores, type SupuestosPlan, type TipoEscenario } from "@/lib/finanzas/planificacion";
import {
  aprobarVersionPlan,
  crearEscenarioPlan,
  eliminarEscenarioPlan,
  eliminarVersionPlan,
  guardarFotoPlan,
  guardarMotores,
  guardarSupuestosPlan,
  guardarVersionPlan,
} from "./actions";

function AvisoError({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="flex items-center gap-2 text-sm">
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
      {texto}
    </p>
  );
}

const unidadTexto = (u: string) => (u === "pedidos" ? "" : ` (${u})`);

/** «Editar» los motores de una tienda: un panel con un campo por motor; vacío = el de la historia. */
export function EditarMotores({ unidadId, nombre, historia, editados }: { unidadId: string; nombre: string; historia: Motores; editados: Partial<Motores> }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    empezar(async () => {
      const r = await guardarMotores(datos).catch(() => ({ error: "No se pudo guardar." }));
      if (r.error) setError(r.error);
      else {
        setAbierto(false);
        mostrarToast("Motores guardados");
        router.refresh();
      }
    });
  };
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => (setError(null), setAbierto(true))} aria-label={`Editar los motores de ${nombre}`}>
        Editar
      </Button>
      <Ventana abierto={abierto} alCerrar={() => !pendiente && setAbierto(false)} titulo={`Motores · ${nombre}`} lado="derecha">
        <form onSubmit={enviar} className="flex flex-col gap-4">
          <input type="hidden" name="unidad_id" value={unidadId} />
          <div className="grid gap-3 sm:grid-cols-2">
            {CAMPOS_MOTORES.map((d, i) => (
              <label key={d.clave} className="flex flex-col gap-1">
                <span className={labelClass}>
                  {d.etiqueta}
                  {unidadTexto(d.unidad)}
                </span>
                <input
                  name={d.clave}
                  type="number"
                  step="any"
                  min={d.min}
                  max={d.max}
                  inputMode="decimal"
                  data-enfocar={i === 0 || undefined}
                  defaultValue={editados[d.clave] ?? ""}
                  placeholder={`Historia: ${historia[d.clave]}`}
                  className={fieldClass}
                />
              </label>
            ))}
          </div>
          <AvisoError texto={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar"}
            </Button>
            <Button type="button" variant="secondary" disabled={pendiente} onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </Ventana>
    </>
  );
}

/** Los supuestos generales del plan: vacío = el que sale de los datos (en el ejemplo del campo). */
export function FormularioSupuestos({ datos, editados }: { datos: SupuestosPlan; editados: Partial<SupuestosPlan> }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [cambiado, setCambiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    empezar(async () => {
      const r = await guardarSupuestosPlan(formData).catch(() => ({ error: "No se pudo guardar." }));
      if (r.error) setError(r.error);
      else {
        setError(null);
        setCambiado(false);
        mostrarToast("Supuestos guardados");
        router.refresh();
      }
    });
  };
  return (
    <form key={version} onSubmit={enviar} onInput={() => setCambiado(true)} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CAMPOS_SUPUESTOS.map((d) => (
          <label key={d.clave} className="flex flex-col gap-1">
            <span className={labelClass}>
              {d.etiqueta} ({d.unidad})
            </span>
            <input name={d.clave} type="number" step="any" min={d.min} max={d.max} inputMode="decimal" defaultValue={editados[d.clave] ?? ""} placeholder={`De los datos: ${datos[d.clave]}`} className={fieldClass} />
          </label>
        ))}
      </div>
      <AvisoError texto={error} />
      {cambiado && (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pendiente}>
            {pendiente ? "Guardando…" : "Guardar"}
          </Button>
          <Button type="button" variant="secondary" disabled={pendiente} onClick={() => (setCambiado(false), setError(null), setVersion((v) => v + 1))}>
            Descartar
          </Button>
        </div>
      )}
    </form>
  );
}

/** Un botón que llama a una acción del servidor, con confirmación opcional en la misma fila. */
function BotonAccionInterno({
  etiqueta,
  pendienteTexto,
  exito,
  confirmar,
  variante,
  accion,
  id,
}: {
  etiqueta: string;
  pendienteTexto: string;
  exito: string;
  confirmar?: string;
  variante: "secondary" | "primary";
  accion: "aprobar" | "eliminar_version" | "eliminar_escenario" | "foto";
  id?: string;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [preguntando, setPreguntando] = useState(false);
  const correr = () =>
    empezar(async () => {
      setPreguntando(false);
      const llamada =
        accion === "aprobar" ? aprobarVersionPlan(id ?? "") : accion === "eliminar_version" ? eliminarVersionPlan(id ?? "") : accion === "eliminar_escenario" ? eliminarEscenarioPlan(id ?? "") : guardarFotoPlan();
      const r = await llamada.catch(() => ({ error: "No se pudo completar." }));
      if (r.error) mostrarToast(r.error, "destructive");
      else mostrarToast(exito);
      router.refresh();
    });
  if (preguntando)
    return (
      <span className="flex flex-wrap items-center gap-2 text-sm">
        {confirmar}
        <Button type="button" onClick={correr} disabled={pendiente}>
          Sí
        </Button>
        <Button type="button" variant="secondary" onClick={() => setPreguntando(false)}>
          No
        </Button>
      </span>
    );
  return (
    <Button type="button" variant={variante} disabled={pendiente} onClick={() => (confirmar ? setPreguntando(true) : correr())}>
      {pendiente ? pendienteTexto : etiqueta}
    </Button>
  );
}

export function BotonVersion({ id, accion }: { id: string; accion: "aprobar" | "eliminar" }) {
  return accion === "aprobar" ? (
    <BotonAccionInterno etiqueta="Aprobar" pendienteTexto="Aprobando…" exito="Plan aprobado" confirmar="¿Aprobar? Reemplaza al aprobado del año y crea su presupuesto." variante="primary" accion="aprobar" id={id} />
  ) : (
    <BotonAccionInterno etiqueta="Eliminar" pendienteTexto="Eliminando…" exito="Versión eliminada" confirmar="¿Eliminar este borrador?" variante="secondary" accion="eliminar_version" id={id} />
  );
}

export function BotonEliminarEscenario({ id }: { id: string }) {
  return <BotonAccionInterno etiqueta="Eliminar" pendienteTexto="Eliminando…" exito="Escenario eliminado" confirmar="¿Eliminar?" variante="secondary" accion="eliminar_escenario" id={id} />;
}

export function BotonFoto() {
  return <BotonAccionInterno etiqueta="Guardar foto del mes" pendienteTexto="Guardando…" exito="Foto guardada" variante="secondary" accion="foto" />;
}

/** «Guardar versión» del plan anual: nombre y año (el que se ve). */
export function GuardarVersion({ anio }: { anio: number }) {
  const router = useRouter();
  return (
    <FichaCrear titulo="Nueva versión del plan" etiquetaBoton="Guardar versión" etiquetaCrear="Guardar versión" mensajeExito="Versión guardada" ocultos={{ anio: String(anio) }} action={guardarVersionPlan} alGuardar={() => router.refresh()}>
      {(ayuda) => (
        <Seccion icono={EtiquetaIcon} titulo={`Plan ${anio}`}>
          <Campo etiqueta="Nombre" id="campo-nombre-version" obligatorio faltante={ayuda.faltante}>
            <input id="campo-nombre-version" name="nombre" required maxLength={120} data-enfocar aria-invalid={ayuda.invalido("campo-nombre-version")} placeholder={`Ej: Plan ${anio} · reproyección de noviembre`} className={`${fieldClass} w-full`} />
          </Campo>
        </Seccion>
      )}
    </FichaCrear>
  );
}

/** «Agregar» escenario: tipo de decisión y sus cifras. */
export function CrearEscenario({ tiendas, meses, referencia }: { tiendas: { id: string; nombre: string }[]; meses: { valor: string; etiqueta: string }[]; referencia: { ticket: number } }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoEscenario>("pauta");
  const nueva = tipo === "tienda" || tipo === "pais";
  const etiquetaCambio = tipo === "pauta" ? "Cambio de pauta (puntos sobre ventas)" : tipo === "precio" ? "Cambio de precio (%)" : "Cambio de tasa de entrega (puntos)";
  const etiquetaRespuesta = tipo === "pauta" ? "Pedidos por cada punto de pauta (%)" : "Elasticidad (% de pedidos por cada 1 % de precio)";
  return (
    <FichaCrear titulo="Nuevo escenario" etiquetaCrear="Crear escenario" mensajeExito="Escenario creado" action={crearEscenarioPlan} alAbrir={() => setTipo("pauta")} alGuardar={() => router.refresh()}>
      {(ayuda) => (
        <>
          <Seccion icono={EtiquetaIcon} titulo="Decisión">
            <Campo etiqueta="Nombre" id="campo-escenario-nombre" obligatorio faltante={ayuda.faltante}>
              <input id="campo-escenario-nombre" name="nombre_escenario" required maxLength={120} data-enfocar aria-invalid={ayuda.invalido("campo-escenario-nombre")} placeholder="Ej: Subir pauta 3 puntos" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Tipo" id="campo-escenario-tipo" obligatorio>
              <select id="campo-escenario-tipo" name="tipo" required value={tipo} onChange={(e) => setTipo(e.target.value as TipoEscenario)} className={`${fieldClass} w-full`}>
                {TIPOS_ESCENARIO.map((t) => (
                  <option key={t.clave} value={t.clave}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Desde" id="campo-escenario-desde" obligatorio>
              <select id="campo-escenario-desde" name="desde" required className={`${fieldClass} w-full`}>
                {meses.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          </Seccion>
          {nueva ? (
            <Seccion icono={EtiquetaIcon} titulo={tipo === "pais" ? "País nuevo" : "Tienda nueva"}>
              <Campo etiqueta="Nombre" id="campo-escenario-nueva">
                <input id="campo-escenario-nueva" name="nombre" maxLength={80} placeholder={tipo === "pais" ? "Ej: Guatemala" : "Ej: Tienda hogar"} className={`${fieldClass} w-full`} />
              </Campo>
              <Campo etiqueta="Pedidos del primer mes" id="campo-escenario-pedidos" obligatorio faltante={ayuda.faltante}>
                <input id="campo-escenario-pedidos" name="pedidos" type="number" min={1} step={1} required aria-invalid={ayuda.invalido("campo-escenario-pedidos")} placeholder="Ej: 300" className={`${fieldClass} w-full`} />
              </Campo>
              <Campo etiqueta="Ticket promedio (USD)" id="campo-escenario-ticket">
                <input id="campo-escenario-ticket" name="ticket" type="number" min={0} step="any" placeholder={`Ej: ${referencia.ticket}`} className={`${fieldClass} w-full`} />
              </Campo>
              <Campo etiqueta="Crecimiento mensual (%)" id="campo-escenario-crecimiento">
                <input id="campo-escenario-crecimiento" name="crecimiento" type="number" step="any" placeholder="Ej: 5" className={`${fieldClass} w-full`} />
              </Campo>
              <Campo etiqueta="Gastos fijos por mes (USD)" id="campo-escenario-fijos">
                <input id="campo-escenario-fijos" name="fijos" type="number" min={0} step="any" placeholder="Ej: 4000" className={`${fieldClass} w-full`} />
              </Campo>
              <Campo etiqueta="Inversión inicial (USD)" id="campo-escenario-inversion">
                <input id="campo-escenario-inversion" name="inversion" type="number" min={0} step="any" placeholder="Ej: 15000" className={`${fieldClass} w-full`} />
              </Campo>
            </Seccion>
          ) : (
            <Seccion icono={EtiquetaIcon} titulo="Cambio">
              <Campo etiqueta="Tienda" id="campo-escenario-tienda">
                <select id="campo-escenario-tienda" name="unidadId" className={`${fieldClass} w-full`}>
                  <option value="">Todas las tiendas</option>
                  {tiendas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta={etiquetaCambio} id="campo-escenario-cambio" obligatorio faltante={ayuda.faltante}>
                <input id="campo-escenario-cambio" name="cambio" type="number" step="any" required aria-invalid={ayuda.invalido("campo-escenario-cambio")} placeholder={tipo === "precio" ? "Ej: 10" : "Ej: 3"} className={`${fieldClass} w-full`} />
              </Campo>
              {tipo !== "entrega" && (
                <Campo etiqueta={etiquetaRespuesta} id="campo-escenario-respuesta">
                  <input id="campo-escenario-respuesta" name="respuesta" type="number" step="any" placeholder={tipo === "precio" ? "Ej: 1.2" : "Ej: 4"} className={`${fieldClass} w-full`} />
                </Campo>
              )}
            </Seccion>
          )}
        </>
      )}
    </FichaCrear>
  );
}
