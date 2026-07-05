import React, { useState, useEffect } from 'react';
import {
  Card as AntCard,
  Form,
  Input,
  DatePicker,
  Button,
  Table,
  Select,
  Space,
  Row,
  Col,
  Typography,
  App,
  InputNumber,
  Divider,
  Tag,
  Upload,
  Modal,
} from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { SaleCreate, SaleItemCreate } from '../../types/sale';
import { saleService } from '../../services/sale';
import { inventoryService } from '../../services/inventory';
import { ExchangeService } from '../../services/exchange';
import { getFileUrl } from '../../utils/urlUtils';
import { InventoryDetail } from '../../types/inventory';
import { barcodeService, BarcodeSearchResult } from '../../services/barcode';
import { BarcodeInput } from '../../components/BarcodeInput';
import { UnregisteredBarcodeModal } from '../../components/UnregisteredBarcodeModal';
import { productService } from '../../services/product';
import { cardService } from '../../services/card';
import { Card as CardType, CARD_ISSUER_LABELS, CARD_TYPE_LABELS } from '../../types/card';

const { Option } = Select;
const { TextArea } = Input;
const { Title } = Typography;

interface SaleFormData {
  sale_date: dayjs.Dayjs;
  customer_name?: string;
  customer_contact?: string;
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
  const [cards, setCards] = useState<CardType[]>([]);

