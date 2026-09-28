import asyncio
import base64
import gzip
import hashlib
import os
import re
import tempfile
from datetime import datetime, timedelta, timezone

import requests
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import pkcs12
from fastapi import HTTPException
from lxml import etree

from core import db, decrypt, get_settings, new_id, now_iso, now_utc, only_digits, logger, SETTINGS_ID
from nfe_parser import parse_nfe_xml, parse_res_nfe

NS = "http://www.portalfiscal.inf.br/nfe"
DS = "http://www.w3.org/2000/09/xmldsig#"
SOAP = "http://www.w3.org/2003/05/soap-envelope"
WS_DIST = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"
WS_EVT = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"
C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
BRT = timezone(timedelta(hours=-3))
UF_CODES = {"RO": 11, "AC": 12, "AM": 13, "RR": 14, "PA": 15, "AP": 16, "TO": 17, "MA": 21, "PI": 22, "CE": 23,
            "RN": 24, "PB": 25, "PE": 26, "AL": 27, "SE": 28, "BA": 29, "MG": 31, "ES": 32, "RJ": 33, "SP": 35,
            "PR": 41, "SC": 42, "RS": 43, "MS": 50, "MT": 51, "GO": 52, "DF": 53}

_sync_lock = asyncio.Lock()


def load_certificate(pfx: bytes, password: str) -> dict:
    """Validate an A1 PFX and return its public info."""
    try:
        key, cert, _ = pkcs12.load_key_and_certificates(pfx, password.encode(), None)
    except Exception:
        raise HTTPException(400, "Não foi possível abrir o certificado. Verifique o arquivo e a senha.")
    if not key or not cert:
        raise HTTPException(400, "Certificado sem chave privada")
    subject = cert.subject.rfc4514_string()
    cn = cert.subject.get_attributes_for_oid(x509.NameOID.COMMON_NAME)
    cn_value = cn[0].value if cn else subject
    match = re.search(r"(\d{14})", cn_value)
    return {"subject": cn_value, "issuer": cert.issuer.rfc4514_string(), "cnpj": match.group(1) if match else "",
            "not_before": cert.not_valid_before_utc.isoformat(), "not_after": cert.not_valid_after_utc.isoformat()}


