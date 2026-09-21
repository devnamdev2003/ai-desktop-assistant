from fastapi import APIRouter
from app.api.v1.endpoints import auth, users, chat, health

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication & Google OAuth"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(chat.router, prefix="/chat", tags=["AI Chat & History"])
api_router.include_router(health.router, prefix="/health", tags=["Health"])
