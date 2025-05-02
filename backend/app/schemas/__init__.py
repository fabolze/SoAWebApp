import json
import os


SCHEMA_DIR = os.path.dirname(__file__)

def load_schemas():
    schemas = {}
    for file in os.listdir(SCHEMA_DIR):
        if file.endswith(".json"):
            name = file[:-5]  # strip ".json"
            with open(os.path.join(SCHEMA_DIR, file), "r") as f:
                schemas[name] = json.load(f)
    return schemas
