from sqlalchemy import Column, Integer, String, Float, ForeignKey, JSON
from sqlalchemy.orm import relationship
from backend.app.models.base import Base



class ShopInventory(Base):
    __tablename__ = 'shops_inventory'

    id = Column(Integer, primary_key=True, autoincrement=True)
    shop_id = Column(String, ForeignKey('shops.id'), nullable=False)
    item_id = Column(String, ForeignKey('items.id'), nullable=False)

    price = Column(Float, nullable=False)
    stock = Column(Integer)  # null = unlimited
    requirements_id = Column(String, ForeignKey('requirements.id'))
    tags = Column(JSON)

    shop = relationship("Shop", back_populates="inventory")
    item = relationship("Item")
    requirements = relationship("Requirement")
