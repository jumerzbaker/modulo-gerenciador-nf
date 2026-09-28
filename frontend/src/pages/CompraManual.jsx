import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/Common";
import { ProductPicker } from "@/components/ProductPicker";
import { api, errMsg } from "@/lib/api";
import { brl, fmtCnpj, today } from "@/lib/format";

const emptyItem = () => ({ key: Math.random(), mode: "create", new_nome: "", unidade: "UN", quantidade: 1, valor_unitario: 0 });

function ItemLine({ item, idx, products, onChange, onRemove }) {
  const set = (patch) => onChange({ ...item, ...patch });
  return (
    <TableRow data-testid={`manual-item-${idx}`}>
      <TableCell className="min-w-[260px]">
        <ProductPicker products={products} value={item} testId={`manual-product-picker-${idx}`}
          onChange={(v) => set({ ...v, unidade: v.unidade || item.unidade })} />
        {item.mode === "create" && (
          <Input className="mt-2 h-8 text-xs" placeholder="Nome do novo produto" value={item.new_nome}
            onChange={(e) => set({ new_nome: e.target.value })} data-testid={`manual-new-name-${idx}`} />
        )}
      </TableCell>
      <TableCell><Input className="h-9 w-20" value={item.unidade} onChange={(e) => set({ unidade: e.target.value.toUpperCase() })} data-testid={`manual-unit-${idx}`} /></TableCell>
      <TableCell><Input className="h-9 w-24" type="number" min="0" step="any" value={item.quantidade} onChange={(e) => set({ quantidade: e.target.value })} data-testid={`manual-qty-${idx}`} /></TableCell>
      <TableCell><Input className="h-9 w-28" type="number" min="0" step="0.01" value={item.valor_unitario} onChange={(e) => set({ valor_unitario: e.target.value })} data-testid={`manual-price-${idx}`} /></TableCell>
      <TableCell className="num whitespace-nowrap text-right font-medium" data-testid={`manual-subtotal-${idx}`}>{brl(Number(item.quantidade) * Number(item.valor_unitario))}</TableCell>
      <TableCell><Button variant="ghost" size="icon" onClick={onRemove} data-testid={`manual-remove-${idx}`}><Trash2 className="h-4 w-4 text-rose-600" /></Button></TableCell>
    </TableRow>
  );
}

export default function CompraManual() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [newSup, setNewSup] = useState({ nome: "", cnpj: "" });
  const [head, setHead] = useState({ numero: "", data_emissao: today(), data_entrada: today(), observacao: "" });
  const [items, setItems] = useState([emptyItem()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.get("/products"), api.get("/suppliers")]).then(([p, s]) => { setProducts(p.data); setSuppliers(s.data); });
  }, []);

  const total = items.reduce((acc, i) => acc + Number(i.quantidade) * Number(i.valor_unitario), 0);

  const submit = async () => {
    setSaving(true);
    try {
      const payload = {
        ...head,
        supplier_id: supplierId && supplierId !== "__new__" ? supplierId : null,
        new_supplier: supplierId === "__new__" ? newSup : null,
        items: items.map((i) => ({
          product_id: i.mode === "link" ? i.product_id : null,
          new_product: i.mode === "create" ? { nome: i.new_nome, unidade: i.unidade } : null,
          descricao: i.mode === "link" ? i.product_nome : i.new_nome,
          unidade: i.unidade, quantidade: Number(i.quantidade), valor_unitario: Number(i.valor_unitario),
        })),
      };
      await api.post("/purchases/manual", payload);
      toast.success("Compra manual registrada e estoque atualizado");
      navigate("/compras");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="compra-manual-page">
      <PageHeader eyebrow="Lançamento" title="Compra manual" description="Registre compras sem XML (recibos, notas de papel, compras avulsas). O estoque e o custo médio são atualizados ao salvar." />
      <Card className="mb-6 grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1.5 xl:col-span-2">
          <Label>Fornecedor</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger data-testid="manual-supplier-select"><SelectValue placeholder="Selecione o fornecedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__new__" data-testid="manual-supplier-new-option">+ Cadastrar novo fornecedor</SelectItem>
              {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome} {s.cnpj ? `· ${fmtCnpj(s.cnpj)}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          {supplierId === "__new__" && (
            <div className="grid gap-2 pt-1 sm:grid-cols-2">
              <Input placeholder="Nome / Razão social" value={newSup.nome} onChange={(e) => setNewSup({ ...newSup, nome: e.target.value })} data-testid="manual-new-supplier-name" />
              <Input placeholder="CNPJ/CPF (opcional)" value={newSup.cnpj} onChange={(e) => setNewSup({ ...newSup, cnpj: e.target.value })} data-testid="manual-new-supplier-cnpj" />
            </div>
          )}
        </div>
        <div className="space-y-1.5"><Label>Nº do documento</Label><Input value={head.numero} onChange={(e) => setHead({ ...head, numero: e.target.value })} placeholder="Opcional" data-testid="manual-number-input" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Emissão</Label><Input type="date" value={head.data_emissao} onChange={(e) => setHead({ ...head, data_emissao: e.target.value })} data-testid="manual-issue-date" /></div>
          <div className="space-y-1.5"><Label>Entrada</Label><Input type="date" value={head.data_entrada} onChange={(e) => setHead({ ...head, data_entrada: e.target.value })} data-testid="manual-entry-date" /></div>
        </div>
        <div className="space-y-1.5 md:col-span-2 xl:col-span-4"><Label>Observação</Label><Textarea rows={2} value={head.observacao} onChange={(e) => setHead({ ...head, observacao: e.target.value })} data-testid="manual-notes-input" /></div>
      </Card>
      <Card className="overflow-x-auto">
        <Table data-testid="manual-items-table">
          <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Unid.</TableHead><TableHead>Qtd.</TableHead><TableHead>Valor unit. (R$)</TableHead><TableHead className="text-right">Subtotal</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {items.map((it, idx) => (
              <ItemLine key={it.key} item={it} idx={idx} products={products}
                onChange={(v) => setItems(items.map((x) => (x.key === it.key ? v : x)))}
                onRemove={() => setItems(items.length > 1 ? items.filter((x) => x.key !== it.key) : [emptyItem()])} />
            ))}
          </TableBody>
        </Table>
        <div className="flex flex-col gap-4 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="outline" onClick={() => setItems([...items, emptyItem()])} data-testid="manual-add-item-button"><Plus className="mr-1.5 h-4 w-4" />Adicionar item</Button>
          <div className="flex items-center gap-6">
            <div className="text-right"><p className="eyebrow">Total</p><p className="num font-display text-2xl font-bold" data-testid="manual-total">{brl(total)}</p></div>
            <Button onClick={submit} disabled={saving} className="active:scale-[0.98]" data-testid="manual-save-button">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar compra
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
