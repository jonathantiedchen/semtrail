import os

from semtrail.config import ProviderConfig
from semtrail.errors import SemtrailError


def create_model(config: ProviderConfig):
    if not config.model:
        raise SemtrailError("Set llm.model to your provider's model identifier.")
    key = os.environ.get(config.api_key_env)
    if not key:
        raise SemtrailError(f"Set {config.api_key_env} to your own API key.")
    base_url = None
    if config.base_url_env:
        base_url = os.environ.get(config.base_url_env)
        if not base_url:
            raise SemtrailError(f"Set {config.base_url_env} to your provider's API base URL.")
    common = {
        "model": config.model,
        "api_key": key,
        "max_tokens": config.max_tokens,
        "timeout": config.timeout_seconds,
        "max_retries": 1,
    }
    if base_url:
        common["base_url"] = base_url
    if config.provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(**common)
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(**common)
