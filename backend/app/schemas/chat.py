from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class ChatMessageBase(BaseModel):
    sender: str
    text: str


class ChatMessageCreate(ChatMessageBase):
    pass


class ChatMessageRead(ChatMessageBase):
    id: int
    conversation_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationBase(BaseModel):
    title: str = "New Chat"


class ConversationCreate(ConversationBase):
    pass


class ConversationRead(ConversationBase):
    id: int
    user_id: str
    created_at: datetime
    updated_at: datetime
    messages: List[ChatMessageRead] = []

    model_config = ConfigDict(from_attributes=True)


class ChatHistoryItem(BaseModel):
    role: Optional[str] = None
    sender: Optional[str] = None
    text: Optional[str] = None
    content: Optional[str] = None


class ChatRequest(BaseModel):
    question: str
    image: Optional[str] = None
    conversation_id: Optional[int] = None
    stream: Optional[bool] = True
    history: Optional[List[ChatHistoryItem]] = None
    messages: Optional[List[ChatHistoryItem]] = None
    save_to_db: Optional[bool] = False
    custom_instruction: Optional[str] = None
    system_instruction: Optional[str] = None


class ChatResponse(BaseModel):
    question: str
    answer: str
    conversation_id: Optional[int] = None
