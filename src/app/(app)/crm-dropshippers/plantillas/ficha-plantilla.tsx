"use client";

import { useRef, useState, useTransition } from "react";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { AlertaIcon, ChatIcon, EtiquetaIcon, ListaIcon, MasIcon, PapeleraIcon } from "@/lib/nav-icons";
import {
  CAMPOS_VARIABLE,
  IDIOMAS,
  MAX_BOTON,
  MAX_BOTONES,
  MAX_CUERPO,
  MAX_ENCABEZADO,
  MAX_PIE,
  NOMBRE_VALIDO,
  alinearVariables,
  nombreSugerido,
  siguienteRanura,
  validarPlantilla,
  type Categoria,
  type VariablePlantilla,
} from "@/lib/whatsapp/plantillas";
import type { PlantillaGuardada } from "@/lib/whatsapp/plantillas-servidor";
import { guardarPlantilla } from "./actions";

/** Con qué arranca una ficha nueva (en blanco o con una plantilla sugerida). */
export interface InicioPlantilla {
  nombre: string;
  categoria: Categoria;
  cuerpo: string;
  botones: string[];
  variables: VariablePlantilla[];
}

const CATEGORIAS_TARJETA: { id: Categoria; titulo: string; texto: string }[] = [
  { id: "marketing", titulo: "Marketing", texto: "Ofertas, novedades y mensajes para que alguien vuelva a escribir o a comprar. Cuesta más por mensaje." },
  { id: "utility", titulo: "Utilidad", texto: "Un aviso de algo que la persona ya pidió: un pedido, un envío, una consulta. Sin promociones." },
];

/** El mensaje como se verá en WhatsApp, con el ejemplo de cada variable resaltado. */
function VistaPrevia({ encabezado, cuerpo, variables, pie, botones }: { encabezado: string; cuerpo: string; variables: VariablePlantilla[]; pie: string; botones: string[] }) {
  const partes = cuerpo.split(/(\{\{\s*\d+\s*\}\})/);
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-muted p-4" aria-label="Vista previa del mensaje" role="group">
      <div className="flex max-w-[320px] flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm">
        {encabezado.trim() && <p className="m-0 font-semibold [overflow-wrap:anywhere]">{encabezado}</p>}
        <p className="m-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {cuerpo.trim() ? (
            partes.map((p, i) => {
              const n = /^\{\{\s*(\d+)\s*\}\}$/.exec(p);
              if (!n) return <span key={i}>{p}</span>;
              const ejemplo = variables[Number(n[1]) - 1]?.ejemplo.trim();
              return (
                <span key={i} className="rounded bg-primario-suave px-0.5 text-primario">
                  {ejemplo || `{{${n[1]}}}`}
                </span>
              );
            })
          ) : (
            <span className="text-muted-foreground">Aquí verás cómo queda el mensaje.</span>
          )}
        </p>
        {pie.trim() && <p className="m-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">{pie}</p>}
      </div>
      {botones.filter((b) => b.trim()).map((b, i) => (
        <span key={i} className="max-w-[320px] rounded-lg border border-border bg-card px-3 py-1.5 text-center text-sm font-medium text-primario shadow-sm">
          {b}
        </span>
      ))}
    </div>
  );
}

/**
 * La ficha para crear o cambiar una plantilla (28 oct 2026). Pensada para quien nunca hizo una: primero el nombre y la categoría, luego el
 * mensaje con sus variables —cada una con el dato que la llena y un ejemplo para Meta—, y al lado cómo se verá. Una revisión en vivo dice lo
 * que falta o lo que Meta suele rechazar. Se guarda como borrador o se manda a Meta; una ya enviada solo cambia mandándola otra vez.
 */
