
import csv
import io
import json
import logging
import os
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from pydantic import ConfigDict


ROOT_DIR = Path(__file__).parent
FRONTEND_BUILD_PATH = ROOT_DIR.parent / "frontend" / "build"
LOCAL_DATA_PATH = ROOT_DIR / "local_data.json"

load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "test_database")
SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_THIS_SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MONGO_STATUS_CACHE_TTL_SECONDS = 10
_mongo_status_cache = {"available": None, "checked_at": None}

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:8000",
        *[origin.strip() for origin in CORS_ORIGINS.split(",") if origin.strip()],
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=1000)
db = client[DB_NAME]
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
security = HTTPBearer()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().isoformat()


def normalize_inventory_category(category: Optional[str]) -> Optional[str]:
    if not category:
        return category

    aliases = {
        "Cleaning": "Limpeza",
        "Limpeza": "Limpeza",
        "Food": "Alimentos",
        "Alimentos": "Alimentos",
        "Office Supplies": "Escritório",
        "Escritório": "Escritório",
        "EscritÃ³rio": "Escritório",
        "EscritÃƒÂ³rio": "Escritório",
    }
    return aliases.get(category, category)


def get_low_stock_limit(unit_type: Optional[str]) -> int:
    """
    Retorna o limite de estoque baixo para cada tipo de unidade.
    
    Args:
        unit_type: Tipo de unidade (Unidades, Litros, Kg, Pacote, Caixas)
    
    Returns:
        int: Limite de estoque baixo para o tipo de unidade
    """
    limits = {
        "Unidades": 5,
        "Litros": 5,
        "Kg": 5,
        "Pacote": 5,
        "Caixas": 2,
    }
    return limits.get(unit_type, 5)  # Retorna 5 como padrão para unidades desconhecidas


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = utc_now() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)           

def build_profile(
    *,
    full_name: str,
    password_hash: str,
    username: Optional[str] = None,
    department: Optional[str] = None,
    role: str = "member",
    profile_id: Optional[str] = None,
    created_at: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "id": profile_id or str(uuid.uuid4()),
        "full_name": full_name,
        "username": username,
        "department": department,
        "role": role,
        "hashed_password": password_hash,
        "is_active": True,
        "created_at": created_at or utc_now_iso(),
    }


