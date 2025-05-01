from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class ShopInventory(Base):
    __tablename__ = 'shop_inventory'

    id = Column(Integer, primary_key=True, autoincrement=True)
    shop_id = Column(String, ForeignKey('shops.shop_id'), nullable=False)
    item_id = Column(String, ForeignKey('items.id'), nullable=False)

    price = Column(Float, nullable=False)
    stock = Column(Integer)  # null = unlimited
    requirements_id = Column(String, ForeignKey('requirements.id'))

    shop = relationship("Shop", back_populates="inventory")
    item = relationship("Item")
    requirements = relationship("Requirement")
