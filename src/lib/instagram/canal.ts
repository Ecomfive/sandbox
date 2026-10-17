/**
 * Un aviso entre las pestañas de la plataforma abiertas en el mismo navegador: la pestaña que guardó algo (la lectura de la Biblioteca, lo
 * compartido desde el celular) le avisa a la lista de Instagram para que se vuelva a pedir sola, sin recargar a mano. Es un `BroadcastChannel`
 * del mismo origen: no sale del navegador ni lleva datos, solo la orden de actualizar.
 */
export const CANAL_INSTAGRAM = "ecomfive-instagram";

/** Avisa a las demás pestañas que hay datos nuevos de Instagram. Nunca lanza (sin soporte del navegador, no hace nada). */
export function avisarActualizacionInstagram(): void {
  try {
    const canal = new BroadcastChannel(CANAL_INSTAGRAM);
    canal.postMessage({ tipo: "actualizado" });
    canal.close();
  } catch {
    // El navegador no sabe de canales: la lista se actualiza igual cada 30 s y al volver a verse.
  }
}

/** Escucha los avisos de otras pestañas; devuelve la función que deja de escuchar. */
export function escucharActualizacionesInstagram(alActualizar: () => void): () => void {
  try {
    const canal = new BroadcastChannel(CANAL_INSTAGRAM);
    canal.onmessage = (e: MessageEvent) => {
      if (e.data?.tipo === "actualizado") alActualizar();
    };
    return () => canal.close();
  } catch {
    return () => undefined;
  }
}
