"""
Chat API Endpoints
채팅 관련 API
"""

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import json

from app.db.database import get_db
from app.api.deps import get_current_active_user
from app.models.user import User
from app.models.chat import ChatRoom, ChatMessage, ChatParticipant, MessageReadReceipt, RoomType
from app.schemas.chat import (
    ChatRoomCreate,
    ChatRoomUpdate,
    ChatRoomResponse,
    ChatRoomListResponse,
    ChatMessageCreate,
    ChatMessageResponse,
    ChatMessageListResponse,
    ChatUserInfo,
    ChatParticipantResponse,
)

router = APIRouter()


# WebSocket 연결 관리
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict = {}  # room_id: [websockets]

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            self.active_connections[room_id].remove(websocket)

    async def broadcast(self, message: dict, room_id: str):
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                try:
                    await connection.send_json(message)
                except:
                    pass


manager = ConnectionManager()


# 채팅방 목록 조회
@router.get("/rooms", response_model=ChatRoomListResponse)
def get_chat_rooms(
    type: Optional[RoomType] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """사용자가 참여 중인 채팅방 목록 조회"""
    query = db.query(ChatRoom).join(ChatParticipant).filter(
        ChatParticipant.user_id == current_user.id,
        ChatParticipant.left_at.is_(None),
    )

    if type:
        query = query.filter(ChatRoom.type == type)

    total = query.count()
    rooms = query.offset(skip).limit(limit).all()

    # 각 방의 읽지 않은 메시지 수 계산
    room_responses = []
    for room in rooms:
        participant = db.query(ChatParticipant).filter(
            ChatParticipant.room_id == room.id,
            ChatParticipant.user_id == current_user.id,
        ).first()

        unread_count = 0
        if participant and participant.last_read_at:
            unread_count = db.query(ChatMessage).filter(
                ChatMessage.room_id == room.id,
                ChatMessage.created_at > participant.last_read_at,
                ChatMessage.user_id != current_user.id,
            ).count()
        else:
            unread_count = db.query(ChatMessage).filter(
                ChatMessage.room_id == room.id,
                ChatMessage.user_id != current_user.id,
            ).count()

        # 마지막 메시지
        last_message = db.query(ChatMessage).filter(
            ChatMessage.room_id == room.id
        ).order_by(ChatMessage.created_at.desc()).first()

        room_response = ChatRoomResponse.from_orm(room)
        room_response.unread_count = unread_count
        if last_message:
            room_response.last_message = ChatMessageResponse.from_orm(last_message)
            room_response.last_message.read_count = len(last_message.read_receipts)

        room_responses.append(room_response)

    return ChatRoomListResponse(rooms=room_responses, total=total)


# 채팅방 생성
@router.post("/rooms", response_model=ChatRoomResponse)
def create_chat_room(
    room_data: ChatRoomCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """새 채팅방 생성"""

    # 1:1 채팅인 경우 기존 방이 있는지 확인
    if room_data.type == RoomType.DIRECT and len(room_data.participant_ids) == 1:
        other_user_id = room_data.participant_ids[0]

        # 기존 1:1 채팅방 찾기
        existing_room = db.query(ChatRoom).join(ChatParticipant).filter(
            ChatRoom.type == RoomType.DIRECT,
        ).group_by(ChatRoom.id).having(
            db.func.count(ChatParticipant.id) == 2
        ).first()

        if existing_room:
            participants = db.query(ChatParticipant).filter(
                ChatParticipant.room_id == existing_room.id
            ).all()
            participant_user_ids = {p.user_id for p in participants}
            if participant_user_ids == {current_user.id, other_user_id}:
                return ChatRoomResponse.from_orm(existing_room)

    # 새 채팅방 생성
    new_room = ChatRoom(
        name=room_data.name,
        type=room_data.type,
        description=room_data.description,
        purchase_id=room_data.purchase_id,
        sale_id=room_data.sale_id,
        product_id=room_data.product_id,
        created_by=current_user.id,
    )
    db.add(new_room)
    db.flush()

    # 생성자를 참여자로 추가
    creator_participant = ChatParticipant(
        room_id=new_room.id,
        user_id=current_user.id,
        is_admin=True,
    )
    db.add(creator_participant)

    # 전체 채팅인 경우 모든 활성 사용자를 자동으로 추가
    if room_data.type == RoomType.GENERAL:
        all_users = db.query(User).filter(User.is_active == True).all()
        for user in all_users:
            if user.id != current_user.id:
                participant = ChatParticipant(
                    room_id=new_room.id,
                    user_id=user.id,
                    is_admin=False,
                )
                db.add(participant)
    else:
        # 초대된 사용자들 추가 (전체 채팅이 아닐 때만)
        for user_id in room_data.participant_ids:
            if user_id != current_user.id:
                participant = ChatParticipant(
                    room_id=new_room.id,
                    user_id=user_id,
                    is_admin=False,
                )
                db.add(participant)

    db.commit()
    db.refresh(new_room)

    return ChatRoomResponse.from_orm(new_room)


# 채팅방 상세 조회
@router.get("/rooms/{room_id}", response_model=ChatRoomResponse)
def get_chat_room(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """채팅방 상세 정보 조회"""
    room = db.query(ChatRoom).filter(ChatRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found")

    # 참여자 확인
    participant = db.query(ChatParticipant).filter(
        ChatParticipant.room_id == room_id,
        ChatParticipant.user_id == current_user.id,
        ChatParticipant.left_at.is_(None),
    ).first()

    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant of this room")

    return ChatRoomResponse.from_orm(room)


# 메시지 목록 조회
@router.get("/rooms/{room_id}/messages", response_model=ChatMessageListResponse)
def get_messages(
    room_id: str,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """채팅방의 메시지 목록 조회"""
    # 참여자 확인
    participant = db.query(ChatParticipant).filter(
        ChatParticipant.room_id == room_id,
        ChatParticipant.user_id == current_user.id,
        ChatParticipant.left_at.is_(None),
    ).first()

    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant of this room")

    total = db.query(ChatMessage).filter(ChatMessage.room_id == room_id).count()
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.room_id == room_id)
        .order_by(ChatMessage.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    message_responses = []
    for msg in messages:
        msg_response = ChatMessageResponse.from_orm(msg)
        msg_response.read_count = len(msg.read_receipts)
        message_responses.append(msg_response)

    return ChatMessageListResponse(messages=message_responses, total=total)


# 메시지 전송
@router.post("/rooms/{room_id}/messages", response_model=ChatMessageResponse)
def send_message(
    room_id: str,
    message_data: ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """메시지 전송"""
    # 참여자 확인
    participant = db.query(ChatParticipant).filter(
        ChatParticipant.room_id == room_id,
        ChatParticipant.user_id == current_user.id,
        ChatParticipant.left_at.is_(None),
    ).first()

    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant of this room")

    # 메시지 생성
    new_message = ChatMessage(
        room_id=room_id,
        user_id=current_user.id,
        message=message_data.message,
    )
    db.add(new_message)
    db.commit()
    db.refresh(new_message)

    return ChatMessageResponse.from_orm(new_message)


# 메시지 읽음 처리
@router.post("/rooms/{room_id}/read")
async def mark_as_read(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """채팅방의 모든 메시지를 읽음 처리"""
    participant = db.query(ChatParticipant).filter(
        ChatParticipant.room_id == room_id,
        ChatParticipant.user_id == current_user.id,
    ).first()

    if not participant:
        raise HTTPException(status_code=403, detail="Not a participant of this room")

    # last_read_at 업데이트
    now = datetime.utcnow()
    participant.last_read_at = now

    # 읽지 않은 메시지들에 대해 읽음 영수증 생성
    unread_messages = db.query(ChatMessage).filter(
        ChatMessage.room_id == room_id,
        ChatMessage.user_id != current_user.id,  # 내가 보낸 메시지 제외
        ChatMessage.created_at <= now,
    ).all()

    message_ids = []
    for message in unread_messages:
        # 이미 읽음 영수증이 있는지 확인
        existing_receipt = db.query(MessageReadReceipt).filter(
            MessageReadReceipt.message_id == message.id,
            MessageReadReceipt.user_id == current_user.id,
        ).first()

        if not existing_receipt:
            receipt = MessageReadReceipt(
                message_id=message.id,
                user_id=current_user.id,
            )
            db.add(receipt)
            message_ids.append(str(message.id))

    db.commit()

    # WebSocket으로 읽음 이벤트 브로드캐스트
    if message_ids:
        await manager.broadcast({
            'type': 'read',
            'user_id': str(current_user.id),
            'user_name': current_user.full_name,
            'message_ids': message_ids,
        }, room_id)

    return {"status": "success"}


# 채팅방 나가기
@router.post("/rooms/{room_id}/leave")
def leave_room(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """채팅방 나가기"""
    participant = db.query(ChatParticipant).filter(
        ChatParticipant.room_id == room_id,
        ChatParticipant.user_id == current_user.id,
    ).first()

    if not participant:
        raise HTTPException(status_code=404, detail="Not a participant of this room")

    participant.left_at = datetime.utcnow()
    db.commit()

    return {"status": "success"}


# WebSocket 연결
@router.websocket("/ws/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    token: str = Query(...),
):
    """WebSocket 실시간 채팅"""
    from app.core.security import verify_token
    from app.db.database import SessionLocal

    # 토큰 검증
    try:
        payload = verify_token(token)
        username = payload.get("sub")
        if not username:
            await websocket.close(code=1008)
            return
    except:
        await websocket.close(code=1008)
        return

    db = SessionLocal()
    try:
        # 사용자 확인 (username으로 조회)
        user = db.query(User).filter(User.username == username).first()
        if not user:
            await websocket.close(code=1008)
            return

        user_id = user.id

        # 채팅방 참여자 확인
        participant = db.query(ChatParticipant).filter(
            ChatParticipant.room_id == room_id,
            ChatParticipant.user_id == user_id,
            ChatParticipant.left_at.is_(None),
        ).first()

        if not participant:
            await websocket.close(code=1008)
            return

        await manager.connect(websocket, room_id)

        try:
            while True:
                data = await websocket.receive_text()
                message_data = json.loads(data)

                # 메시지 타입에 따라 처리
                if message_data.get('type') == 'message':
                    # 데이터베이스에 메시지 저장
                    new_message = ChatMessage(
                        room_id=room_id,
                        user_id=user_id,
                        message=message_data.get('message', ''),
                        is_system=False,
                    )
                    db.add(new_message)
                    db.commit()
                    db.refresh(new_message)

                    # 응답 메시지 구성
                    response_data = {
                        'type': 'message',
                        'data': {
                            'id': str(new_message.id),
                            'room_id': str(new_message.room_id),
                            'user_id': str(new_message.user_id),
                            'user': {
                                'id': str(user.id),
                                'full_name': user.full_name,
                                'email': user.email,
                            },
                            'message': new_message.message,
                            'is_system': new_message.is_system,
                            'created_at': new_message.created_at.isoformat(),
                            'updated_at': new_message.updated_at.isoformat() if new_message.updated_at else None,
                            'read_count': 0,
                        }
                    }

                    # 같은 방의 모든 사용자에게 브로드캐스트
                    await manager.broadcast(response_data, room_id)

        except WebSocketDisconnect:
            manager.disconnect(websocket, room_id)
    finally:
        db.close()