export function FichaPlantilla({
  plantilla,
  inicio,
  conectado,
  puedeEscribir,
  alCerrar,
}: {
  plantilla: PlantillaGuardada | null;
  inicio?: InicioPlantilla;
  conectado: boolean;
  puedeEscribir: boolean;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [idGuardado, setIdGuardado] = useState<string | null>(plantilla?.id ?? null);
  const [nombre, setNombre] = useState(plantilla?.nombre ?? inicio?.nombre ?? "");
  const [idioma, setIdioma] = useState(plantilla?.idioma ?? "es");
  const [categoria, setCategoria] = useState<Categoria>(plantilla?.categoria ?? inicio?.categoria ?? "marketing");
  const [encabezado, setEncabezado] = useState(plantilla?.encabezado ?? "");
  const [cuerpo, setCuerpo] = useState(plantilla?.cuerpo ?? inicio?.cuerpo ?? "");
  const [pie, setPie] = useState(plantilla?.pie ?? "");
  const [botones, setBotones] = useState<string[]>(plantilla?.botones ?? inicio?.botones ?? []);
  const [variables, setVariables] = useState<VariablePlantilla[]>(() => alinearVariables(plantilla?.cuerpo ?? inicio?.cuerpo ?? "", plantilla?.variables ?? inicio?.variables ?? []));
  const [error, setError] = useState<string | null>(null);
  const [tocado, setTocado] = useState(false);
  const textoRef = useRef<HTMLTextAreaElement>(null);

  const yaEnMeta = !!plantilla && plantilla.estado !== "borrador";
  const bloqueada = !puedeEscribir || plantilla?.estado === "pendiente" || plantilla?.estado === "deshabilitada";
  const motivoBloqueo = !puedeEscribir
    ? "Tienes acceso de solo lectura."
    : plantilla?.estado === "pendiente"
      ? "Meta la está revisando: no se puede cambiar hasta que responda."
      : plantilla?.estado === "deshabilitada"
        ? "Meta la deshabilitó: ya no se puede cambiar. Crea otra con otro nombre."
        : null;

  const datos = { nombre: nombre.trim(), idioma, categoria, encabezado: encabezado.trim() || null, cuerpo, pie: pie.trim() || null, botones: botones.map((b) => b.trim()), variables };
  const revision = validarPlantilla(datos);
  const nombreInvalido = nombre.trim() !== "" && !NOMBRE_VALIDO.test(nombre.trim());

  function cambiarCuerpo(nuevo: string) {
    setCuerpo(nuevo);
    setVariables((v) => alinearVariables(nuevo, v));
    setTocado(true);
  }

  function agregarVariable() {
    const area = textoRef.current;
    const token = `{{${siguienteRanura(cuerpo)}}}`;
    const desde = area?.selectionStart ?? cuerpo.length;
    const hasta = area?.selectionEnd ?? cuerpo.length;
    cambiarCuerpo(`${cuerpo.slice(0, desde)}${token}${cuerpo.slice(hasta)}`);
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(desde + token.length, desde + token.length);
    });
  }

  function cambiarVariable(i: number, cambio: Partial<VariablePlantilla>) {
    setTocado(true);
    setVariables((v) => v.map((x, j) => (j === i ? { ...x, ...cambio } : x)));
  }

  /** Al elegir otro dato se pone su ejemplo (si el de antes era el de otro dato o estaba vacío): así se evita escribir lo obvio. */
  function cambiarCampo(i: number, campo: VariablePlantilla["campo"]) {
    const actual = variables[i];
    const ejemploAntes = CAMPOS_VARIABLE.find((c) => c.campo === actual.campo)?.ejemplo ?? "";
    const nuevo = CAMPOS_VARIABLE.find((c) => c.campo === campo)?.ejemplo ?? "";
    const conservar = actual.ejemplo.trim() !== "" && actual.ejemplo !== ejemploAntes;
    cambiarVariable(i, { campo, ejemplo: conservar ? actual.ejemplo : nuevo, ...(campo === "manual" ? {} : { etiqueta: undefined }) });
  }

  function guardar(enviar: boolean) {
    setError(null);
    empezar(async () => {
      const r = await guardarPlantilla(idGuardado, { nombre, idioma, categoria, encabezado, cuerpo, pie, botones: botones.filter((b) => b.trim()), variables }, enviar).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }) as { id?: string; enviada?: boolean; error?: string });
      if (r.id) setIdGuardado(r.id);
      if (r.error) {
        setError(r.id && !idGuardado ? `${r.error} Tu plantilla quedó guardada como borrador.` : r.error);
        return;
      }
      mostrarToast(r.enviada ? "Plantilla enviada a Meta. Te avisamos cuando responda." : "Borrador guardado.");
      alCerrar();
    });
  }

  const puedeEnviar = conectado && revision.errores.length === 0 && !pendiente && !bloqueada;

  return (
    <Ventana abierto alCerrar={alCerrar} lado="derecha" ancho="lg" titulo={plantilla ? `Plantilla ${plantilla.nombre}` : "Nueva plantilla"}>
      <div className="@container flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-w-0 flex-col divide-y divide-border">
              {motivoBloqueo && (
                <p role="status" className="mb-5 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                  {motivoBloqueo}
                </p>
              )}
              {plantilla?.error_envio && (
                <p role="alert" className="mb-5 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
                  Meta no la recibió la última vez: {plantilla.error_envio}
                </p>
              )}
              {plantilla?.estado === "rechazada" && plantilla.motivo && (
                <p role="alert" className="mb-5 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
                  Meta la rechazó: {plantilla.motivo}. Corrígela y mándala de nuevo.
                </p>
              )}

              <Seccion icono={EtiquetaIcon} titulo="Nombre y tipo">
                <fieldset disabled={bloqueada || yaEnMeta} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
                  <label className="flex flex-col gap-1">
                    <span className={labelClass}>Nombre de la plantilla</span>
                    <input
                      value={nombre}
                      onChange={(e) => {
                        setNombre(e.target.value);
                        setTocado(true);
                      }}
                      onBlur={() => nombreInvalido && nombreSugerido(nombre) && setNombre(nombreSugerido(nombre))}
                      placeholder="Ej: retomar_compra"
                      maxLength={100}
                      data-enfocar
                      aria-invalid={nombreInvalido || undefined}
                      className={`${fieldClass} w-full font-mono`}
                    />
                    <span className="text-xs text-muted-foreground">
                      {nombreInvalido ? `Se guardará como: ${nombreSugerido(nombre) || "…"}` : yaEnMeta ? "El nombre no se cambia después de enviarla." : "Solo minúsculas, números y guiones bajos."}
                    </span>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={labelClass}>Idioma</span>
                    <select value={idioma} onChange={(e) => setIdioma(e.target.value)} className={`${fieldClass} w-full`}>
                      {IDIOMAS.map((i) => (
                        <option key={i.codigo} value={i.codigo}>
                          {i.etiqueta}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div role="radiogroup" aria-label="Categoría" className="flex flex-col gap-2">
                    <span className={labelClass}>Categoría</span>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {CATEGORIAS_TARJETA.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          role="radio"
                          aria-checked={categoria === c.id}
                          onClick={() => {
                            setCategoria(c.id);
                            setTocado(true);
                          }}
                          className={`flex min-h-11 flex-col gap-1 rounded-lg border p-3 text-left disabled:cursor-default ${
                            categoria === c.id ? "border-foreground bg-accent" : "border-border bg-card hover:bg-muted"
                          } ${anilloFoco}`}
                        >
                          <span className="text-sm font-semibold">{c.titulo}</span>
                          <span className="text-xs text-muted-foreground">{c.texto}</span>
                        </button>
                      ))}
                    </div>
                    <p className="m-0 text-xs text-muted-foreground">Meta decide la categoría final: si el mensaje promociona algo, lo pasa a Marketing. Para códigos de verificación existe una tercera, Autenticación, que no se crea aquí.</p>
                  </div>
                </fieldset>
              </Seccion>

              <Seccion icono={ChatIcon} titulo="Mensaje">
                <fieldset disabled={bloqueada} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
                  <label className="flex flex-col gap-1">
                    <span className={labelClass}>Encabezado (opcional)</span>
                    <input value={encabezado} onChange={(e) => (setEncabezado(e.target.value), setTocado(true))} maxLength={MAX_ENCABEZADO} placeholder="Ej: Novedad para ti" className={`${fieldClass} w-full`} />
                  </label>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="plantilla-cuerpo" className={`${labelClass} flex items-center justify-between gap-2`}>
                      Texto del mensaje
                      <span className={`text-xs font-normal tabular-nums ${cuerpo.length > MAX_CUERPO ? "text-destructive" : "text-muted-foreground"}`}>
                        {cuerpo.length}/{MAX_CUERPO}
                      </span>
                    </label>
                    <textarea
                      id="plantilla-cuerpo"
                      ref={textoRef}
                      value={cuerpo}
                      onChange={(e) => cambiarCuerpo(e.target.value)}
                      rows={5}
                      placeholder="Ej: Hola {{1}}, hace unos días hablamos y quedó algo pendiente. ¿Quieres que lo retomemos?"
                      className={`${fieldClass} w-full resize-y`}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={agregarVariable} className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-control bg-card px-3 text-xs font-medium hover:bg-muted ${anilloFoco}`}>
                        <MasIcon aria-hidden="true" className="h-3.5 w-3.5" />
                        Agregar variable {`{{${siguienteRanura(cuerpo)}}}`}
                      </button>
                      <span className="text-xs text-muted-foreground">Un hueco que se llena con un dato de cada persona, como su nombre.</span>
                    </div>
                  </div>

                  {variables.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <h4 className="m-0 text-sm font-medium">¿Qué va en cada variable?</h4>
                      <p className="m-0 text-xs text-muted-foreground">Elige el dato que la llena. Meta pide un ejemplo para aprobarla: no uses datos de una persona real.</p>
                      {variables.map((v, i) => (
                        <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-card p-3 sm:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
                          <span className="font-mono text-sm font-semibold sm:pb-2">{`{{${i + 1}}}`}</span>
                          <label className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">Dato</span>
                            <select value={v.campo} onChange={(e) => cambiarCampo(i, e.target.value as VariablePlantilla["campo"])} className={`${fieldClass} w-full`}>
                              {CAMPOS_VARIABLE.map((c) => (
                                <option key={c.campo} value={c.campo}>
                                  {c.etiqueta}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">Ejemplo para Meta</span>
                            <input value={v.ejemplo} onChange={(e) => cambiarVariable(i, { ejemplo: e.target.value })} placeholder="Ej: María" className={`${fieldClass} w-full`} />
                          </label>
                          {v.campo === "manual" && (
                            <label className="flex flex-col gap-1 sm:col-span-3">
                              <span className="text-xs text-muted-foreground">¿Qué se escribe aquí al enviar?</span>
                              <input value={v.etiqueta ?? ""} onChange={(e) => cambiarVariable(i, { etiqueta: e.target.value })} placeholder="Ej: Producto" maxLength={40} className={`${fieldClass} w-full`} />
                            </label>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <label className="flex flex-col gap-1">
                    <span className={labelClass}>Pie (opcional)</span>
                    <input value={pie} onChange={(e) => (setPie(e.target.value), setTocado(true))} maxLength={MAX_PIE} placeholder="Ej: Equipo Ecomfive" className={`${fieldClass} w-full`} />
                  </label>
                </fieldset>
              </Seccion>

              <Seccion icono={ListaIcon} titulo="Botones de respuesta">
                <fieldset disabled={bloqueada} className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
                  <p className="m-0 text-xs text-muted-foreground">Para responder con un toque. Agrega uno para decir que no («No, gracias»): así te reportan menos.</p>
                  {botones.map((b, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <label className="flex min-w-0 flex-1">
                        <span className="sr-only">Botón {i + 1}</span>
                        <input
                          value={b}
                          onChange={(e) => (setBotones((l) => l.map((x, j) => (j === i ? e.target.value : x))), setTocado(true))}
                          maxLength={MAX_BOTON}
                          placeholder="Ej: No, gracias"
                          className={`${fieldClass} w-full`}
                        />
                      </label>
                      <button
                        type="button"
                        aria-label={`Quitar el botón ${i + 1}`}
                        onClick={() => setBotones((l) => l.filter((_, j) => j !== i))}
                        className={`flex h-10 w-10 flex-none items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted ${anilloFoco}`}
                      >
                        <PapeleraIcon aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {botones.length < MAX_BOTONES && (
                    <button type="button" onClick={() => setBotones((l) => [...l, ""])} className={`inline-flex min-h-9 w-fit items-center gap-1.5 rounded-md border border-border-control bg-card px-3 text-xs font-medium hover:bg-muted ${anilloFoco}`}>
                      <MasIcon aria-hidden="true" className="h-3.5 w-3.5" />
                      Agregar botón
                    </button>
                  )}
                </fieldset>
              </Seccion>
            </div>

            <div className="flex min-w-0 flex-col gap-4 @3xl:sticky @3xl:top-0 @3xl:self-start">
              <VistaPrevia encabezado={encabezado} cuerpo={cuerpo} variables={variables} pie={pie} botones={botones} />
              {!bloqueada && (tocado || !!plantilla) && (revision.errores.length > 0 || revision.avisos.length > 0) && (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm" aria-live="polite">
                  {revision.errores.length > 0 && (
                    <>
                      <h4 className="m-0 flex items-center gap-1.5 text-xs font-semibold">
                        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-destructive" />
                        Falta para mandarla a Meta
                      </h4>
                      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-xs">
                        {revision.errores.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {revision.avisos.length > 0 && (
                    <>
                      <h4 className="m-0 flex items-center gap-1.5 text-xs font-semibold">
                        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
                        Ojo: Meta suele rechazar esto
                      </h4>
                      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-xs">
                        {revision.avisos.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border bg-card px-5 py-3">
          {error && (
            <p role="alert" className="m-0 flex items-start gap-2 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
              <AlertaIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
          {!bloqueada && !conectado && <p className="m-0 text-xs text-muted-foreground">WhatsApp todavía no está conectado: guarda el borrador y se manda a Meta cuando se conecte.</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={alCerrar} className={`inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
              {bloqueada ? "Cerrar" : "Cancelar"}
            </button>
            {!bloqueada && !yaEnMeta && (
              <button
                type="button"
                disabled={pendiente || !nombre.trim() || !cuerpo.trim()}
                onClick={() => guardar(false)}
                className={`inline-flex min-h-10 items-center rounded-lg border border-border-control bg-card px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
              >
                Guardar borrador
              </button>
            )}
            {!bloqueada && (
              <button
                type="button"
                disabled={!puedeEnviar}
                onClick={() => guardar(true)}
                className={`inline-flex min-h-10 items-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}
              >
                {pendiente ? "Enviando…" : yaEnMeta ? "Guardar y enviar el cambio a Meta" : "Enviar a Meta"}
              </button>
            )}
          </div>
        </div>
      </div>
    </Ventana>
  );
}