class SefazClient:
    def __init__(self, pfx: bytes, password: str, ambiente: int):
        key, cert, _ = pkcs12.load_key_and_certificates(pfx, password.encode(), None)
        if cert.not_valid_after_utc <= now_utc():
            raise HTTPException(400, "Certificado digital expirado")
        self.key = key
        self.cert_pem = cert.public_bytes(serialization.Encoding.PEM)
        self.cert_der_b64 = base64.b64encode(cert.public_bytes(serialization.Encoding.DER)).decode()
        self.key_pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
                                         serialization.NoEncryption())
        self.tp_amb = ambiente
        suffix = "PROD" if ambiente == 1 else "HOM"
        self.dist_url = os.environ[f"SEFAZ_DIST_URL_{suffix}"]
        self.event_url = os.environ[f"SEFAZ_EVENT_URL_{suffix}"]

    def _post(self, url: str, body_el) -> etree._Element:
        env = etree.Element(etree.QName(SOAP, "Envelope"), nsmap={"soap12": SOAP})
        etree.SubElement(env, etree.QName(SOAP, "Body")).append(body_el)
        xml = etree.tostring(env, xml_declaration=True, encoding="UTF-8")
        cert_f = tempfile.NamedTemporaryFile(delete=False, suffix=".pem")
        key_f = tempfile.NamedTemporaryFile(delete=False, suffix=".pem")
        try:
            os.chmod(cert_f.name, 0o600)
            os.chmod(key_f.name, 0o600)
            cert_f.write(self.cert_pem)
            key_f.write(self.key_pem)
            cert_f.close()
            key_f.close()
            try:
                r = requests.post(url, data=xml, cert=(cert_f.name, key_f.name), timeout=(15, 90),
                                  headers={"Content-Type": "application/soap+xml; charset=utf-8"})
            except requests.RequestException as e:
                raise HTTPException(400, f"Falha de comunicação com a SEFAZ: {type(e).__name__}")
            if r.status_code == 403:
                raise HTTPException(400, "A SEFAZ recusou o certificado (HTTP 403). Use um e-CNPJ A1 ICP-Brasil válido.")
            try:
                return etree.fromstring(r.content)
            except etree.XMLSyntaxError:
                raise HTTPException(400, f"Resposta inválida da SEFAZ (HTTP {r.status_code})")
        finally:
            for f in (cert_f.name, key_f.name):
                try:
                    os.unlink(f)
                except FileNotFoundError:
                    pass

    def _dist(self, cnpj: str, uf: str, query_el) -> dict:
        root = etree.Element(etree.QName(NS, "distDFeInt"), nsmap={None: NS}, versao="1.01")
        etree.SubElement(root, etree.QName(NS, "tpAmb")).text = str(self.tp_amb)
        etree.SubElement(root, etree.QName(NS, "cUFAutor")).text = str(UF_CODES.get(uf, 91))
        etree.SubElement(root, etree.QName(NS, "CNPJ")).text = cnpj
        root.append(query_el)
        op = etree.Element(etree.QName(WS_DIST, "nfeDistDFeInteresse"), nsmap={None: WS_DIST})
        etree.SubElement(op, etree.QName(WS_DIST, "nfeDadosMsg")).append(root)
        resp = self._post(self.dist_url, op)
        ret = resp.xpath("//*[local-name()='retDistDFeInt']")
        if not ret:
            fault = resp.xpath("string(//*[local-name()='Text' or local-name()='faultstring'])")
            raise HTTPException(400, f"SEFAZ retornou erro: {fault or 'resposta inesperada'}")
        ret = ret[0]
        t = lambda n: ret.xpath(f"string(./*[local-name()='{n}'])")
        out = {"cStat": int(t("cStat") or 0), "xMotivo": t("xMotivo"), "ultNSU": int(t("ultNSU") or 0),
               "maxNSU": int(t("maxNSU") or 0), "docs": []}
        for z in ret.xpath(".//*[local-name()='docZip']"):
            raw = gzip.decompress(base64.b64decode((z.text or "").strip()))
            out["docs"].append({"nsu": int(z.get("NSU") or 0), "schema": z.get("schema") or "", "xml": raw})
        return out

    def dist_nsu(self, cnpj: str, uf: str, ult_nsu: int) -> dict:
        q = etree.Element(etree.QName(NS, "distNSU"))
        etree.SubElement(q, etree.QName(NS, "ultNSU")).text = f"{ult_nsu:015d}"
        return self._dist(cnpj, uf, q)

    def cons_chave(self, cnpj: str, uf: str, chave: str) -> dict:
        q = etree.Element(etree.QName(NS, "consChNFe"))
        etree.SubElement(q, etree.QName(NS, "chNFe")).text = chave
        return self._dist(cnpj, uf, q)

    def _sign(self, evento, inf):
        digest = base64.b64encode(hashlib.sha1(etree.tostring(inf, method="c14n")).digest()).decode()
        sig = etree.Element(etree.QName(DS, "Signature"), nsmap={None: DS})
        si = etree.SubElement(sig, etree.QName(DS, "SignedInfo"))
        etree.SubElement(si, etree.QName(DS, "CanonicalizationMethod"), Algorithm=C14N)
        etree.SubElement(si, etree.QName(DS, "SignatureMethod"), Algorithm=DS + "rsa-sha1")
        ref = etree.SubElement(si, etree.QName(DS, "Reference"), URI="#" + inf.get("Id"))
        tr = etree.SubElement(ref, etree.QName(DS, "Transforms"))
        etree.SubElement(tr, etree.QName(DS, "Transform"), Algorithm=DS + "enveloped-signature")
        etree.SubElement(tr, etree.QName(DS, "Transform"), Algorithm=C14N)
        etree.SubElement(ref, etree.QName(DS, "DigestMethod"), Algorithm=DS + "sha1")
        etree.SubElement(ref, etree.QName(DS, "DigestValue")).text = digest
        signature = self.key.sign(etree.tostring(si, method="c14n"), padding.PKCS1v15(), hashes.SHA1())
        etree.SubElement(sig, etree.QName(DS, "SignatureValue")).text = base64.b64encode(signature).decode()
        ki = etree.SubElement(sig, etree.QName(DS, "KeyInfo"))
        x5 = etree.SubElement(ki, etree.QName(DS, "X509Data"))
        etree.SubElement(x5, etree.QName(DS, "X509Certificate")).text = self.cert_der_b64
        evento.append(sig)

    def manifest_ciencia(self, cnpj: str, chave: str) -> dict:
        E = lambda parent, tag, text=None, **attrs: _sub(parent, tag, text, **attrs)
        env = etree.Element(etree.QName(NS, "envEvento"), nsmap={None: NS}, versao="1.00")
        E(env, "idLote", str(int(now_utc().timestamp() * 1000))[-15:])
        evento = E(env, "evento", versao="1.00")
        inf = E(evento, "infEvento", Id=f"ID210210{chave}01")
        E(inf, "cOrgao", "91")
        E(inf, "tpAmb", str(self.tp_amb))
        E(inf, "CNPJ", cnpj)
        E(inf, "chNFe", chave)
        E(inf, "dhEvento", datetime.now(BRT).isoformat(timespec="seconds"))
        E(inf, "tpEvento", "210210")
        E(inf, "nSeqEvento", "1")
        E(inf, "verEvento", "1.00")
        det = E(inf, "detEvento", versao="1.00")
        E(det, "descEvento", "Ciencia da Operacao")
        self._sign(evento, inf)
        msg = etree.Element(etree.QName(WS_EVT, "nfeDadosMsg"), nsmap={None: WS_EVT})
        msg.append(env)
        resp = self._post(self.event_url, msg)
        ret_ev = resp.xpath("//*[local-name()='retEvento']/*[local-name()='infEvento']")
        node = ret_ev[0] if ret_ev else (resp.xpath("//*[local-name()='retEnvEvento']") or [resp])[0]
        return {"cStat": int(node.xpath("string(./*[local-name()='cStat'])") or 0),
                "xMotivo": node.xpath("string(./*[local-name()='xMotivo'])") or "Resposta inesperada"}


