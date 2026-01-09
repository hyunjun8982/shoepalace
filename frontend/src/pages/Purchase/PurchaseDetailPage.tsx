import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card,
  Descriptions,
  Table,
  Button,
  Space,
  Tag,
  App,
  Spin,
  Row,
  Col,
  Typography,
  Image,
  InputNumber,
  Form,
  Input,
  DatePicker,
  Select,
  Upload,
} from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  UploadOutlined,
  DeleteOutlined,
  PictureOutlined,
  QrcodeOutlined,
  MobileOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { Purchase, PurchaseItem, PaymentType } from '../../types/purchase';
import { purchaseService } from '../../services/purchase';
import { getFileUrl } from '../../utils/urlUtils';
import { warehouseService } from '../../services/warehouse';
import { uploadService } from '../../services/upload';
import { Warehouse } from '../../types/warehouse';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;
const { Option } = Select;

const PurchaseDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingPrices, setEditingPrices] = useState<{ [key: string]: number }>({});
  const [form] = Form.useForm();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [uploadLoading, setUploadLoading] = useState(false);

  // QR 코드 영수증 업로드 관련 상태
  const [qrCodeToken, setQrCodeToken] = useState<string | null>(null);
  const [qrCodeLoading, setQrCodeLoading] = useState(false);
  const [qrCodePolling, setQrCodePolling] = useState(false);
  const [mobileUploadedUrls, setMobileUploadedUrls] = useState<string[]>([]);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (id) {
      fetchPurchaseDetail();
    }
  }, [id]);

  const fetchPurchaseDetail = async () => {
    try {
      setLoading(true);
      const data = await purchaseService.getPurchase(id!);
      console.log('Purchase detail:', data);
      setPurchase(data);
    } catch (error: any) {
      message.error(error.message || '구매 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const loadWarehouses = async () => {
    try {
      const response = await warehouseService.getWarehouses({ limit: 1000, is_active: true });
      setWarehouses(response.items || []);
    } catch (error) {
      console.error("Failed to load warehouses:", error);
    }
  };

  const getPaymentTypeText = (type: PaymentType) => {
    const config = {
      [PaymentType.CORP_CARD]: '법인카드',
      [PaymentType.CORP_ACCOUNT]: '법인계좌',
      [PaymentType.PERSONAL_CARD]: '개인카드',
    };
    return config[type];
  };

  // 영수증 업로드
  const handleReceiptUpload = async (options: any) => {
    const { file, onSuccess, onError } = options;
    setUploadLoading(true);
    try {
      console.log('Uploading receipt for purchase:', id);
      const response = await purchaseService.uploadReceipt(id!, file);
      console.log('Upload response:', response);
      message.success('영수증이 업로드되었습니다.');
      // 구매 정보 다시 불러오기
      await fetchPurchaseDetail();
      onSuccess(response);
    } catch (error: any) {
      console.error('Upload failed:', error);
      console.error('Error details:', error.response?.data);
      const errorMsg = error.response?.data?.detail || '영수증 업로드에 실패했습니다.';
      message.error(errorMsg);
      onError(error);
    } finally {
      setUploadLoading(false);
    }
  };

  // 영수증 전체 삭제
  const handleReceiptDelete = async () => {
    if (!purchase?.receipt_url && (!purchase?.receipt_urls || purchase.receipt_urls.length === 0)) return;

    try {
      setUploadLoading(true);
      console.log('Deleting all receipts');
      // 구매 정보 업데이트를 통해 영수증 URL을 모두 삭제
      await purchaseService.updatePurchase(id!, { receipt_url: null, receipt_urls: [] } as any);
      message.success('영수증이 모두 삭제되었습니다.');
      // 구매 정보 다시 불러오기
      await fetchPurchaseDetail();
    } catch (error: any) {
      console.error('Delete failed:', error);
      console.error('Error details:', error.response?.data);
      const errorMsg = error.response?.data?.detail || '영수증 삭제에 실패했습니다.';
      message.error(errorMsg);
    } finally {
      setUploadLoading(false);
    }
  };

  // 영수증 개별 삭제
  const handleReceiptDeleteSingle = async (index: number) => {
    if (!purchase?.receipt_urls || purchase.receipt_urls.length === 0) return;

    try {
      setUploadLoading(true);
      const newUrls = purchase.receipt_urls.filter((_, i) => i !== index);
      await purchaseService.updatePurchase(id!, {
        receipt_url: newUrls.length > 0 ? newUrls[0] : null,
        receipt_urls: newUrls
      } as any);
      message.success('영수증이 삭제되었습니다.');
      await fetchPurchaseDetail();
    } catch (error: any) {
      console.error('Delete failed:', error);
      const errorMsg = error.response?.data?.detail || '영수증 삭제에 실패했습니다.';
      message.error(errorMsg);
    } finally {
      setUploadLoading(false);
    }
  };

  // QR 코드 폴링 정리
  const cleanupPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setQrCodePolling(false);
  }, []);

  // 컴포넌트 언마운트 시 폴링 정리
  useEffect(() => {
    return () => {
      cleanupPolling();
    };
  }, [cleanupPolling]);

  // QR 코드 URL 생성
  const getQrCodeUrl = useCallback((token: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/mobile/receipt/${token}`;
  }, []);

  // QR 코드 생성
  const handleGenerateQrCode = async () => {
    setQrCodeLoading(true);
    try {
      const response = await purchaseService.generateReceiptUploadToken();
      setQrCodeToken(response.token);
      setMobileUploadedUrls([]);
      startPolling(response.token);
      message.success('QR 코드가 생성되었습니다. 모바일로 스캔해주세요.');
    } catch (error: any) {
      console.error('QR code generation failed:', error);
      message.error('QR 코드 생성에 실패했습니다.');
    } finally {
      setQrCodeLoading(false);
    }
  };

  // 폴링 시작
  const startPolling = useCallback((token: string) => {
    setQrCodePolling(true);

    const poll = async () => {
      try {
        const status = await purchaseService.checkReceiptUploadStatus(token);
        if (status.valid && status.uploaded_urls.length > 0) {
          setMobileUploadedUrls(status.uploaded_urls);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    // 즉시 한 번 폴링
    poll();

    // 2초마다 폴링
    pollingIntervalRef.current = setInterval(poll, 2000);

    // 10분 후 자동 종료
    setTimeout(() => {
      cleanupPolling();
      setQrCodeToken(null);
    }, 10 * 60 * 1000);
  }, [cleanupPolling]);

  // QR 코드 완료 - 업로드된 이미지를 구매에 추가
  const handleCloseQrCode = async () => {
    cleanupPolling();

    // 업로드된 이미지가 있으면 구매 정보에 추가
    if (mobileUploadedUrls.length > 0 && purchase) {
      try {
        setUploadLoading(true);
        const currentUrls = purchase.receipt_urls || [];
        const newUrls = [...currentUrls, ...mobileUploadedUrls];
        await purchaseService.updatePurchase(id!, {
          receipt_url: newUrls[0],
          receipt_urls: newUrls
        } as any);
        message.success(`${mobileUploadedUrls.length}장의 영수증이 추가되었습니다.`);
        await fetchPurchaseDetail();
      } catch (error: any) {
        console.error('Failed to save receipts:', error);
        message.error('영수증 저장에 실패했습니다.');
      } finally {
        setUploadLoading(false);
      }
    }

    setQrCodeToken(null);
    setMobileUploadedUrls([]);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!purchase) {
    return <div>구매 정보를 찾을 수 없습니다.</div>;
  }

  // 총액 계산
  const totalAmount = purchase.items?.reduce((sum, item) => {
    const price = editMode && editingPrices[item.id!] !== undefined
      ? editingPrices[item.id!]
      : item.purchase_price;
    return sum + (price * item.quantity);
  }, 0) || 0;

  // 총 수량 계산
  const totalQuantity = purchase.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  // 첫 번째 상품 정보 (모든 아이템이 같은 상품)
  const firstProduct = purchase.items?.[0]?.product;

  // 사이즈별 수량 맵 생성
  const sizeQuantityMap = new Map<string, number>();
  purchase.items?.forEach(item => {
    const size = item.size || 'FREE';
    const current = sizeQuantityMap.get(size) || 0;
    sizeQuantityMap.set(size, current + (item.quantity || 1));
  });

  // 사이즈 정렬
  const sortedSizeEntries = Array.from(sizeQuantityMap.entries()).sort(([a], [b]) => {
    const aNum = parseFloat(a);
    const bNum = parseFloat(b);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum;
    }
    return a.localeCompare(b);
  });

  // 구매가 (모든 아이템이 같은 구매가)
  const purchasePrice = purchase.items?.[0]?.purchase_price || 0;

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        {/* 기본 정보 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '2px solid #1890ff', paddingBottom: 8 }}>
          <Title level={5} style={{ margin: 0 }}>
            기본 정보
          </Title>
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/purchases')}
            >
              목록으로
            </Button>
            {!editMode ? (
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => {
                  setEditMode(true);
                  loadWarehouses();
                  form.setFieldsValue({
                    transaction_no: purchase.transaction_no,
                    purchase_date: dayjs(purchase.purchase_date),
                    payment_type: purchase.payment_type,
                    supplier: purchase.supplier,
                    notes: purchase.notes,
                    warehouse_id: purchase.items?.[0]?.warehouse_id || null,
                  });
                  // 가격 정보 초기화
                  const prices: { [key: string]: number } = {};
                  purchase.items?.forEach(item => {
                    if (item.id) {
                      prices[item.id] = item.purchase_price || 0;
                    }
                  });
                  setEditingPrices(prices);
                }}
                style={{ backgroundColor: '#0d1117', borderColor: '#0d1117' }}
              >
                편집
              </Button>
            ) : (
              <>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  style={{ backgroundColor: '#0d1117', borderColor: '#0d1117' }}
                  onClick={async () => {
                    try {
                      const values = await form.validateFields();

                      // 구매 정보 업데이트
                      await purchaseService.updatePurchase(purchase.id!, {
                        ...values,
                        purchase_date: values.purchase_date.format('YYYY-MM-DD'),
                        items: purchase.items?.map(item => ({
                          ...item,
                          warehouse_id: values.warehouse_id || null,
                          product_id: item.product_id,
                          size: item.size,
                          quantity: item.quantity,
                          purchase_price: editingPrices[item.id!] || item.purchase_price,
                          selling_price: item.selling_price,
                          notes: item.notes,
                        })),
                      });

                      message.success('저장되었습니다.');
                      setEditMode(false);
                      fetchPurchaseDetail();
                    } catch (error) {
                      message.error('저장에 실패했습니다.');
                    }
                  }}
                >
                  저장
                </Button>
                <Button
                  icon={<CloseOutlined />}
                  onClick={() => {
                    setEditMode(false);
                    form.resetFields();
                  }}
                >
                  취소
                </Button>
              </>
            )}
          </Space>
        </div>

        {!editMode ? (
          <Descriptions
            bordered
            column={{ xxl: 3, xl: 3, lg: 2, md: 2, sm: 1, xs: 1 }}
            style={{ marginBottom: 24 }}
          >
            <Descriptions.Item label="거래번호">
              {purchase.transaction_no || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="구매일">
              {dayjs(purchase.purchase_date).format('YYYY-MM-DD')}
            </Descriptions.Item>
            <Descriptions.Item label="결제방식">
              {getPaymentTypeText(purchase.payment_type)}
            </Descriptions.Item>
            <Descriptions.Item label="구매가">
              ₩{purchasePrice.toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="구매처">
              {purchase.supplier || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="구매자">
              {purchase.buyer_name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="입고 창고">
              {purchase.items?.[0]?.warehouse ? `[${purchase.items[0].warehouse.name}] ${purchase.items[0].warehouse.location || ''}` : '미지정'}
            </Descriptions.Item>
            <Descriptions.Item label="등록일시">
              {purchase.created_at ? dayjs(purchase.created_at).format('YYYY-MM-DD HH:mm') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="비고" span={2}>
              {purchase.notes || '-'}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Form form={form} layout="vertical">
            <Descriptions
              bordered
              column={{ xxl: 3, xl: 3, lg: 2, md: 2, sm: 1, xs: 1 }}
              style={{ marginBottom: 24 }}
            >
              <Descriptions.Item label="거래번호">
                {purchase.transaction_no || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="구매일">
                <Form.Item name="purchase_date" style={{ margin: 0 }}>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Descriptions.Item>
              <Descriptions.Item label="결제방식">
                <Form.Item name="payment_type" style={{ margin: 0 }}>
                  <Select style={{ width: '100%' }}>
                    <Option value="corp_card">법인카드</Option>
                    <Option value="corp_account">법인계좌</Option>
                    <Option value="personal_card">개인카드</Option>
                  </Select>
                </Form.Item>
              </Descriptions.Item>
              <Descriptions.Item label="구매가">
                ₩{purchasePrice.toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="구매처">
                <Form.Item name="supplier" style={{ margin: 0 }}>
                  <Input placeholder="구매처 입력" />
                </Form.Item>
              </Descriptions.Item>
              <Descriptions.Item label="구매자">
                {purchase.buyer_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="입고 창고">
                <Form.Item name="warehouse_id" style={{ margin: 0 }}>
                  <Select
                    placeholder="창고 선택"
                    allowClear
                    style={{ width: '100%' }}
                  >
                    {warehouses.map(warehouse => (
                      <Option key={warehouse.id} value={warehouse.id}>
                        [{warehouse.name}] {warehouse.location || ''}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Descriptions.Item>
              <Descriptions.Item label="등록일시">
                {purchase.created_at ? dayjs(purchase.created_at).format('YYYY-MM-DD HH:mm') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="비고" span={2}>
                <Form.Item name="notes" style={{ margin: 0 }}>
                  <Input.TextArea rows={2} placeholder="비고 입력" />
                </Form.Item>
              </Descriptions.Item>
            </Descriptions>
          </Form>
        )}

        {/* 상품 정보와 첨부파일을 나란히 배치 */}
        <Row gutter={24}>
          {/* 좌측: 상품 정보 */}
          <Col span={12}>
            <Title level={5} style={{ marginBottom: 16, borderBottom: '2px solid #1890ff', paddingBottom: 8 }}>
              상품 정보
            </Title>

            {/* 상품 정보 카드 */}
            <div style={{
              display: 'flex',
              gap: '16px',
              backgroundColor: '#f5f5f5',
              padding: '16px',
              borderRadius: '8px',
              marginBottom: 16
            }}>
              {/* 상품 이미지 */}
              {firstProduct?.brand_name && firstProduct?.product_code ? (
                <img
                  src={getFileUrl(`/uploads/products/${firstProduct.brand_name}/${firstProduct.product_code}.png`) || ''}
                  alt={firstProduct.product_name}
                  style={{
                    width: 100,
                    height: 100,
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
                  width: 100,
                  height: 100,
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
                <div style={{ fontWeight: 600, fontSize: '18px', marginBottom: 8 }}>
                  {firstProduct?.product_name || '-'}
                </div>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: 4 }}>
                  상품코드: {firstProduct?.product_code || '-'}
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  브랜드: {firstProduct?.brand_name || '-'}
                </div>
              </div>
            </div>

            {/* 사이즈별 수량 테이블 */}
            <Table
              size="small"
              dataSource={sortedSizeEntries.map(([size, qty]) => ({ size, quantity: qty }))}
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
              style={{ marginBottom: 16 }}
            />

            {/* 총계 */}
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
                  {totalQuantity}개
                </div>
              </div>
              <div>
                <div style={{ fontSize: '14px', color: '#666', textAlign: 'right' }}>총 금액</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
                  ₩{totalAmount.toLocaleString()}
                </div>
              </div>
            </div>
          </Col>

          {/* 우측: 영수증 */}
          <Col span={12}>
            <Title level={5} style={{ marginBottom: 16, borderBottom: '2px solid #1890ff', paddingBottom: 8 }}>
              영수증
            </Title>

            {/* 다중 영수증 지원 */}
            {purchase.receipt_urls && purchase.receipt_urls.length > 0 ? (
              <div>
                <Card size="small" style={{ marginBottom: editMode ? 8 : 0 }}>
                  <Image.PreviewGroup>
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 12
                    }}>
                      {purchase.receipt_urls.map((url: string, index: number) => (
                        <div key={index} style={{ position: 'relative' }}>
                          <Image
                            src={getFileUrl(url) || ''}
                            alt={`영수증 ${index + 1}`}
                            style={{
                              width: 200,
                              height: 260,
                              objectFit: 'cover',
                              borderRadius: 4,
                              border: '1px solid #f0f0f0'
                            }}
                          />
                          <Tag
                            style={{
                              position: 'absolute',
                              bottom: 8,
                              left: 8,
                              margin: 0,
                              fontSize: 12
                            }}
                          >
                            #{index + 1}
                          </Tag>
                          {/* 편집 모드에서 개별 삭제 버튼 */}
                          {editMode && (
                            <Button
                              type="primary"
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReceiptDeleteSingle(index);
                              }}
                              loading={uploadLoading}
                              style={{
                                position: 'absolute',
                                top: 8,
                                right: 8,
                                borderRadius: '50%',
                                width: 28,
                                height: 28,
                                padding: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </Image.PreviewGroup>
                </Card>
                {editMode && !qrCodeToken && (
                  <Space style={{ width: '100%', marginTop: 8 }}>
                    <Upload
                      customRequest={handleReceiptUpload}
                      accept="image/*,.pdf"
                      maxCount={1}
                      showUploadList={false}
                    >
                      <Button icon={<UploadOutlined />} loading={uploadLoading}>
                        PC 추가
                      </Button>
                    </Upload>
                    <Button
                      icon={<QrcodeOutlined />}
                      onClick={handleGenerateQrCode}
                      loading={qrCodeLoading}
                    >
                      모바일 촬영
                    </Button>
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={handleReceiptDelete}
                      loading={uploadLoading}
                    >
                      전체 삭제
                    </Button>
                  </Space>
                )}
                {/* QR 코드 표시 */}
                {editMode && qrCodeToken && (
                  <div style={{
                    border: '1px solid #1890ff',
                    borderRadius: 8,
                    padding: 16,
                    backgroundColor: '#e6f7ff',
                    marginTop: 8
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{
                        backgroundColor: 'white',
                        padding: 12,
                        borderRadius: 8,
                        flexShrink: 0
                      }}>
                        <QRCodeSVG value={getQrCodeUrl(qrCodeToken)} size={120} level="H" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, marginBottom: 8 }}>
                          <MobileOutlined style={{ marginRight: 8 }} />
                          모바일로 QR 코드를 스캔하세요
                        </div>
                        {qrCodePolling && (
                          <Tag icon={<SyncOutlined spin />} color="processing">
                            대기 중...
                          </Tag>
                        )}
                        {mobileUploadedUrls.length > 0 && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                            {mobileUploadedUrls.map((url, index) => (
                              <Image
                                key={index}
                                src={getFileUrl(url) || ''}
                                width={50}
                                height={50}
                                style={{ objectFit: 'cover', borderRadius: 4 }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <Button
                        onClick={handleCloseQrCode}
                        type={mobileUploadedUrls.length > 0 ? 'primary' : 'default'}
                        loading={uploadLoading}
                      >
                        {mobileUploadedUrls.length > 0 ? '완료' : '취소'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : purchase.receipt_url ? (
              // 기존 단일 영수증 (하위 호환)
              <div>
                <Card size="small" style={{ marginBottom: editMode ? 8 : 0 }}>
                  <Image
                    src={getFileUrl(purchase.receipt_url) || ''}
                    alt="영수증"
                    style={{ width: '100%', height: 'auto' }}
                    preview={{ mask: '크게 보기' }}
                  />
                </Card>
                {editMode && !qrCodeToken && (
                  <Space style={{ width: '100%', marginTop: 8 }}>
                    <Upload
                      customRequest={handleReceiptUpload}
                      accept="image/*,.pdf"
                      maxCount={1}
                      showUploadList={false}
                    >
                      <Button icon={<UploadOutlined />} loading={uploadLoading}>
                        PC 추가
                      </Button>
                    </Upload>
                    <Button
                      icon={<QrcodeOutlined />}
                      onClick={handleGenerateQrCode}
                      loading={qrCodeLoading}
                    >
                      모바일 촬영
                    </Button>
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={handleReceiptDelete}
                      loading={uploadLoading}
                    >
                      삭제
                    </Button>
                  </Space>
                )}
                {/* QR 코드 표시 */}
                {editMode && qrCodeToken && (
                  <div style={{
                    border: '1px solid #1890ff',
                    borderRadius: 8,
                    padding: 16,
                    backgroundColor: '#e6f7ff',
                    marginTop: 8
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{
                        backgroundColor: 'white',
                        padding: 12,
                        borderRadius: 8,
                        flexShrink: 0
                      }}>
                        <QRCodeSVG value={getQrCodeUrl(qrCodeToken)} size={120} level="H" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, marginBottom: 8 }}>
                          <MobileOutlined style={{ marginRight: 8 }} />
                          모바일로 QR 코드를 스캔하세요
                        </div>
                        {qrCodePolling && (
                          <Tag icon={<SyncOutlined spin />} color="processing">
                            대기 중...
                          </Tag>
                        )}
                        {mobileUploadedUrls.length > 0 && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                            {mobileUploadedUrls.map((url, index) => (
                              <Image
                                key={index}
                                src={getFileUrl(url) || ''}
                                width={50}
                                height={50}
                                style={{ objectFit: 'cover', borderRadius: 4 }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <Button
                        onClick={handleCloseQrCode}
                        type={mobileUploadedUrls.length > 0 ? 'primary' : 'default'}
                        loading={uploadLoading}
                      >
                        {mobileUploadedUrls.length > 0 ? '완료' : '취소'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {editMode ? (
                  qrCodeToken ? (
                    // QR 코드 표시
                    <div style={{
                      border: '1px solid #1890ff',
                      borderRadius: 8,
                      padding: 16,
                      backgroundColor: '#e6f7ff'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{
                          backgroundColor: 'white',
                          padding: 12,
                          borderRadius: 8,
                          flexShrink: 0
                        }}>
                          <QRCodeSVG value={getQrCodeUrl(qrCodeToken)} size={120} level="H" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, marginBottom: 8 }}>
                            <MobileOutlined style={{ marginRight: 8 }} />
                            모바일로 QR 코드를 스캔하세요
                          </div>
                          {qrCodePolling && (
                            <Tag icon={<SyncOutlined spin />} color="processing">
                              대기 중...
                            </Tag>
                          )}
                          {mobileUploadedUrls.length > 0 && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                              {mobileUploadedUrls.map((url, index) => (
                                <Image
                                  key={index}
                                  src={getFileUrl(url) || ''}
                                  width={50}
                                  height={50}
                                  style={{ objectFit: 'cover', borderRadius: 4 }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        <Button
                          onClick={handleCloseQrCode}
                          type={mobileUploadedUrls.length > 0 ? 'primary' : 'default'}
                          loading={uploadLoading}
                        >
                          {mobileUploadedUrls.length > 0 ? '완료' : '취소'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // 업로드 옵션
                    <div>
                      <div style={{
                        border: '2px dashed #d9d9d9',
                        borderRadius: 8,
                        padding: '24px',
                        backgroundColor: '#fafafa',
                        textAlign: 'center',
                        marginBottom: 12
                      }}>
                        <UploadOutlined style={{ fontSize: 32, color: '#999', marginBottom: 8 }} />
                        <div style={{ color: '#666' }}>영수증을 업로드하세요</div>
                      </div>
                      <Space style={{ width: '100%' }}>
                        <Upload
                          customRequest={handleReceiptUpload}
                          accept="image/*,.pdf"
                          maxCount={1}
                          showUploadList={false}
                        >
                          <Button icon={<UploadOutlined />} loading={uploadLoading}>
                            PC 업로드
                          </Button>
                        </Upload>
                        <Button
                          icon={<QrcodeOutlined />}
                          onClick={handleGenerateQrCode}
                          loading={qrCodeLoading}
                        >
                          모바일 촬영
                        </Button>
                      </Space>
                    </div>
                  )
                ) : (
                  <div style={{
                    padding: '60px 20px',
                    textAlign: 'center',
                    border: '2px dashed #d9d9d9',
                    borderRadius: '8px',
                    backgroundColor: '#fafafa',
                    color: '#8c8c8c'
                  }}>
                    첨부된 영수증이 없습니다
                  </div>
                )}
              </div>
            )}
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default PurchaseDetailPage;
