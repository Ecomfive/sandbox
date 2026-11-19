// Anuncios Meta › cómo se escribe lo que dura un video: «0:34», «1:05». Lógica pura, con prueba.

/** Los segundos como minutos y segundos («34» → «0:34»; «65» → «1:05»); null si no es un número válido. */
export function formatoDuracion(segundos: number | null | undefined): string | null {
  if (typeof segundos !== "number" || !Number.isFinite(segundos) || segundos < 0) return null;
  const total = Math.round(segundos);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
