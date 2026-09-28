import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, FileUp, Loader2, UploadCloud, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader, StatusBadge } from "@/components/Common";
import { api, errMsg } from "@/lib/api";
import { brl } from "@/lib/format";

export default function ImportarXml() {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState([]);
  const input = useRef(null);

  const upload = async (fileList) => {
    const files = Array.from(fileList).filter((f) => f.name.toLowerCase().endsWith(".xml"));
    if (!files.length) return toast.error("Selecione arquivos .xml de NF-e");
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    setBusy(true);
    try {
      const { data } = await api.post("/documents/upload-xml", form);
      setResults((prev) => [...data, ...prev]);
      const ok = data.filter((r) => r.ok).length;
      toast.success(`${ok} de ${data.length} arquivo(s) lido(s) com sucesso`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div data-testid="importar-xml-page">
      <PageHeader eyebrow="Importação" title="Importar XML de NF-e"
        description="Envie um ou vários arquivos XML (até 50 por vez). Depois revise os itens e vincule aos produtos do estoque." />
      <div
        data-testid="xml-dropzone"
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors duration-200 ${drag ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-300 bg-card hover:border-slate-400 dark:border-slate-700"}`}
      >
        {busy ? <Loader2 className="h-10 w-10 animate-spin text-emerald-600" /> : <UploadCloud className="h-10 w-10 text-slate-400" strokeWidth={1.4} />}
        <p className="mt-4 font-display text-lg font-semibold">Arraste os arquivos XML aqui</p>
        <p className="mt-1 text-sm text-muted-foreground">ou clique para selecionar no computador</p>
        <input ref={input} type="file" accept=".xml,text/xml,application/xml" multiple hidden onChange={(e) => upload(e.target.files)} data-testid="xml-file-input" />
      </div>

      {results.length > 0 && (
        <Card className="mt-6 divide-y" data-testid="xml-results">
          {results.map((r, i) => (
            <div key={i} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center" data-testid={`xml-result-${i}`}>
              {r.ok ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <XCircle className="h-5 w-5 shrink-0 text-rose-600" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.ok ? `NF ${r.numero} · ${r.emit_nome}` : r.arquivo}</p>
                <p className="text-xs text-muted-foreground">
                  {r.ok ? `${r.arquivo} · ${brl(r.valor_total)}${r.novo ? "" : " · nota já existia, dados atualizados"}` : r.erro}
                </p>
                {r.aviso && <p className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3 w-3" />{r.aviso}</p>}
              </div>
              {r.ok && <StatusBadge status={r.status} />}
              {r.ok && r.status === "xml_completo" && (
                <Button asChild size="sm" data-testid={`xml-review-button-${i}`}><Link to={`/notas/${r.id}/importar`}><FileUp className="mr-1.5 h-3.5 w-3.5" />Revisar e importar</Link></Button>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
