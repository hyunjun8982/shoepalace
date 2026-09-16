import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  InputNumber,
  DatePicker,
  Select,
  Row,
  Col,
  App,
  Tooltip,
  Popconfirm,
  Image,
  Modal,
  Form,
  Tabs,
  Upload,
} from 'antd';
import {
  CheckCircleOutlined,
  ReloadOutlined,
  ExportOutlined,
  DeleteOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { InventoryAdjustment } from '../../types/inventory';
import { inventoryService } from '../../services/inventory';
import { returnService, ReturnItem } from '../../services/returns';
import { useAuth } from '../../contexts/AuthContext';
import { brandService, Brand } from '../../services/brand';
import { getBrandIconUrl } from '../../utils/imageUtils';
import { getFileUrl } from '../../utils/urlUtils';
import { BarcodeInput } from '../../components/BarcodeInput';
import { barcodeService, BarcodeSearchResult } from '../../services/barcode';
import { productService } from '../../services/product';
import { Product } from '../../types/product';

const { Search } = Input;

const DefectiveItemsPage: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [searchText, setSearchText] = useState('');
  // 기본값 '전체': 출고 처리 후에도 목록에 남아 출고 정보를 확인할 수 있도록
  const [statusFilter, setStatusFilter] = useState<'in_stock' | 'shipped' | 'all'>('all');

  // 반품 입고 (바코드 스캔) 관련 상태
  const [returnInModalVisible, setReturnInModalVisible] = useState(false);
  const [scannedResult, setScannedResult] = useState<BarcodeSearchResult | null>(null);
  const [returnInReason, setReturnInReason] = useState('');
  const [returnInLoading, setReturnInLoading] = useState(false);
  const [returnImageFile, setReturnImageFile] = useState<File | null>(null);
  const [returnImagePreview, setReturnImagePreview] = useState<string>('');

  // 반품 출고 처리 관련 상태
  const [returnOutRecord, setReturnOutRecord] = useState<ReturnItem | null>(null);
  const [returnOutLoading, setReturnOutLoading] = useState(false);
  const [returnOutForm] = Form.useForm();

  // 상품 검색으로 추가 관련 상태 (바코드를 모르는 경우 대응)
  const [products, setProducts] = useState<Product[]>([]);
  const [searchProductId, setSearchProductId] = useState<string | undefined>(undefined);
  const [searchBarcodes, setSearchBarcodes] = useState<any[]>([]);
  const [searchBarcodeValue, setSearchBarcodeValue] = useState<string | undefined>(undefined);
  const [searchBarcodesLoading, setSearchBarcodesLoading] = useState(false);

  // 처리 이력 탭 관련 상태
  const [activeTab, setActiveTab] = useState('stock');
  const [historyItems, setHistoryItems] = useState<InventoryAdjustment[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPagination, setHistoryPagination] = useState({ current: 1, pageSize: 20 });

  const fetchBrands = async () => {
    try {
      const response = await brandService.getBrands();
      setBrands(response.items);
    } catch (error) {
      console.error('Failed to fetch brands:', error);
    }
  };

  useEffect(() => {
    fetchBrands();
    loadProducts();
  }, []);

  // 상품 목록 로드 (상품 검색으로 추가용)
  const loadProducts = async () => {
    try {
      const response = await productService.getProducts({
        limit: 1000,
        only_valid: true,
        order_by: 'inventory_desc',
      });
      setProducts(response.items || []);
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  };

  useEffect(() => {
    fetchReturnItems();
  }, [pagination.current, pagination.pageSize, searchText, statusFilter]);

  const fetchReturnItems = async () => {
    try {
      setLoading(true);
      const response = await returnService.getReturnItems({
        skip: (pagination.current - 1) * pagination.pageSize,
        limit: pagination.pageSize,
        status: statusFilter,
        search: searchText || undefined,
      });
      setReturnItems(response.items);
      setTotal(response.total);
    } catch (error: any) {
      console.error('Failed to fetch return items:', error);
      message.error('반품 목록 조회 실패: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  // 처리 이력 조회 (반품 유형만)
  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const response = await inventoryService.getAdjustmentHistory({
        skip: (historyPagination.current - 1) * historyPagination.pageSize,
        limit: historyPagination.pageSize,
        adjustment_type: 'return',
      });
      setHistoryItems(response.items);
      setHistoryTotal(response.total);
    } catch (error: any) {
      console.error('Failed to fetch return history:', error);
      message.error('처리 이력 조회 실패: ' + (error.response?.data?.detail || error.message));
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, historyPagination.current, historyPagination.pageSize]);

  // ===== 반품 입고 =====
  const handleBarcodeFound = (result: BarcodeSearchResult) => {
    if (!result.product_id || result.product_id === '') {
      message.error('등록되지 않은 바코드입니다. 상품 등록 후 반품 입고가 가능합니다.');
      return;
    }
    setScannedResult(result);
    setReturnInReason('');
    setReturnImageFile(null);
    setReturnImagePreview('');
    setReturnInModalVisible(true);
  };

  const handleBarcodeNotFound = (barcode: string) => {
    message.error(`등록되지 않은 바코드입니다: ${barcode}`);
  };

  // 상품 검색: 상품 선택 시 해당 상품의 바코드 목록 로드
  const handleSearchProductChange = async (productId: string | undefined) => {
    setSearchProductId(productId);
    setSearchBarcodeValue(undefined);
    setSearchBarcodes([]);

    if (!productId) return;

    setSearchBarcodesLoading(true);
    try {
      const barcodes = await barcodeService.getAllBarcodesByProduct(productId);
      setSearchBarcodes(barcodes || []);
      if (!barcodes || barcodes.length === 0) {
        message.info('이 상품에 등록된 바코드가 없습니다');
      }
    } catch (error) {
      console.error('Failed to load barcodes:', error);
      message.error('바코드 목록 조회에 실패했습니다');
    } finally {
      setSearchBarcodesLoading(false);
    }
  };

  // 상품 검색으로 추가: 선택한 바코드를 스캔한 것과 동일하게 처리 (입고 확인 모달)
  const handleSearchAddProduct = async () => {
    if (!searchProductId) {
      message.warning('상품을 선택해주세요');
      return;
    }
    if (!searchBarcodeValue) {
      message.warning('바코드(사이즈)를 선택해주세요');
      return;
    }

    try {
      const result = await barcodeService.searchByBarcode(searchBarcodeValue);
      handleBarcodeFound(result);
      setSearchBarcodeValue(undefined);
    } catch (error: any) {
      message.error(error.message || '바코드 검색에 실패했습니다');
    }
  };

  // 이미지 파일 검증 및 미리보기 설정
  const validateAndSetImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('이미지 파일만 업로드 가능합니다');
      return false;
    }
    if (file.size / 1024 / 1024 > 10) {
      message.error('이미지는 10MB 이하여야 합니다');
      return false;
    }
    setReturnImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setReturnImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
    return false; // 자동 업로드 방지
  };

  // 클립보드 붙여넣기 지원
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

  // 반품 입고 확정 (건별 개별 등록, 구매금액 0원)
  const handleReturnInConfirm = async () => {
    if (!scannedResult) return;
    try {
      setReturnInLoading(true);
      const created = await returnService.createReturnItem(
        scannedResult.product_id,
        scannedResult.size,
        returnInReason || undefined,
      );

      // 불량 사진 업로드 (선택)
      if (returnImageFile) {
        try {
          await returnService.uploadReturnImage(created.id, returnImageFile);
        } catch (error) {
          console.error('Failed to upload return image:', error);
          message.warning('사진 업로드에 실패했지만 반품 입고는 완료되었습니다.');
        }
      }

      message.success(`${scannedResult.product_name} (${scannedResult.size}) 반품 입고 완료 - 구매금액 0원`);
      setReturnInModalVisible(false);
      setScannedResult(null);
      setReturnImageFile(null);
      setReturnImagePreview('');
      fetchReturnItems();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '반품 입고에 실패했습니다.');
    } finally {
      setReturnInLoading(false);
    }
  };

  // ===== 반품 출고 처리 =====
  const handleOpenReturnOut = (record: ReturnItem) => {
    setReturnOutRecord(record);
    returnOutForm.setFieldsValue({
      sale_date: dayjs(),
      customer_name: '번개장터',
      customer_contact: '',
      sale_price: undefined,
      tracking_number: '',
      notes: '',
    });
  };

  const handleReturnOutConfirm = async () => {
    if (!returnOutRecord) return;
    try {
      const values = await returnOutForm.validateFields();
      setReturnOutLoading(true);
      await returnService.shipReturnItem(returnOutRecord.id, {
        sale_date: values.sale_date.format('YYYY-MM-DD'),
        customer_name: values.customer_name,
        customer_contact: values.customer_contact || undefined,
        sale_price: values.sale_price ?? undefined,
        tracking_number: values.tracking_number || undefined,
        notes: values.notes || undefined,
      });
      message.success('반품 출고 처리가 완료되었습니다.');
      setReturnOutRecord(null);
      fetchReturnItems();
    } catch (error: any) {
      if (error?.errorFields) return; // 폼 검증 실패
      message.error(error.response?.data?.detail || '출고 처리에 실패했습니다.');
    } finally {
      setReturnOutLoading(false);
    }
  };

  // ===== 반품 입고 취소 =====
  const handleDeleteReturnItem = async (returnId: string) => {
    try {
      await returnService.deleteReturnItem(returnId);
      message.success('반품 입고가 취소되었습니다.');
      fetchReturnItems();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '입고 취소에 실패했습니다.');
    }
  };

  const columns: ColumnsType<ReturnItem> = [
    {
      title: 'No.',
      key: 'serial',
      width: 55,
      align: 'center',
      render: (_, __, index) => {
        return total - (pagination.current - 1) * pagination.pageSize - index;
      },
    },
    {
      title: '브랜드',
      dataIndex: 'brand_name',
      key: 'brand_name',
      width: 100,
      render: (brandName: string) => {
        if (!brandName) return '-';
        const brand = brands.find(b => b.name === brandName);
        const iconUrl = getBrandIconUrl(brand?.icon_url);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {iconUrl && (
              <img
                src={iconUrl}
                alt={brandName}
                style={{ width: 24, height: 24, objectFit: 'contain' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span style={{ fontSize: '13px' }}>{brandName}</span>
          </div>
        );
      },
    },
    {
      title: '상품 이미지',
      key: 'image',
      width: 75,
      render: (_, record) => {
        const imagePath = record.brand_name && record.sku_code
          ? getFileUrl(`/uploads/products/${record.brand_name}/${record.sku_code}.png`)
          : null;

        if (imagePath) {
          return (
            <Image
              src={imagePath}
              width={50}
              height={50}
              style={{ objectFit: 'cover', borderRadius: '4px' }}
              preview={{ mask: '보기' }}
            />
          );
        }
        return <span style={{ color: '#ccc' }}>-</span>;
      },
    },
    {
      title: '상품코드',
      dataIndex: 'sku_code',
      key: 'sku_code',
      width: 120,
      render: (code: string) => <Tag color="geekblue" style={{ fontSize: '13px' }}>{code || '-'}</Tag>,
    },
    {
      title: '상품명',
      dataIndex: 'product_name',
      key: 'product_name',
      width: 180,
      render: (name: string) => (
        <span style={{ fontWeight: 500, fontSize: '14px' }}>{name}</span>
      ),
    },
    {
      title: '사이즈',
      dataIndex: 'size',
      key: 'size',
      width: 70,
      align: 'center',
      render: (size: string) => <Tag>{size || 'FREE'}</Tag>,
    },
    {
      title: '반품 사유',
      dataIndex: 'reason',
      key: 'reason',
      width: 160,
      render: (reason: string) => (
        <Tooltip title={reason}>
          <span style={{
            display: 'block',
            maxWidth: 150,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#595959'
          }}>
            {reason || '-'}
          </span>
        </Tooltip>
      ),
    },
    {
      title: '불량 사진',
      dataIndex: 'image_url',
      key: 'image_url',
      width: 75,
      align: 'center',
      render: (imageUrl: string) => {
        if (!imageUrl) {
          return <span style={{ color: '#ccc', fontSize: 11 }}>없음</span>;
        }
        return (
          <Image
            src={getFileUrl(imageUrl) || ''}
            width={50}
            height={50}
            style={{ objectFit: 'cover', borderRadius: '4px', border: '1px solid #d9d9d9' }}
            preview={{ mask: '보기' }}
          />
        );
      },
    },
    {
      title: '입고일',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 100,
      render: (v: string, record) => (
        <div>
          <div style={{ fontSize: 12 }}>{v ? new Date(v).toLocaleDateString('ko-KR') : '-'}</div>
          {record.received_by_name && (
            <div style={{ fontSize: 11, color: '#999' }}>{record.received_by_name}</div>
          )}
        </div>
      ),
    },
    {
      title: '출고 정보',
      key: 'ship_info',
      width: 160,
      render: (_, record) => {
        if (record.status !== 'shipped') {
          return <Tag color="orange">보유 중</Tag>;
        }
        return (
          <div style={{ fontSize: 12 }}>
            <div>
              <Tag color="geekblue" style={{ marginRight: 4 }}>출고</Tag>
              {record.sale_date ? new Date(record.sale_date).toLocaleDateString('ko-KR') : '-'}
            </div>
            <div style={{ color: '#595959', marginTop: 2 }}>
              {record.customer_name || '-'}
              {record.sale_price != null && (
                <span style={{ fontWeight: 600, marginLeft: 6 }}>
                  ₩{Number(record.sale_price).toLocaleString()}
                </span>
              )}
            </div>
            {record.tracking_number && (
              <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                송장: {record.tracking_number}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: '작업',
      key: 'action',
      width: 160,
      align: 'center',
      render: (_, record) => {
        if (record.status === 'shipped') {
          return <span style={{ color: '#bbb', fontSize: 12 }}>처리 완료</span>;
        }
        return (
          <Space size="small">
            <Button
              size="small"
              icon={<ExportOutlined />}
              onClick={() => handleOpenReturnOut(record)}
              style={{
                backgroundColor: '#1d39c4',
                borderColor: '#1d39c4',
                color: '#fff',
              }}
            >
              출고 처리
            </Button>
            <Popconfirm
              title="입고 취소"
              description="이 반품 건을 삭제하시겠습니까? (반품 재고 -1)"
              onConfirm={() => handleDeleteReturnItem(record.id)}
              okText="삭제"
              cancelText="취소"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  // 처리 이력 컬럼
  const historyColumns: ColumnsType<InventoryAdjustment> = [
    {
      title: '처리일시',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (v: string) => v ? new Date(v).toLocaleString('ko-KR', {
        year: '2-digit', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      }) : '-',
    },
    {
      title: '구분',
      dataIndex: 'quantity',
      key: 'type',
      width: 90,
      align: 'center',
      render: (qty: number) => qty > 0
        ? <Tag color="green">반품 입고</Tag>
        : <Tag color="geekblue">출고 처리</Tag>,
    },
    {
      title: '상품',
      key: 'product',
      width: 240,
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.product_name || '-'}</div>
          <div style={{ fontSize: 12, color: '#999' }}>
            [{record.brand_name || '-'}] {record.sku_code || '-'}
          </div>
        </div>
      ),
    },
    {
      title: '수량',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 70,
      align: 'center',
      render: (qty: number) => (
        <span style={{ fontWeight: 600, color: qty > 0 ? '#52c41a' : '#1d39c4' }}>
          {qty > 0 ? `+${qty}` : qty}
        </span>
      ),
    },
    {
      title: '상세 내역',
      dataIndex: 'notes',
      key: 'notes',
      render: (notes: string) => (
        <span style={{ fontSize: 13, color: '#595959' }}>{notes || '-'}</span>
      ),
    },
    {
      title: '처리자',
      dataIndex: 'adjusted_by_name',
      key: 'adjusted_by_name',
      width: 90,
      align: 'center',
      render: (name: string) => name || '-',
    },
  ];

  return (
    <div style={{ padding: '16px' }}>
      {/* 반품 입고: 바코드 스캔 / 상품 검색 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card
            title="반품 입고 (바코드 스캔)"
            size="small"
            style={{
              height: '100%',
              borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}
          >
            <div style={{ marginBottom: 8, fontSize: 12, color: '#999' }}>
              검수 탈락 등으로 반품된 상품의 바코드를 스캔하면 <strong>구매금액 0원</strong>으로 반품 재고에 입고됩니다.
              건별로 개별 등록되어 사유·사진을 각각 관리할 수 있습니다.
            </div>
            <BarcodeInput
              onBarcodeFound={handleBarcodeFound}
              onBarcodeNotFound={handleBarcodeNotFound}
              placeholder="반품 상품 바코드를 스캔하거나 입력..."
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title="상품 검색으로 반품 입고"
            size="small"
            style={{
              height: '100%',
              borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}
          >
            <Select
              showSearch
              allowClear
              placeholder="상품명 또는 상품코드로 검색..."
              value={searchProductId}
              onChange={handleSearchProductChange}
              style={{ width: '100%', marginBottom: 8 }}
              size="large"
              filterOption={(input, option) =>
                String((option as any)?.searchText ?? '').toLowerCase().includes(input.toLowerCase())
              }
              optionLabelProp="selectedLabel"
              options={products.map(p => ({
                value: p.id,
                searchText: `${p.brand_name || ''} ${p.product_name} ${p.product_code}`,
                selectedLabel: `${p.product_name} (${p.product_code})`,
                label: (
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 600 }}>{p.product_name}</span>
                    <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>
                      [{p.brand_name || '-'}] {p.product_code}
                    </span>
                  </div>
                ),
              }))}
            />
            <Row gutter={8}>
              <Col flex="auto">
                <Select
                  placeholder={searchProductId ? '바코드(사이즈) 선택' : '상품을 먼저 선택하세요'}
                  value={searchBarcodeValue}
                  onChange={(value) => setSearchBarcodeValue(value)}
                  style={{ width: '100%' }}
                  size="large"
                  disabled={!searchProductId}
                  loading={searchBarcodesLoading}
                  notFoundContent={searchBarcodesLoading ? '조회 중...' : '등록된 바코드가 없습니다'}
                  optionLabelProp="selectedLabel"
                  options={searchBarcodes.map((b: any) => ({
                    value: b.barcode_value,
                    selectedLabel: b.size,
                    label: (
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{b.size}</span>
                        <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>{b.barcode_value}</span>
                      </div>
                    ),
                  }))}
                />
              </Col>
              <Col flex="80px">
                <Button
                  type="primary"
                  size="large"
                  block
                  onClick={handleSearchAddProduct}
                  style={{ backgroundColor: '#1d39c4', borderColor: '#1d39c4' }}
                >
                  추가
                </Button>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>반품 관리</span>
            <Tag color="red">{total}건</Tag>
          </div>
        }
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => (activeTab === 'history' ? fetchHistory() : fetchReturnItems())}
          >
            새로고침
          </Button>
        }
        style={{
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
        }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'stock',
              label: '반품 재고',
              children: (
                <>
                  {/* 검색/필터 영역 */}
                  <Row gutter={16} style={{ marginBottom: 16 }}>
                    <Col span={8}>
                      <Search
                        placeholder="상품명, 상품코드 검색"
                        allowClear
                        onSearch={(value) => {
                          setSearchText(value);
                          setPagination({ ...pagination, current: 1 });
                        }}
                        style={{ width: '100%' }}
                      />
                    </Col>
                    <Col span={4}>
                      <Select
                        style={{ width: '100%' }}
                        value={statusFilter}
                        onChange={(value) => {
                          setStatusFilter(value);
                          setPagination({ ...pagination, current: 1 });
                        }}
                        options={[
                          { value: 'in_stock', label: '보유 중' },
                          { value: 'shipped', label: '출고 완료' },
                          { value: 'all', label: '전체' },
                        ]}
                      />
                    </Col>
                  </Row>

                  {/* 테이블 (건별 개별 행) */}
                  <Table
                    columns={columns}
                    dataSource={returnItems}
                    loading={loading}
                    rowKey="id"
                    pagination={{
                      current: pagination.current,
                      pageSize: pagination.pageSize,
                      total: total,
                      showSizeChanger: true,
                      showQuickJumper: true,
                      showTotal: (total) => `총 ${total}건`,
                      onChange: (page, pageSize) => {
                        setPagination({ current: page, pageSize: pageSize || 20 });
                      },
                    }}
                  />
                </>
              ),
            },
            {
              key: 'history',
              label: '처리 이력',
              children: (
                <Table
                  columns={historyColumns}
                  dataSource={historyItems}
                  loading={historyLoading}
                  rowKey="id"
                  pagination={{
                    current: historyPagination.current,
                    pageSize: historyPagination.pageSize,
                    total: historyTotal,
                    showSizeChanger: true,
                    showTotal: (t) => `총 ${t}건`,
                    onChange: (page, pageSize) => {
                      setHistoryPagination({ current: page, pageSize: pageSize || 20 });
                    },
                  }}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* 반품 입고 확인 모달 */}
      <Modal
        title="반품 입고 확인"
        open={returnInModalVisible}
        onOk={handleReturnInConfirm}
        onCancel={() => {
          setReturnInModalVisible(false);
          setScannedResult(null);
          setReturnImageFile(null);
          setReturnImagePreview('');
        }}
        okText="반품 입고 (0원)"
        cancelText="취소"
        confirmLoading={returnInLoading}
        okButtonProps={{ style: { backgroundColor: '#1d39c4', borderColor: '#1d39c4' } }}
      >
        {scannedResult && (
          <div onPaste={handleImagePaste}>
            <div style={{
              padding: '12px',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              marginBottom: 16,
            }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                {scannedResult.product_name}
              </div>
              <div style={{ fontSize: 13, color: '#666' }}>
                [{scannedResult.brand_name || '-'}] {scannedResult.product_code} · 사이즈 {scannedResult.size}
              </div>
            </div>
            <div style={{ marginBottom: 12, fontSize: 13 }}>
              이 상품을 <strong>구매금액 0원</strong>으로 반품 재고에 입고합니다. (건별 개별 등록)
            </div>
            <Input.TextArea
              rows={2}
              placeholder="반품 사유 (선택, 예: 크림 검수 탈락 - 박음질 불량)"
              value={returnInReason}
              onChange={(e) => setReturnInReason(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            {/* 불량 사진 업로드 */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {returnImagePreview ? (
                <>
                  <Image
                    src={returnImagePreview}
                    alt="불량 사진 미리보기"
                    width={80}
                    height={80}
                    style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #d9d9d9' }}
                    preview={{ mask: '보기' }}
                  />
                  <Button
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      setReturnImageFile(null);
                      setReturnImagePreview('');
                    }}
                  >
                    사진 삭제
                  </Button>
                </>
              ) : (
                <>
                  <Upload
                    maxCount={1}
                    beforeUpload={validateAndSetImage}
                    showUploadList={false}
                    accept="image/*"
                  >
                    <Button icon={<UploadOutlined />}>불량 사진 업로드</Button>
                  </Upload>
                  <span style={{ fontSize: 12, color: '#999' }}>
                    또는 이미지 복사 후 <strong style={{ color: '#1890ff' }}>Ctrl+V</strong>
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* 반품 출고 처리 모달 (판매 등록과 유사한 입력) */}
      <Modal
        title="반품 출고 처리"
        open={!!returnOutRecord}
        onOk={handleReturnOutConfirm}
        onCancel={() => setReturnOutRecord(null)}
        okText="출고 처리"
        cancelText="취소"
        confirmLoading={returnOutLoading}
        okButtonProps={{ style: { backgroundColor: '#1d39c4', borderColor: '#1d39c4' } }}
      >
        {returnOutRecord && (
          <div>
            <div style={{
              padding: '12px',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              marginBottom: 16,
            }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                {returnOutRecord.product_name}
              </div>
              <div style={{ fontSize: 13, color: '#666' }}>
                [{returnOutRecord.brand_name || '-'}] {returnOutRecord.sku_code || '-'} · 사이즈 {returnOutRecord.size}
              </div>
              {returnOutRecord.reason && (
                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                  반품 사유: {returnOutRecord.reason}
                </div>
              )}
            </div>
            <Form form={returnOutForm} layout="vertical">
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item
                    name="sale_date"
                    label="판매일"
                    rules={[{ required: true, message: '판매일을 선택해주세요' }]}
                  >
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="customer_name"
                    label="판매처/고객명"
                    rules={[{ required: true, message: '판매처를 입력해주세요' }]}
                  >
                    <Input placeholder="예: 번개장터" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="customer_contact" label="연락처 (선택)">
                    <Input placeholder="예: 010-0000-0000" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="sale_price" label="판매가격 (선택)">
                    <InputNumber
                      min={0}
                      step={1000}
                      style={{ width: '100%' }}
                      placeholder="예: 50000"
                      formatter={(value) => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      parser={(value) => value!.replace(/₩\s?|(,*)/g, '') as any}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="tracking_number" label="송장번호 (선택)">
                <Input placeholder="예: 1234-5678-9012" />
              </Form.Item>
              <Form.Item name="notes" label="메모 (선택)">
                <Input.TextArea rows={2} placeholder="추가 메모" />
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default DefectiveItemsPage;
