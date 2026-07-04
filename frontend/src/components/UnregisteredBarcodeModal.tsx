import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Button, message, Upload, Image, Tabs, Row, Col, Alert, Spin } from 'antd';
import { UploadOutlined, LinkOutlined, DeleteOutlined } from '@ant-design/icons';
import { productService } from '../services/product';
import { barcodeService, PoizonProductInfo } from '../services/barcode';
import { Product } from '../types/product';
import { Brand } from '../types';

interface UnregisteredBarcodeModalProps {
  barcode: string;
  visible: boolean;
  onSuccess: (newProduct: Product) => void;
  onCancel: () => void;
}

export const UnregisteredBarcodeModal: React.FC<UnregisteredBarcodeModalProps> = ({
  barcode,
  visible,
  onSuccess,
  onCancel,
}) => {
  const [form] = Form.useForm();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);
  const [brands_loading, setBrandsLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [productName, setProductName] = useState<string>('');
  const [size, setSize] = useState<string>('');  // 사이즈 입력
  const [poizonLoading, setPoizonLoading] = useState(false);
  const [poizonInfo, setPoizonInfo] = useState<PoizonProductInfo | null>(null);
  const [poizonError, setPoizonError] = useState(false);

  // 팝업 열릴 때 브랜드 목록 및 포이즌 정보 로드
  useEffect(() => {
    if (visible) {
      loadBrands();
      loadPoizonInfo();
      // 바코드 값을 읽기 전용 필드로 설정 및 카테고리 기본값 설정
      form.setFieldsValue({
        barcode,
        category: 'shoes' // 기본값: 신발
      });
    }
  }, [visible, barcode, form]);

  // 브랜드 목록 로드
  const loadBrands = async () => {
    setBrandsLoading(true);
    try {
      const response = await productService.getBrands();
      setBrands(response || []);
    } catch (error) {
      console.error('Failed to load brands:', error);
      message.error('브랜드 목록 로드 실패');
    } finally {
      setBrandsLoading(false);
    }
  };

  // 포이즌 API에서 바코드 정보 로드
  const loadPoizonInfo = async () => {
    setPoizonLoading(true);
    setPoizonError(false);
    setPoizonInfo(null);
    try {
      const result = await barcodeService.lookupBarcodeFromPoizon(barcode);
      if (result) {
        setPoizonInfo(result);
        // 포이즌 정보로 필드 자동 채우기
        form.setFieldsValue({
          product_name: result.title,
        });
        setProductName(result.title);

        // 첫번째 사이즈 자동 설정
        if (result.sizes && result.sizes.length > 0) {
          setSize(result.sizes[0].size_kr);
        }

        // 이미지 미리보기 설정
        if (result.logo_url) {
          setImagePreview(result.logo_url);
        }
      } else {
        setPoizonError(true);
      }
    } catch (error) {
      console.error('Failed to load Poizon info:', error);
      setPoizonError(true);
    } finally {
      setPoizonLoading(false);
    }
  };

  // 이미지 파일 검증 및 설정
  const validateAndSetImage = (file: File) => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      message.error('이미지 파일만 업로드 가능합니다');
      return false;
    }
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) {
      message.error('이미지는 5MB 이하여야 합니다');
      return false;
    }
    setImageFile(file);
    // 미리보기 생성
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
    return false;
  };

  // 이미지 업로드 핸들러
  const handleImageUpload = (file: File) => {
    return validateAndSetImage(file);
  };

  // 클립보드 paste 핸들러
  const handleImagePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          validateAndSetImage(file);
          e.preventDefault();
        }
        break;
      }
    }
  };

  // 이미지 삭제 핸들러
  const handleImageReset = () => {
    setImageFile(null);
    setImagePreview('');
    message.info('이미지가 삭제되었습니다');
  };

  // 상품 등록 처리
  const handleSubmit = async (values: any) => {
    // size 검증
    if (!size.trim()) {
      message.error('사이즈를 입력해주세요');
      return;
    }

    setLoading(true);
    try {
      // 1. 상품 등록
      const newProduct = await productService.createProduct({
        brand_id: values.brand_id,
        product_code: values.product_code,
        product_name: values.product_name,
        category: values.category,
        description: values.description,
      });

      // 2. 바코드 매핑 (사이즈 포함)
      try {
        await barcodeService.createBarcode({
          product_id: newProduct.id,
          size: size.trim(),
          barcode_value: barcode,
          barcode_type: 'custom',
          notes: `Auto-registered from barcode scan`,
        });
      } catch (barcodeError: any) {
        console.warn('Failed to create barcode mapping:', barcodeError);
        // 바코드 등록 실패해도 상품은 등록되었으니 계속 진행
      }

      message.success('상품이 등록되었습니다');
      form.resetFields();
      setImageFile(null);
      setImagePreview('');
      setProductName('');
      setSize('');
      onSuccess(newProduct);
      onCancel();
    } catch (error: any) {
      console.error('Failed to register product:', error);
      const errorMsg = error.response?.data?.detail || error.message || '상품 등록 실패';
      message.error(`상품 등록 실패: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={`미등록 바코드 - 상품 등록 필요`}
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={900}
      destroyOnClose
    >
      <Spin spinning={poizonLoading}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: '14px', color: '#666' }}>
            스캔된 바코드: <strong style={{ fontSize: '16px', color: '#1890ff' }}>{barcode}</strong>
          </div>
          <div style={{ fontSize: '12px', color: '#999', marginTop: 8 }}>
            이 바코드가 등록되지 않았습니다. 아래에서 상품 정보를 입력하면 자동으로 등록됩니다.
          </div>

          {/* 포이즌 정보 상태 표시 */}
          {poizonError && (
            <Alert
              type="warning"
              message="포이즌 정보 없음"
              description="포이즌 API에서 이 바코드에 대한 정보를 찾을 수 없습니다. 아래에서 직접 입력해주세요."
              style={{ marginTop: 12 }}
              showIcon
            />
          )}
          {poizonInfo && (
            <Alert
              type="success"
              message="포이즌 정보 자동 로드됨"
              description="포이즌 API에서 상품 정보를 가져왔습니다. 필요시 수정 가능합니다."
              style={{ marginTop: 12 }}
              showIcon
            />
          )}
        </div>

        <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        autoComplete="off"
      >
        <Form.Item label="바코드" name="barcode">
          <Input disabled />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              label="상품명"
              name="product_name"
              rules={[{ required: true, message: '상품명은 필수입니다' }]}
            >
              <Input
                placeholder="예: Nike Air Jordan 1"
                onChange={(e) => setProductName(e.target.value)}
              />
            </Form.Item>
            {productName && (
              <div style={{ marginTop: -16, marginBottom: 16, fontSize: 13 }}>
                <a
                  href={`https://kream.co.kr/search?keyword=${encodeURIComponent(productName)}&tab=products`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#1890ff' }}
                >
                  🔗 KREAM에서 "{productName}" 검색하기
                </a>
              </div>
            )}
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              label="상품코드"
              name="product_code"
              rules={[
                { required: true, message: '상품코드는 필수입니다' },
                {
                  pattern: /^[A-Za-z0-9\-/_]+$/,
                  message: '영문, 숫자, -, /, _만 입력 가능합니다',
                },
              ]}
            >
              <Input placeholder="예: NK-AIR-001" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label="사이즈 (필수)"
        >
          {poizonInfo && poizonInfo.sizes.length > 0 && (
            <div style={{ marginBottom: 12, padding: '8px 12px', backgroundColor: '#f0f5ff', borderRadius: 4, fontSize: 12 }}>
              <div style={{ color: '#666', marginBottom: 6 }}>
                🎯 포이즌 API에서 조회된 사이즈:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {poizonInfo.sizes.map((s) => (
                  <div
                    key={s.sku_id}
                    onClick={() => setSize(s.size_kr)}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: size === s.size_kr ? '#1890ff' : '#fff',
                      color: size === s.size_kr ? '#fff' : '#666',
                      border: '1px solid #d9d9d9',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                      transition: 'all 0.2s'
                    }}
                  >
                    {s.size_kr} {s.size_us ? `(US: ${s.size_us})` : ''}
                    {s.average_price && ` - ₩${s.average_price.toLocaleString()}`}
                  </div>
                ))}
              </div>
            </div>
          )}
          <Input
            placeholder="예: M, L, 260, XL"
            value={size}
            onChange={(e) => setSize(e.target.value)}
          />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              label="브랜드"
              name="brand_id"
              rules={[{ required: true, message: '브랜드는 필수입니다' }]}
            >
              <Select
                placeholder="브랜드 선택"
                loading={brands_loading}
                options={[
                  ...brands.map(b => ({
                    value: b.id,
                    label: b.name,
                  })),
                  {
                    value: 'etc',
                    label: '기타',
                  }
                ]}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              label="카테고리"
              name="category"
              rules={[{ required: true, message: '카테고리는 필수입니다' }]}
            >
              <Select placeholder="카테고리 선택">
                <Select.Option value="shoes">👟 신발 (Shoes)</Select.Option>
                <Select.Option value="clothing">👕 의류 (Clothing)</Select.Option>
                <Select.Option value="bags">👜 가방 (Bags)</Select.Option>
                <Select.Option value="hats">🎩 모자 (Hats)</Select.Option>
                <Select.Option value="accessories">⌚ 악세서리 (Accessories)</Select.Option>
                <Select.Option value="socks">🧦 양말 (Socks)</Select.Option>
                <Select.Option value="other">📦 기타 (Other)</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label="설명 (선택사항)"
          name="description"
        >
          <Input.TextArea
            rows={2}
            placeholder="상품 설명을 입력하세요"
          />
        </Form.Item>

        <Form.Item label="이미지 (선택사항)">
          <Tabs
            items={[
              {
                key: 'paste',
                label: <span><LinkOutlined /> 붙여넣기 (Ctrl+V)</span>,
                children: (
                  <div style={{ paddingTop: 8 }} onPaste={handleImagePaste} tabIndex={0}>
                    {!imagePreview ? (
                      <div style={{
                        padding: '20px',
                        border: '2px dashed #1890ff',
                        borderRadius: 4,
                        textAlign: 'center',
                        cursor: 'pointer',
                        backgroundColor: '#fafafa'
                      }}>
                        <div style={{ fontSize: 14, color: '#666' }}>
                          웹에서 이미지를 복사한 후<br />
                          <strong style={{ color: '#1890ff' }}>Ctrl+V</strong>를 눌러주세요
                        </div>
                      </div>
                    ) : (
                      <div>
                        <Image
                          src={imagePreview}
                          alt="Preview"
                          style={{ maxWidth: '100%', maxHeight: 150, borderRadius: 4 }}
                        />
                        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                          <Button
                            danger
                            icon={<DeleteOutlined />}
                            onClick={handleImageReset}
                          >
                            삭제
                          </Button>
                          <span style={{ color: '#999', fontSize: 12 }}>
                            다시 붙여넣으려면 삭제 후 Ctrl+V를 누르세요
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'upload',
                label: <span><UploadOutlined /> 파일 업로드</span>,
                children: (
                  <div style={{ paddingTop: 8 }}>
                    {!imagePreview ? (
                      <Upload
                        maxCount={1}
                        beforeUpload={handleImageUpload}
                        accept="image/*"
                        showUploadList={imageFile ? true : false}
                      >
                        <Button icon={<UploadOutlined />}>
                          {imageFile ? `선택됨: ${imageFile.name}` : '이미지 선택'}
                        </Button>
                      </Upload>
                    ) : (
                      <div>
                        <Image
                          src={imagePreview}
                          alt="Preview"
                          style={{ maxWidth: '100%', maxHeight: 150, borderRadius: 4 }}
                        />
                        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                          <Button
                            danger
                            icon={<DeleteOutlined />}
                            onClick={handleImageReset}
                          >
                            삭제
                          </Button>
                          <span style={{ color: '#999', fontSize: 12 }}>
                            다시 업로드하려면 삭제 후 새로운 파일을 선택하세요
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </Form.Item>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            block
            size="large"
          >
            상품 등록 및 추가
          </Button>
        </Form.Item>
        </Form>
      </Spin>
    </Modal>
  );
};
