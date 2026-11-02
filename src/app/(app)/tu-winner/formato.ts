// Cómo se escriben los números, las iniciales y las fechas en el panel Tu Winner (sirve en el servidor y en el navegador).

export const n = (x: number | null | undefined) => (x === null || x === undefined ? "—" : Number(x).toLocaleString("es-PA"));
export const iniciales = (t: string) =>
  t
    .replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
export const NOMBRE_PAIS = { PA: "Panamá", MX: "México" } as const;
/** «25 oct» de un día AAAA-MM-DD. */
export const fechaCorta = (dia: string) => new Date(`${dia.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "UTC" });
