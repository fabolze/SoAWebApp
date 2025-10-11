from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_currencies import Currency, CurrencyType
from typing import Any, Dict, List
from sqlalchemy.orm import Session


class CurrencyRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Currency,
            blueprint_name='currencies',
            route_prefix='/api/currencies'
        )

    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "name", "type"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, currency: Currency, data: Dict[str, Any]) -> None:
        self.validate_enums(data, {
            "type": CurrencyType
        })

        currency.slug = data["slug"]
        currency.name = data["name"]
        currency.type = data["type"]
        currency.description = data.get("description")
        currency.code = data.get("code")
        currency.symbol = data.get("symbol")
        currency.decimal_precision = data.get("decimal_precision")
        currency.is_premium = data.get("is_premium", False)
        currency.icon_path = data.get("icon_path")
        currency.tags = data.get("tags", [])

    def serialize_item(self, currency: Currency) -> Dict[str, Any]:
        return self.serialize_model(currency)


bp = CurrencyRoute().bp
