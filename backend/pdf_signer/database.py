"""Database setup and models."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column, String, DateTime, Text, Integer, create_engine
)
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import DATABASE_URL


class Base(DeclarativeBase):
    pass


class Certificate(Base):
    """Uploaded or generated digital certificate."""
    __tablename__ = "certificates"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(1024), nullable=False)
    subject_cn = Column(String(255), nullable=True)
    subject_o = Column(String(255), nullable=True)
    issuer_cn = Column(String(255), nullable=True)
    serial_number = Column(String(255), nullable=True)
    not_valid_before = Column(DateTime, nullable=True)
    not_valid_after = Column(DateTime, nullable=True)
    is_self_signed = Column(Integer, default=0)
    key_algorithm = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class SigningRecord(Base):
    """Record of a PDF signing operation."""
    __tablename__ = "signing_records"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    original_filename = Column(String(255), nullable=False)
    original_path = Column(String(1024), nullable=False)
    signed_filename = Column(String(255), nullable=False)
    signed_path = Column(String(1024), nullable=False)
    certificate_id = Column(String(36), nullable=False)
    signer_name = Column(String(255), nullable=True)
    signature_type = Column(String(50), default="visible")  # visible or invisible
    signed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class VerificationRecord(Base):
    """Record of a PDF verification operation."""
    __tablename__ = "verification_records"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String(255), nullable=False)
    file_path = Column(String(1024), nullable=False)
    is_valid = Column(Integer, nullable=False)
    signature_count = Column(Integer, default=0)
    validation_details = Column(Text, nullable=True)  # JSON string
    verified_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# Engine and session
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Create all tables."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """Dependency for FastAPI routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
