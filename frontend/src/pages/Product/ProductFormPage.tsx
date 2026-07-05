import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  Space,
  Switch,
  App,
  Upload,
  Modal,
  Row,
  Col,
  message as antMessage,
} from 'antd';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ProductCreate, ProductUpdate } from '../../types/product';
import { productService } from '../../services/product';
import { brandService, Brand } from '../../services/brand';
import { barcodeService } from '../../services/barcode';
import type { UploadFile } from 'antd/es/upload/interface';
import { getFileUrl } from '../../utils/urlUtils';

const { Option } = Select;
const { TextArea } = Input;

const ProductFormPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { productId } = useParams();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [newBrandModalVisible, setNewBrandModalVisible] = useState(false);
  const [newBrandForm] = Form.useForm();
  const [imageFile, setImageFile] = useState<UploadFile | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [brandIconFile, setBrandIconFile] = useState<File | null>(null);
  const [brandIconUrl, setBrandIconUrl] = useState<string>('');

  // 사이즈별 바코드 관리
  interface SizeBarcode {
    size: string;
    barcode_value: string;
    id?: string;  // 기존 바코드일 경우
  }
  const [sizeBarcodes, setSizeBarcodes] = useState<SizeBarcode[]>([]);
  const [originalSizeBarcodes, setOriginalSizeBarcodes] = useState<SizeBarcode[]>([]);  // 원본 바코드 상태
  const [newSizeBarcode, setNewSizeBarcode] = useState({ size: '', barcode_value: '' });

  const isEditMode = !!productId;
  const fromPurchase = location.state?.from === 'purchase';

  useEffect(() => {
    fetchBrands();
    if (isEditMode) {
      fetchProductData();
    }
  }, [productId]);

  const fetchBrands = async () => {
    try {
      const response = await brandService.getBrands();
      setBrands(response.items);
    } catch (error) {
      message.error('브랜드 목록을 불러오는데 실패했습니다.');
    }
  };

  const fetchProductData = async () => {
    try {
      setLoading(true);
      const product = await productService.getProduct(productId!);
      form.setFieldsValue({
        brand_id: product.brand_id,
        product_code: product.product_code,
        product_name: product.product_name,
        description: product.description,
      });

      // 기존 이미지 표시
      const imagePath = getFileUrl(`/uploads/products/${product.brand_name}/${product.product_code}.png`);
      setImageUrl(imagePath || '');

      // 기존 바코드 로드
      try {
        const response = await barcodeService.getAllBarcodesByProduct(product.id);
        if (response && response.length > 0) {
          console.log(`Loaded ${response.length} barcodes for product`, product.id);
          const loadedBarcodes = response.map(b => ({
            size: b.size,
            barcode_value: b.barcode_value,
            id: b.id
          }));
          setSizeBarcodes(loadedBarcodes);
          setOriginalSizeBarcodes(loadedBarcodes);  // 원본 상태 저장
        } else {
          console.log('No barcodes found for product:', product.id);
        }
      } catch (error: any) {
        console.error('Failed to load barcodes:', error.message || error);
      }
    } catch (error) {
      message.error('상품 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewBrand = async (values: any) => {
    try {
      const newBrand = await brandService.createBrand(
        values.name,
        values.description || null,
        brandIconFile
      );
      message.success('브랜드가 등록되었습니다.');
      
      // 브랜드 목록 새로고침
      await fetchBrands();
      
      // 새로 등록된 브랜드를 선택
      form.setFieldsValue({ brand_id: newBrand.id });
      
      // 모달 닫기 및 초기화
      setNewBrandModalVisible(false);
      newBrandForm.resetFields();
      setBrandIconFile(null);
      setBrandIconUrl('');
    } catch (error: any) {
      message.error(error.message || '브랜드 등록에 실패했습니다.');
    }
  };

  const handleBrandIconChange = (info: any) => {
    const file = info.file.originFileObj || info.file;
    if (!file) return;

    setBrandIconFile(file);

    // 미리보기
    const reader = new FileReader();
    reader.onload = (e) => {
      setBrandIconUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleImageChange = (info: any) => {
    console.log('[UPLOAD] Upload change triggered:', info);
    const file = info.file.originFileObj || info.file;

    if (!file) {
      console.log('[UPLOAD] No file found');
      return;
    }

    console.log('[UPLOAD] File selected:', file.name, file.type, file.size);
    setImageFile(file);

    // 미리보기
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageUrl(e.target?.result as string);
      console.log('[UPLOAD] Preview loaded');
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    console.log('[PASTE] Paste event triggered');
    const items = e.clipboardData?.items;

    if (!items) {
      console.log('[PASTE] No items found in clipboard');
      return;
    }

    console.log('[PASTE] Clipboard items count:', items.length);

    for (let i = 0; i < items.length; i++) {
      console.log('[PASTE] Item', i, ':', items[i].type);

      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault(); // 기본 붙여넣기 동작 방지

        const file = items[i].getAsFile();
        console.log('[PASTE] Image file found:', file);

        if (file) {
          setImageFile(file as any);

          // 미리보기
          const reader = new FileReader();
          reader.onload = (ev) => {
            setImageUrl(ev.target?.result as string);
          };
          reader.readAsDataURL(file);

          message.success('이미지가 붙여넣기 되었습니다.');
          break;
        }
      }
    }
  };

  const validateProductCode = async (_: any, value: string) => {
    if (!value) {
      return Promise.resolve();
    }

    try {
      const exists = await productService.checkProductCode(value, isEditMode ? productId : undefined);
      if (exists) {
        return Promise.reject(new Error('이미 사용중인 상품코드입니다.'));
      }
      return Promise.resolve();
    } catch (error) {
      return Promise.resolve(); // 네트워크 오류 시 통과
    }
  };

  const onFinish = async (values: any) => {
    try {
      setLoading(true);

      // 상품 먼저 저장
      let savedProduct;
      if (isEditMode) {
        const updateData: ProductUpdate = {
          brand_id: values.brand_id,
          product_code: values.product_code,
          product_name: values.product_name,
          description: values.description,
        };
        savedProduct = await productService.updateProduct(productId!, updateData);
      } else {
        const createData: ProductCreate = {
          brand_id: values.brand_id,
          product_code: values.product_code,
          product_name: values.product_name,
          description: values.description,
        };
        savedProduct = await productService.createProduct(createData);
      }

      // 이미지 업로드 처리
      if (imageFile) {
        const brandName = brands.find(b => b.id === values.brand_id)?.name || '';
        if (!brandName) {
          message.error('브랜드 정보를 찾을 수 없습니다.');
          return;
        }

        const formData = new FormData();

        // File 객체로 변환
        let fileToUpload: File;
        if (imageFile instanceof File) {
          fileToUpload = imageFile;
        } else {
          // UploadFile에서 originFileObj 추출
          fileToUpload = (imageFile as any).originFileObj || imageFile;
        }

        console.log('[IMAGE UPLOAD] File to upload:', fileToUpload);
        formData.append('file', fileToUpload);
        formData.append('brand_name', brandName);
        formData.append('product_code', values.product_code);

        try {
          console.log('[IMAGE UPLOAD] Starting image upload...');
          console.log('[IMAGE UPLOAD] Brand name:', brandName);
          console.log('[IMAGE UPLOAD] Product code:', values.product_code);
          console.log('[IMAGE UPLOAD] File:', imageFile);

          const token = localStorage.getItem('access_token');
          // API URL은 상대 경로 사용
          const response = await fetch('/api/v1/products/upload-image', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
            body: formData,
          });

          console.log('[IMAGE UPLOAD] Response status:', response.status);

          if (!response.ok) {
            const errorData = await response.json();
            console.error('[IMAGE UPLOAD] Error response:', errorData);
            throw new Error(errorData.detail || '이미지 업로드 실패');
          }

          const result = await response.json();
          console.log('[IMAGE UPLOAD] Success:', result);
          message.success('상품과 이미지가 저장되었습니다.');
        } catch (error: any) {
          console.error('[IMAGE UPLOAD] Exception:', error);
          message.warning(`상품은 저장되었지만 이미지 업로드에 실패했습니다: ${error.message}`);
        }
      } else {
        message.success(isEditMode ? '상품이 수정되었습니다.' : '상품이 등록되었습니다.');
      }

      // 사이즈별 바코드 저장 및 삭제 처리
      try {
        // 삭제된 바코드 찾기 (원본에는 있지만 현재에는 없는 것)
        const deletedBarcodes = originalSizeBarcodes.filter(orig =>
          !sizeBarcodes.some(current => current.id === orig.id)
        );

        // 삭제된 바코드 API 호출
        for (const barcode of deletedBarcodes) {
          if (barcode.id) {
            await barcodeService.deleteBarcode(barcode.id);
            console.log('Deleted barcode:', barcode.id);
          }
        }

        // 현재 바코드 저장/업데이트
        for (const sizeBarcode of sizeBarcodes) {
          if (sizeBarcode.id) {
            // 기존 바코드 업데이트
            await barcodeService.updateBarcode(sizeBarcode.id, {
              barcode_value: sizeBarcode.barcode_value,
            });
          } else {
            // 새 바코드 생성
            await barcodeService.createBarcode({
              product_id: savedProduct.id,
              size: sizeBarcode.size,
              barcode_value: sizeBarcode.barcode_value,
              barcode_type: 'custom',
            });
          }
        }

        if (deletedBarcodes.length > 0 || sizeBarcodes.length > 0) {
          message.success('바코드가 저장되었습니다.');
        }
      } catch (error: any) {
        console.warn('바코드 저장 실패:', error);
        message.warning('상품은 저장되었지만 일부 바코드 저장에 실패했습니다.');
      }

      // 구매 페이지에서 왔으면 구매 페이지로, 아니면 상품 목록으로
      if (fromPurchase) {
        navigate('/purchases/new');
      } else {
        navigate('/products');
      }
    } catch (error: any) {
      message.error(error.message || '상품 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px' }} onPaste={handlePaste}>
      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
        >
          {/* 기본 정보 */}
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <h3 style={{ marginBottom: 16 }}>기본 정보</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Form.Item
                  label={
                    <span>
                      브랜드{' '}
                      <Button
                        type="link"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => setNewBrandModalVisible(true)}
                        style={{ padding: 0 }}
                      >
                        새 브랜드
                      </Button>
                    </span>
                  }
                  name="brand_id"
                  rules={[{ required: true, message: '브랜드를 선택해주세요.' }]}
                >
                  <Select
                    placeholder="브랜드 선택"
                    showSearch
                    optionFilterProp="children"
                    filterOption={(input, option) =>
                      (option?.label?.toString() ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                  >
                    {brands.map((brand) => (
                      <Option key={brand.id} value={brand.id}>
                        {brand.name}
                      </Option>
                    ))}
                    <Option value="etc">기타</Option>
                  </Select>
                </Form.Item>

                <Form.Item
                  label="상품코드"
                  name="product_code"
                  rules={[
                    { required: true, message: '상품코드를 입력해주세요.' },
                    { max: 100, message: '100자 이내로 입력해주세요.' },
                    { validator: validateProductCode }
                  ]}
                  validateTrigger="onBlur"
                  hasFeedback
                >
                  <Input placeholder="예: NIKE-001" />
                </Form.Item>

                <Form.Item
                  label="상품명"
                  name="product_name"
                  rules={[
                    { required: true, message: '상품명을 입력해주세요.' },
                    { max: 200, message: '200자 이내로 입력해주세요.' }
                  ]}
                >
                  <Input placeholder="상품명을 입력하세요" />
                </Form.Item>
              </div>

              {/* 사이즈별 바코드 */}
              <div style={{ marginTop: 24 }}>
                <h3 style={{ marginBottom: 12 }}>사이즈별 바코드 (선택사항)</h3>

                {/* 기존 바코드 목록 */}
                {sizeBarcodes.length > 0 && (
                  <div style={{ marginBottom: 16, padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                    {sizeBarcodes.map((item, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 0',
                          borderBottom: index < sizeBarcodes.length - 1 ? '1px solid #e8e8e8' : 'none'
                        }}
                      >
                        <span>
                          <strong>{item.size}</strong>: {item.barcode_value}
                        </span>
                        <Button
                          type="text"
                          danger
                          size="small"
                          onClick={() => setSizeBarcodes(sizeBarcodes.filter((_, i) => i !== index))}
                        >
                          삭제
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 새 바코드 추가 */}
                <Row gutter={8} style={{ marginBottom: 8 }}>
                  <Col flex="100px">
                    <Input
                      placeholder="사이즈 (예: M, L, 260)"
                      value={newSizeBarcode.size}
                      onChange={(e) => setNewSizeBarcode({ ...newSizeBarcode, size: e.target.value })}
                    />
                  </Col>
                  <Col flex="auto">
                    <Input
                      placeholder="바코드 번호"
                      value={newSizeBarcode.barcode_value}
                      onChange={(e) => setNewSizeBarcode({ ...newSizeBarcode, barcode_value: e.target.value })}
                    />
                  </Col>
                  <Col>
                    <Button
                      type="primary"
                      onClick={() => {
                        if (newSizeBarcode.size && newSizeBarcode.barcode_value) {
                          setSizeBarcodes([...sizeBarcodes, newSizeBarcode]);
                          setNewSizeBarcode({ size: '', barcode_value: '' });
                        } else {
                          message.warning('사이즈와 바코드를 모두 입력해주세요');
                        }
                      }}
                    >
                      추가
                    </Button>
                  </Col>
                </Row>
              </div>

              {/* 상품 이미지 */}
              <Form.Item label="상품 이미지" style={{ marginTop: 16 }}>
                <Space direction="vertical" size="middle">
                  {imageUrl && (
                    <div
                      style={{
                        border: '1px solid #d9d9d9',
                        borderRadius: 8,
                        padding: 8,
                        display: 'inline-block',
                        cursor: 'pointer'
                      }}
                      onClick={() => {
                        const modal = document.createElement('div');
                        modal.style.cssText = `
                          position: fixed;
                          top: 0;
                          left: 0;
                          width: 100%;
                          height: 100%;
                          background: rgba(0,0,0,0.8);
                          display: flex;
                          align-items: center;
                          justify-content: center;
                          z-index: 9999;
                          cursor: pointer;
                        `;
                        modal.onclick = () => modal.remove();

                        const img = document.createElement('img');
                        img.src = imageUrl;
                        img.style.cssText = `
                          max-width: 90%;
                          max-height: 90%;
                          object-fit: contain;
                          border-radius: 8px;
                        `;

                        modal.appendChild(img);
                        document.body.appendChild(modal);
                      }}
                    >
                      <img
                        src={imageUrl}
                        alt="product"
                        style={{
                          width: 150,
                          height: 150,
                          objectFit: 'contain'
                        }}
                        onError={(e) => {
                          console.error('[IMAGE LOAD ERROR] Failed to load:', imageUrl);
                        }}
                      />
                    </div>
                  )}
                  <Space>
                    <Upload
                      maxCount={1}
                      beforeUpload={() => false}
                      onChange={handleImageChange}
                      showUploadList={false}
                      accept="image/*"
                    >
                      <Button icon={<UploadOutlined />}>
                        {imageUrl ? '이미지 변경' : '이미지 업로드'}
                      </Button>
                    </Upload>
                    {imageUrl && (
                      <Button
                        danger
                        onClick={() => {
                          setImageUrl('');
                          setImageFile(null);
                        }}
                      >
                        이미지 제거
                      </Button>
                    )}
                  </Space>
                  <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
                    이미지를 클릭하면 확대하여 볼 수 있습니다. Ctrl+V로 붙여넣기도 가능합니다.
                  </div>
                </Space>
              </Form.Item>
            </div>

            {/* 상세 정보 */}
            <div>
              <h3 style={{ marginBottom: 16 }}>상세 정보</h3>
              <Form.Item label="설명" name="description">
                <TextArea
                  rows={4}
                  placeholder="상품에 대한 상세 설명을 입력하세요"
                  maxLength={1000}
                  showCount
                />
              </Form.Item>
            </div>

            {/* 버튼 영역 */}
            <Form.Item style={{ marginBottom: 0, textAlign: 'center' }}>
              <Space>
                <Button onClick={() => navigate('/products')}>
                  취소
                </Button>
                <Button type="primary" htmlType="submit" loading={loading}>
                  {isEditMode ? '수정' : '등록'}
                </Button>
              </Space>
            </Form.Item>
          </Space>
        </Form>
      </Card>

      {/* 새 브랜드 등록 모달 */}
      <Modal
        title="새 브랜드 등록"
        open={newBrandModalVisible}
        onCancel={() => {
          setNewBrandModalVisible(false);
          newBrandForm.resetFields();
          setBrandIconFile(null);
          setBrandIconUrl('');
        }}
        onOk={() => newBrandForm.submit()}
        okText="등록"
        cancelText="취소"
      >
        <Form
          form={newBrandForm}
          layout="vertical"
          onFinish={handleCreateNewBrand}
        >
          <Form.Item
            label="브랜드명"
            name="name"
            rules={[{ required: true, message: '브랜드명을 입력해주세요.' }]}
          >
            <Input placeholder="예: Nike" />
          </Form.Item>
          
          <Form.Item label="설명" name="description">
            <TextArea rows={3} placeholder="브랜드 설명 (선택사항)" />
          </Form.Item>

          <Form.Item label="로고 이미지">
            <Upload
              listType="picture-card"
              showUploadList={false}
              beforeUpload={() => false}
              onChange={handleBrandIconChange}
              accept="image/*"
            >
              {brandIconUrl ? (
                <img src={brandIconUrl} alt="brand-icon" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>로고 업로드</div>
                </div>
              )}
            </Upload>
            {brandIconUrl && (
              <Button
                danger
                size="small"
                onClick={() => {
                  setBrandIconUrl('');
                  setBrandIconFile(null);
                }}
                style={{ marginTop: 8 }}
              >
                이미지 제거
              </Button>
            )}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProductFormPage;