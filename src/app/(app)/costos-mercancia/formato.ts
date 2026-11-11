import { dinero } from "@/lib/af4/formato";

/** Dólares con hasta 4 decimales (los costos unitarios llevan fracciones de centavo), con el formato único AF4. Fuera de
 * `tabla-costos.tsx` porque ese archivo es de cliente: una página de servidor no puede llamar a una función suya. */
export const usd4 = (v: number) => dinero(v, "USD", { decimales: 2, decimalesMax: 4 });
