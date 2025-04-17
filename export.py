import pandas as pd
from app import app
from models import db, Item, Effect

def flatten(df, col):
    """Turn nested dicts into dotted columns (stats.armor)."""
    return pd.json_normalize(df[col]).add_prefix(f"{col}.").dropna(axis=1, how="all")

with app.app_context():
    # ---- Items ----
    items = pd.read_sql(Item.query.statement, db.session.bind)
    if not items.empty:
        out = items.drop(columns=["stats","reqs","effects","tags"])
        out = pd.concat([out, flatten(items,"stats"), flatten(items,"reqs")], axis=1)
        out.to_csv("exports/items.csv", index=False)

    # ---- Effects ----
    effects = pd.read_sql(Effect.query.statement, db.session.bind)
    if not effects.empty:
        effects.to_csv("exports/effects.csv", index=False)

print("✅  CSV files written to /exports")
