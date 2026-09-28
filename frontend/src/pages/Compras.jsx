import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Search, ShoppingCart, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, SourceTag } from "@/components/Common";
import { api, errMsg } from "@/lib/api";
import { brl, fmtChave, fmtCnpj, fmtDate, num } from "@/lib/format";

function PurchaseDetail({ p, onClose, onReverted }) {
  const downloadXml = async () => {
    try {
      const { data } = await api.get(`/documents/${p.document_id}/xml`, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      Object.assign(document.createElement("a"), { href: url, download: `${p.chave}.xml` }).click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(errMsg(e)); }
  };
  const revert = async () => {
    try {
      await api.delete(`/purchases/${p.id}`);
      toast.success("Compra estornada. Estoque ajustado.");
      onReverted();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={!!p} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl" data-testid="purchase-detail-dialog">
        <DialogHeader><DialogTitle className="flex items-center gap-2">Compra {p.numero ? `nº ${p.numero}` : ""} <SourceTag source={p.source} /></DialogTitle></DialogHeader>
        <div className="grid gap-4 text-sm sm:grid-cols-4">
          <div className="sm:col-span-2"><p className="eyebrow">Fornecedor</p><p className="mt-1 font-medium">{p.supplier_nome}</p><p className="font-mono text-xs text-muted-foreground">{fmtCnpj(p.supplier_cnpj)}</p></div>
          <div><p className="eyebrow">Emissão / Entrada</p><p className="mt-1">{fmtDate(p.data_emissao)} · {fmtDate(p.data_entrada)}</p></div>
          <div><p className="eyebrow">Total</p><p className="num mt-1 font-display text-lg font-bold">{brl(p.valor_total)}</p></div>
          {p.chave && <div className="sm:col-span-4"><p className="eyebrow">Chave de acesso</p><p className="mt-1 break-all font-mono text-xs">{fmtChave(p.chave)}</p></div>}
          {p.observacao && <div className="sm:col-span-4"><p className="eyebrow">Observação</p><p className="mt-1">{p.observacao}</p></div>}
        </div>
        <div className="max-h-[45vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Qtd.</TableHead><TableHead>Fator</TableHead><TableHead>Entrada</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
            <TableBody>
              {p.items.map((i, idx) => (
                <TableRow key={idx}>
                  <TableCell><p className="font-medium">{i.product_nome}</p>{i.descricao !== i.product_nome && <p className="text-xs text-muted-foreground">{i.descricao}</p>}</TableCell>
                  <TableCell className="num">{num(i.quantidade)} {i.unidade}</TableCell>
                  <TableCell className="num">{num(i.fator)}</TableCell>
                  <TableCell className="num text-emerald-700 dark:text-emerald-400">+{num(i.quantidade_estoque)}</TableCell>
                  <TableCell className="num text-right">{brl(i.valor_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex justify-end gap-2">
          {p.document_id && <Button variant="outline" onClick={downloadXml} data-testid="purchase-download-xml"><Download className="mr-1.5 h-4 w-4" />Download XML</Button>}
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="outline" className="text-rose-600" data-testid="purchase-revert-button"><Undo2 className="mr-1.5 h-4 w-4" />Estornar compra</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Estornar esta compra?</AlertDialogTitle>
                <AlertDialogDescription>As quantidades serão retiradas do estoque e, se a compra veio de uma nota, ela volta para a lista de pendentes.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={revert} data-testid="purchase-revert-confirm">Estornar</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Compras() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);

  const load = useCallback(() => api.get("/purchases", { params: { q: q || undefined } }).then((r) => setRows(r.data)), [q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <div data-testid="compras-page">
      <PageHeader eyebrow="Histórico" title="Compras" description="Todas as entradas registradas: via SEFAZ, XML ou lançamento manual."
        actions={<div className="relative w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Fornecedor, número ou chave" value={q} onChange={(e) => setQ(e.target.value)} data-testid="compras-search-input" /></div>} />
      {rows.length === 0 ? <EmptyState testId="compras-empty" icon={ShoppingCart} title="Nenhuma compra registrada" text="Importe uma nota ou lance uma compra manual." /> : (
        <Card className="overflow-x-auto">
          <Table data-testid="compras-table">
            <TableHeader><TableRow><TableHead>Entrada</TableHead><TableHead>Fornecedor</TableHead><TableHead>Nº</TableHead><TableHead>Origem</TableHead><TableHead>Itens</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => setSel(p)} data-testid={`purchase-row-${p.id}`}>
                  <TableCell className="whitespace-nowrap">{fmtDate(p.data_entrada)}</TableCell>
                  <TableCell className="font-medium">{p.supplier_nome}</TableCell>
                  <TableCell className="font-mono text-sm">{p.numero || "—"}</TableCell>
                  <TableCell><SourceTag source={p.source} /></TableCell>
                  <TableCell>{p.items.length}</TableCell>
                  <TableCell className="num text-right font-medium">{brl(p.valor_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {sel && <PurchaseDetail p={sel} onClose={() => setSel(null)} onReverted={() => { setSel(null); load(); }} />}
    </div>
  );
}
