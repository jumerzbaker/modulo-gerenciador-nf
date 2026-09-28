import os
import re
import uuid
import logging
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
from bson import ObjectId
from cryptography.fernet import Fernet
from fastapi import HTTPException, Request, Response
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger("nfe")

mongo_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = mongo_client[os.environ["DB_NAME"]]

JWT_ALGORITHM = "HS256"
fernet = Fernet(os.environ["CERT_ENC_KEY"].encode())


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_utc().isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def only_digits(value) -> str:
    return re.sub(r"\D", "", value or "")


def clean(doc):
    if doc:
        doc.pop("_id", None)
    return doc


def encrypt(data: bytes) -> str:
    return fernet.encrypt(data).decode()


def decrypt(token: str) -> bytes:
    return fernet.decrypt(token.encode())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "type": "access", "exp": now_utc() + timedelta(minutes=15)}
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "type": "refresh", "exp": now_utc() + timedelta(days=7)}
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str, expected_type: str) -> dict:
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sessão expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token inválido")
    if payload.get("type") != expected_type:
        raise HTTPException(401, "Tipo de token inválido")
    return payload


def set_access_cookie(response: Response, token: str):
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=900, path="/")


def set_auth_cookies(response: Response, user_id: str, email: str):
    set_access_cookie(response, create_access_token(user_id, email))
    response.set_cookie("refresh_token", create_refresh_token(user_id), httponly=True, secure=True,
                        samesite="none", max_age=604800, path="/")


def public_user(user: dict) -> dict:
    return {"id": str(user["_id"]), "email": user["email"], "name": user.get("name", ""), "role": user.get("role", "user")}


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Não autenticado")
    payload = decode_token(token, "access")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(401, "Usuário não encontrado")
    return public_user(user)


SETTINGS_ID = "company"


async def get_settings() -> dict:
    doc = await db.settings.find_one({"id": SETTINGS_ID})
    if not doc:
        doc = {"id": SETTINGS_ID, "cnpj": "", "razao_social": "", "uf": "SP", "ambiente": 1,
               "auto_sync": True, "auto_manifest": True, "ult_nsu": 0, "max_nsu": 0,
               "next_sync_at": None, "last_sync_at": None, "cert": None}
        await db.settings.insert_one(dict(doc))
    return clean(doc)
