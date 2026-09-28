import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/Common";
import { api, errMsg } from "@/lib/api";
import { brl, num } from "@/lib/format";

const EMPTY = { nome: "", sku: "", ean: "", ncm: "", unidade: "UN", estoque_minimo: 0, preco_venda: 0 };
const FIELDS = [["nome", "Nome", "sm:col-span-2"], ["sku", "SKU / Código interno"], ["ean", "Código de barras (EAN)"], ["ncm", "NCM"], ["unidade", "Unidade"], ["estoque_minimo", "Estoque mínimo", "", "number"], ["preco_venda", "Preço de venda (R$)", "", "number"]];

function ProductDialog({ product, onClose, onSaved }) {
  const [form, setForm] = useState(product.id ? product : EMPTY);
  const save = async () => {
    try {
      const body = { ...form, estoque_minimo: Number(form.estoque_minimo), preco_venda: Number(form.preco_venda) };
      product.id ? await api.put(`/products/${product.id}`, body) : await api.post("/products", body);
      toast.success("Produto salvo");
      onSaved();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="product-dialog">
        <DialogHeader><DialogTitle>{product.id ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map(([k, l, cls, type]) => (
            <div key={k} className={`space-y-1.5 ${cls || ""}`}>
              <Label>{l}</Label>
              <Input type={type || "text"} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} data-testid={`product-${k}-input`} />
            </div>
          ))}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={save} data-testid="product-save-button">Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Produtos() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);

  const load = useCallback(() => api.get("/products", { params: { q: q || undefined } }).then((r) => setRows(r.data)), [q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const remove = async (p) => {
    if (!window.confirm(`Excluir o produto "${p.nome}"?`)) return;
    try { await api.delete(`/products/${p.id}`); toast.success("Produto excluído"); load(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div data-testid="produtos-page">
      <PageHeader eyebrow="Cadastro" title="Produtos e estoque" description="Produtos criados nas importações aparecem aqui com a quantidade e o custo médio atualizados."
        actions={<>
          <div className="relative w-64"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar produto" value={q} onChange={(e) => setQ(e.target.value)} data-testid="produtos-search-input" /></div>
          <Button onClick={() => setEdit({})} data-testid="product-new-button"><Plus className="mr-1.5 h-4 w-4" />Novo produto</Button>
        </>} />
      {rows.length === 0 ? <EmptyState testId="produtos-empty" icon={Package} title="Nenhum produto" text="Cadastre manualmente ou crie durante a importação de uma nota." /> : (
        <Card className="overflow-x-auto">
          <Table data-testid="produtos-table">
            <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>SKU / EAN</TableHead><TableHead className="text-right">Estoque</TableHead><TableHead className="text-right">Custo médio</TableHead><TableHead className="text-right">Preço venda</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rows.map((p) => {
                const low = p.estoque_minimo > 0 && p.estoque <= p.estoque_minimo;
                return (
                  <TableRow key={p.id} data-testid={`product-row-${p.id}`}>
                    <TableCell><p className="font-medium">{p.nome}</p>{p.ncm && <p className="font-mono text-[11px] text-muted-foreground">NCM {p.ncm}</p>}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.sku || "—"}<br />{p.ean || ""}</TableCell>
                    <TableCell className={`num text-right font-semibold ${low ? "text-amber-600" : ""}`} data-testid={`product-stock-${p.id}`}>{num(p.estoque)} {p.unidade}</TableCell>
                    <TableCell className="num text-right">{brl(p.custo_medio)}</TableCell>
                    <TableCell className="num text-right">{p.preco_venda ? brl(p.preco_venda) : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setEdit(p)} data-testid={`product-edit-${p.id}`}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(p)} data-testid={`product-delete-${p.id}`}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      {edit && <ProductDialog product={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}
