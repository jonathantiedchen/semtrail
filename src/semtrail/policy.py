from semtrail.catalog import Catalog, Model
from semtrail.config import PolicyConfig
from semtrail.errors import AccessDenied


class Policy:
    def __init__(self, catalog: Catalog, config: PolicyConfig):
        self.models = {
            key: model
            for key, model in catalog.models.items()
            if model.tags.intersection(config.allow_tags_any)
            and not model.tags.intersection(config.deny_tags)
        }

    def require(self, model_id: str) -> Model:
        model = self.models.get(model_id)
        if model is None:
            # Do not reveal whether the forbidden resource exists.
            raise AccessDenied("Model is unavailable under this agent's tag policy.")
        return model

    def discover(self) -> list[dict]:
        # Strip dependency IDs and arbitrary metadata from the agent-visible catalog.
        return [model.public() for model in self.models.values()]
