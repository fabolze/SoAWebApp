from flask import Blueprint, request, jsonify, abort
from backend.app.config import DATA_DIR, SQLALCHEMY_DATABASE_URI
from backend.app.models.base import Base
from backend.app.db.init_db import engine as main_engine
from sqlalchemy import create_engine
import os
import re

bp = Blueprint('db_admin', __name__)

# Helper to sanitize database names
_name_re = re.compile(r'[^a-zA-Z0-9_]+')

def _db_path(name: str):
    name = _name_re.sub('', name).lower() or 'preview'
    return DATA_DIR / f"db_{name}.sqlite"

@bp.route('/api/db/create', methods=['POST'])
def create_db():
    data = request.get_json(silent=True) or {}
    name = data.get('name', 'preview')
    path = _db_path(name)
    if path.exists():
        abort(400, description='Database already exists')
    engine = create_engine(f'sqlite:///{path}')
    Base.metadata.create_all(bind=engine)
    engine.dispose()
    return jsonify({'status': 'ok', 'path': str(path)})

@bp.route('/api/db/delete', methods=['POST'])
def delete_db():
    data = request.get_json(silent=True) or {}
    name = data.get('name', 'preview')
    path = _db_path(name)
    main_path = SQLALCHEMY_DATABASE_URI.replace('sqlite:///', '')
    if str(path) == main_path:
        abort(400, description='Cannot delete active database')
    if path.exists():
        os.remove(path)
        return jsonify({'status': 'ok'})
    abort(404, description='Database not found')

@bp.route('/api/db/list', methods=['GET'])
def list_dbs():
    files = [f.name for f in DATA_DIR.glob('db_*.sqlite')]
    main_path = SQLALCHEMY_DATABASE_URI.replace('sqlite:///', '')
    main_name = os.path.basename(main_path)
    if (DATA_DIR / main_name).exists():
        files.insert(0, main_name)
    return jsonify({'databases': files, 'active': main_name})


@bp.route('/api/db/reset', methods=['POST'])
def reset_db():
    """Drop and recreate all tables on the active database."""
    Base.metadata.drop_all(bind=main_engine)
    Base.metadata.create_all(bind=main_engine)
    main_engine.dispose()
    return jsonify({'status': 'ok'})
