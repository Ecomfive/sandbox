import { dinero } from "@/lib/af4/formato";

/** Dólares con hasta 4 decimales (los costos unitarios llevan fracciones de centavo), con el formato único AF4. */
export const usd4 = (v: number) => dinero(v, "USD", { decimales: 2, decimalesMax: 4 });
