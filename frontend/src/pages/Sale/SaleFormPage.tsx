import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card as AntCard,
  Form,
  Input,
  DatePicker,
  Button,
  Table,
  Row,
  Col,
  App,
  InputNumber,
  Upload,
} from 'antd';
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { SaleCreate, SaleItemCreate } from '../../types/sale';
import { saleService } from '../../services/sale';
import { inventoryService } from '../../services/inventory';
import { getFileUrl } from '../../utils/urlUtils';
import { InventoryDetail } from '../../types/inventory';
import { barcodeService, BarcodeSearchResult } from '../../services/barcode';
import { BarcodeInput } from '../../components/BarcodeInput';
import { UnregisteredBarcodeModal } from '../../components/UnregisteredBarcodeModal';

const { TextArea } = Input;

interface SaleFormData {
  sale_date: dayjs.Dayjs;
  customer_name?: string;
  customer_contact?: string;
  tracking_number?: string;
  notes?: string;
}

interface GroupedInventory {
  product_id: string;
  product_name: string;
  brand: string;
  brand_name: string;
  sku_code: string;
  product_code: string;
  product_image_url?: string;
  category?: string;
  sizes: Array<{
    size: string;
    quantity: number;
    available_quantity: number;
  }>;
}

const SaleFormPageNew: React.FC = () => {
  const navigate = useNavigate();
  const { saleId } = useParams();
  const { message } = App.useApp();
  const [form] = Form.useForm<SaleFormData>();
  const [loading, setLoading] = useState(false);
  const [transactionStatementFile, setTransactionStatementFile] = useState<File | null>(null);
  const [taxInvoiceFile, setTaxInvoiceFile] = useState<File | null>(null);
  const [existingTransactionStatementUrl, setExistingTransactionStatementUrl] = useState<string>('');
  const [existingTaxInvoiceUrl, setExistingTaxInvoiceUrl] = useState<string>('');
  const [inventoryItems, setInventoryItems] = useState<InventoryDetail[]>([]);
  const [groupedInventory, setGroupedInventory] = useState<GroupedInventory[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<SaleItemCreate[]>([]);

  // 바코드 검색 관련 상태
  const [barcodeSearchResult, setBarcodeSearchResult] = useState<BarcodeSearchResult | null>(null);
  const [unregisteredBarcodeModalVisible, setUnregisteredBarcodeModalVisible] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string>('');

  // 바코드 스캔 관련 refs
  const barcodeBufferRef = useRef('');
  const barcodeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedBarcodeRef = useRef<string>(''); // 중복 처리 방지
  const groupedInventoryRef = useRef<GroupedInventory[]>([]); // 항상 최신 재고 참조

  const isEditMode = !!saleId;

  useEffect(() => {
    fetchInventoryItems();
    if (isEditMode && saleId) {
      fetchSaleData();
    }
    form.setFieldsValue({
      sale_date: dayjs(),
    });
  }, []);

  // groupedInventory ref 항상 최신 상태 유지
  useEffect(() => {
    groupedInventoryRef.current = groupedInventory;
  }, [groupedInventory]);

  // 전역 바코드 스캔 리스너 (어디서든 바코드 스캔 감지)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 입력 필드에 포커스되어 있으면 무시 (사용자 직접 입력)
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return;
      }

      // 수정자 키 무시
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
        return;
      }

      // Enter 키: 버퍼 제출
      if (e.key === 'Enter' && barcodeBufferRef.current) {
        e.preventDefault();
        e.stopPropagation();
        // 타임아웃 clear (중복 처리 방지)
        if (barcodeTimeoutRef.current) clearTimeout(barcodeTimeoutRef.current);
        handleBarcodeSearchGlobal(barcodeBufferRef.current.trim());
        barcodeBufferRef.current = '';
        return;
      }

      // 일반 문자 추가
      if (e.key.length === 1) {
        barcodeBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      if (barcodeTimeoutRef.current) clearTimeout(barcodeTimeoutRef.current);
    };
  }, []);

  const fetchInventoryItems = async () => {
    try {
      setLoading(true);
      console.log('[SaleFormPage] Fetching inventory items...');
      const response = await inventoryService.getInventoryList({
        limit: 10000
      });
      // 모든 재고 아이템 사용 (재고 0개 포함)
      const allItems = response.items;
      console.log('[SaleFormPage] Inventory items loaded:', allItems.length, allItems);
      setInventoryItems(allItems);

      // 상품별로 그룹화
      const grouped = allItems.reduce((acc: any, item: any) => {
        const existing = acc.find((g: any) => g.product_id === item.product_id);
        if (existing) {
          existing.sizes.push({
            size: item.size,
            quantity: item.quantity,
            available_quantity: item.available_quantity || 0
          });
          existing.category = existing.category || item.category;
        } else {
          // 상품 이미지 URL 생성
          const brand_name = item.brand || '';
          const product_code = item.sku_code || '';
          const image_url = brand_name && product_code
            ? getFileUrl(`/uploads/products/${brand_name}/${product_code}.png`)
            : undefined;

          acc.push({
            product_id: item.product_id,
            product_name: item.product_name,
            brand: item.brand,
            brand_name: brand_name,
            sku_code: item.sku_code,
            product_code: product_code,
            product_image_url: image_url,
            category: item.category,
            sizes: [{
              size: item.size,
              quantity: item.quantity,
              available_quantity: item.available_quantity || 0
            }]
          });
        }
        return acc;
      }, []);

      console.log('[SaleFormPage] Grouped inventory:', grouped.length, grouped);

      // 정렬: 브랜드, 상품코드, 카테고리가 있는 상품 우선 + 재고량 많은 순
      const sorted = grouped.sort((a: any, b: any) => {
        // 1. 유효한 상품(브랜드, 상품코드, 카테고리 모두 있음) 우선
        const aValid = a.brand_name && a.sku_code && a.category;
        const bValid = b.brand_name && b.sku_code && b.category;
        if (aValid && !bValid) return -1;
        if (!aValid && bValid) return 1;

        // 2. 재고량 많은 순
        const aTotalQty = a.sizes.reduce((sum: number, s: any) => sum + s.quantity, 0);
        const bTotalQty = b.sizes.reduce((sum: number, s: any) => sum + s.quantity, 0);
        return bTotalQty - aTotalQty;
      });

      console.log('[SaleFormPage] Setting grouped inventory, count:', sorted.length);
      setGroupedInventory(sorted);
    } catch (error) {
      console.error('[SaleFormPage] Error fetching inventory:', error);
      message.error('재고 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 바코드 검색 함수 (전역 리스너용)
  const handleBarcodeSearchGlobal = useCallback(async (barcodeValue: string) => {
    if (!barcodeValue) return;

    // 중복 처리 방지: 이미 처리 중이면 무시
    if (lastProcessedBarcodeRef.current === barcodeValue) {
      console.log('[Duplicate barcode ignored]', barcodeValue);
      return;
    }

    // 처리 중 표시
    lastProcessedBarcodeRef.current = barcodeValue;
    console.log('[Processing barcode]', barcodeValue);

    try {
      const result = await barcodeService.searchByBarcode(barcodeValue);
      console.log('[Search result]', result.product_name);
      message.success(`상품 검색됨: ${result.product_name}`);
      handleBarcodeFound(result);
    } catch (error: any) {
      if (error.message.includes('등록되지 않았습니다')) {
        // 미등록 바코드
        handleBarcodeNotFound(barcodeValue);
      } else {
        message.error(error.message || '바코드 검색에 실패했습니다.');
      }
    }

    // 200ms 후에 캐시 초기화 (같은 상품 연속 스캔 가능하도록)
    setTimeout(() => {
      if (lastProcessedBarcodeRef.current === barcodeValue) {
        lastProcessedBarcodeRef.current = '';
        console.log('[Cache cleared]', barcodeValue);
      }
    }, 200);
  }, [groupedInventory]);

  // 성공 알림음 (짧고 깔끔한 단일 비프음)
  const playSuccessSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.value = 800; // 낮은 음

      gain.gain.setValueAtTime(0.6, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime + 0.12); // 매우 짧게

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);

      console.log('✓ 성공음 재생');
    } catch (error) {
      console.log('성공음 재생 실패:', error);
    }
  };

  // 바코드 검색 성공 핸들러
  const handleBarcodeFound = useCallback((result: BarcodeSearchResult) => {
    console.log('[SaleFormPage] Barcode found:', result);

    // 포이즌 정보만 있는 경우 (product_id가 빈 문자열)
    if (!result.product_id || result.product_id === '') {
      console.log('[SaleFormPage] Poizon Info Only, opening modal');
      // 알림음은 UnregisteredBarcodeModal에서 재생
      setScannedBarcode(result.barcode_value);
      setUnregisteredBarcodeModalVisible(true);
      return;
    }

    // 등록된 상품인 경우만 성공음 재생
    playSuccessSound();

    // DB에 등록된 상품 - product_id로 매칭
    console.log('[Debug] Searching for product_id:', result.product_id);
    console.log('[Debug] Available product_ids:', groupedInventoryRef.current.map(p => p.product_id));

    const product = groupedInventoryRef.current.find(p => p.product_id === result.product_id);

    if (!product) {
      message.error(`재고 목록에서 해당 상품을 찾을 수 없습니다. (코드: ${result.product_code})`);
      return;
    }

    console.log('[SaleFormPage] Adding to selectedProducts directly', {
      product_id: result.product_id,
      size: result.size,
      product_name: product.product_name
    });

    // 해당 size의 재고 찾기
    const sizeStock = product.sizes.find(s => s.size === result.size);
    if (!sizeStock) {
      message.error(`${result.size} 사이즈의 재고 정보를 찾을 수 없습니다.`);
      return;
    }

    // 같은 상품+사이즈는 수량 증가, 없으면 새로운 행 추가
    setSelectedProducts(prev => {
      const existingItemIndex = prev.findIndex(item =>
        item.product_id === result.product_id && item.size === result.size
      );

      if (existingItemIndex >= 0) {
        // 기존 항목 수량 증가 전 재고 확인
        const existingItem = prev[existingItemIndex];
        const currentQty = existingItem.quantity || 1;
        if (currentQty >= sizeStock.available_quantity) {
          message.warning(`재고 부족 (최대: ${sizeStock.available_quantity}개, 현재: ${currentQty}개)`);
          return prev;
        }
        const newItems = [...prev];
        newItems[existingItemIndex].quantity = currentQty + 1;
        console.log('[SaleFormPage] Quantity increased', {
          product_id: result.product_id,
          size: result.size,
          new_quantity: newItems[existingItemIndex].quantity
        });
        return newItems;
      } else {
        // 새 항목은 재고가 1개 이상이면 추가
        if (sizeStock.available_quantity < 1) {
          message.warning(`재고 부족 (현재: 0개)`);
          return prev;
        }
        // 새로운 항목 추가
        console.log('[SaleFormPage] New item added', {
          product_id: result.product_id,
          size: result.size
        });
        return [...prev, {
          product_id: result.product_id,
          size: result.size,
          quantity: 1,
          seller_sale_price_original: 0,
          seller_sale_currency: 'KRW',
          seller_sale_price_krw: 0,
          product_name: product.product_name,
          product_code: product.product_code,
          brand_name: product.brand_name,
          product_image_url: product.product_image_url || '',
        }];
      }
    });

    message.success(`${result.product_name} (${result.size}) +1 추가됨`);
  }, [groupedInventory]);

  // 바코드 검색 실패 핸들러 (미등록 상품)
  const handleBarcodeNotFound = (barcode: string) => {
    setScannedBarcode(barcode);
    setUnregisteredBarcodeModalVisible(true);
  };

  // 새로운 상품이 등록되었을 때 - 바코드 상품을 바로 selectedProducts에 추가
  const handleNewProductRegistered = (newProduct: any, barcodeInfo: { barcode_value: string; size: string; image_url?: string }) => {
    // 상품 목록 새로고침
    fetchInventoryItems();

    // 바코드 상품을 바로 selectedProducts에 추가 (판매가는 나중에 입력하도록)
    setTimeout(() => {
      setSelectedProducts(prev => {
        const newItems = [...prev];

        // 이미지 URL: 업로드된 이미지 URL 또는 자동 생성 경로
        const imageUrl = barcodeInfo.image_url ||
          (newProduct.brand_name && newProduct.product_code
            ? getFileUrl(`/uploads/products/${newProduct.brand_name}/${newProduct.product_code}.png`)
            : '');

        // 새 바코드 상품을 selectedProducts에 추가
        const newBarCodeItem = {
          product_id: newProduct.id,
          size: barcodeInfo.size,
          quantity: 1,
          seller_sale_price_original: 0,
          seller_sale_currency: 'KRW',
          seller_sale_price_krw: 0,
          product_name: newProduct.product_name,
          product_code: newProduct.product_code,
          brand_name: newProduct.brand_name,
          product_image_url: imageUrl,
        };
        newItems.push(newBarCodeItem);
        console.log('Added new barcode item:', newBarCodeItem);
        console.log('Total items now:', newItems);

        return newItems;
      });

      message.success(`${newProduct.product_name} (${barcodeInfo.size}) +1 추가됨`);
    }, 500);
  };

  const fetchSaleData = async () => {
    try {
      setLoading(true);
      const sale = await saleService.getSale(saleId!);

      form.setFieldsValue({
        sale_date: dayjs(sale.sale_date),
        customer_name: sale.customer_name,
        customer_contact: sale.customer_contact,
        notes: sale.notes,
      });

      if (sale.items) {
        setSelectedProducts(sale.items.map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          size: item.size,
          quantity: item.quantity,
          seller_sale_price_original: item.seller_sale_price_original,
          seller_sale_currency: item.seller_sale_currency,
          seller_sale_price_krw: item.seller_sale_price_krw,
          product_image_url: item.product_image_url,
        })));
      }

      // 기존 파일 URL 로드
      if (sale.transaction_statement_url) {
        setExistingTransactionStatementUrl(sale.transaction_statement_url);
      }
      if (sale.tax_invoice_url) {
        setExistingTaxInvoiceUrl(sale.tax_invoice_url);
      }
    } catch (error) {
      message.error('판매 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };



  const handleRemoveItem = (index: number) => {
    setSelectedProducts(selectedProducts.filter((_, i) => i !== index));
  };

  // 거래명세서 업로드 핸들러
  const handleTransactionStatementUpload = (file: any) => {
    const actualFile = file.originFileObj || file;

    // 파일 형식 검증
    const isExcel = actualFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                    actualFile.type === 'application/vnd.ms-excel' ||
                    actualFile.type === 'text/csv' ||
                    actualFile.name.endsWith('.xlsx') ||
                    actualFile.name.endsWith('.xls') ||
                    actualFile.name.endsWith('.csv');

    if (!isExcel) {
      message.error('엑셀 또는 CSV 파일만 업로드 가능합니다.');
      return false;
    }

    setTransactionStatementFile(actualFile);
    message.success('거래명세서가 업로드되었습니다.');
    return false; // 자동 업로드 방지
  };

  // 세금계산서 업로드 핸들러
  const handleTaxInvoiceUpload = (file: any) => {
    const actualFile = file.originFileObj || file;

    // 파일 형식 검증
    const isValid = actualFile.type?.startsWith('image/') ||
                    actualFile.type === 'application/pdf';

    if (!isValid) {
      message.error('이미지 또는 PDF 파일만 업로드 가능합니다.');
      return false;
    }

    setTaxInvoiceFile(actualFile);
    message.success('세금계산서가 업로드되었습니다.');
    return false; // 자동 업로드 방지
  };


  const calculateTotal = () => {
    return selectedProducts.reduce((total, product) => {
      return total + (product.seller_sale_price_krw * product.quantity);
    }, 0);
  };

  const onFinish = async (values: SaleFormData) => {
    if (selectedProducts.length === 0) {
      message.error('최소 하나의 상품을 추가해야 합니다.');
      return;
    }

    try {
      setLoading(true);

      const saleData: SaleCreate = {
        sale_date: values.sale_date.format('YYYY-MM-DD'),
        customer_name: values.customer_name,
        customer_contact: values.customer_contact,
        notes: values.notes,
        items: selectedProducts,
      };

      let createdOrUpdatedSale;
      if (isEditMode) {
        createdOrUpdatedSale = await saleService.updateSale(saleId!, saleData);
        message.success('판매가 수정되었습니다.');
      } else {
        createdOrUpdatedSale = await saleService.createSale(saleData);
        message.success('판매가 등록되었습니다.');
      }

      // 파일 업로드 처리
      const uploadSaleId = createdOrUpdatedSale.id || saleId;

      if (uploadSaleId) {
        // 거래명세서 업로드
        if (transactionStatementFile) {
          try {
            const formData = new FormData();
            formData.append('file', transactionStatementFile);
            await saleService.uploadTransactionStatement(uploadSaleId, formData);
          } catch (error) {
            console.error('거래명세서 업로드 실패:', error);
            message.warning('거래명세서 업로드에 실패했습니다.');
          }
        }

        // 세금계산서 업로드
        if (taxInvoiceFile) {
          try {
            const formData = new FormData();
            formData.append('file', taxInvoiceFile);
            await saleService.uploadTaxInvoice(uploadSaleId, formData);
          } catch (error) {
            console.error('세금계산서 업로드 실패:', error);
            message.warning('세금계산서 업로드에 실패했습니다.');
          }
        }
      }

      navigate('/sales');
    } catch (error: any) {
      console.error('Sale creation error:', error);

      // 재고 부족 에러 처리
      if (error.response?.status === 400) {
        const errorDetail = error.response?.data?.detail || '';
        if (errorDetail.includes('stock') || errorDetail.includes('재고') || errorDetail.includes('Insufficient')) {
          message.error('재고가 부족합니다. 재고 수량을 확인해주세요.');
          return;
        }
      }

      message.error(error.message || '판매 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 테이블 컬럼 정의
  const selectedProductColumns: ColumnsType<SaleItemCreate> = [
    {
      title: '이미지',
      key: 'image',
      width: 60,
      render: (_, record: any) => {
        if (record.brand_name && record.product_code) {
          return (
            <img
              src={getFileUrl(`/uploads/products/${record.brand_name}/${record.product_code}.png`) || ''}
              alt={record.product_name}
              style={{
                width: 50,
                height: 50,
                objectFit: 'cover',
                borderRadius: 4,
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          );
        }
        return <div style={{ fontSize: 20 }}>📦</div>;
      },
    },
    {
      title: '상품',
      key: 'product',
      render: (_, record: any) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.product_name}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>
            [{record.brand_name || '-'}] {record.product_code}
          </div>
        </div>
      ),
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
      render: (quantity: number, record: any, index: number) => (
        <InputNumber
          min={1}
          value={quantity || 1}
          onChange={(value) => {
            const newItems = [...selectedProducts];
            newItems[index].quantity = value || 1;
            setSelectedProducts(newItems);
          }}
          size="small"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '판매가(원화)',
      dataIndex: 'seller_sale_price_krw',
      key: 'seller_sale_price_krw',
      width: 160,
      align: 'right',
      render: (price: number, record: any, index: number) => (
        <InputNumber
          value={price || 0}
          onChange={(value) => {
            const newItems = [...selectedProducts];
            newItems[index].seller_sale_price_krw = value || 0;
            setSelectedProducts(newItems);
          }}
          formatter={(value) => `₩${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={(value) => value!.replace(/₩\s?|(,*)/g, '') as any}
          min={0}
          step={1000}
          size="large"
          style={{ width: '100%', height: '36px' }}
        />
      ),
    },
    {
      title: '소계',
      key: 'subtotal',
      width: 120,
      align: 'right',
      render: (_, record) => `₩${((record.seller_sale_price_krw || 0) * record.quantity).toLocaleString()}`,
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
          onClick={() => handleRemoveItem(index)}
        />
      ),
    },
  ];


  return (
    <div style={{ padding: '16px' }}>
      <AntCard bodyStyle={{ padding: '16px' }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            sale_date: dayjs(),
          }}
        >
          {/* 판매 기본 정보 */}
          <AntCard
            title="판매 정보"
            size="small"
            style={{ marginBottom: 24 }}
          >
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item
                  name="sale_date"
                  label="판매일"
                  rules={[{ required: true, message: '판매일을 선택해주세요' }]}
                >
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>

              <Col span={8}>
                <Form.Item name="customer_name" label="고객명">
                  <Input placeholder="고객명을 입력하세요" />
                </Form.Item>
              </Col>

              <Col span={8}>
                <Form.Item name="customer_contact" label="연락처">
                  <Input placeholder="연락처를 입력하세요" />
                </Form.Item>
              </Col>

              <Col span={8}>
                <Form.Item name="tracking_number" label="송장번호">
                  <Input placeholder="송장번호를 입력하세요" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="notes" label="메모">
              <TextArea rows={2} placeholder="추가 메모를 입력하세요" />
            </Form.Item>

            {/* 파일 업로드 */}
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col span={12}>
                <div style={{ marginBottom: 8 }}>
                  <label>거래명세서</label>
                </div>
                <Upload
                  beforeUpload={handleTransactionStatementUpload}
                  showUploadList={false}
                  accept=".xlsx,.xls,.csv"
                >
                  <Button icon={<UploadOutlined />} block>
                    거래명세서 업로드
                  </Button>
                </Upload>
                {(transactionStatementFile || existingTransactionStatementUrl) && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#52c41a' }}>
                    ✓ {transactionStatementFile ? transactionStatementFile.name : '기존 파일 있음'}
                  </div>
                )}
              </Col>

              <Col span={12}>
                <div style={{ marginBottom: 8 }}>
                  <label>세금계산서</label>
                </div>
                <Upload
                  beforeUpload={handleTaxInvoiceUpload}
                  showUploadList={false}
                  accept="image/*,.pdf"
                >
                  <Button icon={<UploadOutlined />} block>
                    세금계산서 업로드
                  </Button>
                </Upload>
                {(taxInvoiceFile || existingTaxInvoiceUrl) && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#52c41a' }}>
                    ✓ {taxInvoiceFile ? taxInvoiceFile.name : '기존 파일 있음'}
                  </div>
                )}
              </Col>
            </Row>
          </AntCard>

          {/* 바코드 검색 */}
          <AntCard
            title="바코드 스캔으로 상품 추가"
            size="small"
            style={{ marginBottom: 24 }}
          >
            <BarcodeInput
              onBarcodeFound={handleBarcodeFound}
              onBarcodeNotFound={handleBarcodeNotFound}
              placeholder="바코드 리더기로 스캔하거나 수동으로 입력..."
            />
          </AntCard>

          {/* 추가된 상품 목록 */}
          <AntCard
            title={`추가된 상품 (${selectedProducts.length}건)`}
            size="small"
            style={{ marginBottom: 24 }}
          >
            {selectedProducts.length > 0 ? (
              <>
                <Table
                  columns={selectedProductColumns}
                  dataSource={selectedProducts}
                  pagination={false}
                  bordered
                  rowKey={(_, index) => index}
                  summary={() => (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={5} align="right">
                        <strong>합계</strong>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        <strong>₩{calculateTotal().toLocaleString()}</strong>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={2} />
                    </Table.Summary.Row>
                  )}
                />
                <div style={{ marginTop: 16 }}>
                  <Button
                    type="primary"
                    size="large"
                    style={{ width: '100%', backgroundColor: '#1890ff', height: 44, fontSize: 16 }}
                    htmlType="submit"
                  >
                    판매 등록
                  </Button>
                </div>
              </>
            ) : (
              <div style={{
                border: '2px dashed #d9d9d9',
                borderRadius: 8,
                padding: '32px 24px',
                backgroundColor: '#fafafa',
                color: '#999',
                textAlign: 'center'
              }}>
                바코드를 스캔하여 상품을 추가하세요
              </div>
            )}
          </AntCard>

        </Form>
      </AntCard>


      {/* 미등록 바코드 팝업 */}
      <UnregisteredBarcodeModal
        barcode={scannedBarcode}
        visible={unregisteredBarcodeModalVisible}
        onSuccess={handleNewProductRegistered}
        onCancel={() => setUnregisteredBarcodeModalVisible(false)}
      />
    </div>
  );
};

export default SaleFormPageNew;
