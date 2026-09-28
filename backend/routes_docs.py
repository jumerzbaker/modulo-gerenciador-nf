from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from core import db, get_current_user, get_settings, now_iso, only_digits
from purchase_service import create_purchase, suggest_product, upsert_supplier
from sefaz import store_full_nfe

router = APIRouter(prefix="/documents", dependencies=[Depends(get_current_user)])


class NewProduct(BaseModel):
    nome: str
    sku: str = ""
    ean: str = ""
    ncm: str = ""
    unidade: str = "UN"


class ImportLine(BaseModel):
    n_item: int
    product_id: Optional[str] = None
    new_product: Optional[NewProduct] = None
    fator: float = 1


class ImportIn(BaseModel):
    data_entrada: Optional[str] = None
    observacao: str = ""
    lines: List[ImportLine]


@router.get("")
async def list_documents(status: Optional[str] = None, source: Optional[str] = None, q: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    if source:
        query["source"] = source
    if q:
        query["$or"] = [{"emit_nome": {"$regex": q, "$options": "i"}}, {"chave": {"$regex": only_digits(q) or q}},
                        {"numero": q}]
    return await db.nfe_documents.find(query, {"_id": 0, "xml": 0, "items": 0}).sort("data_emissao", -1).to_list(500)


@router.post("/upload-xml")
async def upload_xml(files: List[UploadFile] = File(...)):
    settings = await get_settings()
    results = []
    for f in files[:50]:
        entry = {"arquivo": f.filename}
        try:
            content = await f.read()
            if len(content) > 5 * 1024 * 1024:
                raise ValueError("Arquivo maior que 5 MB")
            doc, created = await store_full_nfe(content, "xml")
            warn = ""
            if settings.get("cnpj") and doc.get("dest_cnpj") and doc["dest_cnpj"] != settings["cnpj"]:
                warn = "Destinatário da nota é diferente do CNPJ da empresa"
            entry.update({"ok": True, "id": doc["id"], "numero": doc["numero"], "emit_nome": doc["emit_nome"],
                          "valor_total": doc["valor_total"], "status": doc["status"], "novo": created, "aviso": warn})
        except ValueError as e:
            entry.update({"ok": False, "erro": str(e)})
        results.append(entry)
    return results


@router.get("/{doc_id}")
async def get_document(doc_id: str):
    doc = await db.nfe_documents.find_one({"id": doc_id}, {"_id": 0, "xml": 0})
    if not doc:
        raise HTTPException(404, "Nota não encontrada")
    return doc


@router.get("/{doc_id}/xml")
async def download_xml(doc_id: str):
    doc = await db.nfe_documents.find_one({"id": doc_id}, {"_id": 0, "xml": 1, "chave": 1})
    if not doc or not doc.get("xml"):
        raise HTTPException(404, "XML não disponível")
    return Response(doc["xml"], media_type="application/xml",
                    headers={"Content-Disposition": f'attachment; filename="{doc["chave"]}.xml"'})


@router.get("/{doc_id}/review")
async def review(doc_id: str):
    doc = await get_document(doc_id)
    if not doc.get("has_xml"):
        raise HTTPException(400, "Esta nota ainda só possui o resumo. Baixe o XML completo antes de importar.")
    supplier = await db.suppliers.find_one({"cnpj": doc.get("emit_cnpj")}, {"_id": 0})
    for item in doc["items"]:
        product, reason = await suggest_product(item, doc.get("emit_cnpj", ""))
        item["sugestao"] = {"product_id": product["id"], "nome": product["nome"], "unidade": product["unidade"],
                            "estoque": product["estoque"], "motivo": reason} if product else None
    doc["supplier"] = supplier
    return doc


@router.post("/{doc_id}/import")
async def import_document(doc_id: str, body: ImportIn):
    doc = await get_document(doc_id)
    if doc["status"] == "importada":
        raise HTTPException(400, "Esta nota já foi importada")
    if doc["status"] == "cancelada":
        raise HTTPException(400, "Nota cancelada não pode ser importada")
    if not doc.get("has_xml"):
        raise HTTPException(400, "XML completo não disponível")
    by_item = {i["n_item"]: i for i in doc["items"]}
    lines = []
    for ln in body.lines:
        item = by_item.get(ln.n_item)
        if not item:
            raise HTTPException(400, f"Item {ln.n_item} não existe na nota")
        if not ln.product_id and not ln.new_product:
            raise HTTPException(400, f"Vincule ou crie um produto para o item {ln.n_item}")
        lines.append({**item, "product_id": ln.product_id,
                      "new_product": ln.new_product.model_dump() if ln.new_product else None, "fator": ln.fator})
    supplier = await upsert_supplier({"cnpj": doc.get("emit_cnpj"), "nome": doc.get("emit_nome"),
                                      "fantasia": doc.get("emit_fantasia", ""), "ie": doc.get("emit_ie", ""),
                                      "uf": doc.get("emit_uf", ""), "cidade": doc.get("emit_cidade", "")})
    header = {k: doc.get(k, "") for k in ("chave", "numero", "serie", "data_emissao", "valor_total")}
    header.update({"data_entrada": body.data_entrada, "observacao": body.observacao})
    purchase = await create_purchase(doc["source"], supplier, header, lines, doc_id)
    await db.nfe_documents.update_one({"id": doc_id}, {"$set": {"status": "importada", "purchase_id": purchase["id"],
                                                               "updated_at": now_iso()}})
    return purchase


@router.post("/{doc_id}/ignore")
async def ignore_document(doc_id: str):
    doc = await get_document(doc_id)
    if doc["status"] == "importada":
        raise HTTPException(400, "Nota já importada")
    new_status = doc.get("prev_status") if doc["status"] == "ignorada" else "ignorada"
    await db.nfe_documents.update_one({"id": doc_id}, {"$set": {
        "status": new_status or ("xml_completo" if doc.get("has_xml") else "resumo"),
        "prev_status": doc["status"], "updated_at": now_iso()}})
    return {"ok": True}


@router.delete("/{doc_id}")
async def delete_document(doc_id: str):
    doc = await get_document(doc_id)
    if doc["status"] == "importada":
        raise HTTPException(400, "Estorne a compra antes de excluir a nota")
    await db.nfe_documents.delete_one({"id": doc_id})
    return {"ok": True}
