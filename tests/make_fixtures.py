"""Generate fixtures: sample NF-e XMLs and a self-signed test PFX."""
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12

OUT = Path(__file__).parent / "fixtures"
OUT.mkdir(exist_ok=True)

ITEM = """<det nItem="{n}"><prod><cProd>{cod}</cProd><cEAN>{ean}</cEAN><xProd>{desc}</xProd><NCM>{ncm}</NCM><CFOP>5102</CFOP><uCom>{un}</uCom><qCom>{q}</qCom><vUnCom>{vu}</vUnCom><vProd>{vp}</vProd></prod></det>"""


def nfe(chave, numero, emit_cnpj, emit_nome, dest_cnpj, items):
    dets = "".join(ITEM.format(n=i + 1, **it) for i, it in enumerate(items))
    total = sum(float(it["vp"]) for it in items)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe{chave}" versao="4.00">
<ide><cUF>35</cUF><natOp>VENDA</natOp><mod>55</mod><serie>1</serie><nNF>{numero}</nNF><dhEmi>2026-06-01T10:00:00-03:00</dhEmi></ide>
<emit><CNPJ>{emit_cnpj}</CNPJ><xNome>{emit_nome}</xNome><xFant>Distribuidora</xFant><enderEmit><xMun>Sao Paulo</xMun><UF>SP</UF></enderEmit><IE>123456789</IE></emit>
<dest><CNPJ>{dest_cnpj}</CNPJ><xNome>EMPRESA DESTINO</xNome></dest>
{dets}
<total><ICMSTot><vProd>{total:.2f}</vProd><vFrete>0.00</vFrete><vDesc>0.00</vDesc><vNF>{total:.2f}</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>"""


items1 = [
    {"cod": "A100", "ean": "7891000100103", "desc": "CAFE TORRADO 500G", "ncm": "09012100", "un": "CX", "q": "2.0000", "vu": "120.00", "vp": "240.00"},
    {"cod": "A200", "ean": "SEM GTIN", "desc": "ACUCAR REFINADO 1KG", "ncm": "17019900", "un": "UN", "q": "10.0000", "vu": "4.50", "vp": "45.00"},
    {"cod": "A300", "ean": "7891000300305", "desc": "LEITE INTEGRAL 1L", "ncm": "04012010", "un": "UN", "q": "12.0000", "vu": "5.25", "vp": "63.00"},
]
items2 = [
    {"cod": "A100", "ean": "7891000100103", "desc": "CAFE TORRADO 500G", "ncm": "09012100", "un": "CX", "q": "1.0000", "vu": "130.00", "vp": "130.00"},
    {"cod": "B900", "ean": "SEM GTIN", "desc": "FILTRO DE PAPEL 103", "ncm": "48232000", "un": "PCT", "q": "5.0000", "vu": "6.00", "vp": "30.00"},
]
DEST = "11222333000181"
(OUT / "nfe_exemplo_1.xml").write_text(nfe("35260612345678000195550010000012341000012345", "1234", "12345678000195", "DISTRIBUIDORA ALFA LTDA", DEST, items1))
(OUT / "nfe_exemplo_2.xml").write_text(nfe("35260612345678000195550010000012351000012350", "1235", "12345678000195", "DISTRIBUIDORA ALFA LTDA", DEST, items2))
(OUT / "invalido.xml").write_text("<html>nao e nfe</html>")

key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
name = x509.Name([x509.NameAttribute(x509.NameOID.COMMON_NAME, f"EMPRESA TESTE LTDA:{DEST}")])
cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
        .serial_number(x509.random_serial_number()).not_valid_before(datetime.now(timezone.utc) - timedelta(days=1))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=365)).sign(key, hashes.SHA256()))
pfx = pkcs12.serialize_key_and_certificates(b"teste", key, cert, None, serialization.BestAvailableEncryption(b"teste123"))
(OUT / "certificado_teste.pfx").write_bytes(pfx)
print("fixtures ok", list(OUT.iterdir()))
