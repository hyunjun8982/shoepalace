import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Spin, App, Image, List, Empty } from 'antd';
import {
  CameraOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import axios from 'axios';

// 모바일 페이지용 API (인증 없이 직접 호출)
// 이 페이지는 QR코드로 접근하므로 로그인 없이 토큰 기반으로 작동
const getApiBaseUrl = () => {
  // 현재 페이지의 origin을 기반으로 API URL 결정
  return `${window.location.origin}/api/v1`;
};

const MobileReceiptCapturePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { message } = App.useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [userName, setUserName] = useState('');
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 토큰 검증
  useEffect(() => {
    const validateToken = async () => {
      try {
        const apiBase = getApiBaseUrl();
        const response = await axios.get(`${apiBase}/purchases/receipt-upload-token/${token}/validate`);
        if (response.data.valid) {
          setValid(true);
          setUserName(response.data.user_name || '');
        } else {
          setValid(false);
          setErrorMessage(response.data.message || '유효하지 않은 토큰입니다.');
        }
      } catch (error: any) {
        setValid(false);
        setErrorMessage(error.response?.data?.message || '토큰 검증에 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      validateToken();
    } else {
      setLoading(false);
      setErrorMessage('토큰이 없습니다.');
    }
  }, [token]);

  // 현재 업로드 상태 폴링 (처음 로드 시)
  useEffect(() => {
    const fetchStatus = async () => {
      if (!valid || !token) return;
      try {
        const apiBase = getApiBaseUrl();
        const response = await axios.get(`${apiBase}/purchases/receipt-upload-token/${token}/status`);
        if (response.data.uploaded_urls) {
          setUploadedUrls(response.data.uploaded_urls);
        }
      } catch (error) {
        console.error('Status fetch error:', error);
      }
    };

    fetchStatus();
  }, [valid, token]);

  // 파일 선택 핸들러
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // 이미지 파일인지 확인
    if (!file.type.startsWith('image/')) {
      message.error('이미지 파일만 업로드 가능합니다.');
      return;
    }

    // 파일 크기 제한 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      message.error('파일 크기는 10MB 이하여야 합니다.');
      return;
    }

    // 업로드
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const apiBase = getApiBaseUrl();
      const response = await axios.post(
        `${apiBase}/purchases/receipt-upload-token/${token}/upload`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      if (response.data.url) {
        setUploadedUrls(prev => [...prev, response.data.url]);
        message.success(`영수증 ${response.data.upload_count}장 업로드 완료!`);
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      message.error(error.response?.data?.detail || '업로드에 실패했습니다.');
    } finally {
      setUploading(false);
      // 파일 입력 초기화
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 이미지 삭제 핸들러
  const handleDeleteImage = async (index: number) => {
    try {
      const apiBase = getApiBaseUrl();
      await axios.delete(`${apiBase}/purchases/receipt-upload-token/${token}/images/${index}`);
      setUploadedUrls(prev => prev.filter((_, i) => i !== index));
      message.success('이미지가 삭제되었습니다.');
    } catch (error: any) {
      message.error(error.response?.data?.detail || '삭제에 실패했습니다.');
    }
  };

  // 사진 촬영 버튼 클릭
  const handleCaptureClick = () => {
    fileInputRef.current?.click();
  };

  // API URL 가져오기
  const getFullImageUrl = (url: string) => {
    if (url.startsWith('http')) return url;
    // 상대 경로인 경우 현재 origin 사용 (nginx 프록시가 처리)
    return `${window.location.origin}${url}`;
  };

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5'
      }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: '#666' }}>토큰 검증 중...</div>
      </div>
    );
  }

  if (!valid) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff2f0',
        padding: 24
      }}>
        <CloseCircleOutlined style={{ fontSize: 64, color: '#ff4d4f', marginBottom: 16 }} />
        <div style={{ fontSize: 20, fontWeight: 'bold', color: '#ff4d4f', marginBottom: 8 }}>
          접근 불가
        </div>
        <div style={{ color: '#666', textAlign: 'center' }}>
          {errorMessage}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: 16
    }}>
      {/* 헤더 */}
      <div style={{
        backgroundColor: '#1890ff',
        color: 'white',
        padding: 16,
        borderRadius: 8,
        marginBottom: 16,
        textAlign: 'center'
      }}>
        <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 4 }}>
          영수증 업로드
        </div>
        <div style={{ fontSize: 14, opacity: 0.9 }}>
          {userName}님의 구매 영수증
        </div>
      </div>

      {/* 업로드된 이미지 목록 */}
      {uploadedUrls.length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 'bold',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            업로드된 영수증 ({uploadedUrls.length}장)
          </div>
          <List
            grid={{ gutter: 8, column: 2 }}
            dataSource={uploadedUrls}
            renderItem={(url, index) => (
              <List.Item>
                <div style={{
                  position: 'relative',
                  backgroundColor: 'white',
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: '1px solid #d9d9d9'
                }}>
                  <Image
                    src={getFullImageUrl(url)}
                    alt={`영수증 ${index + 1}`}
                    style={{ width: '100%', height: 150, objectFit: 'cover' }}
                    preview={{ mask: '크게보기' }}
                  />
                  <Button
                    type="primary"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => handleDeleteImage(index)}
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      borderRadius: '50%',
                      width: 28,
                      height: 28,
                      padding: 0
                    }}
                  />
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    color: 'white',
                    padding: '4px 8px',
                    fontSize: 12,
                    textAlign: 'center'
                  }}>
                    영수증 #{index + 1}
                  </div>
                </div>
              </List.Item>
            )}
          />
        </div>
      ) : (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 24,
          marginBottom: 16,
          textAlign: 'center'
        }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="아직 업로드된 영수증이 없습니다"
          />
        </div>
      )}

      {/* 사진 촬영 버튼 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      <Button
        type="primary"
        size="large"
        icon={uploading ? undefined : (uploadedUrls.length > 0 ? <PlusOutlined /> : <CameraOutlined />)}
        onClick={handleCaptureClick}
        loading={uploading}
        block
        style={{
          height: 56,
          fontSize: 18,
          borderRadius: 8,
          marginBottom: 16
        }}
      >
        {uploading ? '업로드 중...' : (uploadedUrls.length > 0 ? '영수증 추가 촬영' : '영수증 촬영하기')}
      </Button>

      {/* 안내 메시지 */}
      <div style={{
        backgroundColor: '#e6f7ff',
        border: '1px solid #91d5ff',
        borderRadius: 8,
        padding: 12,
        fontSize: 13,
        color: '#0050b3'
      }}>
        <div style={{ marginBottom: 4 }}>
          <strong>안내</strong>
        </div>
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          <li>영수증을 여러 장 촬영할 수 있습니다.</li>
          <li>촬영한 사진은 PC에 자동으로 반영됩니다.</li>
          <li>업로드 후 PC에서 구매 등록을 완료해주세요.</li>
        </ul>
      </div>
    </div>
  );
};

export default MobileReceiptCapturePage;
