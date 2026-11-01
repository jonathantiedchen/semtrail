"""Local-first HTTP API and static React UI. No credential configuration over HTTP."""

import secrets
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from semtrail.config import StrictModel
from semtrail.errors import SemtrailError
from semtrail.service import AgentService


class Investigation(StrictModel):
    question: str = Field(min_length=1, max_length=10000)
    previous_run_ids: list[str] = Field(default_factory=list, max_length=6)


def create_app(
    service: AgentService,
    *,
    token: str | None = None,
    allowed_hosts: list[str] | None = None,
    ui_directory: Path | None = None,
) -> FastAPI:
    app = FastAPI(
        title="Semtrail API",
        version="0.1.0",
        description="Investigations grounded in permitted dbt models. Single trusted operator.",
        dependencies=[Depends(HTTPBearer(auto_error=False))] if token else [],
    )
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=allowed_hosts or ["localhost", "127.0.0.1"]
    )

    @app.middleware("http")
    async def boundary(request: Request, call_next):
        if request.url.path.startswith("/api/"):
            if token:
                actual = request.headers.get("authorization", "")
                if not secrets.compare_digest(actual, f"Bearer {token}"):
                    return JSONResponse(
                        {"detail": "A server access token is required."}, status_code=401
                    )
            origin = request.headers.get("origin")
            if origin and origin != f"{request.url.scheme}://{request.headers.get('host')}":
                return JSONResponse(
                    {"detail": "Cross-origin requests are disabled."}, status_code=403
                )
            if request.method == "POST":
                if request.headers.get("content-type", "").split(";")[0] != "application/json":
                    return JSONResponse({"detail": "JSON required."}, status_code=415)
                # Prevent enormous bodies before validation/JSON parsing.
                declared_size = request.headers.get("content-length", "0")
                if not declared_size.isdigit() or int(declared_size) > 50000:
                    return JSONResponse({"detail": "Request too large."}, status_code=413)
                if len(await request.body()) > 50000:
                    return JSONResponse({"detail": "Request too large."}, status_code=413)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
        )
        if request.url.path in {"/docs", "/redoc"}:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "img-src 'self' data: https://fastapi.tiangolo.com; frame-ancestors 'none'"
            )
        return response

    @app.exception_handler(KeyError)
    async def missing(request, exc):
        return JSONResponse({"detail": "Agent or run not found."}, status_code=404)

    @app.exception_handler(SemtrailError)
    async def safe_error(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=400)

    @app.get("/api/health")
    def health():
        return {"status": "ok", "mode": "demo" if service.demo else "live", "version": "0.1.0"}

    @app.get("/api/agents")
    def agents():
        return service.list_agents()

    @app.get("/api/agents/{agent_id}/catalog")
    def catalog(agent_id: str):
        return service.catalog(agent_id)

    @app.post("/api/agents/{agent_id}/investigations")
    def investigate(agent_id: str, body: Investigation):
        if not body.question.strip():
            raise HTTPException(422, "Question must not be empty.")
        return service.investigate(agent_id, body.question, previous_run_ids=body.previous_run_ids)

    @app.get("/api/runs")
    def runs():
        return service.runs()

    @app.get("/api/agents/{agent_id}/runs/{run_id}")
    def run(agent_id: str, run_id: str):
        try:
            return service.run(agent_id, run_id)
        except ValueError as exc:
            raise HTTPException(404, "Run not found.") from exc

    ui = ui_directory or Path(__file__).parent / "static"
    if (ui / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=ui / "assets"), name="assets")

        @app.get("/", include_in_schema=False)
        def index():
            return FileResponse(ui / "index.html")
    else:

        @app.get("/", include_in_schema=False)
        def no_ui():
            return {
                "message": "Build the React UI with npm ci && npm run build in ui/.",
                "api_docs": "/docs",
            }

    return app
