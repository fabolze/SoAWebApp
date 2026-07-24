from typing import Any, Dict, List

from flask import request, jsonify
from sqlalchemy.orm import Session

from backend.app.db.init_db import get_db_session
from backend.app.models.m_effects import Effect
from backend.app.models.m_items import EquipmentSet
from backend.app.routes.base_route import BaseRoute


class EquipmentSetRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=EquipmentSet,
            blueprint_name="equipment_sets",
            route_prefix="/api/equipment-sets",
        )

    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "name"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(
        self,
        db_session: Session,
        equipment_set: EquipmentSet,
        data: Dict[str, Any],
    ) -> None:
        bonuses = data.get("bonuses") or []
        if not isinstance(bonuses, list):
            raise ValueError("bonuses must be an array")

        normalized_bonuses = []
        seen_counts = set()
        for index, raw_bonus in enumerate(bonuses):
            path = f"bonuses[{index}]"
            if not isinstance(raw_bonus, dict):
                raise ValueError(f"{path} must be an object")
            try:
                required_pieces = int(raw_bonus.get("required_pieces"))
            except (TypeError, ValueError) as exc:
                raise ValueError(f"{path}.required_pieces must be an integer") from exc
            if required_pieces < 1:
                raise ValueError(f"{path}.required_pieces must be at least 1")
            if required_pieces in seen_counts:
                raise ValueError(
                    f"bonuses must not repeat the {required_pieces}-piece threshold"
                )
            seen_counts.add(required_pieces)

            effect_ids = raw_bonus.get("effect_ids") or []
            if not isinstance(effect_ids, list) or any(
                not isinstance(effect_id, str) or not effect_id.strip()
                for effect_id in effect_ids
            ):
                raise ValueError(f"{path}.effect_ids must be an array of effect IDs")
            if len(effect_ids) != len(set(effect_ids)):
                raise ValueError(f"{path}.effect_ids must not contain duplicates")
            for effect_id in effect_ids:
                if not db_session.get(Effect, effect_id):
                    raise ValueError(f"Invalid effect_id in {path}: {effect_id}")

            normalized_bonuses.append(
                {
                    "required_pieces": required_pieces,
                    "name": str(raw_bonus.get("name") or "").strip(),
                    "description": str(raw_bonus.get("description") or "").strip(),
                    "effect_ids": effect_ids,
                }
            )

        equipment_set.slug = data["slug"]
        equipment_set.name = data["name"]
        equipment_set.description = data.get("description")
        equipment_set.bonuses = sorted(
            normalized_bonuses,
            key=lambda bonus: bonus["required_pieces"],
        )
        equipment_set.icon_path = data.get("icon_path")
        equipment_set.tags = data.get("tags") or []

    def serialize_item(self, equipment_set: EquipmentSet) -> Dict[str, Any]:
        data = self.serialize_for_export(equipment_set)
        data.update({
            "piece_count": len(equipment_set.items),
            "pieces": [
                {
                    "id": item.id,
                    "slug": item.slug,
                    "name": item.name,
                    "type": item.type.value if item.type else None,
                    "equipment_slot": (
                        item.equipment_slot.value if item.equipment_slot else None
                    ),
                }
                for item in sorted(
                    equipment_set.items,
                    key=lambda item: ((item.name or "").lower(), item.id or ""),
                )
            ],
        })
        return data

    def serialize_for_export(self, equipment_set: EquipmentSet) -> Dict[str, Any]:
        """Serialize only canonical columns; piece summaries are derived API data."""
        return {
            "id": equipment_set.id,
            "slug": equipment_set.slug,
            "name": equipment_set.name,
            "description": equipment_set.description,
            "bonuses": equipment_set.bonuses or [],
            "icon_path": equipment_set.icon_path,
            "tags": equipment_set.tags or [],
        }

    def get_all(self):
        db_session = get_db_session()
        try:
            search = request.args.get("search", "").strip()
            query = db_session.query(self.model)
            if search:
                query = query.filter(
                    (self.model.name.ilike(f"%{search}%"))
                    | (self.model.id.ilike(f"%{search}%"))
                )
            rows = query.order_by(self.model.name, self.model.id).all()
            return jsonify(self.serialize_list(rows))
        finally:
            db_session.close()


bp = EquipmentSetRoute().bp
