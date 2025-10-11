from sqlalchemy import Column, Integer, String, Float, ForeignKey, JSON
from sqlalchemy.orm import relationship
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid



class ShopInventory(Base):
    __tablename__ = 'shops_inventory'

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    shop_id = Column(String, ForeignKey('shops.id'), nullable=False)
    item_id = Column(String, ForeignKey('items.id'), nullable=False)

    price_modifier = Column(Float, default=0.0)
    price_multiplier = Column(Float, default=1.0)
    price_override = Column(Float)
    currency_id = Column(String, ForeignKey('currencies.id'))

    stock = Column(Integer)  # null = unlimited
    requirements_id = Column(String, ForeignKey('requirements.id'))
    tags = Column(JSON)  # List of string tags

    shop = relationship("Shop", back_populates="inventory")
    item = relationship("Item")
    currency = relationship("Currency")
    requirements = relationship("Requirement")

    def custom_serialization(self):
        """Attach computed pricing data for serialization."""
        item = getattr(self, "item", None)
        if item is None:
            return {}
        from backend.app.utils.pricing import compute_shop_price

        shop = getattr(self, "shop", None)
        pricing = compute_shop_price(item=item, shop_entry=self, shop=shop)
        return {"pricing": pricing}

