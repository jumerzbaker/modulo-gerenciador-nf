import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/Common";
import { api, errMsg } from "@/lib/api";
import { brl, fmtCnpj } from "@/lib/format";

const EMPTY = { nome: "", cnpj: "", fantasia: "", ie: "", uf: "", cidade: "", telefone: "", email: "" };
const FIELDS = [["nome", "Razão social", "sm:col-span-2"], ["fantasia", "Nome fantasia"], ["cnpj", "CNPJ/CPF"], ["ie", "Inscrição estadual"], ["uf", "UF"], ["cidade", "Cidade"], ["telefone", "Telefone"], ["email", "E-mail", "sm:col-span-2"]];

function SupplierDialog({ supplier, onClose, onSaved }) {
  const [form, setForm] = useState(supplier.id ? supplier : EMPTY);
  const save = async () => {
    try {
      const body = Object.fromEntries(Object.keys(EMPTY).map((k) => [k, form[k] || ""]));
      supplier.id ? await api.put(`/suppliers/${supplier.id}`, body) : await api.post("/suppliers", body);
      toast.success("Fornecedor salvo");
      onSaved();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="supplier-dialog">
        <DialogHeader><DialogTitle>{supplier.id ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map(([k, l, cls]) => (
            <div key={k} className={`space-y-1.5 ${cls || ""}`}>
              <Label>{l}</Label>
              <Input value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} data-testid={`supplier-${k}-input`} />
            </div>
          ))}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={save} data-testid="supplier-save-button">Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Fornecedores() {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = () => api.get("/suppliers").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const remove = async (s) => {
    if (!window.confirm(`Excluir o fornecedor "${s.nome}"?`)) return;
    try { await api.delete(`/suppliers/${s.id}`); toast.success("Fornecedor excluído"); load(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div data-testid="fornecedores-page">
      <PageHeader eyebrow="Cadastro" title="Fornecedores" description="Fornecedores são cadastrados automaticamente a partir do emitente das notas importadas."
        actions={<Button onClick={() => setEdit({})} data-testid="supplier-new-button"><Plus className="mr-1.5 h-4 w-4" />Novo fornecedor</Button>} />
      {rows.length === 0 ? <EmptyState testId="fornecedores-empty" icon={Truck} title="Nenhum fornecedor" text="Eles aparecerão aqui após a primeira importação." /> : (
        <Card className="overflow-x-auto">
          <Table data-testid="fornecedores-table">
            <TableHeader><TableRow><TableHead>Fornecedor</TableHead><TableHead>CNPJ</TableHead><TableHead>Cidade/UF</TableHead><TableHead className="text-right">Compras</TableHead><TableHead className="text-right">Total comprado</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id} data-testid={`supplier-row-${s.id}`}>
                  <TableCell><p className="font-medium">{s.nome}</p>{s.fantasia && <p className="text-xs text-muted-foreground">{s.fantasia}</p>}</TableCell>
                  <TableCell className="font-mono text-xs">{fmtCnpj(s.cnpj)}</TableCell>
                  <TableCell className="text-sm">{[s.cidade, s.uf].filter(Boolean).join(" / ") || "—"}</TableCell>
                  <TableCell className="num text-right">{s.qtd_compras}</TableCell>
                  <TableCell className="num text-right font-medium">{brl(s.total_compras)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setEdit(s)} data-testid={`supplier-edit-${s.id}`}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(s)} data-testid={`supplier-delete-${s.id}`}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {edit && <SupplierDialog supplier={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}
