// Lo que cada persona configura en una tabla (filtros, vista, columnas) vive en el navegador. Cada
// entrada es un mini almacén externo: React se suscribe con useSyncExternalStore, así el estado se
// lee igual en servidor y cliente sin efectos, y un cambio avisa a todos los que lo usan.

export interface Almacen {
  suscribir: (avisar: () => void) => () => void;
  leer: () => string;
  guardar: (json: string) => void;
}

const almacenes = new Map<string, Almacen>();

function almacenamiento(tipo: "local" | "sesion"): Storage | null {
  try {
    return tipo === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** `sesion` sobrevive a entrar a un registro y volver; `local` sobrevive a cerrar el navegador. */
export function almacen(clave: string, tipo: "local" | "sesion"): Almacen {
  const existente = almacenes.get(clave);
  if (existente) return existente;

  const oyentes = new Set<() => void>();
  let enMemoria: string | null = null;

  const nuevo: Almacen = {
    suscribir(avisar) {
      oyentes.add(avisar);
      return () => {
        oyentes.delete(avisar);
      };
    },
    leer() {
      if (enMemoria !== null) return enMemoria;
      try {
        return almacenamiento(tipo)?.getItem(clave) ?? "";
      } catch {
        return "";
      }
    },
    guardar(json) {
      enMemoria = json;
      try {
        almacenamiento(tipo)?.setItem(clave, json);
      } catch {
        // Sin almacenamiento (modo privado, cuotas) la tabla sigue funcionando mientras no se recargue.
      }
      oyentes.forEach((avisar) => avisar());
    },
  };
  almacenes.set(clave, nuevo);
  return nuevo;
}
