from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Aivora Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "aivora-backend"
    }


@app.post("/api/chat")
def chat(message: dict):
    user_message = message.get("message", "")

    return {
        "response": f"Aivora received: {user_message}"
    }