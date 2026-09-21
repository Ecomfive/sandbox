import { anilloFoco } from "@/components/ui/field";

/** El aviso que sale bajo un campo obligatorio cuando se pulsó «Crear» sin llenarlo (ver `useFaltantes`). Con `mensaje`
 * dice otra cosa (p. ej. «Debe ser mayor a cero» si el campo tiene un valor pero no sirve). */
export function AvisoFaltante({ id, faltante, mensaje = "Falta este dato" }: { id: string; faltante: string | null; mensaje?: string }) {
  if (faltante !== id) return null;
  return (
    <p id={`${id}-falta`} role="alert" className="text-xs text-destructive">
      {mensaje}
    </p>
  );
}

/**
 * El botón grande del final de un formulario de creación. Con `puede` en falso (falta algún dato obligatorio) se ve
 * apagado y **no envía el formulario**, pero sí responde al clic: llama a `alPulsarSinCompletar`, que lleva a la persona
 * al dato que falta. Es `aria-disabled` y no `disabled` justamente para poder recibir ese clic (y el Enter dentro de un
 * campo). Mientras se guarda (`enviando`) no responde a nada.
 */
export function BotonCrear({
  puede,
  enviando,
  etiqueta,
  etiquetaEnviando = "Creando...",
  alPulsarSinCompletar,
}: {
  puede: boolean;
  enviando: boolean;
  etiqueta: string;
  etiquetaEnviando?: string;
  alPulsarSinCompletar: () => void;
}) {
  const activo = puede && !enviando;
  return (
    <button
      type="submit"
      aria-disabled={!activo}
      onClick={(e) => {
        if (activo) return;
        e.preventDefault();
        if (!enviando) alPulsarSinCompletar();
      }}
      className={`flex h-12 w-full items-center justify-center text-base font-semibold transition-colors ${anilloFoco} !rounded-full ${
        activo ? "bg-foreground text-background hover:bg-foreground/85" : "cursor-not-allowed bg-muted text-muted-foreground"
      }`}
    >
      {enviando ? etiquetaEnviando : etiqueta}
    </button>
  );
}