  // 상품 추가 폼 상태
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [sizeQuantityMap, setSizeQuantityMap] = useState<Record<string, number>>({});
  const [sellerSalePriceOriginal, setSellerSalePriceOriginal] = useState<number>(0);
  const [sellerSaleCurrency, setSellerSaleCurrency] = useState<string>('KRW');
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);

  // 바코드 검색 관련 상태
  const [barcodeSearchResult, setBarcodeSearchResult] = useState<BarcodeSearchResult | null>(null);
  const [unregisteredBarcodeModalVisible, setUnregisteredBarcodeModalVisible] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string>('');

  const isEditMode = !!saleId;

  useEffect(() => {
    fetchInventoryItems();
    loadCards();
    if (isEditMode) {
      fetchSaleData();
    }
    form.setFieldsValue({
      sale_date: dayjs(),
    });
  }, [saleId]);

  const fetchInventoryItems = async () => {
    try {
      setLoading(true);
      const response = await inventoryService.getInventoryList({
        limit: 10000
      });
      // 모든 재고 아이템 사용 (재고 0개 포함)
      const allItems = response.items;
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

      setGroupedInventory(sorted);
    } catch (error) {
      message.error('재고 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 바코드 검색 성공 핸들러
  const handleBarcodeFound = (result: BarcodeSearchResult) => {
    setSelectedProductId(result.product_id);
    const product = groupedInventory.find(p => p.product_id === result.product_id);
    if (product) {
      message.success(`${product.product_name}이(가) 선택되었습니다.`);
    } else {
      message.warning('재고 목록에서 해당 상품을 찾을 수 없습니다.');
    }
  };

  // 바코드 검색 실패 핸들러 (미등록 상품)
  const handleBarcodeNotFound = (barcode: string) => {
    setScannedBarcode(barcode);
    setUnregisteredBarcodeModalVisible(true);
  };

  // 자동 선택된 상품을 추가
  const handleAutoSelectProduct = (productId: string) => {
    const product = groupedInventory.find(p => p.product_id === productId);
    if (product) {
      setSelectedProductId(productId);
      setBarcodeSearchResult(null);
      message.success(`${product.product_name}이(가) 선택되었습니다.`);
    }
  };

  // 새로운 상품이 등록되었을 때
  const handleNewProductRegistered = () => {
    // 재고 목록 새로고침
    fetchInventoryItems();
    message.success('새 상품이 등록되었습니다. 재고 목록이 새로고침됩니다.');
  };

  const loadCards = async () => {
    try {
      const response = await cardService.getCards({ limit: 1000, is_active: true });
      setCards(response.items || []);
    } catch (error) {
      console.error('Failed to load cards:', error);
    }
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

  const handleProductChange = (productId: string) => {
    setSelectedProductId(productId);
    setSizeQuantityMap({});
  };

  // 전체 사이즈 목록 (220-300)
  const allSizes = [
    '220', '225', '230', '235', '240', '245', '250', '255', '260', '265', '270', '275', '280', '285', '290', '295', '300'
  ];

  // 사이즈 매핑 (표시용)
  const sizeMapping: { [key: string]: string } = {
    '220': 'FREE',
    '225': 'XXS',
    '230': 'XS',
    '235': 'S',
    '240': 'M',
    '245': 'L',
    '250': 'XL',
    '255': 'XXL',
    '260': '170',
    '265': '180',
    '270': '190',
    '275': '200',
    '280': '210',
    '285': '95',
    '290': '100',
    '295': '105',
    '300': '110',
  };

  // 사이즈 표시 함수
  const getSizeDisplay = (size: string): string => {
    if (sizeMapping[size]) {
      return `${size} (${sizeMapping[size]})`;
    }
    return size;
  };

  // 역매핑: 의류/신발 사이즈 -> mm 사이즈
  const reverseSizeMapping: { [key: string]: string } = {
    'FREE': '220',
    'XXS': '225',
    'XS': '230',
    'S': '235',
    'M': '240',
    'L': '245',
    'XL': '250',
    'XXL': '255',
    '170': '260',
    '180': '265',
    '190': '270',
    '200': '275',
    '210': '280',
    '95': '285',
    '100': '290',
    '105': '295',
    '110': '300',
  };

  // 카테고리별 전체 사이즈 목록 가져오기 (항상 220-300 반환)
  const getSizesForCategory = (category?: string): string[] => {
    return allSizes;
  };

  // 사이즈 정렬 함수
  const sortSizes = (sizes: Array<{ size: string; available_quantity: number }>): Array<{ size: string; available_quantity: number }> => {
    return [...sizes].sort((a, b) => {
      const aNum = parseFloat(a.size);
      const bNum = parseFloat(b.size);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return aNum - bNum;
      }
      const sizeOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL', 'FREE'];
      return sizeOrder.indexOf(a.size) - sizeOrder.indexOf(b.size);
    });
  };

  // 재고 수량에 따른 색상 반환
  const getStockColor = (availableQty: number): string => {
    if (availableQty === 0) return '#ff4d4f'; // 빨간색 - 품절
    if (availableQty <= 3) return '#faad14'; // 노란색 - 품절 임박
    return '#1890ff'; // 파란색 - 여유
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

  // 상품 추가 버튼 클릭 시
  const handleShowConfirmModal = () => {
    if (!selectedProductId) {
      message.warning('상품을 선택해주세요.');
      return;
    }

    // 수량이 입력된 사이즈만 필터링
    const validSizes = Object.entries(sizeQuantityMap).filter(([_, qty]) => qty > 0);

    if (validSizes.length === 0) {
      message.warning('최소 하나 이상의 사이즈 수량을 입력해주세요.');
      return;
    }

    if (sellerSalePriceOriginal <= 0) {
      message.warning('판매가를 입력해주세요.');
      return;
    }

    const product = groupedInventory.find(p => p.product_id === selectedProductId);
    if (!product) {
      message.error('상품을 찾을 수 없습니다.');
      return;
    }

    // 재고 검증
    for (const [size, qty] of validSizes) {
      const sizeInfo = product.sizes.find(s => s.size === size);
      if (!sizeInfo) {
        message.error(`사이즈 ${size}를 찾을 수 없습니다.`);
        return;
      }
      if (qty > sizeInfo.available_quantity) {
        message.error(`사이즈 ${size}의 재고가 부족합니다. 사용 가능한 재고: ${sizeInfo.available_quantity}개`);
        return;
      }
    }

    // 여러 사이즈를 selectedProducts에 추가
    const krwPrice = ExchangeService.convertToKRW(sellerSalePriceOriginal, sellerSaleCurrency);
    const newItems: SaleItemCreate[] = validSizes.map(([size, qty]) => ({
      product_id: selectedProductId,
      product_name: product.product_name,
      size: size,
      quantity: qty,
      seller_sale_price_original: sellerSalePriceOriginal,
      seller_sale_currency: sellerSaleCurrency,
      seller_sale_price_krw: krwPrice,
      product_image_url: product.product_image_url || '',
    }));

    // 기존 items에 새로운 상품들 추가
    setSelectedProducts(prev => [...prev, ...newItems]);

    // 상품 추가 폼 초기화 (다음 상품 추가를 위해)
    setSelectedProductId('');
    setSizeQuantityMap({});
    setSellerSalePriceOriginal(0);
    setSellerSaleCurrency('KRW');

    message.success(`${product.product_name}이(가) 추가되었습니다.`);
  };

  // 최종 등록 확인 후 실행
  const handleConfirmSale = async () => {
    const formValues = form.getFieldsValue();

    const product = groupedInventory.find(p => p.product_id === selectedProductId);
    if (!product) return;

    const validSizes = Object.entries(sizeQuantityMap).filter(([_, qty]) => qty > 0);
    const krwPrice = ExchangeService.convertToKRW(sellerSalePriceOriginal, sellerSaleCurrency);

    const saleItems: SaleItemCreate[] = validSizes.map(([size, qty]) => ({
      product_id: selectedProductId,
      product_name: product.product_name,
      size: size,
      quantity: qty,
      seller_sale_price_original: sellerSalePriceOriginal,
      seller_sale_currency: sellerSaleCurrency,
      seller_sale_price_krw: krwPrice,
      product_image_url: product.product_image_url || '',
    }));

    try {
      setLoading(true);
      await saleService.createSale({
        ...formValues,
        sale_date: formValues.sale_date.format('YYYY-MM-DD'),
        items: saleItems
      });

      message.success('판매가 등록되었습니다.');
      setConfirmModalVisible(false);
      navigate('/sales');
    } catch (error: any) {
      message.error(error.message || '판매 등록에 실패했습니다.');
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

  const selectedProductColumns: ColumnsType<SaleItemCreate> = [
    {
      title: '브랜드',
      key: 'brand',
      width: 120,
      render: (_, record) => {
        const product = groupedInventory.find(p => p.product_id === record.product_id);
        return product?.brand || '-';
      },
    },
    {
      title: '상품명',
      dataIndex: 'product_name',
      key: 'product_name',
      width: 200,
    },
    {
      title: '사이즈',
      dataIndex: 'size',
      key: 'size',
      width: 80,
      align: 'center',
    },
    {
      title: '수량',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      align: 'center',
      render: (qty) => <Tag color="blue">{qty}개</Tag>,
    },
    {
      title: '판매가(현지)',
      key: 'seller_sale_price_original',
      width: 140,
      align: 'right',
      render: (_, record) =>
        `${record.seller_sale_currency} ${record.seller_sale_price_original?.toLocaleString() || '0'}`,
    },
    {
      title: '판매가(원화)',
      key: 'seller_sale_price_krw',
      width: 120,
      align: 'right',
      render: (_, record) => `₩${(record.seller_sale_price_krw || 0).toLocaleString()}`,
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
      align: 'center',
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

  const selectedProduct = groupedInventory.find(p => p.product_id === selectedProductId);

  // 전체 사이즈 목록 생성 (재고 0개 포함)
  const getAllSizesWithStock = (): Array<{ size: string; available_quantity: number }> => {
    if (!selectedProduct) return [];

    const category = selectedProduct.category;
    const allSizes = getSizesForCategory(category);

    // 재고 정보와 병합 (역매핑 적용)
    const sizesWithStock = allSizes.map(size => {
      // 재고에서 찾을 때는 원본 사이즈(220) 또는 매핑된 사이즈(FREE, XXS 등) 모두 확인
      let stockInfo = selectedProduct.sizes.find(s => s.size === size);
      if (!stockInfo && sizeMapping[size]) {
        // mm 사이즈로 재고를 찾지 못하면 매핑된 사이즈로도 찾아봄
        const mappedSize = sizeMapping[size];
        stockInfo = selectedProduct.sizes.find(s => s.size === mappedSize);
      }

      return {
        size,
        available_quantity: stockInfo?.available_quantity || 0
      };
    });

    // 이미 220-300 순서대로 되어 있으므로 정렬 불필요
    return sizesWithStock;
  };

  const availableSizes = getAllSizesWithStock();

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
            </Row>

            <Row gutter={16} style={{ marginTop: 8 }}>
              <Col span={12}>
                <Form.Item
                  name="payment_card_id"
                  label="결제 카드"
                  rules={[{ required: true, message: '결제 카드를 선택해주세요' }]}
                >
                  <Select placeholder="카드를 선택하세요">
                    {cards.map(card => (
                      <Option key={card.id} value={card.id}>
                        [{CARD_TYPE_LABELS[card.card_type]}] - [{CARD_ISSUER_LABELS[card.card_issuer]}] - [{card.owner_name}] - ****-****-****-{card.card_number}
                      </Option>
                    ))}
                  </Select>
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
            {barcodeSearchResult && (
              <AntCard size="small" style={{ marginTop: 16, backgroundColor: '#f0f9ff' }}>
                <Row gutter={16}>
                  <Col span={12}>
                    <div><strong>상품명:</strong> {barcodeSearchResult.product_name}</div>
                    <div><strong>상품코드:</strong> {barcodeSearchResult.product_code}</div>
                    <div><strong>브랜드:</strong> {barcodeSearchResult.brand_name || '-'}</div>
                  </Col>
                  <Col span={12}>
                    <div><strong>가용 재고:</strong> {barcodeSearchResult.available_qty}개</div>
                    <div><strong>바코드:</strong> {barcodeSearchResult.barcode_value}</div>
                  </Col>
                </Row>
                <Button
                  type="primary"
                  style={{ marginTop: 12 }}
                  onClick={() => handleAutoSelectProduct(barcodeSearchResult.product_id)}
                >
                  이 상품으로 추가
                </Button>
              </AntCard>
            )}
          </AntCard>

          {/* 상품 추가 */}
          <AntCard
            title="상품 추가"
            size="small"
            style={{ marginBottom: 24 }}
          >
            <Row gutter={16}>
              <Col span={24}>
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
                    const product = groupedInventory.find(p => p.product_id === option?.value);
                    if (!product) return false;
                    const searchText = `${product.product_code} ${product.brand} ${product.product_name}`.toLowerCase();
                    return searchText.includes(input.toLowerCase());
                  }}
                  optionRender={(option) => {
                    const product = groupedInventory.find(p => p.product_id === option.value);
                    if (!product) return null;

                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {product.product_image_url && (
                          <img
                            src={product.product_image_url}
                            alt={product.product_name}
                            style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: '#666' }}>
                            {product.product_code}
                          </div>
                          <div>
                            <span style={{ fontWeight: 500 }}>[{product.brand}]</span> {product.product_name}
                          </div>
                        </div>
                      </div>
                    );
                  }}
                  options={groupedInventory.map(product => ({
                    label: `[${product.brand}] ${product.product_name}`,
                    value: product.product_id,
                  }))}
                />
              </Col>
            </Row>

            {/* 선택된 상품의 사이즈별 재고 및 수량 입력 */}
            {selectedProductId && availableSizes.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ marginBottom: 12, fontWeight: 600 }}>사이즈별 재고 및 판매 수량</div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                  gap: '12px',
                  marginBottom: 16
                }}>
                  {availableSizes.map(sizeInfo => {
                    const stockColor = getStockColor(sizeInfo.available_quantity);
                    return (
                      <div key={sizeInfo.size} style={{
                        border: `1px solid ${stockColor}`,
                        borderRadius: 4,
                        padding: '8px',
                        backgroundColor: '#fafafa'
                      }}>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                          사이즈: <span style={{ fontWeight: 600, color: '#000' }}>{getSizeDisplay(sizeInfo.size)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: stockColor, marginBottom: 6, fontWeight: 600 }}>
                          재고: {sizeInfo.available_quantity}개
                        </div>
                        <InputNumber
                          min={0}
                          max={sizeInfo.available_quantity}
                          value={sizeQuantityMap[sizeInfo.size] || 0}
                          onChange={(val) => handleSizeQuantityChange(sizeInfo.size, val || 0)}
                          style={{ width: '100%' }}
                          placeholder="수량"
                          disabled={sizeInfo.available_quantity === 0}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 판매가 입력 */}
            {selectedProductId && (
              <Row gutter={16} style={{ marginTop: 16 }}>
                <Col span={6}>
                  <div style={{ marginBottom: 8 }}>
                    <label>통화</label>
                  </div>
                  <Select
                    value={sellerSaleCurrency}
                    onChange={setSellerSaleCurrency}
                    style={{ width: '100%' }}
                  >
                    <Option value="KRW">KRW (한국)</Option>
                    <Option value="USD">USD (미국)</Option>
                    <Option value="EUR">EUR (유럽)</Option>
                    <Option value="JPY">JPY (일본)</Option>
                    <Option value="CNY">CNY (중국)</Option>
                  </Select>
                </Col>

                <Col span={8}>
                  <div style={{ marginBottom: 8 }}>
                    <label>판매가</label>
                  </div>
                  <InputNumber
                    min={0}
                    value={sellerSalePriceOriginal}
                    onChange={(val) => setSellerSalePriceOriginal(val || 0)}
                    style={{ width: '100%' }}
                    formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  />
                </Col>

                <Col span={10} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#1890ff' }}>
                    총 수량: {getTotalQuantity()}개
                  </div>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={handleShowConfirmModal}
                    size="large"
                    style={{ backgroundColor: '#0d1117', borderColor: '#0d1117' }}
                  >
                    등록
                  </Button>
                </Col>
              </Row>
            )}
          </AntCard>
        </Form>
      </AntCard>

      {/* 확인 모달 */}
      <Modal
        title="판매 정보 확인"
        open={confirmModalVisible}
        onOk={handleConfirmSale}
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
            <div style={{ color: '#666' }}>판매일:</div>
            <div style={{ fontWeight: 500 }}>{form.getFieldValue('sale_date')?.format('YYYY-MM-DD')}</div>

            {form.getFieldValue('customer_name') && (
              <>
                <div style={{ color: '#666' }}>고객명:</div>
                <div style={{ fontWeight: 500 }}>{form.getFieldValue('customer_name')}</div>
              </>
            )}

            {form.getFieldValue('customer_contact') && (
              <>
                <div style={{ color: '#666' }}>연락처:</div>
                <div style={{ fontWeight: 500 }}>{form.getFieldValue('customer_contact')}</div>
              </>
            )}

            <div style={{ color: '#666' }}>통화:</div>
            <div style={{ fontWeight: 500 }}>{sellerSaleCurrency}</div>

            <div style={{ color: '#666' }}>판매가:</div>
            <div style={{ fontWeight: 500, color: '#1890ff' }}>
              {sellerSaleCurrency} {sellerSalePriceOriginal.toLocaleString()}
            </div>

            <div style={{ color: '#666' }}>판매가(원화):</div>
            <div style={{ fontWeight: 500, color: '#1890ff' }}>
              ₩{ExchangeService.convertToKRW(sellerSalePriceOriginal, sellerSaleCurrency).toLocaleString()}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <h4 style={{ marginBottom: 12, borderBottom: '2px solid #1890ff', paddingBottom: 8 }}>판매 상품</h4>
          <div style={{
            display: 'flex',
            gap: '16px',
            backgroundColor: '#f5f5f5',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: 12
          }}>
            {selectedProduct?.product_image_url ? (
              <img
                src={selectedProduct.product_image_url}
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
                render: (_, record) => {
                  const krwPrice = ExchangeService.convertToKRW(sellerSalePriceOriginal, sellerSaleCurrency);
                  return `₩${(krwPrice * record.quantity).toLocaleString()}`;
                },
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
              ₩{(ExchangeService.convertToKRW(sellerSalePriceOriginal, sellerSaleCurrency) * getTotalQuantity()).toLocaleString()}
            </div>
          </div>
        </div>
      </Modal>

      {/* 미등록 바코드 팝업 */}
      <UnregisteredBarcodeModal
        barcode={scannedBarcode}
        visible={unregisteredBarcodeModalVisible}
        onSuccess={() => handleNewProductRegistered()}
        onCancel={() => setUnregisteredBarcodeModalVisible(false)}
      />
    </div>
  );
};

export default SaleFormPageNew;
