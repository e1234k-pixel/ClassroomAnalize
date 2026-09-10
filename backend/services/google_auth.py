"""Google OAuth2 authentication service."""
import os
import json
from pathlib import Path
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# Scopes needed for Classroom API
SCOPES = [
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.rosters.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.students.readonly",
    "https://www.googleapis.com/auth/classroom.student-submissions.students.readonly",
    "https://www.googleapis.com/auth/classroom.announcements.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "credentials.json")
TOKEN_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "token.json")


def get_credentials():
    """Get valid Google OAuth2 credentials."""
    creds = None
    
    # Load existing token
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    
    # If no valid credentials, need to authorize
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CREDENTIALS_FILE):
                return None
            flow = Flow.from_client_secrets_file(CREDENTIALS_FILE, scopes=SCOPES)
            flow.redirect_uri = "http://localhost:8000/auth/callback"
            auth_url, _ = flow.authorization_url(prompt="consent")
            return {"auth_url": auth_url}
        
        # Save token
        with open(TOKEN_FILE, "w") as token:
            token.write(creds.to_json())
    
    return creds


def save_credentials(code: str, state: str = None):
    """Exchange authorization code for credentials."""
    if not os.path.exists(CREDENTIALS_FILE):
        return None
    
    flow = Flow.from_client_secrets_file(CREDENTIALS_FILE, scopes=SCOPES)
    flow.redirect_uri = "http://localhost:8000/auth/callback"
    flow.fetch_token(code=code)
    
    creds = flow.credentials
    with open(TOKEN_FILE, "w") as token:
        token.write(creds.to_json())
    
    return creds


def get_classroom_service():
    """Get Google Classroom API service."""
    creds = get_credentials()
    if creds is None or isinstance(creds, dict):
        return creds
    return build("classroom", "v1", credentials=creds)


def get_drive_service():
    """Get Google Drive API service."""
    creds = get_credentials()
    if creds is None or isinstance(creds, dict):
        return creds
    return build("drive", "v3", credentials=creds)
