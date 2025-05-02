import pkgutil
import importlib
import inspect
from backend.app.models.base import Base

ALL_MODELS = []

# Walk all modules inside the models package
for _, module_name, _ in pkgutil.iter_modules(__path__):
    module = importlib.import_module(f"{__name__}.{module_name}")

    # Find all subclasses of Base (excluding Base itself)
    for name, obj in inspect.getmembers(module, inspect.isclass):
        if issubclass(obj, Base) and obj is not Base:
            ALL_MODELS.append(obj)
