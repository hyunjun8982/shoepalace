/**
 * 채팅 메시지 페이지
 */

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Input,
  Button,
  List,
  Avatar,
  message as antMessage,
  Spin,
  Empty,
  Space,
  Typography,
} from 'antd';
import { SendOutlined, ArrowLeftOutlined, TeamOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

import { chatService } from '../../services/chat';
import { ChatRoom, ChatMessage } from '../../types/chat';

const { Text } = Typography;

const ChatRoomPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const currentUserId = localStorage.getItem('user_id');

  useEffect(() => {
    if (roomId) {
      fetchRoomData();
      fetchMessages();
      connectWebSocket();
    }

    return () => {
      // 컴포넌트 언마운트 시 WebSocket 연결 해제
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [roomId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const connectWebSocket = () => {
    const token = localStorage.getItem('access_token');
    if (!token || !roomId) return;

    try {
      const ws = chatService.connectWebSocket(roomId, token);

      ws.onopen = () => {
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'message' && data.data) {
            // 새 메시지 수신 - 중복 체크
            setMessages((prevMessages) => {
              // 이미 같은 ID의 메시지가 있는지 확인
              const exists = prevMessages.some(msg => msg.id === data.data.id);
              if (exists) {
                return prevMessages;
              }
              return [...prevMessages, data.data];
            });
            // 자동으로 읽음 처리
            chatService.markAsRead(roomId);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        // 5초 후 재연결 시도
        setTimeout(() => {
          if (roomId) {
            connectWebSocket();
          }
        }, 5000);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  };

  const fetchRoomData = async () => {
    try {
      const roomData = await chatService.getRoom(roomId!);
      setRoom(roomData);
    } catch (error: any) {
      if (error.response?.status === 401) {
        antMessage.error('로그인이 필요합니다.');
        navigate('/login');
      } else {
        antMessage.error('채팅방 정보를 불러오는데 실패했습니다.');
        navigate('/chat');
      }
    }
  };

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const response = await chatService.getMessages(roomId!, 0, 100);
      setMessages(response.messages.reverse()); // 최신순으로 정렬

      // 메시지를 불러온 후 읽음 처리
      await chatService.markAsRead(roomId!);
    } catch (error: any) {
      if (error.response?.status === 401) {
        antMessage.error('로그인이 필요합니다.');
        navigate('/login');
      } else {
        antMessage.error('메시지를 불러오는데 실패했습니다.');
        console.error('Failed to fetch messages:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim()) return;

    try {
      setSending(true);

      // WebSocket이 연결되어 있으면 WebSocket으로 전송
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'message',
          message: messageInput.trim(),
        }));
        setMessageInput('');
      } else {
        // WebSocket이 연결되어 있지 않으면 REST API로 전송
        const newMessage = await chatService.sendMessage(roomId!, {
          message: messageInput.trim(),
        });
        setMessages([...messages, newMessage]);
        setMessageInput('');
        await chatService.markAsRead(roomId!);
      }
    } catch (error) {
      antMessage.error('메시지 전송에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '80vh',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, height: 'calc(100vh - 64px)' }}>
      <Card
        title={
          <Space>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/chat')}
            />
            <span>{room?.name || '채팅방'}</span>
            <TeamOutlined />
            <Text type="secondary" style={{ fontSize: 14 }}>
              {room?.participants.length}명
            </Text>
          </Space>
        }
        bodyStyle={{
          height: 'calc(100vh - 64px - 120px)',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
        }}
      >
        {/* 메시지 목록 */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {messages.length === 0 ? (
            <Empty
              description="메시지가 없습니다"
              style={{ margin: 'auto' }}
            />
          ) : (
            <List
              dataSource={messages}
              renderItem={(msg) => {
                const isMyMessage = msg.user_id === currentUserId;
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      justifyContent: isMyMessage ? 'flex-end' : 'flex-start',
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '70%',
                        display: 'flex',
                        flexDirection: isMyMessage ? 'row-reverse' : 'row',
                        gap: 8,
                      }}
                    >
                      {!isMyMessage && (
                        <Avatar size="small">{msg.user.full_name[0]}</Avatar>
                      )}
                      <div>
                        {!isMyMessage && (
                          <div
                            style={{
                              fontSize: 12,
                              color: '#999',
                              marginBottom: 4,
                            }}
                          >
                            {msg.user.full_name}
                          </div>
                        )}
                        <div
                          style={{
                            background: isMyMessage ? '#1890ff' : '#f0f0f0',
                            color: isMyMessage ? 'white' : 'black',
                            padding: '8px 12px',
                            borderRadius: 8,
                            wordBreak: 'break-word',
                          }}
                        >
                          {msg.message}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: '#999',
                            marginTop: 4,
                            textAlign: isMyMessage ? 'right' : 'left',
                          }}
                        >
                          {dayjs(msg.created_at).format('HH:mm')}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 메시지 입력 */}
        <div
          style={{
            borderTop: '1px solid #f0f0f0',
            padding: 16,
            display: 'flex',
            gap: 8,
          }}
        >
          <Input.TextArea
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="메시지를 입력하세요 (Enter: 전송, Shift+Enter: 줄바꿈)"
            autoSize={{ minRows: 1, maxRows: 4 }}
            style={{ flex: 1 }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSendMessage}
            loading={sending}
            disabled={!messageInput.trim()}
          >
            전송
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default ChatRoomPage;