def _sub(parent, tag, text=None, **attrs):
    el = etree.SubElement(parent, etree.QName(NS, tag), **attrs)
    if text is not None:
        el.text = text
    return el


async def build_client():
    s = await get_settings()
    if not s.get("cert"):
        raise HTTPException(400, "Envie o Certificado Digital A1 em Configurações")
    cnpj = only_digits(s.get("cnpj"))
    if len(cnpj) != 14:
        raise HTTPException(400, "Informe o CNPJ da empresa em Configurações")
    pfx = decrypt(s["cert"]["pfx_enc"])
    pwd = decrypt(s["cert"]["pwd_enc"]).decode()
    return SefazClient(pfx, pwd, int(s.get("ambiente") or 1)), s, cnpj


async def add_log(kind: str, cstat: int, motivo: str, docs: int = 0, detail: str = ""):
    await db.sync_logs.insert_one({"id": new_id(), "at": now_iso(), "tipo": kind, "cstat": cstat,
                                   "motivo": motivo, "docs": docs, "detalhe": detail})


def _serie_numero(chave: str):
    if len(chave) == 44:
        return chave[22:25].lstrip("0") or "0", chave[25:34].lstrip("0") or "0"
    return "", ""


async def store_full_nfe(xml_bytes: bytes, source: str, nsu: int = None) -> tuple:
    """Insert or upgrade a document with a full NF-e XML. Returns (doc, created)."""
    data = parse_nfe_xml(xml_bytes)
    if len(data["chave"]) != 44:
        raise ValueError("Chave de acesso não encontrada no XML")
    items = data.pop("items")
    existing = await db.nfe_documents.find_one({"chave": data["chave"]}, {"_id": 0, "xml": 0})
    fields = {**data, "items": items, "xml": xml_bytes.decode("utf-8", errors="replace"), "has_xml": True,
              "updated_at": now_iso()}
    if existing:
        if existing["status"] not in ("importada", "cancelada"):
            fields["status"] = "xml_completo"
        if nsu:
            fields["nsu"] = nsu
        await db.nfe_documents.update_one({"chave": data["chave"]}, {"$set": fields})
        return {**existing, **fields}, False
    doc = {"id": new_id(), "source": source, "status": "xml_completo", "nsu": nsu, "manifest_status": None,
           "manifest_msg": "", "purchase_id": None, "created_at": now_iso(), **fields}
    await db.nfe_documents.insert_one(dict(doc))
    return doc, True


async def _store_summary(root, nsu: int):
    data = parse_res_nfe(root)
    if len(data["chave"]) != 44:
        return
    if await db.nfe_documents.find_one({"chave": data["chave"]}, {"_id": 1}):
        return
    data["serie"], data["numero"] = _serie_numero(data["chave"])
    status = "cancelada" if data.get("situacao") == "3" else "resumo"
    await db.nfe_documents.insert_one({"id": new_id(), "source": "sefaz", "status": status, "nsu": nsu,
                                       "has_xml": False, "xml": None, "manifest_status": None, "manifest_msg": "",
                                       "purchase_id": None, "dest_cnpj": "", "created_at": now_iso(),
                                       "updated_at": now_iso(), **data})


