const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

export const brl = (v) => brlFmt.format(Number(v) || 0);
export const num = (v) => numFmt.format(Number(v) || 0);

export function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
  return isNaN(d) ? v : d.toLocaleDateString("pt-BR");
}

export function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d) ? v : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function fmtCnpj(v) {
  const d = (v || "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return v || "—";
}

export const fmtChave = (v) => (v || "").replace(/(\d{4})(?=\d)/g, "$1 ");

export const today = () => new Date().toISOString().slice(0, 10);

export const SOURCE_LABEL = { sefaz: "SEFAZ", xml: "XML", manual: "Manual" };
