# utils/payload_builder.py
# After submitting a form, it collects all the field values in a dict ready for DB insertion.
def build_payload(form, schema):
    payload = {}
    for field_name in schema.keys():
        if hasattr(form, field_name):
            data = getattr(form, field_name).data
            payload[field_name] = data
    return payload
