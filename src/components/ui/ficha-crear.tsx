"use client";

import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import { BotonCrear } from "@/components/ui/boton-crear";
import { PanelEnSitio, useEnSitio } from "@/components/ui/en-sitio";
import { useToast } from "@/components/ui/toast";
import { useFaltantes } from "@/components/ui/usar-faltantes";
import { Ventana } from "@/components/ui/ventana";
import { pideCrear } from "@/lib/crear-global";

/** Lo que recibe el contenido de la ficha para señalar el dato obligatorio que falta. */
export interface AyudaFaltantes {
  /** El `id` del campo que se está señalando (o `null`). Va a `<Campo faltante={...}>`. */
  faltante: string | null;
  /** Para el atributo `aria-invalid` de un campo obligatorio: `aria-invalid={invalido("campo-monto")}`. */
  invalido: (id: string) => true | undefined;
}

/**
 * El botón «Agregar» de una tabla y la ficha para crear un registro: un panel que sale por la derecha (igual que la
 * ficha de Nuevo retiro), con los datos en bloques con ícono (`Seccion`) y **un botón grande de crear al final**.
 * Ese botón se ve apagado mientras falte un dato obligatorio y no envía el formulario, pero al pulsarlo así la ficha
 * baja hasta el primer dato que falta y lo marca (`useFaltantes`). Los campos vacíos llevan un ejemplo ficticio.
 *
 * Es el molde de todas las fichas de creación: el módulo solo pone su `action`, sus campos (`children`, con
 * `<Seccion>` y `<Campo>`) y lo que envía oculto (`ocultos`, p. ej. el país). La acción devuelve `{ error }` como valor
 * (en producción Next.js oculta el mensaje de una excepción); sin error, la ficha se cierra y sale un aviso. Mientras se
 * guarda no se cierra. Con `abrirConNuevo`, el botón «Crear» de la barra (`?nuevo=1`) la abre sola.
 */
