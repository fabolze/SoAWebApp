from flask import Blueprint, request, Response, abort
import csv
import json
import io
import zipfile
import enum
from backend.app.db.init_db import get_db_session
from backend.app.models import ALL_MODELS

bp = Blueprint('export', __name__)

def serialize_row(row):
    data = {}
    for column in row.__table__.columns:
        value = getattr(row, column.name)
        if isinstance(value, enum.Enum):
            data[column.name] = value.value
        else:
            data[column.name] = value
    # Unreal Engine DataTables expect a 'Name' key
    data['Name'] = data.get('id')
    return data

@bp.route('/api/export')
def export_data():
    fmt = request.args.get('format', 'csv').lower()
    tables_param = request.args.get('tables')
    selected = {t.strip() for t in tables_param.split(',')} if tables_param else None
    db_session = get_db_session()
    try:
        if fmt == 'json':
            payload = {}
            for model in ALL_MODELS:
                table_name = model.__tablename__
                if selected and table_name not in selected:
                    continue
                rows = db_session.query(model).all()
                payload[table_name] = [serialize_row(r) for r in rows]
            json_bytes = json.dumps(payload, indent=2).encode('utf-8')
            return Response(
                json_bytes,
                mimetype='application/json',
                headers={'Content-Disposition': 'attachment; filename=export.json'}
            )
        else:
            memory_file = io.BytesIO()
            with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
                for model in ALL_MODELS:
                    table_name = model.__tablename__
                    if selected and table_name not in selected:
                        continue
                    rows = db_session.query(model).all()
                    if not rows:
                        continue
                    cols = [c.name for c in model.__table__.columns if c.name != 'id']
                    headers = ['Name'] + cols
                    csv_buffer = io.StringIO()
                    writer = csv.DictWriter(csv_buffer, fieldnames=headers)
                    writer.writeheader()
                    for r in rows:
                        data = serialize_row(r)
                        row_dict = {'Name': data['Name']}
                        for c in cols:
                            val = data.get(c)
                            if isinstance(val, (list, dict)):
                                row_dict[c] = json.dumps(val)
                            else:
                                row_dict[c] = val
                        writer.writerow(row_dict)
                    zf.writestr(f'{table_name}.csv', csv_buffer.getvalue())
            memory_file.seek(0)
            return Response(
                memory_file.getvalue(),
                mimetype='application/zip',
                headers={'Content-Disposition': 'attachment; filename=export.zip'}
            )
    finally:
        db_session.close()

