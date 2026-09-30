import json
from typing import AsyncGenerator, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db, get_optional_user
from app.core.config import settings
from app.models.chat import ChatMessageRecord, Conversation
from app.models.preference import UserPreference
from app.models.user import User
from app.schemas.chat import ChatRequest, ChatResponse, ConversationRead

router = APIRouter()

SYSTEM_INSTRUCTION = (
    "You are Aivora, a high-performance desktop AI assistant. "
    "Provide clear, concise, intelligent, and beautifully structured responses with Markdown formatting."
)


async def stream_gemini_response(
    prompt: str,
    history: Optional[List[dict]] = None,
    custom_instruction: Optional[str] = None,
    image: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """Streams token generations using the official Google Gemini SDK."""
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        yield "Error: GEMINI_API_KEY is not configured on the backend server."
        return

    instruction = SYSTEM_INSTRUCTION
    if custom_instruction and custom_instruction.strip():
        instruction = f"{SYSTEM_INSTRUCTION}\n\nUser Custom Instructions:\n{custom_instruction.strip()}"

    # 1. Primary: Official google-genai SDK
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        contents = []
        if history:
            for msg in history:
                # Accept role or sender, and text or content
                sender_val = msg.get("sender") or msg.get("role") or "user"
                role = "user" if sender_val == "user" else "model"
                text_val = msg.get("text") or msg.get("content") or ""
                if text_val:
                    contents.append(
                        types.Content(
                            role=role,
                            parts=[types.Part.from_text(text=text_val)],
                        )
                    )

        user_parts = [types.Part.from_text(text=prompt)]
        if image:
            import base64
            clean_b64 = image
            mime = "image/jpeg"
            if "," in image:
                header, clean_b64 = image.split(",", 1)
                if ";" in header and "data:" in header:
                    mime = header.split(";")[0].replace("data:", "") or "image/jpeg"
            try:
                img_bytes = base64.b64decode(clean_b64)
                user_parts.append(types.Part.from_bytes(data=img_bytes, mime_type=mime))
            except Exception as b64_err:
                print(f"Error decoding image base64: {b64_err}")

        contents.append(
            types.Content(
                role="user",
                parts=user_parts,
            )
        )

        config = types.GenerateContentConfig(
            system_instruction=instruction,
            temperature=0.7,
            max_output_tokens=2048,
        )
        print("="*40)
        print(contents)
        print("="*40)
        print(instruction)
        print("="*40)
        response_stream = await client.aio.models.generate_content_stream(
            model="gemini-3.5-flash-lite",
            contents=contents,
            config=config,
        )
        async for chunk in response_stream:
            token = chunk.text if chunk and chunk.text else ""
            if token:
                yield token
        return

    except ImportError:
        pass
    except Exception as exc:
        yield f"\n[Gemini Error: {str(exc)}]"
        return

    # 2. Fallback: Legacy google-generativeai SDK if user already has it
    try:
        import google.generativeai as legacy_genai

        legacy_genai.configure(api_key=api_key)
        model = legacy_genai.GenerativeModel(
            model_name="gemini-3.5-flash-lite",
            system_instruction=instruction,
        )
        chat_contents = []
        if history:
            for msg in history:
                role = "user" if msg.get("sender") == "user" else "model"
                chat_contents.append({"role": role, "parts": [msg.get("text", "")]})

        user_legacy_parts = [prompt]
        if image:
            import base64
            clean_b64 = image
            mime = "image/jpeg"
            if "," in image:
                header, clean_b64 = image.split(",", 1)
                if ";" in header and "data:" in header:
                    mime = header.split(";")[0].replace("data:", "") or "image/jpeg"
            try:
                img_bytes = base64.b64decode(clean_b64)
                user_legacy_parts.append({"mime_type": mime, "data": img_bytes})
            except Exception:
                pass

        chat_contents.append({"role": "user", "parts": user_legacy_parts})

        response_stream = await model.generate_content_async(chat_contents, stream=True)
        async for chunk in response_stream:
            token = chunk.text if chunk and chunk.text else ""
            if token:
                yield token
        return

    except Exception as exc:
        yield f"\n[Gemini Error: {str(exc)}]"
        return


async def generate_gemini_response(
    prompt: str,
    history: Optional[List[dict]] = None,
    custom_instruction: Optional[str] = None,
    image: Optional[str] = None,
) -> str:
    """Generates an answer using the official Google Gemini Python library."""
    tokens = []
    async for token in stream_gemini_response(prompt, history=history, custom_instruction=custom_instruction, image=image):
        tokens.append(token)
    return "".join(tokens) or "No response text generated by Gemini."


@router.post("", summary="Send message to AI Assistant")
async def send_chat_message(
    chat_req: ChatRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Processes an AI assistant question directly using Gemini with real-time SSE token streaming."""
    # Check max input words limit if configured
    if settings.MAX_INPUT_WORDS and settings.MAX_INPUT_WORDS > 0:
        words = chat_req.question.strip().split()
        if len(words) > settings.MAX_INPUT_WORDS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Message exceeds limit of {settings.MAX_INPUT_WORDS} words (got {len(words)} words). Please shorten your message.",
            )

    conv_id = chat_req.conversation_id
    history_messages = []

    # 1. First check: Client passed in-memory transient history directly from frontend
    client_history = chat_req.history or chat_req.messages
    if client_history:
        for item in client_history:
            item_dict = item.model_dump() if hasattr(item, "model_dump") else dict(item)
            sender = item_dict.get("sender") or item_dict.get("role") or "user"
            text = item_dict.get("text") or item_dict.get("content") or ""
            if text:
                history_messages.append({"sender": sender, "text": text})

    # 2. Optional: If user explicitly opted into saving to DB and provided an existing conv_id
    should_save_to_db = bool(chat_req.save_to_db and current_user)
    if should_save_to_db and conv_id and not history_messages:
        existing_conv = (
            db.query(Conversation)
            .filter(Conversation.id == conv_id, Conversation.user_id == current_user.id)
            .first()
        )
        if existing_conv:
            prev_records = (
                db.query(ChatMessageRecord)
                .filter(ChatMessageRecord.conversation_id == conv_id)
                .order_by(ChatMessageRecord.created_at.asc())
                .limit(10)
                .all()
            )
            history_messages = [{"sender": r.sender, "text": r.text} for r in prev_records]

    # Only persist conversation if explicitly requested
    if should_save_to_db:
        if conv_id:
            conv = (
                db.query(Conversation)
                .filter(Conversation.id == conv_id, Conversation.user_id == current_user.id)
                .first()
            )
        else:
            conv = None

        if not conv:
            title = chat_req.question.strip()[:40] or "New Chat"
            conv = Conversation(user_id=current_user.id, title=title)
            db.add(conv)
            db.commit()
            db.refresh(conv)

        conv_id = conv.id
        user_msg = ChatMessageRecord(conversation_id=conv.id, sender="user", text=chat_req.question)
        db.add(user_msg)
        db.commit()
    else:
        conv_id = None

    # Resolve custom instruction: priority to request, fallback to database user preference
    effective_instruction = chat_req.custom_instruction or chat_req.system_instruction
    if not effective_instruction and current_user:
        pref = db.query(UserPreference).filter(UserPreference.user_id == current_user.id).first()
        if pref and pref.custom_instruction:
            effective_instruction = pref.custom_instruction

    # Determine if client requested SSE streaming
    accept_header = request.headers.get("accept", "").lower()
    wants_streaming = (chat_req.stream is not False) or ("text/event-stream" in accept_header)

    if wants_streaming:
        async def event_generator():
            accumulated_tokens = []
            try:
                # Initial event to emit immediately
                init_data = json.dumps({"token": "", "conversation_id": None, "done": False})
                yield f"data: {init_data}\n\n"

                # Stream token generation directly from Gemini with in-memory history and custom instruction
                async for token in stream_gemini_response(
                    chat_req.question,
                    history=history_messages,
                    custom_instruction=effective_instruction,
                    image=chat_req.image,
                ):
                    accumulated_tokens.append(token)
                    token_data = json.dumps({"token": token, "conversation_id": None, "done": False})
                    yield f"data: {token_data}\n\n"

                # Record completed assistant message ONLY if should_save_to_db is True
                full_answer = "".join(accumulated_tokens).strip()
                if should_save_to_db and conv_id and full_answer:
                    try:
                        assistant_msg = ChatMessageRecord(
                            conversation_id=conv_id,
                            sender="assistant",
                            text=full_answer,
                        )
                        db.add(assistant_msg)
                        db.commit()
                    except Exception:
                        db.rollback()

                # Completion event
                done_data = json.dumps({
                    "token": "",
                    "answer": full_answer,
                    "conversation_id": None,
                    "done": True,
                })
                yield f"data: {done_data}\n\n"

            except Exception as stream_err:
                err_data = json.dumps({
                    "error": str(stream_err),
                    "conversation_id": None,
                    "done": True,
                })
                yield f"data: {err_data}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "Content-Type": "text/event-stream; charset=utf-8",
            },
        )

    # Fallback to non-streaming response
    custom_inst = chat_req.custom_instruction or chat_req.system_instruction
    answer = await generate_gemini_response(
        chat_req.question,
        history=history_messages,
        custom_instruction=custom_inst,
        image=chat_req.image,
    )
    if should_save_to_db and conv_id:
        assistant_msg = ChatMessageRecord(conversation_id=conv_id, sender="assistant", text=answer)
        db.add(assistant_msg)
        db.commit()

    return ChatResponse(
        question=chat_req.question,
        answer=answer,
        conversation_id=None,
    )


@router.get("/conversations", response_model=List[ConversationRead], summary="List Saved Conversations")
def list_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[ConversationRead]:
    convs = (
        db.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
        .all()
    )
    return [ConversationRead.model_validate(c) for c in convs]


@router.get("/conversations/{conversation_id}", response_model=ConversationRead, summary="Get Conversation Messages")
def get_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationRead:
    conv = (
        db.query(Conversation)
        .filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
        .first()
    )
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return ConversationRead.model_validate(conv)


@router.delete("/conversations/{conversation_id}", summary="Delete Conversation")
def delete_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    conv = (
        db.query(Conversation)
        .filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
        .first()
    )
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    db.delete(conv)
    db.commit()
    return {"message": "Conversation deleted"}
