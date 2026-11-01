from pathlib import Path

import pytest

from semtrail.catalog import Catalog
from semtrail.config import AgentConfig
from semtrail.demo import create_demo
from semtrail.policy import Policy


@pytest.fixture
def demo(tmp_path):
    paths = create_demo(tmp_path / "demo")
    config = AgentConfig.load(paths["revenue"])
    catalog = Catalog(Path(config.manifest), Path(config.semantic_manifest))
    return config, catalog, Policy(catalog, config.policy)
