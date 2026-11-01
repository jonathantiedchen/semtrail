class SemtrailError(Exception):
    """A safe, actionable failure that may be returned to the agent."""


class AccessDenied(SemtrailError):
    pass


class Unsupported(SemtrailError):
    pass
