import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from core import db, encrypt, get_current_user, get_settings, now_iso, only_digits, SETTINGS_ID
from sefaz import build_client, load_certificate, manifest_document, run_sync, store_full_nfe, add_log

router = APIRouter(dependencies=[Depends(get_current_user)])


class SettingsIn(BaseModel):
    cnpj: str
    razao_social: str = ""
    uf: str = "SP"
    ambiente: int = 1
    auto_sync: bool = True
    auto_manifest: bool = True


def _public(s: dict) -> dict:
    cert = s.get("cert")
    s["cert"] = {k: cert[k] for k in ("subject", "issuer", "cnpj", "not_before", "not_after", "uploaded_at")} if cert else None
    return s


@router.get("/settings")
async def read_settings():
    return _public(await get_settings())


@router.put("/settings")
async def update_settings(body: SettingsIn):
    cnpj = only_digits(body.cnpj)
    if len(cnpj) != 14:
        raise HTTPException(400, "CNPJ deve ter 14 dígitos")
    if body.ambiente not in (1, 2):
        raise HTTPException(400, "Ambiente inválido")
    s = await get_settings()
    data = {**body.model_dump(), "cnpj": cnpj, "uf": body.uf.upper()}
    if s.get("cnpj") != cnpj or s.get("ambiente") != body.ambiente:
        data.update({"ult_nsu": 0, "max_nsu": 0, "next_sync_at": None})
    await db.settings.update_one({"id": SETTINGS_ID}, {"$set": data})
    return _public(await get_settings())


@router.post("/settings/certificate")
async def upload_certificate(file: UploadFile = File(...), password: str = Form(...)):
    if not (file.filename or "").lower().endswith((".pfx", ".p12")):
        raise HTTPException(400, "Envie um certificado A1 no formato .pfx ou .p12")
    pfx = await file.read()
    if len(pfx) > 1024 * 1024:
        raise HTTPException(413, "Arquivo de certificado muito grande")
    info = load_certificate(pfx, password)
    s = await get_settings()
    if s.get("cnpj") and info["cnpj"] and info["cnpj"][:8] != s["cnpj"][:8]:
        raise HTTPException(400, f"O certificado pertence ao CNPJ {info['cnpj']}, diferente do CNPJ configurado")
    cert = {**info, "pfx_enc": encrypt(pfx), "pwd_enc": encrypt(password.encode()), "uploaded_at": now_iso()}
    update = {"cert": cert, "next_sync_at": None}
    if not s.get("cnpj") and info["cnpj"]:
        update["cnpj"] = info["cnpj"]
    await db.settings.update_one({"id": SETTINGS_ID}, {"$set": update})
    return _public(await get_settings())


@router.delete("/settings/certificate")
async def delete_certificate():
    await db.settings.update_one({"id": SETTINGS_ID}, {"$set": {"cert": None}})
    return {"ok": True}


@router.post("/sefaz/sync")
async def sync_now():
    return await run_sync()


@router.get("/sefaz/logs")
async def sync_logs(limit: int = 50):
    return await db.sync_logs.find({}, {"_id": 0}).sort("at", -1).to_list(min(limit, 200))


async def _doc_or_404(doc_id: str) -> dict:
    doc = await db.nfe_documents.find_one({"id": doc_id}, {"_id": 0, "xml": 0})
    if not doc:
        raise HTTPException(404, "Nota não encontrada")
    return doc


@router.post("/sefaz/documents/{doc_id}/manifest")
async def manifest(doc_id: str):
    doc = await _doc_or_404(doc_id)
    client, _, cnpj = await build_client()
    res = await manifest_document(client, cnpj, doc)
    if not res["ok"]:
        raise HTTPException(400, f"SEFAZ recusou a manifestação: {res['cStat']} - {res['xMotivo']}")
    return res


@router.post("/sefaz/documents/{doc_id}/download")
async def download_full_xml(doc_id: str):
    doc = await _doc_or_404(doc_id)
    client, s, cnpj = await build_client()
    res = await asyncio.to_thread(client.cons_chave, cnpj, s.get("uf") or "SP", doc["chave"])
    await add_log("consulta_chave", res["cStat"], res["xMotivo"], len(res["docs"]), doc["chave"])
    full = [d for d in res["docs"] if d["schema"].startswith(("procNFe", "nfeProc"))]
    if res["cStat"] != 138 or not full:
        raise HTTPException(400, f"XML completo ainda não disponível ({res['cStat']} - {res['xMotivo']}). "
                                 "Após a Ciência da Operação a SEFAZ pode levar alguns minutos para liberar.")
    updated, _ = await store_full_nfe(full[0]["xml"], "sefaz", full[0]["nsu"])
    updated.pop("xml", None)
    return updated
