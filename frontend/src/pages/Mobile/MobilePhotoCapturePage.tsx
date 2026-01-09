import React, { useState, useRef, useEffect } from 'react';
import { Button, message, Spin, Result, Typography, Space } from 'antd';
import { CameraOutlined, CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useParams, useSearchParams } from 'react-router-dom';
import api from '../../services/api';

const { Title, Text } = Typography;

const MobilePhotoCapturePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const inventoryId = searchParams.get('inventory_id');

  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [productInfo, setProductInfo] = useState<{ name: string; size: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 토큰 검증
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setIsValid(false);
        setValidating(false);
        return;
      }

      try {
        const response = await api.get(`/inventory/upload-token/${token}/validate`);
        if (response.data.valid) {
          setIsValid(true);
          setProductInfo({
            name: response.data.product_name,
            size: response.data.size
          });
        } else {
          setIsValid(false);
        }
      } catch (error) {
        console.error('Token validation error:', error);
        setIsValid(false);
      } finally {
        setValidating(false);
      }
    };

    validateToken();
  }, [token]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 미리보기 생성
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // 업로드
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      await api.post(`/inventory/upload-token/${token}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setUploaded(true);
      message.success('사진이 성공적으로 업로드되었습니다!');
    } catch (error: any) {
      console.error('Upload error:', error);
      message.error(error.response?.data?.detail || '업로드에 실패했습니다.');
      setPreviewUrl(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  const handleRetake = () => {
    setPreviewUrl(null);
    setUploaded(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 토큰 검증 중
  if (validating) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5'
      }}>
        <Spin size="large" tip="확인 중..." />
      </div>
    );
  }

  // 토큰이 유효하지 않음
  if (!isValid) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        padding: 20
      }}>
        <Result
          status="error"
          title="유효하지 않은 링크"
          subTitle="링크가 만료되었거나 유효하지 않습니다. PC에서 새로운 QR코드를 생성해 주세요."
        />
      </div>
    );
  }

  // 업로드 완료
  if (uploaded) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        padding: 20
      }}>
        <Result
          status="success"
          title="업로드 완료!"
          subTitle="사진이 PC 화면에 반영됩니다."
          extra={[
            <Button
              key="retake"
              icon={<ReloadOutlined />}
              onClick={handleRetake}
            >
              다른 사진 촬영
            </Button>
          ]}
        />
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Uploaded"
            style={{
              maxWidth: '90%',
              maxHeight: 300,
              borderRadius: 8,
              marginTop: 20,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
            }}
          />
        )}
      </div>
    );
  }

  // 메인 촬영 화면
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f5f5f5',
      padding: 20
    }}>
      {/* 상품 정보 */}
      <div style={{
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 16,
        marginBottom: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <Title level={4} style={{ margin: 0, marginBottom: 8 }}>
          불량 상품 사진 촬영
        </Title>
        {productInfo && (
          <Space direction="vertical" size={4}>
            <Text strong>{productInfo.name}</Text>
            <Text type="secondary">사이즈: {productInfo.size}</Text>
          </Space>
        )}
      </div>

      {/* 미리보기 영역 */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 20,
        marginBottom: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Preview"
            style={{
              maxWidth: '100%',
              maxHeight: '50vh',
              borderRadius: 8
            }}
          />
        ) : (
          <div style={{
            width: '100%',
            height: 300,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            border: '2px dashed #d9d9d9',
            borderRadius: 8,
            color: '#999'
          }}>
            <CameraOutlined style={{ fontSize: 48, marginBottom: 16 }} />
            <Text type="secondary">아래 버튼을 눌러 사진을 촬영하세요</Text>
          </div>
        )}
      </div>

      {/* 숨겨진 파일 입력 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* 촬영 버튼 */}
      <Button
        type="primary"
        size="large"
        icon={loading ? undefined : <CameraOutlined />}
        loading={loading}
        onClick={handleCameraClick}
        style={{
          height: 56,
          fontSize: 18,
          borderRadius: 8
        }}
      >
        {loading ? '업로드 중...' : (previewUrl ? '다시 촬영' : '사진 촬영')}
      </Button>
    </div>
  );
};

export default MobilePhotoCapturePage;
