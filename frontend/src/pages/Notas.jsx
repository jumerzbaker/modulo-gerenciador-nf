import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Download, FileCheck2, Loader2, MoreHorizontal, RefreshCw, Search, Send, Trash2, EyeOff, Landmark, CloudDownload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState, PageHeader, SourceTag, StatusBadge } from "@/components/Common";
import { api, errMsg } from "@/lib/api";
import { brl, fmtCnpj, fmtDate, fmtDateTime } from "@/lib/format";

const FILTERS = {
  pendentes: ["resumo", "manifestada", "xml_completo"],
  importada: ["importada"],
  outras: ["ignorada", "cancelada"],
  todas: null,
};

function SyncBar({ settings, onSynced }) {
  const [busy, setBusy] = useState(false);
  const sync = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/sefaz/sync");
      toast.success(`SEFAZ: ${data.motivo}`, { description: `${data.documentos} documento(s) recebido(s) · ${data.manifestadas} ciência(s) enviada(s)` });
      onSynced();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center" data-testid="sefaz-sync-bar">
      <Landmark className="hidden h-5 w-5 text-emerald-600 sm:block" />
      <div className="flex-1 text-sm">
        <p className="font-medium">CNPJ {settings?.cnpj ? fmtCnpj(settings.cnpj) : "não configurado"} · {settings?.ambiente === 2 ? "Homologação" : "Produção"}</p>
        <p className="text-xs text-muted-foreground" data-testid="sefaz-sync-info">
          Última consulta: {fmtDateTime(settings?.last_sync_at)}
          {settings?.next_sync_at && ` · Próxima permitida: ${fmtDateTime(settings.next_sync_at)}`}
          {settings?.auto_sync ? " · Busca automática ativa" : ""}
        </p>
      </div>
      <Button onClick={sync} disabled={busy || !settings?.cert} data-testid="sefaz-sync-button" className="active:scale-[0.98]">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
        Sincronizar agora
      </Button>
    </Card>
  );
}

