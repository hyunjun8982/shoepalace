import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Form,
  Input,
  Select,
  DatePicker,
  Button,
  Table,
  InputNumber,
  Card,
  Space,
  App,
  Checkbox,
  Tooltip,
  Upload,
  Image,
  Row,
  Col,
  Modal,
} from 'antd';
import { PlusOutlined, DeleteOutlined, UploadOutlined, MinusCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { purchaseService } from '../../services/purchase';
import { productService } from '../../services/product';
import { warehouseService } from '../../services/warehouse';
import { uploadService } from '../../services/upload';
import { PaymentType, PurchaseItem } from '../../types/purchase';
import { Warehouse } from '../../types/warehouse';
import { Product } from '../../types/product';
import dayjs from 'dayjs';
import { getFileUrl } from '../../utils/urlUtils';

const { Option } = Select;
const { TextArea } = Input;

const PurchaseFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [sizeQuantities, setSizeQuantities] = useState<{ size: string; quantity: number }[]>([
    { size: '', quantity: 1 }
  ]);
  const [createSeparately, setCreateSeparately] = useState(false); // 개별 등록 여부 (기본값: false - 한 건으로 등록)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [fileList, setFileList] = useState<any[]>([]);

  // 상품 추가 폼 상태
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [sizeQuantityMap, setSizeQuantityMap] = useState<Record<string, number>>({});
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [warehouseExpanded, setWarehouseExpanded] = useState(false);

  // 상품 목록 로드 및 거래번호 생성
  useEffect(() => {
    loadProducts();
    loadWarehouses();
    if (id) {
      loadPurchase(id);
    } else {
      // 신규 등록일 때 거래번호 자동 생성
      loadNextTransactionNo();
    }
  }, [id]);

  const loadProducts = async () => {
    try {
      const response = await productService.getProducts({ limit: 1000 });
      console.log('Loaded products:', response.items); // 디버깅용
      setProducts(response.items || []);
    } catch (error) {
      console.error('Failed to load products:', error);
      message.error('상품 목록 조회 실패');
    }
  };
  const loadWarehouses = async () => {
    try {
      const response = await warehouseService.getWarehouses({ limit: 1000, is_active: true });
      setWarehouses(response.items || []);
    } catch (error) {
      console.error("Failed to load warehouses:", error);
      message.error("창고 목록 조회 실패");
    }
  };

  const loadNextTransactionNo = async () => {
    try {
      const nextNo = await purchaseService.getNextTransactionNo();
      form.setFieldsValue({ transaction_no: nextNo });
    } catch (error) {
      console.error('Failed to get next transaction no:', error);
      // 에러가 발생해도 사용자가 직접 입력할 수 있으므로 경고만 표시
      console.log('거래번호를 자동으로 가져올 수 없습니다. 직접 입력해주세요.');
    }
  };

  const loadPurchase = async (purchaseId: string) => {
    try {
      const purchase = await purchaseService.getPurchase(purchaseId);
      form.setFieldsValue({
        ...purchase,
        purchase_date: dayjs(purchase.purchase_date),
      });

      // 영수증 URL이 있으면 fileList에 추가
      if (purchase.receipt_url) {
        setReceiptUrl(purchase.receipt_url);
        // 미리보기를 위해 전체 URL 설정 (getFileUrl 사용)
        const fullUrl = getFileUrl(purchase.receipt_url);
        setFileList([{
          uid: '-1',
          name: '영수증',
          status: 'done',
          url: purchase.receipt_url,
          thumbUrl: fullUrl,  // 썸네일 URL 추가
        }]);
      }

      // items에 product 정보 추가
      const itemsWithProductInfo = purchase.items.map(item => ({
        ...item,
        product_name: item.product?.product_name || item.product_name || '',
        product_code: item.product?.product_code || item.product_code || '',
      }));

      console.log('Loaded purchase items:', itemsWithProductInfo);
      setItems(itemsWithProductInfo);
    } catch (error) {
      message.error('구매 정보 조회 실패');
    }
  };

  // 상품 선택 변경 핸들러
  const handleProductChange = (productId: string) => {
    setSelectedProductId(productId);
    const product = products.find(p => p.id === productId);
    setSelectedProduct(product || null);
    setSizeQuantityMap({});
  };

  // 카테고리별 사이즈 목록 가져오기
  const getSizesForCategory = (category?: string): string[] => {
    if (!category) return [];

    switch (category) {
      case 'shoes':
        return Array.from({ length: 17 }, (_, i) => (220 + i * 5).toString());
      case 'clothing':
        return ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL', 'FREE'];
      case 'hats':
      case 'bags':
      case 'accessories':
      case 'socks':
        return ['FREE'];
      default:
        return [];
    }
  };

  // 사이즈별 수량 변경 핸들러
  const handleSizeQuantityChange = (size: string, quantity: number) => {
    if (quantity === 0) {
      const newMap = { ...sizeQuantityMap };
      delete newMap[size];
      setSizeQuantityMap(newMap);
    } else {
      setSizeQuantityMap(prev => ({
        ...prev,
        [size]: quantity
      }));
    }
  };

  // 총 수량 계산
  const getTotalQuantity = () => {
    return Object.values(sizeQuantityMap).reduce((sum, qty) => sum + qty, 0);
  };

  // 등록 버튼 핸들러 - 확인 모달 표시
  const handleAddItems = () => {
    if (!selectedProductId) {
      message.warning('상품을 선택해주세요');
      return;
    }
    if (purchasePrice <= 0) {
      message.warning('구매가를 입력해주세요');
      return;
    }

    const product = products.find(p => p.id === selectedProductId);
    if (!product) {
      message.error('상품을 찾을 수 없습니다');
      return;
    }

    // 수량이 입력된 사이즈만 필터링
    const validSizes = Object.entries(sizeQuantityMap).filter(([_, qty]) => qty > 0);

    if (validSizes.length === 0) {
      message.warning('최소 하나 이상의 사이즈 수량을 입력해주세요');
      return;
    }

    // 각 사이즈별로 아이템 생성
    const newItems: PurchaseItem[] = validSizes.map(([size, quantity]) => ({
      product_id: selectedProductId,
      size,
      quantity,
      purchase_price: purchasePrice,
      product_name: product.product_name,
      product_code: product.product_code,
    }));

    setItems(newItems);
    setConfirmModalVisible(true);
  };

  // 최종 등록 확인
  const handleConfirmPurchase = async () => {
    const values = form.getFieldsValue();
    await handleSubmit(values);
  };

  // 상품 삭제
  const handleDeleteItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // 총액 계산
  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + item.purchase_price * item.quantity, 0);
  };

  // 영수증 업로드 처리
  const handleUpload = async (options: any) => {
    const { file, onSuccess, onError } = options;

    setUploadLoading(true);
    try {
      console.log('Starting upload:', file.name);
      const response = await uploadService.uploadReceipt(file);
      console.log('Upload response:', response);
      setReceiptUrl(response.file_url);

      // 미리보기를 위한 전체 URL 생성 (getFileUrl 사용)
      const fullUrl = getFileUrl(response.file_url);
      console.log('Full URL:', fullUrl);

      setFileList([{
        uid: file.uid,
        name: file.name,
        status: 'done',
        url: response.file_url,
        thumbUrl: fullUrl, // 미리보기용 URL 추가
      }]);
      onSuccess(response);
      message.success('영수증이 업로드되었습니다.');
    } catch (error: any) {
      console.error('Upload failed:', error);
      console.error('Error details:', error.response?.data);
      onError(error);
      const errorMsg = error.response?.data?.detail || '영수증 업로드에 실패했습니다.';
      message.error(errorMsg);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleRemove = () => {
    setReceiptUrl(null);
    setFileList([]);
  };

  const handlePreview = async (file: any) => {
    if (file.url) {
      // 상대 경로인 경우 백엔드 URL 추가
      const fullUrl = file.url.startsWith('http')
        ? file.url
        : `http://localhost:8001${file.url}`;
      window.open(fullUrl, '_blank');
    }
  };

  // 폼 제출
  const handleSubmit = async (values: any) => {
    if (items.length === 0) {
      message.error('상품을 추가해주세요');
      return;
    }

    setLoading(true);
    try {
      // 개별 등록 선택 시 (신규 등록일 때만)
      if (!id && createSeparately && items.length > 1) {
        let successCount = 0;
        const errors: string[] = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];

          // 각 상품마다 새로운 거래번호 생성
          let transactionNo = values.transaction_no;
          if (i > 0) {
            try {
              transactionNo = await purchaseService.getNextTransactionNo();
            } catch (error) {
              transactionNo = `${values.transaction_no}-${i + 1}`;
            }
          }

          // size 처리
          let processedSize = item.size;
          if (Array.isArray(item.size)) {
            processedSize = item.size[0];
          }

          const data = {
            ...values,
            transaction_no: transactionNo,
            purchase_date: values.purchase_date.format('YYYY-MM-DD'),
            receipt_url: receiptUrl,
            items: [{
              product_id: item.product_id,
              warehouse_id: values.warehouse_id || null,
              size: processedSize ? String(processedSize) : null,
              quantity: item.quantity || 1,
              purchase_price: item.purchase_price,
              selling_price: item.selling_price || null,
              notes: item.notes || null,
            }],
          };

          try {
            await purchaseService.createPurchase(data);
            successCount++;
          } catch (error: any) {
            const errorMsg = error.response?.data?.detail || '등록 실패';
            errors.push(`${item.product_name || item.product_id}: ${errorMsg}`);
          }
        }

        if (successCount > 0) {
          message.success(`${successCount}건의 구매가 등록되었습니다.`);
        }
        if (errors.length > 0) {
          message.error(`실패: ${errors.join(', ')}`);
        }
        if (successCount > 0) {
          navigate('/purchases');
        }
        return;
      }

      // 기존 방식 (한 번에 등록)
      // items 배열의 각 아이템에서 size 필드를 정리
      const processedItems = items.map(item => {
        // size가 배열인 경우 첫 번째 값만 사용
        let processedSize = item.size;
        if (Array.isArray(item.size)) {
          processedSize = item.size[0];
        }

        return {
          product_id: item.product_id,
          warehouse_id: values.warehouse_id || null,
          size: processedSize ? String(processedSize) : null,
          quantity: item.quantity || 1,
          purchase_price: item.purchase_price,
          selling_price: item.selling_price || null,
          notes: item.notes || null,
        };
      });

      const data = {
        ...values,
        transaction_no: values.transaction_no, // 이미 자동 생성된 값 사용
        purchase_date: values.purchase_date.format('YYYY-MM-DD'),
        receipt_url: receiptUrl,
        items: processedItems,
      };

      console.log('Sending purchase data:', data); // 디버깅용
      console.log('Processed items:', processedItems); // 디버깅용

      if (id) {
        await purchaseService.updatePurchase(id, data);
        message.success('구매 정보 수정 완료');
      } else {
        await purchaseService.createPurchase(data);
        message.success('구매 등록 완료');
      }
      navigate('/purchases');
    } catch (error: any) {
      console.error('Purchase error:', error);
      console.error('Error response:', error.response?.data);

      let errorMsg = '구매 등록 실패';

      if (error.response?.data?.detail) {
        // detail이 문자열인 경우
        if (typeof error.response.data.detail === 'string') {
          errorMsg = error.response.data.detail;
        }
        // detail이 배열인 경우 (validation errors)
        else if (Array.isArray(error.response.data.detail)) {
          console.log('Validation errors:', error.response.data.detail);
          errorMsg = error.response.data.detail.map((e: any) => {
            if (typeof e === 'string') return e;
            if (e.msg) return `${e.loc ? e.loc.join(' > ') : ''}: ${e.msg}`;
            return JSON.stringify(e);
          }).join(', ');
        }
        // detail이 객체인 경우
        else if (typeof error.response.data.detail === 'object') {
          errorMsg = error.response.data.detail.msg ||
                    error.response.data.detail.message ||
                    '구매 등록 중 오류가 발생했습니다';
        }
      } else if (error.message) {
        errorMsg = error.message;
      }

      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // 테이블 컬럼 정의
  const columns: ColumnsType<PurchaseItem> = [
    {
      title: '상품번호',
      dataIndex: 'product_code',
      key: 'product_code',
      width: 120,
    },
    {
      title: '상품명',
      dataIndex: 'product_name',
      key: 'product_name',
    },
    {
      title: '사이즈',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (size: string) => size || '-',
    },
    {
      title: '수량',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      render: (quantity: number) => quantity || 1,
    },
    {
      title: '구매가',
      dataIndex: 'purchase_price',
      key: 'purchase_price',
      width: 120,
      align: 'right',
      render: (price: number) => `₩${price.toLocaleString()}`,
    },
    {
      title: '판매예정가',
      dataIndex: 'selling_price',
      key: 'selling_price',
      width: 120,
      align: 'right',
      render: (price: number) => price ? `₩${price.toLocaleString()}` : '-',
    },
    {
      title: '소계',
      key: 'subtotal',
      width: 120,
      align: 'right',
      render: (_, record) => `₩${(record.purchase_price * record.quantity).toLocaleString()}`,
    },
    {
      title: '작업',
      key: 'action',
      width: 80,
      render: (_, __, index) => (
        <Button
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleDeleteItem(index)}
        />
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
    <Card>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          purchase_date: dayjs(),
          payment_type: PaymentType.CORP_CARD,
        }}
      >
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {/* 왼쪽: 모든 입력 정보 (70%) */}
          <div style={{ flex: '0 0 70%' }}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {/* 첫째 줄: 거래번호, 구매일, 결제방식, 구매처 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
                <Form.Item
                  name="transaction_no"
                  label="거래번호"
                  tooltip="자동으로 생성되며, 필요시 수정 가능합니다"
                  rules={[{ required: true, message: '거래번호를 입력해주세요' }]}
                >
                  <Input placeholder="거래번호" />
                </Form.Item>

                <Form.Item
                  name="purchase_date"
                  label="구매일"
                  rules={[{ required: true, message: '구매일을 선택해주세요' }]}
                >
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  name="payment_type"
                  label="결제방식"
                  rules={[{ required: true, message: '결제방식을 선택해주세요' }]}
                >
                  <Select>
                    <Option value={PaymentType.CORP_CARD}>법인카드</Option>
                    <Option value={PaymentType.CORP_ACCOUNT}>법인계좌</Option>
                    <Option value={PaymentType.PERSONAL_CARD}>개인카드</Option>
                  </Select>
                </Form.Item>

                <Form.Item name="supplier" label="구매처">
                  <Input placeholder="구매처 입력" />
                </Form.Item>
              </div>

              {/* 둘째 줄: 입고 창고 + 메모 */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr', gap: 16 }}>
                <Form.Item name="warehouse_id" label="입고 창고" style={{ marginBottom: 0, minWidth: 0 }}>
                  <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    {/* 선택된 창고 표시 또는 선택 버튼 */}
                    {selectedWarehouseId && !warehouseExpanded ? (
                      <div>
                        {(() => {
                          const selectedWarehouse = warehouses.find(w => w.id === selectedWarehouseId);
                          if (!selectedWarehouse) return null;

                          const imageUrl = selectedWarehouse.image_url ? getFileUrl(selectedWarehouse.image_url) : null;

                          return (
                            <Card
                              size="small"
                              onClick={() => setWarehouseExpanded(true)}
                              style={{
                                cursor: 'pointer',
                                border: '2px solid #1890ff',
                                backgroundColor: '#e6f7ff',
                                maxWidth: '250px'
                              }}
                              bodyStyle={{ padding: '12px' }}
                            >
                              <div style={{ textAlign: 'center' }}>
                                {imageUrl ? (
                                  <img
                                    src={imageUrl}
                                    alt={selectedWarehouse.name}
                                    style={{
                                      width: '100%',
                                      height: '80px',
                                      objectFit: 'contain',
                                      marginBottom: '8px',
                                      borderRadius: '4px'
                                    }}
                                  />
                                ) : (
                                  <div style={{
                                    width: '100%',
                                    height: '80px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: '#f0f0f0',
                                    marginBottom: '8px',
                                    borderRadius: '4px',
                                    fontSize: '48px'
                                  }}>
                                    📦
                                  </div>
                                )}
                                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
                                  {selectedWarehouse.name}
                                </div>
                                <div style={{ fontSize: '12px', color: '#666' }}>
                                  {selectedWarehouse.location || '-'}
                                </div>
                                <div style={{ fontSize: '11px', color: '#1890ff', marginTop: '8px' }}>
                                  클릭하여 변경
                                </div>
                              </div>
                            </Card>
                          );
                        })()}
                      </div>
                    ) : (
                      <div>
                        <Button
                          onClick={() => setWarehouseExpanded(!warehouseExpanded)}
                          style={{ marginBottom: warehouseExpanded ? '12px' : 0 }}
                        >
                          {warehouseExpanded ? '창고 목록 닫기' : '창고 선택'}
                        </Button>
                        {warehouseExpanded && (
                          <div style={{
                            position: 'relative',
                            width: '100%'
                          }}>
                            <div style={{
                              display: 'flex',
                              gap: '12px',
                              overflowX: 'auto',
                              overflowY: 'hidden',
                              paddingBottom: '8px',
                              scrollBehavior: 'smooth',
                              WebkitOverflowScrolling: 'touch',
                              maxHeight: '200px'
                            }}>
                              {warehouses.map(warehouse => {
                                const imageUrl = warehouse.image_url ? getFileUrl(warehouse.image_url) : null;
                                const isSelected = selectedWarehouseId === warehouse.id;

                                return (
                                  <Card
                                    key={warehouse.id}
                                    size="small"
                                    hoverable
                                    onClick={() => {
                                      setSelectedWarehouseId(warehouse.id);
                                      form.setFieldValue('warehouse_id', warehouse.id);
                                      setWarehouseExpanded(false);
                                    }}
                                    style={{
                                      cursor: 'pointer',
                                      border: isSelected ? '2px solid #1890ff' : '1px solid #d9d9d9',
                                      backgroundColor: isSelected ? '#e6f7ff' : '#fff',
                                      transition: 'all 0.3s',
                                      minWidth: '180px',
                                      maxWidth: '180px',
                                      flexShrink: 0,
                                      height: '168px'
                                    }}
                                    bodyStyle={{ padding: '12px', height: '100%', display: 'flex', flexDirection: 'column' }}
                                  >
                                    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', height: '100%' }}>
                                      {imageUrl ? (
                                        <img
                                          src={imageUrl}
                                          alt={warehouse.name}
                                          style={{
                                            width: '100%',
                                            height: '80px',
                                            objectFit: 'contain',
                                            marginBottom: '8px',
                                            borderRadius: '4px'
                                          }}
                                        />
                                      ) : (
                                        <div style={{
                                          width: '100%',
                                          height: '80px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          backgroundColor: '#f0f0f0',
                                          marginBottom: '8px',
                                          borderRadius: '4px',
                                          fontSize: '48px'
                                        }}>
                                          📦
                                        </div>
                                      )}
                                      <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
                                        {warehouse.name}
                                      </div>
                                      <div style={{ fontSize: '12px', color: '#666' }}>
                                        {warehouse.location || '-'}
                                      </div>
                                    </div>
                                  </Card>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Form.Item>

                <Form.Item name="notes" label="메모" style={{ marginBottom: 0 }}>
                  <TextArea rows={3} placeholder="메모 입력" />
                </Form.Item>
              </div>

              {/* 상품 추가 */}
              <Card
                title="상품 추가"
                size="small"
                style={{ marginBottom: 24 }}
              >
                <div style={{ marginBottom: 16 }}>
                  <div style={{ marginBottom: 8 }}>
                    <label>상품 선택</label>
                  </div>
                  <Select
                    showSearch
                    placeholder="상품을 선택하세요"
                    style={{ width: '100%' }}
                    value={selectedProductId || undefined}
                    onChange={handleProductChange}
                    filterOption={(input, option) => {
                      const product = products.find(p => p.id === option?.value);
                      if (!product) return false;
                      const searchText = `${product.product_code} ${product.brand_name || ''} ${product.product_name}`.toLowerCase();
                      return searchText.includes(input.toLowerCase());
                    }}
                    optionRender={(option) => {
                      const product = products.find(p => p.id === option.value);
                      if (!product) return null;

                      const imageUrl = product.brand_name && product.product_code
                        ? getFileUrl(`/uploads/products/${product.brand_name}/${product.product_code}.png`)
                        : null;

                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={product.product_name}
                              style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }}
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div style={{
                              width: 40,
                              height: 40,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: '#f0f0f0',
                              borderRadius: 4,
                              fontSize: 16
                            }}>
                              📦
                            </div>
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, color: '#666' }}>
                              {product.product_code}
                            </div>
                            <div>
                              <span style={{ fontWeight: 500 }}>[{product.brand_name}]</span> {product.product_name}
                            </div>
                          </div>
                        </div>
                      );
                    }}
                    options={products.map(product => ({
                      label: `[${product.brand_name}] ${product.product_name}`,
                      value: product.id,
                    }))}
                  />
                </div>

                {/* 사이즈별 수량 입력 */}
                {selectedProduct && (
                  <div>
                    <div style={{
                      padding: '8px 12px',
                      backgroundColor: '#e6f7ff',
                      borderRadius: '4px',
                      border: '1px solid #91d5ff',
                      marginBottom: 12,
                      fontSize: '12px',
                      color: '#0050b3',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>
                        {selectedProduct.category === 'shoes' && '👟 신발 사이즈'}
                        {selectedProduct.category === 'clothing' && '👕 의류 사이즈'}
                        {['hats', 'bags', 'accessories', 'socks'].includes(selectedProduct.category || '') && '📦 프리 사이즈'}
                      </span>
                      <span>수량을 입력하세요 (0 = 미구매)</span>
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: selectedProduct.category === 'shoes'
                        ? 'repeat(auto-fill, minmax(120px, 1fr))'
                        : 'repeat(auto-fill, minmax(100px, 1fr))',
                      gap: '8px',
                      marginBottom: 16
                    }}>
                      {getSizesForCategory(selectedProduct.category).map(size => (
                        <div key={size} style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          padding: '8px',
                          border: '1px solid #d9d9d9',
                          borderRadius: '4px',
                          backgroundColor: sizeQuantityMap[size] > 0 ? '#e6f7ff' : '#fff'
                        }}>
                          <div style={{ fontWeight: 500, marginBottom: 4, fontSize: '13px' }}>{size}</div>
                          <InputNumber
                            min={0}
                            value={sizeQuantityMap[size] || 0}
                            onChange={(val) => handleSizeQuantityChange(size, val || 0)}
                            style={{ width: '100%' }}
                            size="small"
                          />
                        </div>
                      ))}
                    </div>

                    {/* 구매가 입력 */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: '14px', fontWeight: 500 }}>구매가</label>
                      </div>
                      <InputNumber
                        min={0}
                        value={purchasePrice}
                        onChange={(val) => setPurchasePrice(val || 0)}
                        style={{ width: '100%' }}
                        size="large"
                        formatter={value => `₩${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        placeholder="구매가 입력"
                      />
                    </div>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '4px',
                      marginBottom: 16
                    }}>
                      <div style={{ fontSize: '16px', fontWeight: 500 }}>
                        총 수량: <span style={{ color: '#1890ff', fontSize: '18px' }}>{getTotalQuantity()}</span>개
                      </div>
                      <Button
                        type="primary"
                        icon={<CheckCircleOutlined />}
                        onClick={handleAddItems}
                        disabled={Object.values(sizeQuantityMap).every(qty => qty === 0)}
                        size="large"
                      >
                        등록
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </Space>
          </div>

          {/* 오른쪽: 영수증 영역 (30%) */}
          <div style={{ flex: '0 0 30%', position: 'sticky', top: 24 }}>
            <Form.Item label="영수증">
              {fileList.length === 0 ? (
                <div style={{ paddingRight: 16 }}>
                  <Upload
                    customRequest={handleUpload}
                    onRemove={handleRemove}
                    fileList={[]}
                    accept="image/*"
                    maxCount={1}
                    listType="picture-card"
                    showUploadList={false}
                    style={{ width: '100%', display: 'block' }}
                  >
                    <div style={{ width: '100%', padding: '40px 20px', textAlign: 'center' }}>
                      <UploadOutlined style={{ fontSize: 32, color: '#1890ff' }} />
                      <div style={{ marginTop: 8, whiteSpace: 'nowrap' }}>영수증 업로드</div>
                    </div>
                  </Upload>
                </div>
              ) : (
                <div>
                  {/* 영수증 미리보기 */}
                  <div style={{
                    border: '1px solid #d9d9d9',
                    borderRadius: 8,
                    overflow: 'auto',
                    backgroundColor: '#fafafa',
                    maxHeight: 'calc(100vh - 200px)',
                    position: 'relative'
                  }}>
                    <Image
                      src={fileList[0].thumbUrl || fileList[0].url}
                      style={{
                        width: '100%',
                        objectFit: 'contain',
                        display: 'block'
                      }}
                      preview={{
                        mask: '크게 보기'
                      }}
                    />
                  </div>
                  {/* 수정/삭제 버튼 */}
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <Upload
                      customRequest={handleUpload}
                      onRemove={handleRemove}
                      fileList={[]}
                      accept="image/*"
                      maxCount={1}
                      showUploadList={false}
                      style={{ flex: 1 }}
                    >
                      <Button icon={<UploadOutlined />} style={{ width: '100%' }}>
                        수정
                      </Button>
                    </Upload>
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={handleRemove}
                      style={{ flex: 1 }}
                    >
                      삭제
                    </Button>
                  </div>
                </div>
              )}
            </Form.Item>
          </div>
        </div>
      </Form>

      {/* 확인 모달 */}
      <Modal
        title="구매 정보 확인"
        open={confirmModalVisible}
        onOk={handleConfirmPurchase}
        onCancel={() => setConfirmModalVisible(false)}
        okText="확인"
        cancelText="취소"
        width={700}
        confirmLoading={loading}
        centered={false}
        style={{ top: 20 }}
      >
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ marginBottom: 12, borderBottom: '2px solid #1890ff', paddingBottom: 8 }}>기본 정보</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px', fontSize: '14px' }}>
            <div style={{ color: '#666' }}>거래번호:</div>
            <div style={{ fontWeight: 500 }}>{form.getFieldValue('transaction_no')}</div>

            <div style={{ color: '#666' }}>구매일:</div>
            <div style={{ fontWeight: 500 }}>{form.getFieldValue('purchase_date')?.format('YYYY-MM-DD')}</div>

            <div style={{ color: '#666' }}>결제방식:</div>
            <div style={{ fontWeight: 500 }}>
              {form.getFieldValue('payment_type') === PaymentType.CORP_CARD && '법인카드'}
              {form.getFieldValue('payment_type') === PaymentType.CORP_ACCOUNT && '법인계좌'}
              {form.getFieldValue('payment_type') === PaymentType.PERSONAL_CARD && '개인카드'}
            </div>

            <div style={{ color: '#666' }}>구매가:</div>
            <div style={{ fontWeight: 500, color: '#1890ff' }}>₩{purchasePrice.toLocaleString()}</div>

            {form.getFieldValue('supplier') && (
              <>
                <div style={{ color: '#666' }}>구매처:</div>
                <div style={{ fontWeight: 500 }}>{form.getFieldValue('supplier')}</div>
              </>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <h4 style={{ marginBottom: 12, borderBottom: '2px solid #1890ff', paddingBottom: 8 }}>구매 상품</h4>
          <div style={{
            display: 'flex',
            gap: '16px',
            backgroundColor: '#f5f5f5',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: 12
          }}>
            {/* 상품 이미지 */}
            {selectedProduct?.brand_name && selectedProduct?.product_code ? (
              <img
                src={getFileUrl(`/uploads/products/${selectedProduct.brand_name}/${selectedProduct.product_code}.png`) || ''}
                alt={selectedProduct.product_name}
                style={{
                  width: 80,
                  height: 80,
                  objectFit: 'cover',
                  borderRadius: 8,
                  border: '1px solid #d9d9d9',
                  backgroundColor: '#fff'
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div style={{
                width: 80,
                height: 80,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#fff',
                borderRadius: 8,
                border: '1px solid #d9d9d9',
                fontSize: 32
              }}>
                📦
              </div>
            )}

            {/* 상품 정보 */}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: 4 }}>
                {selectedProduct?.product_name}
              </div>
              <div style={{ fontSize: '13px', color: '#666' }}>
                상품코드: {selectedProduct?.product_code}
              </div>
              <div style={{ fontSize: '13px', color: '#666' }}>
                브랜드: {selectedProduct?.brand_name}
              </div>
            </div>
          </div>

          {/* 사이즈별 수량 테이블 */}
          <Table
            size="small"
            dataSource={Object.entries(sizeQuantityMap)
              .filter(([_, qty]) => qty > 0)
              .map(([size, qty]) => ({ size, quantity: qty }))}
            columns={[
              {
                title: '사이즈',
                dataIndex: 'size',
                key: 'size',
                align: 'center',
                width: 120,
              },
              {
                title: '수량',
                dataIndex: 'quantity',
                key: 'quantity',
                align: 'center',
                width: 120,
                render: (qty) => `${qty}개`,
              },
              {
                title: '금액',
                key: 'amount',
                align: 'right',
                render: (_, record) => `₩${(purchasePrice * record.quantity).toLocaleString()}`,
              },
            ]}
            pagination={false}
            bordered
            rowKey="size"
          />
        </div>

        <div style={{
          padding: '16px',
          backgroundColor: '#e6f7ff',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '14px', color: '#666' }}>총 수량</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
              {getTotalQuantity()}개
            </div>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#666', textAlign: 'right' }}>총 금액</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
              ₩{calculateTotal().toLocaleString()}
            </div>
          </div>
        </div>
      </Modal>
    </Card>
    </div>
  );
};

export default PurchaseFormPage;