/**
 * 채팅방 모달 컴포넌트
 * 새 창으로 채팅방을 표시
 */

import React, { useEffect, useState, useRef } from 'react';
import { Modal, Input, Button, List, Avatar, message as antMessage, Spin, Typography } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

import { chatService } from '../../services/chat';
import { ChatRoom, ChatMessage } from '../../types/chat';

const { Text } = Typography;

interface ChatRoomModalProps {
  room: ChatRoom;
  visible: boolean;
  onClose: () => void;
}

const ChatRoomModal: React.FC<ChatRoomModalProps> = ({ room, visible, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const currentUserId = localStorage.getItem('user_id');

  useEffect(() => {
    if (visible && room.id) {
      fetchMessages();
      connectWebSocket();
    }

    return () => {
      // 모달이 닫힐 때 WebSocket 연결 해제
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [visible, room.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const connectWebSocket = () => {
    const token = localStorage.getItem('access_token');
    if (!token || !room.id) return;

    try {
      const ws = chatService.connectWebSocket(room.id, token);

      ws.onopen = () => {
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'message' && data.data) {
            // 새 메시지 수신 - 중복 체크
            setMessages((prevMessages) => {
              const exists = prevMessages.some(msg => msg.id === data.data.id);
              if (exists) {
                return prevMessages;
              }
              return [...prevMessages, data.data];
            });
            // 자동으로 읽음 처리
            chatService.markAsRead(room.id);
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

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const response = await chatService.getMessages(room.id, 0, 100);
      setMessages(response.messages.reverse());
      await chatService.markAsRead(room.id);
    } catch (error: any) {
      if (error.response?.status === 401) {
        antMessage.error('로그인이 필요합니다.');
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
        const newMessage = await chatService.sendMessage(room.id, {
          message: messageInput.trim(),
        });
        setMessages([...messages, newMessage]);
        setMessageInput('');
        await chatService.markAsRead(room.id);
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
    <Modal
      title={room.name || '채팅방'}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
      bodyStyle={{ padding: 0, height: 500 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* 메시지 목록 */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          backgroundColor: '#f5f5f5',
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
                    {!isMyMessage && (
                      <Avatar style={{ marginRight: 8 }}>
                        {msg.user.full_name?.[0] || 'U'}
                      </Avatar>
                    )}
                    <div style={{ maxWidth: '70%' }}>
                      {!isMyMessage && (
                        <Text strong style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
                          {msg.user.full_name}
                        </Text>
                      )}
                      <div
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          backgroundColor: isMyMessage ? '#1890ff' : 'white',
                          color: isMyMessage ? 'white' : 'black',
                          wordBreak: 'break-word',
                        }}
                      >
                        {msg.message}
                      </div>
                      <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                        {dayjs(msg.created_at).format('A h:mm')}
                      </Text>
                    </div>
                    {isMyMessage && (
                      <Avatar style={{ marginLeft: 8 }}>
                        {msg.user.full_name?.[0] || 'U'}
                      </Avatar>
                    )}
                  </div>
                );
              }}
            />
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 메시지 입력 */}
        <div style={{
          padding: 16,
          borderTop: '1px solid #f0f0f0',
          backgroundColor: 'white',
        }}>
          <Input.TextArea
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="메시지를 입력하세요 (Shift+Enter: 줄바꿈)"
            autoSize={{ minRows: 1, maxRows: 4 }}
            style={{ marginBottom: 8 }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSendMessage}
            loading={sending}
            block
          >
            전송
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ChatRoomModal;