function RowActions({ doc, reload }) {
  const navigate = useNavigate();
  const run = async (fn, ok) => {
    const t = toast.loading("Processando...");
    try {
      await fn();
      toast.success(ok, { id: t });
      reload();
    } catch (e) {
      toast.error(errMsg(e), { id: t });
    }
  };
  const downloadXml = async () => {
    const { data } = await api.get(`/documents/${doc.id}/xml`, { responseType: "blob" });
    const url = URL.createObjectURL(data);
    Object.assign(document.createElement("a"), { href: url, download: `${doc.chave}.xml` }).click();
    URL.revokeObjectURL(url);
  };
  const canImport = doc.has_xml && !["importada", "cancelada"].includes(doc.status);
  return (
    <div className="flex items-center justify-end gap-1">
      {canImport && (
        <Button size="sm" onClick={() => navigate(`/notas/${doc.id}/importar`)} data-testid={`doc-import-button-${doc.id}`}>
          <FileCheck2 className="mr-1.5 h-3.5 w-3.5" /> Revisar e importar
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8" data-testid={`doc-actions-${doc.id}`}><MoreHorizontal className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {doc.source === "sefaz" && doc.manifest_status !== "ciencia" && doc.status !== "importada" && (
            <DropdownMenuItem data-testid={`doc-manifest-${doc.id}`} onClick={() => run(() => api.post(`/sefaz/documents/${doc.id}/manifest`), "Ciência da Operação registrada")}>
              <Send className="mr-2 h-4 w-4" /> Manifestar ciência
            </DropdownMenuItem>
          )}
          {!doc.has_xml && (
            <DropdownMenuItem data-testid={`doc-download-full-${doc.id}`} onClick={() => run(() => api.post(`/sefaz/documents/${doc.id}/download`), "XML completo baixado")}>
              <CloudDownload className="mr-2 h-4 w-4" /> Baixar XML completo da SEFAZ
            </DropdownMenuItem>
          )}
          {doc.has_xml && (
            <DropdownMenuItem data-testid={`doc-xml-${doc.id}`} onClick={() => downloadXml().catch((e) => toast.error(errMsg(e)))}>
              <Download className="mr-2 h-4 w-4" /> Download do XML
            </DropdownMenuItem>
          )}
          {doc.status !== "importada" && (
            <>
              <DropdownMenuItem data-testid={`doc-ignore-${doc.id}`} onClick={() => run(() => api.post(`/documents/${doc.id}/ignore`), doc.status === "ignorada" ? "Nota restaurada" : "Nota ignorada")}>
                <EyeOff className="mr-2 h-4 w-4" /> {doc.status === "ignorada" ? "Restaurar" : "Ignorar nota"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-rose-600" data-testid={`doc-delete-${doc.id}`} onClick={() => run(() => api.delete(`/documents/${doc.id}`), "Nota excluída")}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </>
          )}
          {doc.status === "importada" && (
            <DropdownMenuItem asChild><Link to="/compras" data-testid={`doc-view-purchase-${doc.id}`}>Ver em Compras</Link></DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function Notas() {
  const [docs, setDocs] = useState([]);
  const [settings, setSettings] = useState(null);
  const [filter, setFilter] = useState("pendentes");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [d, s] = await Promise.all([api.get("/documents", { params: { q: q || undefined } }), api.get("/settings")]);
    setDocs(d.data);
    setSettings(s.data);
    setLoading(false);
  }, [q]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const shown = FILTERS[filter] ? docs.filter((d) => FILTERS[filter].includes(d.status)) : docs;
  const count = (k) => (FILTERS[k] ? docs.filter((d) => FILTERS[k].includes(d.status)).length : docs.length);

  return (
    <div data-testid="notas-page" className="min-w-0">
      <PageHeader eyebrow="Caixa de entrada fiscal" title="Notas fiscais"
        description="NF-e emitidas contra o CNPJ da empresa (SEFAZ) e XMLs enviados. Revise os itens e dê entrada no estoque." />
      <SyncBar settings={settings} onSynced={load} />
      {settings && !settings.cert && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300" data-testid="no-cert-warning">
          Para buscar notas automaticamente, envie o Certificado Digital A1 em <Link to="/configuracoes" className="font-medium underline">Configurações</Link>.
        </p>
      )}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={setFilter} className="max-w-full overflow-x-auto">
          <TabsList>
            {[["pendentes", "Pendentes"], ["importada", "Importadas"], ["outras", "Ignoradas/Canceladas"], ["todas", "Todas"]].map(([k, l]) => (
              <TabsTrigger key={k} value={k} data-testid={`notas-tab-${k}`}>{l} <span className="ml-1.5 text-xs opacity-60">{count(k)}</span></TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Fornecedor, número ou chave" className="pl-9" data-testid="notas-search-input" />
        </div>
      </div>
      {loading ? <div className="h-40 animate-pulse rounded-lg bg-muted" /> : shown.length === 0 ? (
        <EmptyState testId="notas-empty" icon={Landmark} title="Nenhuma nota nesta lista"
          text="Sincronize com a SEFAZ ou importe arquivos XML para começar."
          action={<Button asChild variant="outline"><Link to="/importar-xml">Importar XML</Link></Button>} />
      ) : (
        <Card className="overflow-x-auto">
          <Table data-testid="notas-table">
            <TableHeader>
              <TableRow>
                <TableHead>Emissão</TableHead><TableHead>Fornecedor</TableHead><TableHead>Nº / Série</TableHead>
                <TableHead className="text-right">Valor</TableHead><TableHead>Origem</TableHead><TableHead>Status</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((d) => (
                <TableRow key={d.id} data-testid={`doc-row-${d.id}`}>
                  <TableCell className="whitespace-nowrap text-sm">{fmtDate(d.data_emissao)}</TableCell>
                  <TableCell>
                    <p className="max-w-[280px] truncate font-medium">{d.emit_nome}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{fmtCnpj(d.emit_cnpj)}</p>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{d.numero || "—"}{d.serie ? ` / ${d.serie}` : ""}</TableCell>
                  <TableCell className="num whitespace-nowrap text-right font-medium">{brl(d.valor_total)}</TableCell>
                  <TableCell><SourceTag source={d.source} /></TableCell>
                  <TableCell><StatusBadge status={d.status} testId={`doc-status-${d.id}`} /></TableCell>
                  <TableCell><RowActions doc={d} reload={load} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
