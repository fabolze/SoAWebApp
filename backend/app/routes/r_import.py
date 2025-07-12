from flask import Blueprint, request, jsonify, abort
from backend.app.models import ALL_MODELS
from backend.app.models.base import Base
from backend.app.db.init_db import get_db_session, engine
from sqlalchemy.types import JSON as JSONType, Enum as EnumType
import csv
import io
import json
import os
import zipfile

# Mapping of table name to model class
TABLE_TO_MODEL = {model.__tablename__: model for model in ALL_MODELS}

bp = Blueprint('data_import', __name__)

def _read_csv(file_obj):
    text = io.TextIOWrapper(file_obj, encoding='utf-8')
    reader = csv.DictReader(text)
    return [row for row in reader]

def _parse_zip(uploaded):
    data = {}
    with zipfile.ZipFile(uploaded.stream) as z:
        for name in z.namelist():
            if name.endswith('.csv'):
                table = os.path.splitext(os.path.basename(name))[0]
                with z.open(name) as f:
                    data[table] = _read_csv(f)
    return data

def _convert_value(column, value):
    if value in (None, ""):
        return None
    if isinstance(column.type, JSONType):
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return None
    if isinstance(column.type, EnumType):
        return column.type.enum_class(value)
    return value

def _create_instance(model, record):
    processed = {}
    for column in model.__table__.columns:
        if column.name in record:
            processed[column.name] = _convert_value(column, record[column.name])
    return model(**processed)

@bp.route('/api/import', methods=['POST'])
def import_data():
    if 'file' not in request.files:
        abort(400, description='No file provided')
    uploaded = request.files['file']
    if uploaded.filename == '':
        abort(400, description='Empty filename')

    try:
        if uploaded.filename.endswith('.zip'):
            parsed = _parse_zip(uploaded)
        elif uploaded.filename.endswith('.csv'):
            table = os.path.splitext(uploaded.filename)[0]
            parsed = {table: _read_csv(uploaded.stream)}
        else:  # assume JSON
            parsed = json.load(uploaded.stream)
            if isinstance(parsed, list):
                table = os.path.splitext(uploaded.filename)[0]
                parsed = {table: parsed}
    except Exception as e:
        abort(400, description=f'Failed to parse file: {e}')

    db_session = get_db_session()
    try:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

        for table in Base.metadata.sorted_tables:
            name = table.name
            if name in parsed:
                model = TABLE_TO_MODEL.get(name)
                if not model:
                    continue
                for record in parsed[name]:
                    instance = _create_instance(model, record)
                    db_session.add(instance)
        db_session.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        db_session.rollback()
        abort(400, description=str(e))
    finally:
        db_session.close()

