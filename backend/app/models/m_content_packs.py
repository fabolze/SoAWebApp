# backend/app/models/m_content_packs.py

from sqlalchemy import Column, String, Text, Boolean, JSON
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid


class ContentPack(Base):
    __tablename__ = 'content_packs'

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)

    description = Column(Text)
    release_date = Column(String)  # ISO string (YYYY-MM-DD) or free-form
    status = Column(String)  # e.g., Planned, Released, Archived
    is_active = Column(Boolean, default=True)

    tags = Column(JSON)
