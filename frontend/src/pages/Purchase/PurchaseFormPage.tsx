import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Tag,
} from 'antd';
import { DeleteOutlined, UploadOutlined, CheckCircleOutlined, QrcodeOutlined, MobileOutlined, SyncOutlined } from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import type { ColumnsType } from 'antd/es/table';
import { purchaseService } from '../../services/purchase';
import { productService } from '../../services/product';
import { uploadService } from '../../services/upload';
import { userService } from '../../services/user';
import { barcodeService, BarcodeSearchResult } from '../../services/barcode';
import { UnregisteredBarcodeModal } from '../../components/UnregisteredBarcodeModal';
import { PaymentType, PurchaseItem } from '../../types/purchase';
import { Product } from '../../types/product';
import { User } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import dayjs from 'dayjs';
import { getFileUrl } from '../../utils/urlUtils';

const { Option } = Select;
const { TextArea } = Input;

const PurchaseFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { message } = App.useApp();
  const { user: currentUser } = useAuth();
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
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);

  // 사용자 목록 (구매자/입고확인자 선택용)
  const [users, setUsers] = useState<User[]>([]);

  // QR 코드 영수증 업로드 관련 상태
  const [qrCodeToken, setQrCodeToken] = useState<string | null>(null);
  const [qrCodeLoading, setQrCodeLoading] = useState(false);
  const [qrCodePolling, setQrCodePolling] = useState(false);
  const [mobileUploadedUrls, setMobileUploadedUrls] = useState<string[]>([]);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 바코드 스캔 관련 refs
  const barcodeBufferRef = useRef('');
  const barcodeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 바코드 검색 관련 상태
  const [barcodeSearchResult, setBarcodeSearchResult] = useState<BarcodeSearchResult | null>(null);
  const [unregisteredBarcodeModalVisible, setUnregisteredBarcodeModalVisible] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string>('');

  // 상품 목록 로드 및 거래번호 생성
  useEffect(() => {
    loadProducts();
    loadUsers();
    if (id) {
      loadPurchase(id);
    } else {
      // 신규 등록일 때 거래번호 자동 생성
      loadNextTransactionNo();
      // 구매자 기본값을 현재 로그인한 사용자로 설정
      if (currentUser?.id) {
        form.setFieldsValue({ buyer_id: currentUser.id });
      }
    }
  }, [id, currentUser]);

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
        // 타임아웃 clear (중복 처리 방지)
        if (barcodeTimeoutRef.current) clearTimeout(barcodeTimeoutRef.current);
        handleBarcodeSearchGlobal(barcodeBufferRef.current.trim());
        barcodeBufferRef.current = '';
        return;
      }

      // 일반 문자 추가
      if (e.key.length === 1) {
        barcodeBufferRef.current += e.key;

        // 타임아웃 초기화 (마지막 입력으로부터 150ms 후 처리)
        if (barcodeTimeoutRef.current) clearTimeout(barcodeTimeoutRef.current);

        barcodeTimeoutRef.current = setTimeout(() => {
          if (barcodeBufferRef.current) {
            handleBarcodeSearchGlobal(barcodeBufferRef.current.trim());
            barcodeBufferRef.current = '';
          }
        }, 150);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      if (barcodeTimeoutRef.current) clearTimeout(barcodeTimeoutRef.current);
    };
  }, []);

  const loadProducts = async () => {
    try {
      const response = await productService.getProducts({
        limit: 1000,
        only_valid: true,  // 브랜드, 상품코드, 카테고리가 모두 있는 상품만
        order_by: 'inventory_desc'  // 재고량 많은 순으로 정렬
      });
      console.log('Loaded products:', response.items); // 디버깅용
      setProducts(response.items || []);
    } catch (error: any) {
      console.error('Failed to load products:', error);
      console.error('Error details:', error.response?.data);
      const errorMsg = error.response?.data?.detail || error.message || '상품 목록 조회 실패';
      message.error(`상품 목록 조회 실패: ${errorMsg}`);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await userService.getUsers({ is_active: true });
      setUsers(response);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  // 바코드 검색 성공 핸들러
  // 바코드 검색 함수 (전역 리스너용)
  const handleBarcodeSearchGlobal = useCallback(async (barcodeValue: string) => {
    if (!barcodeValue) return;

    try {
      const result = await barcodeService.searchByBarcode(barcodeValue);
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
  }, []);

  const handleBarcodeFound = (result: BarcodeSearchResult) => {
    console.log('[Barcode Found]', result);

    // 포이즌 정보만 있는 경우 (product_id가 빈 문자열)
    if (!result.product_id || result.product_id === '') {
      console.log('[Poizon Info Only] Opening modal for registration');
      setScannedBarcode(result.barcode_value);
      setUnregisteredBarcodeModalVisible(true);
      return;
    }

    // DB에 등록된 상품
    setSelectedProductId(result.product_id);
    // products 배열에서 찾기
    let product = products.find(p => p.id === result.product_id);
    if (!product) {
      // 상품이 없으면 검색 결과에서 만들어서 사용
      console.log('[Creating temporary product]', { product_name: result.product_name });
      product = {
        id: result.product_id,
        brand_id: '',
        product_code: result.product_code,
        product_name: result.product_name,
        category: result.category || 'shoes',
        description: '',
        is_active: true,
        brand_name: result.brand_name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } as Product;
    }
    setSelectedProduct(product);
    // 바코드에서 받은 사이즈의 수량을 +1 (같은 바코드를 여러 번 스캔하면 누적)
    setSizeQuantityMap(prev => {
      const currentQty = prev[result.size] || 0;
      return { ...prev, [result.size]: currentQty + 1 };
    });
    console.log('[Selected Product with Size]', product, 'Size:', result.size);
    message.success(`${result.product_name} (${result.size}) +1 추가됨`);
  };

  // 바코드 검색 실패 핸들러 (미등록 상품)
  const handleBarcodeNotFound = (barcode: string) => {
    setScannedBarcode(barcode);
    setUnregisteredBarcodeModalVisible(true);
  };

  // 자동 선택된 상품을 추가
  const handleAutoSelectProduct = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setSelectedProductId(productId);
      handleProductChange(productId);
      setBarcodeSearchResult(null);
      message.success(`${product.product_name}이(가) 선택되었습니다.`);
    }
  };

  // 새로운 상품이 등록되었을 때
  const handleNewProductRegistered = (newProduct: Product, barcodeInfo: { barcode_value: string; size: string }) => {
    // 상품 목록 새로고침
    loadProducts();

    // 새로 등록된 상품 자동 선택 및 사이즈 추가
    setTimeout(() => {
      setSelectedProductId(newProduct.id);
      setSelectedProduct(newProduct);

      // 바코드의 사이즈 수량 추가
      setSizeQuantityMap(prev => {
        const currentQty = prev[barcodeInfo.size] || 0;
        return { ...prev, [barcodeInfo.size]: currentQty + 1 };
      });

      message.success(`${newProduct.product_name} (${barcodeInfo.size}) +1 추가됨`);
    }, 500);
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
    // 운영 환경에서는 현재 도메인 사용, 개발환경에서는 localhost
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

  // QR 코드 닫기
  const handleCloseQrCode = () => {
    cleanupPolling();
    setQrCodeToken(null);
    // 업로드된 이미지가 있으면 fileList에 반영
    if (mobileUploadedUrls.length > 0) {
      const newFileList = mobileUploadedUrls.map((url, index) => ({
        uid: `mobile-${index}`,
        name: `영수증 ${index + 1}`,
        status: 'done',
        url: url,
        thumbUrl: getFileUrl(url),
      }));
      setFileList(newFileList);
      setReceiptUrl(mobileUploadedUrls[0]); // 첫 번째 URL을 대표로
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

      // 영수증 URL이 있으면 fileList에 추가 (다중 영수증 지원)
      if (purchase.receipt_urls && purchase.receipt_urls.length > 0) {
        // 다중 영수증
        setReceiptUrl(purchase.receipt_urls[0]);
        const newFileList = purchase.receipt_urls.map((url: string, index: number) => ({
          uid: `receipt-${index}`,
          name: `영수증 ${index + 1}`,
          status: 'done',
          url: url,
          thumbUrl: getFileUrl(url),
        }));
        setFileList(newFileList);
      } else if (purchase.receipt_url) {
        // 기존 단일 영수증 (하위 호환)
        setReceiptUrl(purchase.receipt_url);
        const fullUrl = getFileUrl(purchase.receipt_url);
        setFileList([{
          uid: '-1',
          name: '영수증',
          status: 'done',
          url: purchase.receipt_url,
          thumbUrl: fullUrl,
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

  // 카테고리별 사이즈 목록 가져오기 (항상 220-300 반환)
  const getSizesForCategory = (category?: string): string[] => {
    return allSizes;
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

    if (!selectedProduct) {
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
      product_name: selectedProduct.product_name,
      product_code: selectedProduct.product_code,
    }));

    // 기존 items에 새로운 상품 추가
    setItems(prev => [...prev, ...newItems]);

    // 상품 추가 폼 초기화 (다음 상품 추가를 위해)
    setSelectedProductId('');
    setSelectedProduct(null);
    setSizeQuantityMap({});
    setPurchasePrice(0);

    message.success(`${selectedProduct.product_name}이(가) 추가되었습니다.`);
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

  // 영수증 업로드 처리 (다중 업로드 지원)
  const handleUpload = async (options: any) => {
    const { file, onSuccess, onError } = options;

    setUploadLoading(true);
    try {
      console.log('Starting upload:', file.name);
      const response = await uploadService.uploadReceipt(file);
      console.log('Upload response:', response);

      // 미리보기를 위한 전체 URL 생성 (getFileUrl 사용)
      const fullUrl = getFileUrl(response.file_url);
      console.log('Full URL:', fullUrl);

      // 기존 목록에 추가 (다중 업로드)
      const newFile = {
        uid: file.uid || `upload-${Date.now()}`,
        name: file.name,
        status: 'done' as const,
        url: response.file_url,
        thumbUrl: fullUrl,
      };

      setFileList(prev => [...prev, newFile]);
      setReceiptUrl(response.file_url); // 대표 URL
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

  // 전체 삭제
  const handleRemove = () => {
    setReceiptUrl(null);
    setFileList([]);
  };

  // 개별 삭제
  const handleRemoveFile = (index: number) => {
    const newFileList = fileList.filter((_, i) => i !== index);
    setFileList(newFileList);
    if (newFileList.length > 0) {
      setReceiptUrl(newFileList[0].url);
    } else {
      setReceiptUrl(null);
    }
  };

  const handlePreview = async (file: any) => {
    if (file.url) {
      // 상대 경로는 그대로 사용 (프록시 또는 동일 도메인)
      window.open(file.url, '_blank');
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

          // 영수증 URL 목록
          const receiptUrls = fileList.map(f => f.url).filter(Boolean);

          const data = {
            ...values,
            transaction_no: transactionNo,
            purchase_date: values.purchase_date.format('YYYY-MM-DD'),
            receipt_url: receiptUrls[0] || receiptUrl,
            receipt_urls: receiptUrls,
            buyer_id: values.buyer_id || null,
            receiver_id: values.receiver_id || null,
            items: [{
              product_id: item.product_id,
              warehouse_id: null,
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
          warehouse_id: null,
          size: processedSize ? String(processedSize) : null,
          quantity: item.quantity || 1,
          purchase_price: item.purchase_price,
          selling_price: item.selling_price || null,
          notes: item.notes || null,
        };
      });

      // 영수증 URL 목록 생성 (fileList에서 URL 추출)
      const receiptUrls = fileList.map(file => file.url).filter(Boolean);

      const data = {
        ...values,
        transaction_no: values.transaction_no, // 이미 자동 생성된 값 사용
        purchase_date: values.purchase_date.format('YYYY-MM-DD'),
        receipt_url: receiptUrls[0] || receiptUrl, // 하위 호환성
        receipt_urls: receiptUrls, // 다중 영수증
        buyer_id: values.buyer_id || null,
        receiver_id: values.receiver_id || null,
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
        <div>
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
                    <Option value={PaymentType.PERSONAL_CARD_INSER}>개인카드(인서)</Option>
                    <Option value={PaymentType.PERSONAL_CARD_DAHEE}>개인카드(다희)</Option>
                  </Select>
                </Form.Item>

                <Form.Item name="supplier" label="구매처">
                  <Input placeholder="구매처 입력" />
                </Form.Item>
              </div>

              {/* 둘째 줄: 구매자, 입고확인자, 메모 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 16 }}>
                <Form.Item name="buyer_id" label="구매자">
                  <Select
                    placeholder="구매자 선택"
                    allowClear
                    showSearch
                    optionLabelProp="label"
                    filterOption={(input, option) =>
                      String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    disabled={currentUser?.role !== 'admin'}
                    options={users.map(user => ({
                      label: user.full_name,
                      value: user.id,
                    }))}
                  />
                </Form.Item>

                <Form.Item name="receiver_id" label="입고확인자">
                  <Select
                    placeholder="입고확인자 선택"
                    allowClear
                    showSearch
                    optionLabelProp="label"
                    filterOption={(input, option) =>
                      String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={users.map(user => ({
                      label: user.full_name,
                      value: user.id,
                    }))}
                  />
                </Form.Item>

                <Form.Item name="notes" label="메모" style={{ marginBottom: 0 }}>
                  <TextArea rows={1} placeholder="메모 입력" />
                </Form.Item>
              </div>

              {/* 셋째 줄: 영수증 (가로 스크롤) */}
              <div style={{ marginTop: 8 }}>
                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontWeight: 500 }}>영수증</label>
                  <Space size="small">
                    {!qrCodeToken && (
                      <>
                        <Upload
                          customRequest={handleUpload}
                          accept="image/*"
                          multiple
                          showUploadList={false}
                        >
                          <Button size="small" icon={<UploadOutlined />} loading={uploadLoading}>
                            PC 업로드
                          </Button>
                        </Upload>
                        <Button size="small" icon={<QrcodeOutlined />} onClick={handleGenerateQrCode} loading={qrCodeLoading}>
                          모바일 촬영
                        </Button>
                        {fileList.length > 0 && (
                          <Button size="small" danger icon={<DeleteOutlined />} onClick={handleRemove}>
                            전체삭제
                          </Button>
                        )}
                      </>
                    )}
                  </Space>
                </div>

                {/* QR 코드 모달 */}
                {qrCodeToken ? (
                  <div style={{
                    border: '1px solid #1890ff',
                    borderRadius: 8,
                    padding: 16,
                    backgroundColor: '#e6f7ff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 24
                  }}>
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
                    <Button onClick={handleCloseQrCode} type={mobileUploadedUrls.length > 0 ? 'primary' : 'default'}>
                      {mobileUploadedUrls.length > 0 ? '완료' : '취소'}
                    </Button>
                  </div>
                ) : fileList.length > 0 ? (
                  /* 업로드된 영수증 목록 (가로 스크롤) */
                  <div style={{
                    border: '1px solid #d9d9d9',
                    borderRadius: 8,
                    padding: 12,
                    backgroundColor: '#fafafa',
                    overflowX: 'auto',
                    whiteSpace: 'nowrap'
                  }}>
                    <Image.PreviewGroup>
                      <div style={{ display: 'inline-flex', gap: 12 }}>
                        {fileList.map((file, index) => (
                          <div key={file.uid} style={{
                            position: 'relative',
                            flexShrink: 0,
                            width: 200,
                            height: 200
                          }}>
                            <Image
                              src={file.thumbUrl || getFileUrl(file.url) || ''}
                              width={200}
                              height={200}
                              style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #d9d9d9' }}
                            />
                            <Tag style={{ position: 'absolute', bottom: 4, left: 4, margin: 0 }}>
                              #{index + 1}
                            </Tag>
                            {/* 개별 삭제 버튼 */}
                            <Button
                              type="primary"
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveFile(index);
                              }}
                              style={{
                                position: 'absolute',
                                top: 4,
                                right: 4,
                                borderRadius: '50%',
                                width: 24,
                                height: 24,
                                padding: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </Image.PreviewGroup>
                  </div>
                ) : (
                  /* 영수증 없음 */
                  <div style={{
                    border: '2px dashed #d9d9d9',
                    borderRadius: 8,
                    padding: '16px 24px',
                    backgroundColor: '#fafafa',
                    color: '#999',
                    textAlign: 'center'
                  }}>
                    영수증을 업로드하세요 (선택사항)
                  </div>
                )}
              </div>

              {/* 바코드 검색 */}
              <Card
                title="바코드 스캔으로 상품 추가"
                size="small"
                style={{ marginBottom: 24 }}
              >
                <div style={{
                  padding: '16px',
                  backgroundColor: '#f0f9ff',
                  border: '1px solid #91d5ff',
                  borderRadius: '4px',
                  textAlign: 'center',
                  fontSize: '14px',
                  color: '#0050b3'
                }}>
                  🔍 페이지 어디서든 바코드 리더기로 스캔하면 자동으로 상품이 추가됩니다
                </div>
                {barcodeSearchResult && (
                  <Card size="small" style={{ marginTop: 16, backgroundColor: '#f0f9ff' }}>
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
                  </Card>
                )}
              </Card>

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
                    labelInValue={false}
                    optionLabelProp="label"
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
                    options={[
                      // 바코드로 선택된 상품 (products 배열에 없을 수 있음)
                      ...(selectedProduct && !products.find(p => p.id === selectedProductId) ? [{
                        label: `[${selectedProduct.brand_name || '-'}] ${selectedProduct.product_name}`,
                        value: selectedProduct.id,
                      }] : []),
                      // 기존 상품 목록
                      ...products.map(product => ({
                        label: `[${product.brand_name}] ${product.product_name}`,
                        value: product.id,
                      }))
                    ]}
                  />
                </div>

                {/* 선택된 상품 정보 및 사이즈 */}
                {selectedProduct && Object.keys(sizeQuantityMap).length > 0 && (
                  <Card size="small" style={{ marginBottom: 16, backgroundColor: '#fafafa' }}>
                    <Row gutter={16}>
                      <Col span={6}>
                        {selectedProduct.brand_name && selectedProduct.product_code && (
                          <img
                            src={getFileUrl(`/uploads/products/${selectedProduct.brand_name}/${selectedProduct.product_code}.png`)}
                            alt={selectedProduct.product_name}
                            style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 4 }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        )}
                      </Col>
                      <Col span={18}>
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: '12px', color: '#999' }}>상품코드</div>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#000' }}>
                            {selectedProduct.product_code}
                          </div>
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: '12px', color: '#999' }}>상품명</div>
                          <div style={{ fontSize: '14px', color: '#000' }}>
                            {selectedProduct.product_name}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', color: '#999', marginBottom: 4 }}>선택된 사이즈</div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {Object.entries(sizeQuantityMap).map(([size, qty]) =>
                              qty > 0 && (
                                <Tag key={size} color="blue">
                                  {getSizeDisplay(size)} (×{qty})
                                </Tag>
                              )
                            )}
                          </div>
                        </div>
                      </Col>
                    </Row>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 12 }}>
                      {Object.entries(sizeQuantityMap).map(([size, qty]) => (
                        qty > 0 && (
                          <div key={size} style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            border: '1px solid #d9d9d9',
                            borderRadius: '4px',
                            backgroundColor: '#fff'
                          }}>
                            <div style={{ fontSize: '13px', color: '#666', minWidth: '60px' }}>
                              {getSizeDisplay(size)}
                            </div>
                            <InputNumber
                              min={1}
                              value={qty}
                              onChange={(val) => handleSizeQuantityChange(size, val || 1)}
                              style={{ width: '50px' }}
                              size="small"
                            />
                          </div>
                        )
                      ))}
                    </div>
                  </Card>
                )}

                {/* 구매가 입력 (필수) */}
                {selectedProduct && Object.keys(sizeQuantityMap).length > 0 && (
                  <div style={{
                    marginBottom: 16,
                    padding: '16px',
                    backgroundColor: '#fff7e6',
                    border: '2px solid #ff7a45',
                    borderRadius: '6px'
                  }}>
                    <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#ff7a45' }}>⚠</span>
                      <label style={{ fontSize: '15px', fontWeight: 'bold', color: '#ff7a45', margin: 0 }}>
                        구매가 입력 (필수)
                      </label>
                    </div>
                    <InputNumber
                      min={0}
                      value={purchasePrice}
                      onChange={(val) => setPurchasePrice(val || 0)}
                      style={{ width: '100%' }}
                      size="large"
                      formatter={value => `₩${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      placeholder="구매가를 입력하세요"
                      status={purchasePrice === 0 ? 'error' : ''}
                    />
                  </div>
                )}

                {/* 등록 버튼 */}
                {selectedProduct && Object.keys(sizeQuantityMap).length > 0 && (
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
                      disabled={Object.values(sizeQuantityMap).every(qty => qty === 0) || purchasePrice === 0}
                      size="large"
                      style={{ backgroundColor: '#ff7a45', borderColor: '#ff7a45' }}
                    >
                      추가
                    </Button>
                  </div>
                )}
              </Card>

              {/* 추가된 상품 목록 */}
              {items.length > 0 && (
                <Card
                  title={`추가된 상품 (${items.length}건)`}
                  size="small"
                  style={{ marginBottom: 24 }}
                >
                  <Table
                    columns={columns}
                    dataSource={items}
                    pagination={false}
                    bordered
                    rowKey={(_, index) => index}
                    summary={() => (
                      <Table.Summary.Row>
                        <Table.Summary.Cell colSpan={6} align="right">
                          <strong>합계</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell align="right">
                          <strong>₩{calculateTotal().toLocaleString()}</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell />
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
                      구매 등록
                    </Button>
                  </div>
                </Card>
              )}
          </Space>
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
              {form.getFieldValue('payment_type') === PaymentType.PERSONAL_CARD_INSER && '개인카드(인서)'}
              {form.getFieldValue('payment_type') === PaymentType.PERSONAL_CARD_DAHEE && '개인카드(다희)'}
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

      {/* 미등록 바코드 팝업 */}
      <UnregisteredBarcodeModal
        barcode={scannedBarcode}
        visible={unregisteredBarcodeModalVisible}
        onSuccess={handleNewProductRegistered}
        onCancel={() => setUnregisteredBarcodeModalVisible(false)}
      />
    </Card>
    </div>
  );
};

export default PurchaseFormPage;