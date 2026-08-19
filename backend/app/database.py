import socket

from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings

settings = get_settings()

connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine_kwargs = {
    "pool_pre_ping": True,
    "pool_recycle": 240,
    "pool_size": 10,
    "max_overflow": 10,
}

if not settings.database_url.startswith("sqlite"):
    from sqlalchemy.engine import make_url

    url = make_url(settings.database_url)
    host = url.host or ""
    if host and not host.replace(".", "").isdigit():
        # Force IPv4 — avoids multi-second IPv6 fallback timeouts on some networks
        try:
            infos = socket.getaddrinfo(host, None, socket.AF_INET, socket.SOCK_STREAM)
            if infos:
                connect_args["hostaddr"] = infos[0][4][0]
        except socket.gaierror:
            pass

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    **engine_kwargs,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    if settings.database_url.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app import models  # noqa: F401  (register all models)

    inspector = inspect(engine)
    if not inspector.get_table_names():
        Base.metadata.create_all(bind=engine)