def normalize_account_document(document: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(document)
    normalized["_id"] = str(normalized.get("_id") or normalized.get("id") or uuid.uuid4())
    normalized["email"] = str(normalized.get("email", "")).strip().lower()
    normalized["profiles"] = [dict(profile) for profile in normalized.get("profiles", [])]
    normalized["account_id"] = normalized["_id"]

    if normalized["profiles"]:
        for profile in normalized["profiles"]:
            profile["id"] = str(profile.get("id") or uuid.uuid4())
            profile["role"] = profile.get("role") or "member"
            profile["is_active"] = profile.get("is_active", True)
            profile["created_at"] = profile.get("created_at") or utc_now_iso()
        return normalized

    primary_profile = build_profile(
        full_name=normalized.get("full_name") or normalized.get("username") or "Administrador",
        username=normalized.get("username"),
        department=normalized.get("department"),
        password_hash=normalized["hashed_password"],
        role="admin",
    )
    normalized["profiles"] = [primary_profile]
    return normalized


def get_primary_profile(account: Dict[str, Any]) -> Dict[str, Any]:
    """Retorna o perfil primário (preferindo admin) ou o primeiro ativo"""
    profiles = account.get("profiles", [])
    if not profiles:
        raise HTTPException(status_code=500, detail="Conta sem perfis configurados")

    # Preferir admin, depois o primeiro ativo
    for profile in profiles:
        if profile.get("is_active", True) and profile.get("role") == "admin":
            return profile
    
    # Se não houver admin ativo, retornar o primeiro ativo
    active_profiles = [p for p in profiles if p.get("is_active", True)]
    if active_profiles:
        return active_profiles[0]
    
    # Fallback para qualquer profile
    return profiles[0]


def get_profile_by_id(account: Dict[str, Any], profile_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not profile_id:
        return None
    return next((profile for profile in account.get("profiles", []) if profile.get("id") == profile_id), None)


def serialize_actor(account: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "profile_id": profile.get("id"),
        "full_name": profile.get("full_name"),
        "username": profile.get("username"),
        "department": profile.get("department"),
        "role": profile.get("role"),
        "email": account.get("email"),
    }


def build_account_response(account: Dict[str, Any], active_profile: Dict[str, Any]) -> Dict[str, Any]:
    profiles = [
        {
            "id": profile.get("id"),
            "full_name": profile.get("full_name"),
            "username": profile.get("username"),
            "department": profile.get("department"),
            "date_of_birth": profile.get("date_of_birth"),
            "phone_number": profile.get("phone_number"),
            "profile_picture": profile.get("profile_picture"),
            "role": profile.get("role"),
            "is_active": profile.get("is_active", True),
            "created_at": profile.get("created_at"),
        }
        for profile in account.get("profiles", [])
        if profile.get("is_active", True)
    ]
    return {
        "account_id": account["_id"],
        "email": account["email"],
        "full_name": active_profile.get("full_name"),
        "username": active_profile.get("username"),
        "department": active_profile.get("department"),
        "date_of_birth": active_profile.get("date_of_birth"),
        "phone_number": active_profile.get("phone_number"),
        "profile_picture": active_profile.get("profile_picture"),
        "role": active_profile.get("role"),
        "profile_id": active_profile.get("id"),
        "is_admin": active_profile.get("role") == "admin",
        "profiles": profiles,
    }


def attach_common_metadata(
    payload: Dict[str, Any],
    *,
    account: Dict[str, Any],
    actor: Dict[str, Any],
    existing: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    now = utc_now_iso()
    result = dict(payload)
    result["account_id"] = account["_id"]
    result["updated_at"] = now
    result["updated_by"] = actor

    if existing:
        result["created_at"] = existing.get("created_at") or now
        result["created_by"] = existing.get("created_by") or actor
    else:
        result["created_at"] = now
        result["created_by"] = actor

    return result


def serialize_document(document: Dict[str, Any]) -> Dict[str, Any]:
    serialized = dict(document)
    if "_id" in serialized:
        serialized["id"] = serialized.pop("_id")
    if "category" in serialized:
        serialized["category"] = normalize_inventory_category(serialized.get("category"))
    return serialized


def parse_iso_timestamp(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def is_past_event_date(event_date: Optional[datetime], now: datetime) -> bool:
    if not event_date:
        return False
    return event_date.year < now.year or (
        event_date.year == now.year and event_date.month < now.month
    )


async def purge_past_events(current_user: dict) -> int:
    now = utc_now()
    events = await list_collection("events", account_id=current_user["_id"])
    deleted_count = 0
    for event in events:
        event_date = parse_iso_timestamp(event.get("date"))
        if is_past_event_date(event_date, now):
            deleted = await delete_document("events", event.get("_id"))
            if deleted:
                deleted_count += 1
    return deleted_count


def event_sort_key(item: Dict[str, Any]):
    return (item.get("date", ""), item.get("time", ""))


def is_upcoming_event(item: Dict[str, Any], today: date, current_time: str) -> bool:
    event_date = item.get("date", "")
    event_time = item.get("time", "")

    if not event_date:
        return False
    if event_date > today.isoformat():
        return True
    if event_date < today.isoformat():
        return False
    return not event_time or event_time >= current_time


def csv_response(filename: str, rows: List[Dict[str, Any]]) -> StreamingResponse:
    buffer = io.StringIO()
    buffer.write("\ufeff")
    fieldnames = list(rows[0].keys()) if rows else ["id"]
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        cleaned = {
            key: json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else value
            for key, value in row.items()
        }
        writer.writerow(cleaned)
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

class JsonStore:
    def __init__(self, path: Path):
        self.path = path
        self.data = self._load()

    def _default(self) -> Dict[str, List[Dict[str, Any]]]:
        return {"users": [], "events": [], "inventory": [], "audit_logs": []}

    def _load(self) -> Dict[str, List[Dict[str, Any]]]:
        if not self.path.exists():
            return self._default()
        try:
            with self.path.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, json.JSONDecodeError):
            return self._default()
        return {
            "users": data.get("users", []),
            "events": data.get("events", []),
            "inventory": data.get("inventory", []),
            "audit_logs": data.get("audit_logs", []),
        }

    def save(self):
        with self.path.open("w", encoding="utf-8") as fh:
            json.dump(self.data, fh, ensure_ascii=False, indent=2)


json_store = JsonStore(LOCAL_DATA_PATH)


async def mongo_available() -> bool:
    now = utc_now()
    checked_at = _mongo_status_cache["checked_at"]
    cached_available = _mongo_status_cache["available"]

    if (
        checked_at is not None
        and cached_available is not None
        and (now - checked_at).total_seconds() < MONGO_STATUS_CACHE_TTL_SECONDS
    ):
        return cached_available

    try:
        await client.admin.command("ping")
        _mongo_status_cache["available"] = True
        _mongo_status_cache["checked_at"] = now
        return True
    except Exception:
        _mongo_status_cache["available"] = False
        _mongo_status_cache["checked_at"] = now
        return False


async def find_account_by_email(email: str):
    normalized_email = email.strip().lower()
    if await mongo_available():
        account = await db.users.find_one({"email": normalized_email})
        return normalize_account_document(account) if account else None
    account = next((user for user in json_store.data["users"] if user.get("email", "").strip().lower() == normalized_email), None)
    return normalize_account_document(account) if account else None


async def find_account_by_id(account_id: str):
    if await mongo_available():
        account = await db.users.find_one({"_id": account_id})
        return normalize_account_document(account) if account else None
    account = next((user for user in json_store.data["users"] if user.get("_id") == account_id), None)
    return normalize_account_document(account) if account else None


async def insert_account(account_dict: Dict[str, Any]):
    normalized = normalize_account_document(account_dict)
    if await mongo_available():
        await db.users.insert_one(normalized)
        return normalized
    json_store.data["users"].append(normalized)
    json_store.save()
    return normalized


async def replace_account(account_id: str, account_dict: Dict[str, Any]):
    clean_account = dict(account_dict)
    clean_account.pop("_active_profile", None)
    normalized = normalize_account_document(clean_account)
    normalized["_id"] = account_id
    if await mongo_available():
        await db.users.replace_one({"_id": account_id}, normalized, upsert=True)
        return normalized
    updated = False
    for index, item in enumerate(json_store.data["users"]):
        if item.get("_id") == account_id:
            json_store.data["users"][index] = normalized
            updated = True
            break
    if not updated:
        json_store.data["users"].append(normalized)
    json_store.save()
    return normalized


async def list_collection(collection_name: str, *, account_id: Optional[str] = None):
    if await mongo_available():
        query = {"account_id": account_id} if account_id else {}
        return await getattr(db, collection_name).find(query).to_list(length=500)
    items = list(json_store.data[collection_name])
    if not account_id:
        return items
    return [item for item in items if item.get("account_id") in (None, account_id)]


async def find_document(collection_name: str, document_id: str):
    if await mongo_available():
        return await getattr(db, collection_name).find_one({"_id": document_id})
    return next((item for item in json_store.data[collection_name] if item.get("_id") == document_id), None)


async def insert_document(collection_name: str, document: Dict[str, Any]):
    if await mongo_available():
        await getattr(db, collection_name).insert_one(document)
        return
    json_store.data[collection_name].append(document)
    json_store.save()


async def update_document(collection_name: str, document_id: str, document: Dict[str, Any]):
    if await mongo_available():
        await getattr(db, collection_name).replace_one({"_id": document_id}, document, upsert=False)
        return
    for index, item in enumerate(json_store.data[collection_name]):
        if item.get("_id") == document_id:
            json_store.data[collection_name][index] = document
            json_store.save()
            return


async def delete_document(collection_name: str, document_id: str) -> bool:
    if await mongo_available():
        result = await getattr(db, collection_name).delete_one({"_id": document_id})
        return result.deleted_count > 0
    original_count = len(json_store.data[collection_name])
    json_store.data[collection_name] = [
        item for item in json_store.data[collection_name] if item.get("_id") != document_id
    ]
    deleted = len(json_store.data[collection_name]) != original_count
    if deleted:
        json_store.save()
    return deleted


async def add_audit_log(
    *,
    account_id: str,
    actor: Dict[str, Any],
    entity_type: str,
    entity_id: str,
    action: str,
    snapshot: Dict[str, Any],
):
    entry = {
        "_id": str(uuid.uuid4()),
        "account_id": account_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "action": action,
        "actor": actor,
        "occurred_at": utc_now_iso(),
        "snapshot": snapshot,
    }
    await insert_document("audit_logs", entry)


async def get_current_user(
    token: HTTPAuthorizationCredentials = Depends(security),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        account_id: Optional[str] = payload.get("sub")
        profile_id: Optional[str] = payload.get("profile_id")
        if account_id is None:
            raise credentials_exception
    except jwt.PyJWTError as exc:
        raise credentials_exception from exc

    account = await find_account_by_id(account_id)
    if account is None:
        raise credentials_exception

    profile = get_profile_by_id(account, profile_id) or get_primary_profile(account)
    account["_active_profile"] = profile
    return account


def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)):
    active_profile = current_user.get("_active_profile")
    if not active_profile or active_profile.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Apenas o administrador pode acessar este recurso")
    return current_user


class UserBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    email: EmailStr
    full_name: Optional[str] = None
    username: Optional[str] = None
    department: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    profile_id: Optional[str] = None


class ProfileCreate(BaseModel):
    full_name: str
    username: Optional[str] = None
    department: Optional[str] = None
    password: str
    is_admin: bool = False


class Event(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[str] = Field(None, alias="_id")
    event_name: str
    date: str
    time: str
    requester: Optional[str] = None
    department: Optional[str] = None
    notes: Optional[str] = None


class InventoryItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[str] = Field(None, alias="_id")
    product_name: str
    quantity: float
    expiration_date: Optional[str] = None
    price: float
    unit_type: str
    category: str
    added_value: Optional[float] = None
    is_withdrawal: Optional[bool] = False


auth_router = APIRouter(prefix="/api/auth")
api_router = APIRouter(prefix="/api")


@auth_router.post("/register", status_code=201)
async def register(user: UserCreate):
    existing_user = await find_account_by_email(user.email)
    if existing_user:
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")

    password_hash = get_password_hash(user.password)
    account_id = str(uuid.uuid4())
    primary_profile = build_profile(
        full_name=user.full_name or user.username or "Administrador",
        username=user.username,
        department=user.department,
        password_hash=password_hash,
        role="admin",
    )
    account_dict = {
        "_id": account_id,
        "email": user.email.strip().lower(),
        "full_name": user.full_name,
        "username": user.username,
        "department": user.department,
        "hashed_password": password_hash,
        "profiles": [primary_profile],
        "created_at": utc_now_iso(),
    }
    account = await insert_account(account_dict)
    await add_audit_log(
        account_id=account["_id"],
        actor=serialize_actor(account, primary_profile),
        entity_type="account",
        entity_id=account["_id"],
        action="created",
        snapshot={"email": account["email"]},
    )
    return {"msg": "Usuário criado com sucesso"}


@auth_router.get("/account-profiles")
async def get_account_profiles(email: EmailStr):
    account = await find_account_by_email(email)
    if not account:
        return {"profiles": []}

    profiles = []
    for profile in account.get("profiles", []):
        if not profile.get("is_active", True):
            continue
        profiles.append(
            {
                "id": profile.get("id"),
                "full_name": profile.get("full_name"),
                "username": profile.get("username"),
                "department": profile.get("department"),
                "role": profile.get("role"),
            }
        )
    return {"profiles": profiles}


@auth_router.post("/login")
async def login(form_data: UserLogin):
    account = await find_account_by_email(form_data.email)
    if not account:
        raise HTTPException(status_code=400, detail="E-mail ou senha incorretos")

    if form_data.profile_id:
        profile = get_profile_by_id(account, form_data.profile_id)
        if not profile or not profile.get("is_active", True):
            raise HTTPException(status_code=400, detail="Perfil não encontrado")
        if not verify_password(form_data.password, profile["hashed_password"]):
            raise HTTPException(status_code=400, detail="E-mail ou senha incorretos")
        active_profile = profile
    else:
        if not verify_password(form_data.password, account["hashed_password"]):
            raise HTTPException(status_code=400, detail="E-mail ou senha incorretos")
        active_profile = get_primary_profile(account)

    access_token = create_access_token(data={"sub": account["_id"], "profile_id": active_profile["id"]})
    return {"access_token": access_token, "token_type": "bearer"}


@auth_router.get("/me")
@auth_router.get("/profile")
async def read_profile(current_user: dict = Depends(get_current_user)):
    return build_account_response(current_user, current_user["_active_profile"])

@api_router.get("/account/profiles")
async def list_account_profiles(current_user: dict = Depends(require_admin)):
    profiles_list = []
    for profile in current_user.get("profiles", []):
        profiles_list.append({
            "id": profile.get("id"),
            "full_name": profile.get("full_name"),
            "username": profile.get("username"),
            "department": profile.get("department"),
            "role": profile.get("role"),
            "is_admin": profile.get("role") == "admin",
            "is_active": profile.get("is_active"),
            "created_at": profile.get("created_at"),
        })
    return {"profiles": profiles_list}


@api_router.post("/account/profiles", status_code=201)
async def create_account_profile(profile: ProfileCreate, current_user: dict = Depends(require_admin)):
    account = current_user
    if any(
        existing.get("full_name", "").strip().lower() == profile.full_name.strip().lower()
        for existing in account.get("profiles", [])
    ):
        raise HTTPException(status_code=400, detail="Já existe um perfil com esse nome")

    new_profile = build_profile(
        full_name=profile.full_name.strip(),
        username=profile.username.strip() if profile.username else None,
        department=profile.department.strip() if profile.department else None,
        password_hash=get_password_hash(profile.password),
        role="admin" if profile.is_admin else "member",
    )
    account["profiles"].append(new_profile)
    updated_account = await replace_account(account["_id"], account)

    await add_audit_log(
        account_id=updated_account["_id"],
        actor=serialize_actor(updated_account, current_user["_active_profile"]),
        entity_type="profile",
        entity_id=new_profile["id"],
        action="created",
        snapshot={
            "full_name": new_profile["full_name"],
            "username": new_profile.get("username"),
            "department": new_profile.get("department"),
            "role": new_profile["role"],
        },
    )

    logger.info(f"Profile created: {new_profile.get('id')} with role {new_profile.get('role')}")
    return {
        "profile": {
            "id": new_profile["id"],
            "full_name": new_profile["full_name"],
            "username": new_profile.get("username"),
            "department": new_profile.get("department"),
            "role": new_profile["role"],
            "is_admin": new_profile["role"] == "admin",
            "is_active": new_profile["is_active"],
            "created_at": new_profile["created_at"],
        }
    }


@api_router.delete("/account/profiles/{profile_id}", status_code=200)
async def delete_account_profile(profile_id: str, current_user: dict = Depends(require_admin)):
    account = current_user
    profile_to_delete = None
    
    for profile in account.get("profiles", []):
        if profile.get("id") == profile_id:
            profile_to_delete = profile
            break
    
    if not profile_to_delete:
        raise HTTPException(status_code=404, detail="Perfil não encontrado")
    
    # Evitar deletar o perfil ativo
    active_profile = current_user.get("_active_profile")
    active_profile_id = active_profile.get("id") if isinstance(active_profile, dict) else active_profile
    if profile_id == active_profile_id:
        raise HTTPException(status_code=400, detail="Não é possível deletar o perfil ativo")
    
    # Remove o perfil da lista
    account["profiles"] = [p for p in account.get("profiles", []) if p.get("id") != profile_id]
    updated_account = await replace_account(account["_id"], account)

    await add_audit_log(
        account_id=updated_account["_id"],
        actor=serialize_actor(updated_account, current_user["_active_profile"]),
        entity_type="profile",
        entity_id=profile_id,
        action="deleted",
        snapshot={
            "full_name": profile_to_delete.get("full_name"),
            "username": profile_to_delete.get("username"),
            "department": profile_to_delete.get("department"),
            "role": profile_to_delete.get("role"),
        },
    )

    return {"message": "Perfil deletado com sucesso"}


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    department: Optional[str] = None
    date_of_birth: Optional[str] = None
    phone_number: Optional[str] = None
    profile_picture: Optional[str] = None


@api_router.put("/user/profile")
async def update_user_profile(data: ProfileUpdate, current_user: dict = Depends(get_current_user)):
    account = current_user
    active_profile = account.get("_active_profile", {})
    profile_id = active_profile.get("id") if isinstance(active_profile, dict) else active_profile
    
    # Encontrar e atualizar o perfil ativo
    updated_profile = None
    for profile in account.get("profiles", []):
        if profile.get("id") == profile_id:
            update_data = data.model_dump(exclude_unset=True)
            if "full_name" in update_data and data.full_name:
                profile["full_name"] = data.full_name.strip()
            if "department" in update_data:
                profile["department"] = data.department.strip() if data.department else None
            if "date_of_birth" in update_data:
                profile["date_of_birth"] = data.date_of_birth or None
            if "phone_number" in update_data:
                profile["phone_number"] = data.phone_number.strip() if data.phone_number else None
            if "profile_picture" in update_data:
                profile["profile_picture"] = data.profile_picture or None
            updated_profile = profile
            break
    
    await replace_account(account["_id"], account)
    logger.info(f"Profile updated for user {profile_id}")
    
    return {
        "message": "Perfil atualizado com sucesso",
        "profile": {
            "id": updated_profile.get("id") if updated_profile else profile_id,
            "full_name": updated_profile.get("full_name") if updated_profile else None,
            "department": updated_profile.get("department") if updated_profile else None,
            "date_of_birth": updated_profile.get("date_of_birth") if updated_profile else None,
            "phone_number": updated_profile.get("phone_number") if updated_profile else None,
            "profile_picture": updated_profile.get("profile_picture") if updated_profile else None,
        }
    }


@api_router.get("/audit-logs")
async def list_audit_logs(
    entity_type: Optional[str] = None,
    current_user: dict = Depends(require_admin),
):
    logs = await list_collection("audit_logs", account_id=current_user["_id"])
    if entity_type:
        logs = [log for log in logs if log.get("entity_type") == entity_type]
    logs.sort(key=lambda item: item.get("occurred_at", ""), reverse=True)
    return [serialize_document(log) for log in logs]


@api_router.post("/events", status_code=201)
async def create_event(event: Event, current_user: dict = Depends(get_current_user)):
    actor = serialize_actor(current_user, current_user["_active_profile"])
    event_dict = attach_common_metadata(
        event.model_dump(exclude={"id"}),
        account=current_user,
        actor=actor,
    )
    event_dict["_id"] = str(uuid.uuid4())
    await insert_document("events", event_dict)
    await add_audit_log(
        account_id=current_user["_id"],
        actor=actor,
        entity_type="event",
        entity_id=event_dict["_id"],
        action="created",
        snapshot=serialize_document(event_dict),
    )
    logger.info("Event created: %s by %s", event_dict.get("_id"), actor.get("full_name"))
    await manager.broadcast(
        json.dumps({"type": "event_created", "payload": serialize_document(event_dict)})
    )
    return serialize_document(event_dict)


@api_router.get("/events")
async def list_events(current_user: dict = Depends(get_current_user)):
    await purge_past_events(current_user)
    events = await list_collection("events", account_id=current_user["_id"])
    return [serialize_document(event) for event in events]


@api_router.put("/events/{event_id}")
async def update_event(
    event_id: str,
    event: Event,
    current_user: dict = Depends(get_current_user),
):
    existing_event = await find_document("events", event_id)
    if not existing_event or existing_event.get("account_id") not in (None, current_user["_id"]):
        raise HTTPException(status_code=404, detail="Evento não encontrado")

    actor = serialize_actor(current_user, current_user["_active_profile"])
    updated_event = attach_common_metadata(
        event.model_dump(exclude={"id"}),
        account=current_user,
        actor=actor,
        existing=existing_event,
    )
    updated_event["_id"] = event_id
    await update_document("events", event_id, updated_event)
    await add_audit_log(
        account_id=current_user["_id"],
        actor=actor,
        entity_type="event",
        entity_id=event_id,
        action="updated",
        snapshot=serialize_document(updated_event),
    )
    logger.info("Event updated: %s by %s", event_id, actor.get("full_name"))
    await manager.broadcast(
        json.dumps({"type": "event_updated", "payload": serialize_document(updated_event)})
    )
    return serialize_document(updated_event)


@api_router.delete("/events/{event_id}")
async def delete_event(event_id: str, current_user: dict = Depends(get_current_user)):
    existing_event = await find_document("events", event_id)
    if not existing_event or existing_event.get("account_id") not in (None, current_user["_id"]):
        raise HTTPException(status_code=404, detail="Evento não encontrado")

    deleted = await delete_document("events", event_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Evento não encontrado")

    actor = serialize_actor(current_user, current_user["_active_profile"])
    await add_audit_log(
        account_id=current_user["_id"],
        actor=actor,
        entity_type="event",
        entity_id=event_id,
        action="deleted",
        snapshot=serialize_document(existing_event),
    )
    logger.info("Event deleted: %s by %s", event_id, actor.get("full_name"))
    await manager.broadcast(json.dumps({"type": "event_deleted", "payload": {"id": event_id}}))
    return {"msg": "Evento excluído com sucesso"}

@api_router.post("/inventory", status_code=201)
async def create_inventory_item(
    item: InventoryItem,
    current_user: dict = Depends(get_current_user),
):
    actor = serialize_actor(current_user, current_user["_active_profile"])
    item_payload = item.model_dump(exclude={"id"})
    item_payload["category"] = normalize_inventory_category(item_payload.get("category"))
    item_payload["added_value"] = float(item_payload.get("quantity", 0)) * float(item_payload.get("price", 0))
    item_dict = attach_common_metadata(item_payload, account=current_user, actor=actor)
    item_dict["_id"] = str(uuid.uuid4())
    await insert_document("inventory", item_dict)
    await add_audit_log(
        account_id=current_user["_id"],
        actor=actor,
        entity_type="inventory",
        entity_id=item_dict["_id"],
        action="created",
        snapshot=serialize_document(item_dict),
    )
    await manager.broadcast(
        json.dumps({"type": "inventory_created", "payload": serialize_document(item_dict)})
    )
    return serialize_document(item_dict)


@api_router.get("/inventory")
async def list_inventory(current_user: dict = Depends(get_current_user)):
    items = await list_collection("inventory", account_id=current_user["_id"])
    return [serialize_document(item) for item in items]


@api_router.put("/inventory/{item_id}")
async def update_inventory_item(
    item_id: str,
    item: InventoryItem,
    current_user: dict = Depends(get_current_user),
):
    existing_item = await find_document("inventory", item_id)
    if not existing_item or existing_item.get("account_id") not in (None, current_user["_id"]):
        raise HTTPException(status_code=404, detail="Item de estoque não encontrado")

    actor = serialize_actor(current_user, current_user["_active_profile"])
    item_payload = item.model_dump(exclude={"id"})
    item_payload["category"] = normalize_inventory_category(item_payload.get("category"))
    if not item_payload.get("is_withdrawal"):
        item_payload["added_value"] = float(item_payload.get("quantity", 0)) * float(item_payload.get("price", 0))
    else:
        item_payload["added_value"] = existing_item.get("added_value")
    item_payload.pop("is_withdrawal", None)
    updated_item = attach_common_metadata(
        item_payload,
        account=current_user,
        actor=actor,
        existing=existing_item,
    )
    updated_item["_id"] = item_id
    await update_document("inventory", item_id, updated_item)
    await add_audit_log(
        account_id=current_user["_id"],
        actor=actor,
        entity_type="inventory",
        entity_id=item_id,
        action="updated",
        snapshot=serialize_document(updated_item),
    )
    await manager.broadcast(
        json.dumps({"type": "inventory_updated", "payload": serialize_document(updated_item)})
    )
    return serialize_document(updated_item)


@api_router.delete("/inventory/{item_id}")
async def delete_inventory_item(item_id: str, current_user: dict = Depends(get_current_user)):
    existing_item = await find_document("inventory", item_id)
    if not existing_item or existing_item.get("account_id") not in (None, current_user["_id"]):
        raise HTTPException(status_code=404, detail="Item de estoque não encontrado")

    deleted = await delete_document("inventory", item_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Item de estoque não encontrado")

    actor = serialize_actor(current_user, current_user["_active_profile"])
    await add_audit_log(
        account_id=current_user["_id"],
        actor=actor,
        entity_type="inventory",
        entity_id=item_id,
        action="deleted",
        snapshot=serialize_document(existing_item),
    )
    await manager.broadcast(
        json.dumps({"type": "inventory_deleted", "payload": {"id": item_id}})
    )
    return {"msg": "Item de estoque excluído com sucesso"}


@api_router.get("/inventory/categories")
async def inventory_categories(current_user: dict = Depends(get_current_user)):
    items = await list_collection("inventory", account_id=current_user["_id"])
    grouped = defaultdict(list)
    for item in items:
        grouped[item.get("category", "Sem categoria")].append(serialize_document(item))
    return dict(grouped)


@api_router.get("/stats/dashboard")
async def dashboard_stats(current_user: dict = Depends(get_current_user)):
    events = await list_collection("events", account_id=current_user["_id"])
    inventory = await list_collection("inventory", account_id=current_user["_id"])
    serialized_events = [serialize_document(event) for event in events]
    sorted_events = sorted(serialized_events, key=event_sort_key)
    now = datetime.now()
    today = now.date()
    current_time = now.strftime("%H:%M")
    upcoming_events = [
        event for event in sorted_events if is_upcoming_event(event, today, current_time)
    ]
    low_inventory = [
        serialize_document(item) for item in inventory if float(item.get("quantity", 0)) <= get_low_stock_limit(item.get("unit_type"))
    ]
    return {
        "total_events": len(events),
        "total_inventory": len(inventory),
        "upcoming_events": upcoming_events[:5],
        "low_inventory": low_inventory,
    }


@api_router.get("/export/events/csv")
async def export_events_csv(
    current_user: dict = Depends(require_admin),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=1900),
):
    now = utc_now()
    month = month or now.month
    year = year or now.year
    events = [serialize_document(event) for event in await list_collection("events", account_id=current_user["_id"])]
    filtered_events = []
    for event in events:
        if not event.get("date"):
            continue
        event_date = parse_iso_timestamp(event.get("date"))
        if not event_date:
            continue
        if event_date.month == month and event_date.year == year:
            filtered_events.append({
                "id": event.get("id"),
                "event_name": event.get("event_name"),
                "date": event.get("date"),
                "time": event.get("time"),
                "requester": event.get("requester"),
                "department": event.get("department"),
                "notes": event.get("notes"),
                "created_at": event.get("created_at"),
                "updated_at": event.get("updated_at"),
                "created_by": event.get("created_by", {}).get("full_name"),
                "updated_by": event.get("updated_by", {}).get("full_name"),
            })
    return csv_response(f"eventos_{month:02d}_{year}.csv", filtered_events)


@api_router.get("/export/inventory/csv")
async def export_inventory_csv(
    current_user: dict = Depends(require_admin),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=1900),
):
    now = utc_now()
    month = month or now.month
    year = year or now.year
    inventory = [serialize_document(item) for item in await list_collection("inventory", account_id=current_user["_id"])]
    filtered_inventory = []
    for item in inventory:
        created_at = parse_iso_timestamp(item.get("created_at"))
        if not created_at or created_at.month != month or created_at.year != year:
            continue
        filtered_inventory.append({
            "id": item.get("id"),
            "product_name": item.get("product_name"),
            "category": item.get("category"),
            "quantity": item.get("quantity"),
            "unit_type": item.get("unit_type"),
            "price": item.get("price"),
            "expiration_date": item.get("expiration_date"),
            "created_at": item.get("created_at"),
            "updated_at": item.get("updated_at"),
            "created_by": item.get("created_by", {}).get("full_name"),
            "updated_by": item.get("updated_by", {}).get("full_name"),
        })
    return csv_response(f"estoque_{month:02d}_{year}.csv", filtered_inventory)


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info("WebSocket connected: %s", websocket.client)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info("WebSocket disconnected: %s", websocket.client)

    async def broadcast(self, message: str):
        logger.info("Broadcasting message to %d connections", len(self.active_connections))
        logger.debug("Broadcast payload: %s", message)
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except Exception as exc:
                logger.warning("Failed to send message to %s: %s", connection.client, exc)
                if connection in self.active_connections:
                    self.active_connections.remove(connection)


manager = ConnectionManager()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(f"Message from client: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as exc:
        logger.warning("WebSocket error for %s: %s", websocket.client, exc)
        manager.disconnect(websocket)


app.include_router(auth_router)
app.include_router(api_router)


if (FRONTEND_BUILD_PATH / "static").exists():
    app.mount(
        "/static",
        StaticFiles(directory=FRONTEND_BUILD_PATH / "static"),
        name="static",
    )


if (FRONTEND_BUILD_PATH / "index.html").exists():
    @app.get("/")
    async def serve_index():
        return FileResponse(
            FRONTEND_BUILD_PATH / "index.html",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )


    @app.get("/{full_path:path}")
    async def serve_react(full_path: str):
        if full_path.startswith("api/") or full_path == "ws":
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(
            FRONTEND_BUILD_PATH / "index.html",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    logger.info("MongoDB connection closed")
