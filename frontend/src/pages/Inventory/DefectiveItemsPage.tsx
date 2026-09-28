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
  Radio,
} from 'antd';
import {
  CheckCircleOutlined,
  ReloadOutlined,
  ExportOutlined,
  DeleteOutlined,
  UploadOutlined,
  EditOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { InventoryAdjustment } from '../../types/inventory';
import { inventoryService } from '../../services/inventory';
import {
  returnService,
  ReturnItem,
  RegistrationStatus,
  REGISTRATION_STATUS_OPTIONS,
  REGISTRATION_PLATFORM_PRESETS,
} from '../../services/returns';
import { UnregisteredBarcodeModal } from '../../components/UnregisteredBarcodeModal';
import { useAuth } from '../../contexts/AuthContext';
import { brandService, Brand } from '../../services/brand';
import { getBrandIconUrl } from '../../utils/imageUtils';
import { getFileUrl } from '../../utils/urlUtils';
import { BarcodeInput } from '../../components/BarcodeInput';
import { barcodeService, BarcodeSearchResult } from '../../services/barcode';
import { productService } from '../../services/product';
import { Product } from '../../types/product';

const { Search } = Input;

// 반품 입고 대기 목록 1줄 (같은 상품+사이즈는 수량으로 합산)
interface PendingReturn {
  key: string;
  product_id: string;
  size: string;
  quantity: number;
  reason: string;
  registration_status: RegistrationStatus;
  registration_platforms: string[];
  imageFile?: File;
  imagePreview?: string;
  product_name: string;
  product_code: string;
  brand_name?: string;
  image_url?: string;
}

const PLATFORM_OPTIONS = REGISTRATION_PLATFORM_PRESETS.map(p => ({ value: p, label: p }));

// 상품 이미지 경로: 저장된 image_url 우선, 없으면 업로드 규칙(브랜드 공백→'-', 품번 '/'→'-')으로 추정
const getProductImageSrc = (imageUrl?: string, brandName?: string, productCode?: string) => {
  if (imageUrl) return getFileUrl(imageUrl);
  if (brandName && productCode) {
    return getFileUrl(`/uploads/products/${brandName.replace(/ /g, '-')}/${productCode.replace(/\//g, '-')}.png`);
  }
  return null;
};

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
  const [registrationFilter, setRegistrationFilter] = useState<RegistrationStatus | undefined>(undefined);

  // 반품 재고 선택 (일괄 삭제용, 보유 중 건만 선택 가능)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // 반품 입고 대기 목록 (여러 건 입력 후 한 번에 등록)
  const [pendingItems, setPendingItems] = useState<PendingReturn[]>([]);
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  // 미등록 바코드 → 상품 등록 팝업
  const [unregisteredBarcodeModalVisible, setUnregisteredBarcodeModalVisible] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');

  // 등록여부 수정 모달
  const [regEditRecord, setRegEditRecord] = useState<ReturnItem | null>(null);
  const [regEditStatus, setRegEditStatus] = useState<RegistrationStatus>('unregistered');
  const [regEditPlatforms, setRegEditPlatforms] = useState<string[]>([]);
  const [regEditSaving, setRegEditSaving] = useState(false);

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
  }, [pagination.current, pagination.pageSize, searchText, statusFilter, registrationFilter]);

  const fetchReturnItems = async () => {
    try {
      setLoading(true);
      const response = await returnService.getReturnItems({
        skip: (pagination.current - 1) * pagination.pageSize,
        limit: pagination.pageSize,
        status: statusFilter,
        registration_status: registrationFilter,
        search: searchText || undefined,
      });
      setReturnItems(response.items);
      setTotal(response.total);
      setSelectedRowKeys([]); // 목록이 바뀌면 선택 해제 (보이지 않는 건이 삭제되는 것 방지)
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

  // ===== 반품 입고 (대기 목록) =====
  // 같은 상품+사이즈는 수량 증가, 없으면 새 줄 추가
  const addPendingItem = (info: {
    product_id: string;
    size: string;
    product_name: string;
    product_code: string;
    brand_name?: string;
    image_url?: string;
  }) => {
    setPendingItems(prev => {
      const idx = prev.findIndex(p => p.product_id === info.product_id && p.size === info.size);
      if (idx >= 0) {
        return prev.map((p, i) => (i === idx ? { ...p, quantity: p.quantity + 1 } : p));
      }
      return [...prev, {
        ...info,
        key: `${info.product_id}_${info.size}_${Date.now()}`,
        quantity: 1,
        reason: '',
        registration_status: 'unregistered',
        registration_platforms: [],
      }];
    });
    message.success(`${info.product_name} (${info.size}) +1 추가됨`);
  };

  const updatePendingItem = (key: string, patch: Partial<PendingReturn>) => {
    setPendingItems(prev => prev.map(p => (p.key === key ? { ...p, ...patch } : p)));
  };

  const removePendingItem = (key: string) => {
    setPendingItems(prev => prev.filter(p => p.key !== key));
  };

  const handleBarcodeFound = (result: BarcodeSearchResult) => {
    // 포이즌 정보만 있는 경우 (product_id 없음) → 상품 등록 팝업
    if (!result.product_id || result.product_id === '') {
      setScannedBarcode(result.barcode_value);
      setUnregisteredBarcodeModalVisible(true);
      return;
    }
    addPendingItem({
      product_id: result.product_id,
      size: result.size,
      product_name: result.product_name,
      product_code: result.product_code,
      brand_name: result.brand_name,
      image_url: result.image_url,
    });
  };

  // 미등록 바코드 → 상품 등록 팝업
  const handleBarcodeNotFound = (barcode: string) => {
    setScannedBarcode(barcode);
    setUnregisteredBarcodeModalVisible(true);
  };

  // 상품 등록 팝업에서 등록 완료 → 대기 목록에 바로 추가
  const handleNewProductRegistered = (
    newProduct: Product,
    barcodeInfo: { barcode_value: string; size: string; image_url?: string },
  ) => {
    loadProducts();
    addPendingItem({
      product_id: newProduct.id,
      size: barcodeInfo.size,
      product_name: newProduct.product_name,
      product_code: newProduct.product_code,
      brand_name: newProduct.brand_name,
      image_url: barcodeInfo.image_url || newProduct.image_url,
    });
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

  // 상품 검색으로 추가: 선택한 바코드를 스캔한 것과 동일하게 처리 (대기 목록에 추가)
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

  // 대기 목록 줄에 불량 사진 지정 (검증 + 미리보기)
  const setPendingImage = (key: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('이미지 파일만 업로드 가능합니다');
      return false;
    }
    if (file.size / 1024 / 1024 > 10) {
      message.error('이미지는 10MB 이하여야 합니다');
      return false;
    }
    const reader = new FileReader();
    reader.onload = (e) => updatePendingItem(key, {
      imageFile: file,
      imagePreview: e.target?.result as string,
    });
    reader.readAsDataURL(file);
    return false; // 자동 업로드 방지
  };

  // 반품 사유 입력칸에서 이미지 붙여넣기(Ctrl+V) 시 해당 줄의 불량 사진으로 지정
  const handlePendingPaste = (key: string, e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          setPendingImage(key, file);
          e.preventDefault();
        }
        break;
      }
    }
  };

  // 일괄 반품 입고 (수량만큼 건별 개별 등록, 구매금액 0원)
  const handleBatchSubmit = async () => {
    if (pendingItems.length === 0) return;
    try {
      setBatchSubmitting(true);
      const result = await returnService.createReturnItemsBatch(pendingItems.map(p => ({
        product_id: p.product_id,
        size: p.size,
        quantity: p.quantity,
        reason: p.reason.trim() || undefined,
        registration_status: p.registration_status,
        registration_platforms: p.registration_status === 'registered' ? p.registration_platforms : undefined,
      })));

      // 불량 사진 업로드 (선택) - 해당 줄로 생성된 모든 건에 동일 사진 적용
      let imageFailed = 0;
      for (let i = 0; i < pendingItems.length; i++) {
        const file = pendingItems[i].imageFile;
        if (!file) continue;
        for (const id of result.lines[i]?.ids || []) {
          try {
            await returnService.uploadReturnImage(id, file);
          } catch (error) {
            console.error('Failed to upload return image:', error);
            imageFailed++;
          }
        }
      }

      message.success(`반품 입고 완료: 총 ${result.total_created}건 (구매금액 0원)`);
      if (imageFailed > 0) {
        message.warning(`사진 업로드 ${imageFailed}건이 실패했지만 반품 입고는 완료되었습니다.`);
      }
      setPendingItems([]);
      fetchReturnItems();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '반품 입고에 실패했습니다.');
    } finally {
      setBatchSubmitting(false);
    }
  };

  // ===== 등록여부 수정 =====
  const handleOpenRegEdit = (record: ReturnItem) => {
    setRegEditRecord(record);
    setRegEditStatus(record.registration_status || 'unregistered');
    setRegEditPlatforms(record.registration_platforms || []);
  };

  const handleRegEditSave = async () => {
    if (!regEditRecord) return;
    try {
      setRegEditSaving(true);
      await returnService.updateRegistration(
        regEditRecord.id,
        regEditStatus,
        regEditStatus === 'registered' ? regEditPlatforms : undefined,
      );
      message.success('등록여부가 수정되었습니다.');
      setRegEditRecord(null);
      fetchReturnItems();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '등록여부 수정에 실패했습니다.');
    } finally {
      setRegEditSaving(false);
    }
  };

  // 등록여부 + 등록처 표시 (반품 재고 테이블)
  const renderRegistration = (record: ReturnItem) => {
    const opt = REGISTRATION_STATUS_OPTIONS.find(o => o.value === record.registration_status)
      || REGISTRATION_STATUS_OPTIONS[1];
    const platforms = record.registration_platforms || [];
    return (
      <Tooltip title="클릭하여 등록여부 수정">
        <div style={{ cursor: 'pointer' }} onClick={() => handleOpenRegEdit(record)}>
          <Tag color={opt.color} style={{ marginRight: 0 }}>
            {opt.label} <EditOutlined style={{ fontSize: 10 }} />
          </Tag>
          {platforms.length > 0 && (
            <div style={{ marginTop: 4, fontSize: 11, color: '#595959' }}>
              {platforms.join(', ')}
            </div>
          )}
        </div>
      </Tooltip>
    );
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

  // ===== 반품 입고 일괄 취소 =====
  const handleBulkDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      setBulkDeleting(true);
      const result = await returnService.bulkDeleteReturnItems(selectedRowKeys as string[]);
      message.success(result.message);
      fetchReturnItems();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '일괄 삭제에 실패했습니다.');
    } finally {
      setBulkDeleting(false);
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
      title: '등록여부',
      key: 'registration',
      width: 110,
      align: 'center',
      render: (_, record) => renderRegistration(record),
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

  // 반품 입고 대기 목록 컬럼
  const pendingColumns: ColumnsType<PendingReturn> = [
    {
      title: '이미지',
      key: 'product_image',
      width: 70,
      align: 'center',
      render: (_, record) => {
        const src = getProductImageSrc(record.image_url, record.brand_name, record.product_code);
        if (!src) return <span style={{ color: '#ccc' }}>-</span>;
        return (
          <Image
            src={src}
            width={48}
            height={48}
            style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #f0f0f0' }}
            preview={{ mask: '보기' }}
            fallback="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><rect width='48' height='48' fill='%23f5f5f5'/><text x='24' y='29' font-size='11' text-anchor='middle' fill='%23bbb'>없음</text></svg>"
          />
        );
      },
    },
    {
      title: '상품',
      key: 'product',
      width: 220,
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.product_name}</div>
          <div style={{ fontSize: 12, color: '#999' }}>
            [{record.brand_name || '-'}] {record.product_code}
          </div>
        </div>
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
      title: '수량',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      render: (quantity: number, record) => (
        <InputNumber
          min={1}
          max={100}
          value={quantity}
          onChange={(value) => updatePendingItem(record.key, { quantity: value || 1 })}
          size="small"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '반품 사유',
      dataIndex: 'reason',
      key: 'reason',
      render: (reason: string, record) => (
        <Input
          size="small"
          placeholder="예: 크림 검수 탈락 - 박음질 불량"
          value={reason}
          onChange={(e) => updatePendingItem(record.key, { reason: e.target.value })}
          onPaste={(e) => handlePendingPaste(record.key, e)}
        />
      ),
    },
    {
      title: '등록여부',
      dataIndex: 'registration_status',
      key: 'registration_status',
      width: 110,
      render: (status: RegistrationStatus, record) => (
        <Select
          size="small"
          value={status}
          onChange={(value) => updatePendingItem(record.key, {
            registration_status: value,
            registration_platforms: value === 'registered' ? record.registration_platforms : [],
          })}
          options={REGISTRATION_STATUS_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '등록처',
      dataIndex: 'registration_platforms',
      key: 'registration_platforms',
      width: 200,
      render: (platforms: string[], record) => (
        <Select
          size="small"
          mode="tags"
          placeholder={record.registration_status === 'registered' ? '크림/포이즌 또는 직접 입력' : '등록완료 시 입력'}
          value={platforms}
          onChange={(value) => updatePendingItem(record.key, { registration_platforms: value })}
          options={PLATFORM_OPTIONS}
          tokenSeparators={[',']}
          disabled={record.registration_status !== 'registered'}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '불량 사진',
      key: 'image',
      width: 110,
      align: 'center',
      render: (_, record) => record.imagePreview ? (
        <Space size={4}>
          <Image
            src={record.imagePreview}
            width={36}
            height={36}
            style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #d9d9d9' }}
            preview={{ mask: '보기' }}
          />
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => updatePendingItem(record.key, { imageFile: undefined, imagePreview: undefined })}
          />
        </Space>
      ) : (
        <Tooltip title="반품 사유 칸에서 Ctrl+V 로 붙여넣기도 가능">
          <Upload
            maxCount={1}
            beforeUpload={(file) => setPendingImage(record.key, file)}
            showUploadList={false}
            accept="image/*"
          >
            <Button size="small" icon={<UploadOutlined />}>사진</Button>
          </Upload>
        </Tooltip>
      ),
    },
    {
      title: '',
      key: 'remove',
      width: 50,
      align: 'center',
      render: (_, record) => (
        <Button
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removePendingItem(record.key)}
        />
      ),
    },
  ];

  const pendingTotalQty = pendingItems.reduce((sum, p) => sum + p.quantity, 0);

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
              스캔한 상품은 아래 <strong>반품 입고 대기 목록</strong>에 추가되며, 수량·사유·등록여부를 입력한 뒤
              한 번에 <strong>구매금액 0원</strong>으로 입고합니다. 미등록 바코드는 상품 등록 팝업이 열립니다.
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

      {/* 반품 입고 대기 목록 (여러 건 입력 후 한 번에 등록) */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>반품 입고 대기 목록</span>
            {pendingItems.length > 0 && (
              <Tag color="blue">{pendingItems.length}개 품목 · 총 {pendingTotalQty}개</Tag>
            )}
          </div>
        }
        size="small"
        extra={
          <Space>
            <Popconfirm
              title="대기 목록 비우기"
              description="입력한 대기 목록을 모두 지우시겠습니까?"
              onConfirm={() => setPendingItems([])}
              okText="비우기"
              cancelText="취소"
              disabled={pendingItems.length === 0}
            >
              <Button disabled={pendingItems.length === 0 || batchSubmitting}>비우기</Button>
            </Popconfirm>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleBatchSubmit}
              loading={batchSubmitting}
              disabled={pendingItems.length === 0}
              style={pendingItems.length > 0 ? { backgroundColor: '#1d39c4', borderColor: '#1d39c4' } : undefined}
            >
              일괄 반품 입고{pendingTotalQty > 0 ? ` (${pendingTotalQty}건, 0원)` : ''}
            </Button>
          </Space>
        }
        style={{
          marginBottom: 16,
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
        }}
      >
        <Table
          columns={pendingColumns}
          dataSource={pendingItems}
          rowKey="key"
          size="small"
          pagination={false}
          locale={{ emptyText: '바코드를 스캔하거나 상품 검색으로 반품 상품을 추가하세요' }}
        />
        {pendingItems.some(p => p.quantity > 1 && p.imageFile) && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
            * 수량이 2개 이상인 줄의 불량 사진은 해당 줄로 생성되는 모든 건에 동일하게 적용됩니다.
          </div>
        )}
      </Card>

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
                    <Col span={4}>
                      <Select
                        style={{ width: '100%' }}
                        allowClear
                        placeholder="등록여부 전체"
                        value={registrationFilter}
                        onChange={(value) => {
                          setRegistrationFilter(value);
                          setPagination({ ...pagination, current: 1 });
                        }}
                        options={REGISTRATION_STATUS_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                      />
                    </Col>
                    <Col flex="auto" style={{ textAlign: 'right' }}>
                      <Popconfirm
                        title="선택 삭제 (입고 취소)"
                        description={`선택한 ${selectedRowKeys.length}건을 삭제하시겠습니까? (반품 재고 -${selectedRowKeys.length})`}
                        onConfirm={handleBulkDelete}
                        okText="삭제"
                        cancelText="취소"
                        okButtonProps={{ danger: true }}
                        disabled={selectedRowKeys.length === 0}
                      >
                        <Button
                          danger
                          icon={<DeleteOutlined />}
                          disabled={selectedRowKeys.length === 0}
                          loading={bulkDeleting}
                        >
                          선택 삭제{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length}건)` : ''}
                        </Button>
                      </Popconfirm>
                    </Col>
                  </Row>

                  {/* 테이블 (건별 개별 행) */}
                  <Table
                    columns={columns}
                    dataSource={returnItems}
                    loading={loading}
                    rowKey="id"
                    rowSelection={{
                      selectedRowKeys,
                      onChange: setSelectedRowKeys,
                      // 출고 완료 건은 삭제 불가 → 선택 비활성화
                      getCheckboxProps: (record) => ({ disabled: record.status === 'shipped' }),
                    }}
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

      {/* 미등록 바코드 → 상품 등록 팝업 (구매 등록과 동일) */}
      <UnregisteredBarcodeModal
        barcode={scannedBarcode}
        visible={unregisteredBarcodeModalVisible}
        onSuccess={handleNewProductRegistered}
        onCancel={() => setUnregisteredBarcodeModalVisible(false)}
      />

      {/* 등록여부 수정 모달 */}
      <Modal
        title="등록여부 수정"
        open={!!regEditRecord}
        onOk={handleRegEditSave}
        onCancel={() => setRegEditRecord(null)}
        okText="저장"
        cancelText="취소"
        confirmLoading={regEditSaving}
        okButtonProps={{ style: { backgroundColor: '#1d39c4', borderColor: '#1d39c4' } }}
      >
        {regEditRecord && (
          <div>
            <div style={{
              padding: '12px',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              marginBottom: 16,
            }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                {regEditRecord.product_name}
              </div>
              <div style={{ fontSize: 13, color: '#666' }}>
                [{regEditRecord.brand_name || '-'}] {regEditRecord.sku_code || '-'} · 사이즈 {regEditRecord.size}
              </div>
            </div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>등록여부</div>
            <Radio.Group
              value={regEditStatus}
              onChange={(e) => {
                setRegEditStatus(e.target.value);
                if (e.target.value !== 'registered') setRegEditPlatforms([]);
              }}
              optionType="button"
              buttonStyle="solid"
              options={REGISTRATION_STATUS_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              style={{ marginBottom: 16 }}
            />
            <div style={{ marginBottom: 6, fontWeight: 500 }}>등록처</div>
            <Select
              mode="tags"
              placeholder={regEditStatus === 'registered' ? '크림/포이즌 선택 또는 직접 입력 후 Enter' : '등록완료 선택 시 입력할 수 있습니다'}
              value={regEditPlatforms}
              onChange={setRegEditPlatforms}
              options={PLATFORM_OPTIONS}
              tokenSeparators={[',']}
              disabled={regEditStatus !== 'registered'}
              style={{ width: '100%' }}
            />
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
