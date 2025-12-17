/**
 * 채팅 창 페이지 (팝업 전용)
 * 독립적인 브라우저 창으로 열리는 채팅방
 */

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Input, Button, List, Avatar, message as antMessage, Spin, Typography, Space } from 'antd';
import { SendOutlined, TeamOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

import { chatService } from '../../services/chat';
import { ChatRoom, ChatMessage } from '../../types/chat';

const { Text } = Typography;

const ChatWindowPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // localStorage에서 사용자 ID 가져오기
  const getUserId = () => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        return user.id;
      } catch (e) {
        return null;
      }
    }
    return null;
  };
  const currentUserId = getUserId();

  useEffect(() => {
    if (roomId) {
      fetchRoomData();
      fetchMessages();
      connectWebSocket();
    }

    return () => {
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
            // 새 메시지 수신
            setMessages((prevMessages) => {
              const exists = prevMessages.some(msg => msg.id === data.data.id);
              if (exists) {
                return prevMessages;
              }
              return [...prevMessages, data.data];
            });
            chatService.markAsRead(roomId);
          } else if (data.type === 'read' && data.message_ids) {
            // 읽음 이벤트 수신 - 메시지의 read_count 업데이트
            setMessages((prevMessages) => {
              return prevMessages.map(msg => {
                if (data.message_ids.includes(msg.id)) {
                  return {
                    ...msg,
                    read_count: (msg.read_count || 0) + 1,
                  };
                }
                return msg;
              });
            });
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
      // 페이지 타이틀 변경
      document.title = roomData.name || '채팅방';
    } catch (error: any) {
      if (error.response?.status === 401) {
        antMessage.error('로그인이 필요합니다.');
        window.close();
      } else {
        antMessage.error('채팅방 정보를 불러오는데 실패했습니다.');
      }
    }
  };

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const response = await chatService.getMessages(roomId!, 0, 100);
      setMessages(response.messages.reverse());
      await chatService.markAsRead(roomId!);
    } catch (error: any) {
      if (error.response?.status === 401) {
        antMessage.error('로그인이 필요합니다.');
        window.close();
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

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'message',
          message: messageInput.trim(),
        }));
        setMessageInput('');
      } else {
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

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f5f5f5',
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: 'white',
        borderBottom: '1px solid #e8e8e8',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <Avatar icon={<TeamOutlined />} style={{ backgroundColor: '#1a1d2e' }} />
        <div style={{ flex: 1 }}>
          <Text strong style={{ fontSize: 16 }}>{room?.name || '채팅방'}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            참여자 {room?.participants.length || 0}명
          </Text>
        </div>
      </div>

      {/* 메시지 목록 */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 16,
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
            메시지가 없습니다
          </div>
        ) : (
          <>
            {messages.map((msg, index) => {
              const isMyMessage = String(msg.user_id) === String(currentUserId);

              // 디버깅
              if (index === 0) {
                console.log('First message - msg.user_id:', msg.user_id, 'type:', typeof msg.user_id);
                console.log('First message - currentUserId:', currentUserId, 'type:', typeof currentUserId);
                console.log('First message - isMyMessage:', isMyMessage);
              }

              const showDate = index === 0 ||
                dayjs(messages[index - 1].created_at).format('YYYY-MM-DD') !== dayjs(msg.created_at).format('YYYY-MM-DD');

              return (
                <React.Fragment key={msg.id}>
                  {showDate && (
                    <div style={{
                      textAlign: 'center',
                      margin: '20px 0',
                    }}>
                      <span style={{
                        backgroundColor: 'rgba(0,0,0,0.4)',
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: 12,
                        fontSize: 12,
                      }}>
                        {dayjs(msg.created_at).format('YYYY-MM-DD (ddd)')}
                      </span>
                    </div>
                  )}

                  <div style={{
                    display: 'flex',
                    justifyContent: isMyMessage ? 'flex-end' : 'flex-start',
                    marginBottom: 12,
                  }}>
                    {!isMyMessage && (
                      <Avatar style={{ marginRight: 8, flexShrink: 0 }}>
                        {msg.user.full_name?.[0] || 'U'}
                      </Avatar>
                    )}
                    <div style={{ maxWidth: '70%' }}>
                      {!isMyMessage && (
                        <Text strong style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
                          {msg.user.full_name}
                        </Text>
                      )}
                      <div style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: 6,
                        flexDirection: isMyMessage ? 'row-reverse' : 'row',
                      }}>
                        {/* 메시지 말풍선 */}
                        <div style={{
                          padding: '8px 12px',
                          borderRadius: isMyMessage ? '12px 12px 0 12px' : '12px 12px 12px 0',
                          backgroundColor: isMyMessage ? '#FAE100' : 'white',
                          color: 'black',
                          wordBreak: 'break-word',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                        }}>
                          {msg.message}
                        </div>

                        {/* 시간과 읽음 표시 (내 메시지일 때만) */}
                        {isMyMessage && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                            {msg.read_count !== undefined && room && msg.read_count < room.participants.length - 1 && (
                              <Text style={{ fontSize: 11, color: '#faad14' }}>
                                {room.participants.length - 1 - msg.read_count}
                              </Text>
                            )}
                            <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                              {dayjs(msg.created_at).format('A h:mm')}
                            </Text>
                          </div>
                        )}

                        {/* 상대방 메시지 시간 */}
                        {!isMyMessage && (
                          <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                            {dayjs(msg.created_at).format('A h:mm')}
                          </Text>
                        )}
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 메시지 입력 */}
      <div style={{
        padding: 16,
        backgroundColor: 'white',
        borderTop: '1px solid #e8e8e8',
      }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input.TextArea
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="메시지를 입력하세요 (Shift+Enter: 줄바꿈)"
            autoSize={{ minRows: 1, maxRows: 4 }}
            style={{ resize: 'none', borderColor: '#1a1d2e' }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSendMessage}
            loading={sending}
            style={{ height: 'auto', backgroundColor: '#1a1d2e', borderColor: '#1a1d2e' }}
          >
            전송
          </Button>
        </Space.Compact>
      </div>
    </div>
  );
};

export default ChatWindowPage;