async def _process_doc(d: dict):
    schema = d["schema"]
    if schema.startswith("procNFe") or schema.startswith("nfeProc"):
        await store_full_nfe(d["xml"], "sefaz", d["nsu"])
        return
    root = etree.fromstring(d["xml"])
    if schema.startswith("resNFe"):
        await _store_summary(root, d["nsu"])
    elif "Evento" in schema:
        tp = root.xpath("string(//*[local-name()='tpEvento'])")
        chave = root.xpath("string(//*[local-name()='chNFe'])")
        if tp == "110111" and chave:
            await db.nfe_documents.update_one({"chave": chave, "status": {"$ne": "importada"}},
                                              {"$set": {"status": "cancelada", "updated_at": now_iso()}})


async def manifest_document(client, cnpj: str, doc: dict) -> dict:
    res = await asyncio.to_thread(client.manifest_ciencia, cnpj, doc["chave"])
    ok = res["cStat"] in (135, 136, 573)
    await db.nfe_documents.update_one({"id": doc["id"]}, {"$set": {
        "manifest_status": "ciencia" if ok else "erro", "manifest_msg": f"{res['cStat']} - {res['xMotivo']}",
        "status": "manifestada" if ok and doc["status"] == "resumo" else doc["status"], "updated_at": now_iso()}})
    await add_log("manifestacao", res["cStat"], res["xMotivo"], 0, doc["chave"])
    return {**res, "ok": ok}


async def run_sync(force: bool = False) -> dict:
    if _sync_lock.locked():
        raise HTTPException(409, "Uma sincronização já está em andamento")
    async with _sync_lock:
        client, s, cnpj = await build_client()
        nxt = s.get("next_sync_at")
        if nxt and datetime.fromisoformat(nxt) > now_utc() and not force:
            raise HTTPException(429, f"A SEFAZ só permite nova consulta após {datetime.fromisoformat(nxt).astimezone(BRT).strftime('%H:%M')} (regra de consumo indevido)")
        ult = int(s.get("ult_nsu") or 0)
        total_docs, last = 0, {"cStat": 0, "xMotivo": ""}
        for _ in range(30):
            last = await asyncio.to_thread(client.dist_nsu, cnpj, s.get("uf") or "SP", ult)
            await add_log("distribuicao", last["cStat"], last["xMotivo"], len(last["docs"]), f"ultNSU {ult}")
            if last["cStat"] != 138:
                break
            for d in last["docs"]:
                try:
                    await _process_doc(d)
                except Exception as e:
                    logger.warning("Falha ao processar NSU %s: %s", d["nsu"], e)
            total_docs += len(last["docs"])
            ult = last["ultNSU"]
            await db.settings.update_one({"id": SETTINGS_ID}, {"$set": {"ult_nsu": ult, "max_nsu": last["maxNSU"]}})
            if ult >= last["maxNSU"]:
                break
        update = {"last_sync_at": now_iso(), "last_sync_msg": f"{last['cStat']} - {last['xMotivo']}"}
        wait = timedelta(hours=1, minutes=1) if last["cStat"] in (137, 138, 656) else timedelta(minutes=15)
        update["next_sync_at"] = (now_utc() + wait).isoformat()
        await db.settings.update_one({"id": SETTINGS_ID}, {"$set": update})
        manifested = 0
        if s.get("auto_manifest") and last["cStat"] in (137, 138):
            pending = await db.nfe_documents.find({"status": "resumo", "manifest_status": None},
                                                  {"_id": 0, "xml": 0}).to_list(200)
            for doc in pending:
                try:
                    if (await manifest_document(client, cnpj, doc))["ok"]:
                        manifested += 1
                except HTTPException as e:
                    logger.warning("Falha na manifestação %s: %s", doc["chave"], e.detail)
        if last["cStat"] not in (137, 138):
            raise HTTPException(400, f"SEFAZ: {last['cStat']} - {last['xMotivo']}")
        return {"cstat": last["cStat"], "motivo": last["xMotivo"], "documentos": total_docs,
                "manifestadas": manifested, "ult_nsu": ult}


async def auto_sync_loop():
    while True:
        await asyncio.sleep(120)
        try:
            s = await get_settings()
            nxt = s.get("next_sync_at")
            if s.get("auto_sync") and s.get("cert") and (not nxt or datetime.fromisoformat(nxt) <= now_utc()):
                await run_sync()
        except HTTPException as e:
            logger.info("Auto-sync: %s", e.detail)
        except Exception as e:
            logger.exception("Auto-sync falhou: %s", e)
