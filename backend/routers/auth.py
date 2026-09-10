"""Authentication router for Google OAuth."""
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from ..services.google_auth import get_credentials, save_credentials

router = APIRouter()


@router.get("/auth/status")
async def auth_status():
    """Check if user is authenticated."""
    creds = get_credentials()
    if creds is None:
        return {"authenticated": False, "message": "No credentials file found"}
    if isinstance(creds, dict) and "auth_url" in creds:
        return {"authenticated": False, "auth_url": creds["auth_url"]}
    return {"authenticated": True}


@router.get("/auth")
async def auth_start():
    """Start Google OAuth flow."""
    creds = get_credentials()
    if creds is None:
        raise HTTPException(status_code=400, detail="credentials.json not found")
    if isinstance(creds, dict) and "auth_url" in creds:
        return RedirectResponse(url=creds["auth_url"])
    return JSONResponse({"message": "Already authenticated"})


@router.get("/auth/callback")
async def auth_callback(code: str = None, state: str = None):
    """Handle OAuth callback."""
    if not code:
        raise HTTPException(status_code=400, detail="No authorization code provided")
    creds = save_credentials(code, state)
    if creds:
        return JSONResponse({"message": "Authentication successful"})
    raise HTTPException(status_code=400, detail="Failed to authenticate")
