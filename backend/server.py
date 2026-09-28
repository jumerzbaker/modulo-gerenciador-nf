from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import asyncio
import logging
import os

from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

from core import db, mongo_client
from routes_auth import router as auth_router, seed_admin
from routes_catalog import router as catalog_router
from routes_docs import router as docs_router
from routes_settings import router as settings_router
from sefaz import auto_sync_loop

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

app = FastAPI(title="Importação de Compras NF-e")
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"status": "ok"}


for r in (auth_router, settings_router, docs_router, catalog_router):
    api.include_router(r)
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ["FRONTEND_URL"]],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.nfe_documents.create_index("chave", unique=True)
    await db.nfe_documents.create_index("id", unique=True)
    await db.products.create_index("id", unique=True)
    await db.suppliers.create_index("id", unique=True)
    await db.purchases.create_index("id", unique=True)
    await seed_admin()
    app.state.sync_task = asyncio.create_task(auto_sync_loop())


@app.on_event("shutdown")
async def shutdown():
    app.state.sync_task.cancel()
    mongo_client.close()
