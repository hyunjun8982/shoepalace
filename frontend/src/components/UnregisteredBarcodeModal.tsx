import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Button, message, Upload, Image, Tabs, Row, Col, Alert, Spin, Radio } from 'antd';
import { UploadOutlined, LinkOutlined, DeleteOutlined } from '@ant-design/icons';
import { productService } from '../services/product';
import { barcodeService, PoizonProductInfo } from '../services/barcode';
import { Product } from '../types/product';
import { Brand } from '../types';

interface UnregisteredBarcodeModalProps {
  barcode: string;
  visible: boolean;
  onSuccess: (newProduct: Product, barcodeInfo: { barcode_value: string; size: string }) => void;
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
  const [poizonLoading, setPoizonLoading] = useState(false);
  const [poizonInfo, setPoizonInfo] = useState<PoizonProductInfo | null>(null);
  const [poizonError, setPoizonError] = useState(false);
  const [sizeInputMode, setSizeInputMode] = useState(false);

  // 팝업 열릴 때 브랜드 목록 및 포이즌 정보 로드
  useEffect(() => {
    if (visible) {
      // 모달 열려있음 표시 (바코드 입력 방지)
      document.documentElement.setAttribute('data-modal-open', 'true');

      // 바코드 스캐너 입력 차단 (캡처 페이즈에서)
      const blockBarcodeInput = (e: KeyboardEvent) => {
        // INPUT/TEXTAREA/SELECT는 허용 (모달 내 입력은 가능)
        const target = e.target as HTMLElement;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
          return;
        }
        // 수정자 키는 통과
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
          return;
        }
        // 다른 모든 키보드 입력 차단
        if (e.key.length === 1 || e.key === 'Enter') {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      };

      document.addEventListener('keydown', blockBarcodeInput, true); // 캡처 페이즈

      // 바코드 값을 읽기 전용 필드로 설정
      form.setFieldsValue({
        barcode,
      });

      // 브랜드 로드 후 포이즌 정보 로드
      loadBrands().then((loadedBrands) => {
        loadPoizonInfo(loadedBrands);
      });

      return () => {
        document.removeEventListener('keydown', blockBarcodeInput, true);
        document.documentElement.setAttribute('data-modal-open', 'false');
      };
    }
  }, [visible, barcode, form]);

  // 브랜드 목록 로드
  const loadBrands = async () => {
    setBrandsLoading(true);
    try {
      const response = await productService.getBrands();
      setBrands(response || []);
      return response || [];
    } catch (error) {
      console.error('Failed to load brands:', error);
      message.error('브랜드 목록 로드 실패');
      return [];
    } finally {
      setBrandsLoading(false);
    }
  };

  // 포이즌 API에서 바코드 정보 로드
  const loadPoizonInfo = async (loadedBrands?: any[]) => {
    setPoizonLoading(true);
    setPoizonError(false);
    setPoizonInfo(null);
    try {
      const result = await barcodeService.lookupBarcodeFromPoizon(barcode);
      if (result) {
        setPoizonInfo(result);

        // 포이즌 정보에서 추출 (poizon_info 필드 사용)
        const poizonData = (result as any).poizon_info || result;

        // 포이즌 정보로 필드 자동 채우기
        const formValues: any = {
          product_name: poizonData.title || result.title,
        };

        // 상품코드 설정 (article_number가 있으면)
        const articleNumber = (poizonData as any).article_number || (poizonData as any).articleNumber;
        if (articleNumber) {
          formValues.product_code = articleNumber;
        }

        // 브랜드 설정 (brand_name이 있으면 매칭)
        const brandName = (poizonData as any).brand_name || (poizonData as any).brandName;
        const brandsToUse = loadedBrands || brands;
        console.log('[Brand Matching] brandName:', brandName, 'brands:', brandsToUse);

        if (brandName && brandsToUse.length > 0) {
          const matchedBrand = brandsToUse.find(b => {
            const matches = b.name.toLowerCase() === brandName.toLowerCase();
            console.log('[Brand Check]', b.name, '===', brandName, '?', matches);
            return matches;
          });
          if (matchedBrand) {
            console.log('[Brand Matched]', matchedBrand);
            formValues.brand_id = matchedBrand.id;
          } else {
            console.log('[Brand Not Matched]', brandName);
          }
        }

        // 사이즈가 1개만 있으면 자동 선택
        const sizes = poizonData.sizes || result.sizes;
        if (sizes && sizes.length === 1) {
          formValues.size = sizes[0].size_kr;
        }

        form.setFieldsValue(formValues);
        setProductName(poizonData.title || result.title);

        // 이미지 미리보기 설정
        if (poizonData.logo_url) {
          setImagePreview(poizonData.logo_url);
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
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
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
    setLoading(true);
    try {
      let targetProduct = null;

      // 1. 상품 등록 시도
      try {
        targetProduct = await productService.createProduct({
          brand_id: values.brand_id,
          product_code: values.product_code,
          product_name: values.product_name,
          description: values.description,
        });
        message.info('새 상품이 등록되었습니다');
      } catch (createError: any) {
        // 상품 코드 중복 에러인 경우 → 기존 상품을 포이즌 정보로 업데이트
        if (createError.response?.status === 409 ||
            createError.response?.data?.detail?.includes('Product code already exists')) {
          console.log('상품 코드 중복, 기존 상품을 최신 정보로 업데이트');
          targetProduct = await productService.getProductByCode(values.product_code);
          if (!targetProduct) {
            throw new Error('상품 코드는 중복되지만 기존 상품을 찾을 수 없습니다.');
          }

          // 기존 상품을 포이즌 정보로 업데이트
          await productService.updateProduct(targetProduct.id, {
            product_name: values.product_name,
            product_code: values.product_code,
            brand_id: values.brand_id,
            description: values.description,
          });

          message.info('기존 상품을 최신 정보로 업데이트합니다');
        } else {
          throw createError;
        }
      }

      // 2. 바코드 매핑 (사이즈 포함)
      try {
        await barcodeService.createBarcode({
          product_id: targetProduct.id,
          size: values.size,
          barcode_value: barcode,
          barcode_type: 'custom',
          notes: `Auto-registered from barcode scan`,
        });
        message.success('바코드가 등록되었습니다');
      } catch (barcodeError: any) {
        console.warn('Failed to create barcode mapping:', barcodeError);
        // 바코드 등록 실패해도 상품은 등록되었으니 계속 진행
        message.warning('바코드 등록 중 오류가 발생했지만 계속 진행합니다');
      }

      form.resetFields();
      setImageFile(null);
      setImagePreview('');
      setProductName('');
      onSuccess(targetProduct, {
        barcode_value: barcode,
        size: values.size,
      });
      onCancel();
    } catch (error: any) {
      console.error('Failed to register product:', error);
      const errorMsg = error.response?.data?.detail || error.message || '상품 등록 실패';
      message.error(`실패: ${errorMsg}`);
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
      width={650}
      bodyStyle={{ padding: '16px' }}
      destroyOnClose
    >
      <Spin spinning={poizonLoading}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '13px', color: '#666' }}>
            바코드: <strong>{barcode}</strong>
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
              style={{ marginTop: 12, padding: '8px 12px' }}
              showIcon={false}
            />
          )}
        </div>

        <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        autoComplete="off"
        onPaste={handleImagePaste}
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

        {productName && (
          <div style={{ fontSize: 13, marginBottom: 12 }}>
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

        <Form.Item
          label="사이즈 (필수)"
          name="size"
          rules={[{ required: true, message: '사이즈를 선택하거나 입력해주세요' }]}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {poizonInfo?.sizes && poizonInfo.sizes.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <Radio.Group
                  options={poizonInfo.sizes.map(s => ({
                    value: s.size_kr,
                    label: `${s.size_kr}${s.size_us ? ` (US: ${s.size_us})` : ''}`,
                  }))}
                  optionType="button"
                  buttonStyle="solid"
                  defaultValue={poizonInfo.sizes.length === 1 ? poizonInfo.sizes[0].size_kr : undefined}
                  onChange={(e) => {
                    setSizeInputMode(false);
                    form.setFieldValue('size', e.target.value);
                  }}
                  style={{ display: 'flex', gap: '8px', flex: 1 }}
                />
                <Radio.Group
                  options={[
                    {
                      value: 'custom',
                      label: '직접 입력',
                    }
                  ]}
                  optionType="button"
                  buttonStyle="solid"
                  onChange={(e) => {
                    setSizeInputMode(true);
                    form.setFieldValue('size', '');
                  }}
                />
              </div>
            )}
            {(sizeInputMode || !poizonInfo?.sizes || poizonInfo.sizes.length === 0) && (
              <Input
                placeholder="사이즈를 입력하세요 (예: M, L, 260)"
                onChange={(e) => form.setFieldValue('size', e.target.value)}
                autoFocus
              />
            )}
          </div>
        </Form.Item>

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

        <Form.Item
          label="설명 (선택사항)"
          name="description"
        >
          <Input placeholder="상품 설명을 입력하세요" />
        </Form.Item>

        <Form.Item label="이미지 (선택사항)">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {!imagePreview ? (
              <div style={{ fontSize: 12, color: '#999' }}>
                웹에서 이미지 복사 후 <strong style={{ color: '#1890ff' }}>Ctrl+V</strong>로 붙여넣기
              </div>
            ) : (
              <>
                <Image
                  src={imagePreview}
                  alt="Preview"
                  style={{ maxWidth: 80, maxHeight: 80, borderRadius: 4 }}
                  preview={{ mask: '보기' }}
                />
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={handleImageReset}
                >
                  삭제
                </Button>
              </>
            )}
          </div>
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