export function FichaCrear({
  titulo,
  etiquetaBoton,
  etiquetaCrear,
  action,
  mensajeExito,
  ocultos,
  abrirConNuevo,
  puedeExtra = true,
  alAbrir,
  alPulsarSinCompletar,
  boton,
  alGuardar,
  incrustada = false,
  enSitio = false,
  alCambiarEnviando,
  secundario,
  children,
}: {
  /** Título de la cabecera: «Nuevo gasto». */
  titulo: string;
  /** Texto del botón de la tabla (por defecto «Agregar»). */
  etiquetaBoton?: string;
  /** Texto del botón grande del final: «Registrar gasto». */
  etiquetaCrear: string;
  action: (formData: FormData) => Promise<{ error?: string } | void>;
  mensajeExito: string;
  /** Datos que la ficha manda sin mostrarlos (el país). */
  ocultos?: Record<string, string>;
  abrirConNuevo?: boolean;
  /** Otra condición para poder crear además de los campos obligatorios (p. ej. que haya al menos una opción). */
  puedeExtra?: boolean;
  /** Se llama cada vez que se abre: para dejar en blanco lo que la ficha guarda en su estado (el tipo elegido). */
  alAbrir?: () => void;
  /** Si `señalarFaltante` no encontró ningún campo por llenar (no hay opciones que elegir), lleva a ese aviso. */
  alPulsarSinCompletar?: () => void;
  /** Otro botón que abre la ficha en vez de «Agregar» (p. ej. las acciones de la ficha de un dropshipper). */
  boton?: (abrir: () => void) => ReactNode;
  /** Se llama cuando se guardó sin error (para que la ficha que la contiene vuelva a pedir lo que muestra). */
  alGuardar?: () => void;
  /** Solo el formulario, sin botón ni panel propio: va dentro de otra ventana (p. ej. una pestaña de «Agregar»). */
  incrustada?: boolean;
  /**
   * Se abre **en el mismo lugar** (debajo de los botones de la ficha, `EnSitio`) en vez de en una ventana encima, para poder copiar y pegar datos de lo que
   * queda a la vista. Solo vale dentro de una zona `EnSitio`; fuera de ella se abre en su ventana de siempre.
   */
  enSitio?: boolean;
  /** Avisa cuando empieza y termina de guardar (para que la ventana que la contiene no se cierre a medias). */
  alCambiarEnviando?: (enviando: boolean) => void;
  /**
   * Otro botón, más discreto, encima del de crear: guarda lo que haya **sin exigir los datos obligatorios** (por ejemplo «Guardar como
   * borrador»). Manda el mismo formulario a su propia acción; la acción dice qué falta como `{ error }` si no se puede.
   */
  secundario?: { etiqueta: string; etiquetaEnviando?: string; mensajeExito: string; action: (formData: FormData) => Promise<{ error?: string } | void> };
  children: (ayuda: AyudaFaltantes) => ReactNode;
}) {
  const [abiertoLocal, setAbiertoLocal] = useState(false);
  const sitio = useEnSitio();
  const idPanel = useId();
  const enLugar = enSitio && !!sitio;
  // En el sitio, el que está abierto lo decide la zona (solo hay uno a la vez: abrir otro cierra este).
  const abierto = enLugar ? sitio.activo === idPanel : abiertoLocal;
  const setAbierto = (valor: boolean) => {
    if (enLugar) {
      if (valor) sitio.abrir(idPanel);
      else sitio.cerrar(idPanel);
    } else setAbiertoLocal(valor);
  };
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const botonAbrirRef = useRef<HTMLButtonElement>(null);
  const { formRef, completo, faltante, revisar, señalarFaltante } = useFaltantes();
  const { mostrarToast } = useToast();

  const parametros = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const yaAbrio = useRef(false);

  // Siempre la última función, sin volver a correr el efecto de abajo en cada dibujo.
  const alAbrirRef = useRef(alAbrir);
  useEffect(() => {
    alAbrirRef.current = alAbrir;
  });

  function abrir() {
    setError(null);
    alAbrir?.();
    setAbierto(true);
  }

  // El botón «Crear» de la barra de arriba llega con `?nuevo=1`: la ficha se abre sola y se quita el parámetro de la
  // dirección (para que recargar o volver atrás no la abra otra vez).
  useEffect(() => {
    if (!abrirConNuevo || !pideCrear(parametros.get("nuevo")) || yaAbrio.current) return;
    yaAbrio.current = true;
    router.replace(pathname, { scroll: false });
    alAbrirRef.current?.();
    setAbiertoLocal(true);
  }, [abrirConNuevo, parametros, pathname, router]);

  // Incrustada: se «abre» al montarse (deja en blanco su estado) y avisa si está guardando.
  useEffect(() => {
    if (incrustada) alAbrirRef.current?.();
  }, [incrustada]);
  useEffect(() => {
    alCambiarEnviando?.(pending);
  }, [pending, alCambiarEnviando]);

  function cerrar() {
    if (pending) return;
    setAbierto(false);
  }

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const resultado = await action(datos);
        if (resultado && resultado.error) setError(resultado.error);
        else {
          setAbierto(false);
          mostrarToast(mensajeExito);
          alGuardar?.();
        }
      } catch {
        setError("No se pudo guardar. Inténtalo de nuevo.");
      }
    });
  }

  function alPulsar() {
    if (!señalarFaltante()) alPulsarSinCompletar?.();
  }

  // El botón secundario guarda sin revisar lo obligatorio (el servidor decide si alcanza).
  function guardarSecundario() {
    if (!secundario || !formRef.current) return;
    const datos = new FormData(formRef.current);
    setError(null);
    startTransition(async () => {
      try {
        const resultado = await secundario.action(datos);
        if (resultado && resultado.error) setError(resultado.error);
        else {
          setAbierto(false);
          mostrarToast(secundario.mensajeExito);
          alGuardar?.();
        }
      } catch {
        setError("No se pudo guardar. Inténtalo de nuevo.");
      }
    });
  }

  const formulario = (
        <form
          ref={formRef}
          onSubmit={alEnviar}
          onInput={revisar}
          onChange={revisar}
          aria-busy={pending}
          className="flex flex-1 flex-col"
        >
          {ocultos && Object.entries(ocultos).map(([nombre, valor]) => <input key={nombre} type="hidden" name={nombre} value={valor} />)}

          <div className="flex flex-1 flex-col divide-y divide-border p-5">
            {children({ faltante, invalido: (id) => (faltante === id ? true : undefined) })}
          </div>

          <div className={`${enLugar ? "" : "sticky bottom-0 "}mt-auto flex flex-col gap-2 border-t border-border bg-card p-4`}>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              <span aria-hidden="true" className="text-destructive">
                *
              </span>{" "}
              Obligatorio
            </p>
            {secundario && (
              <button
                type="button"
                onClick={guardarSecundario}
                disabled={pending}
                className="flex h-11 w-full items-center justify-center !rounded-full border border-border-control bg-card text-sm font-semibold hover:bg-muted disabled:opacity-50"
              >
                {pending ? (secundario.etiquetaEnviando ?? "Guardando...") : secundario.etiqueta}
              </button>
            )}
            <BotonCrear
              puede={completo && puedeExtra}
              enviando={pending}
              etiqueta={etiquetaCrear}
              etiquetaEnviando="Guardando..."
              alPulsarSinCompletar={alPulsar}
            />
          </div>
        </form>
  );

  if (incrustada) return formulario;

  if (enLugar) {
    return (
      <>
        {boton ? boton(abrir) : <BotonAgregar ref={botonAbrirRef} etiqueta={etiquetaBoton} onClick={abrir} />}
        {abierto && sitio.destino && createPortal(<PanelEnSitio titulo={titulo} alCerrar={cerrar}>{formulario}</PanelEnSitio>, sitio.destino)}
      </>
    );
  }

  return (
    <>
      {boton ? boton(abrir) : <BotonAgregar ref={botonAbrirRef} etiqueta={etiquetaBoton} onClick={abrir} />}

      <Ventana
        abierto={abierto}
        alCerrar={cerrar}
        lado="derecha"
        ancho="lg"
        titulo={<span className="text-lg font-semibold">{titulo}</span>}
      >
        {formulario}
      </Ventana>
    </>
  );
}
