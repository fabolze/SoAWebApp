# utils/form_builder.py
from flask_wtf import FlaskForm
from wtforms import StringField, TextAreaField, IntegerField, FloatField, BooleanField, SelectField
from wtforms.validators import Optional

def flatten_schema_properties(properties, parent_key=""):
    fields = {}

    for key, config in properties.items():
        full_key = f"{parent_key}_{key}" if parent_key else key

        if config.get("type") == "object" and "properties" in config:
            nested_fields = flatten_schema_properties(config["properties"], parent_key=full_key)
            fields.update(nested_fields)
        else:
            fields[full_key] = config

    return fields

def generate_form_class(schema):
    class DynamicItemForm(FlaskForm):
        pass

    field_type_map = {
        "text": TextAreaField,
        "textarea": TextAreaField,
        "string": StringField,
        "int": IntegerField,
        "integer": IntegerField,
        "float": FloatField,
        "number": FloatField,
        "bool": BooleanField,
        "boolean": BooleanField,
    }

    flat_fields = flatten_schema_properties(schema["properties"])

    for field_name, config in flat_fields.items():
        label = config.get("ui", {}).get("label", field_name.capitalize())
        widget_type = config.get("ui", {}).get("widget", "text")  # default to text input
        

        # Special case: select dropdown
        if widget_type == "select" or config.get("enum"):
            options = config.get("ui", {}).get("options", config.get("enum", []))
            choices = [(v, v) for v in options]
            setattr(DynamicItemForm, field_name, SelectField(label, choices=choices, validators=[Optional()]))
            continue

        # Special case: multiselect (for arrays)
        if widget_type == "multiselect":
            setattr(DynamicItemForm, field_name, StringField(label, validators=[Optional()]))
            continue

        # Normal fields
        FieldClass = field_type_map.get(widget_type, StringField)
        setattr(DynamicItemForm, field_name, FieldClass(label, validators=[Optional()]))

    return DynamicItemForm
