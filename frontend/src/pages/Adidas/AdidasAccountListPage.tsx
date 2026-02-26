import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  message,
  Modal,
  Form,
  Input,
  Tag,
  Popconfirm,
  Upload,
  Switch,
  Select,
  DatePicker,
  Checkbox,
  Dropdown,
  Badge,
  Progress,
  Radio,
  Alert,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  UploadOutlined,
  ReloadOutlined,
  SearchOutlined,
  FilterOutlined,
  GlobalOutlined,
  MobileOutlined,
  SyncOutlined,
  DesktopOutlined,
  CloudServerOutlined,
} from '@ant-design/icons';
import { adidasAccountService } from '../../services/adidasAccount';
import { AdidasAccount, AdidasAccountCreate } from '../../types/adidasAccount';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import api from '../../services/api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;

// 쿠폰 종류 카테고리 (getCouponDisplayInfo 정규화 이름 기준)
const COUPON_CATEGORIES = [
  { key: '10만원', label: '10만원권' },
  { key: '5만원', label: '5만원권' },
  { key: '3만원', label: '3만원권' },
  { key: '1만원', label: '1만원권' },
  { key: '3천원', label: '3천원권' },
  { key: '20% 할인', label: '20% (생일)' },
  { key: '15% 할인', label: '15%' },
  { key: '10% 할인', label: '10% (웰컴)' },
  { key: '5% 할인', label: '5%' },
  { key: '스타벅스', label: '스타벅스' },
];

const AdidasAccountListPage: React.FC = () => {
  const [accounts, setAccounts] = useState<AdidasAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [bulkPasteModalVisible, setBulkPasteModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AdidasAccount | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkPasteText, setBulkPasteText] = useState('');
  const [parsedAccounts, setParsedAccounts] = useState<{
    name: string;
    email: string;
    password: string;
    phone: string;
    birthday: string;
    isExisting: boolean;
  }[]>([]);
  const [form] = Form.useForm();

  // 필터링 상태
  const [searchText, setSearchText] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [emailTypeFilter, setEmailTypeFilter] = useState<'all' | 'official' | 'catchall'>('all');
  const [fetchDateFrom, setFetchDateFrom] = useState<string | null>(null); // 이후 (from)
  const [fetchDateTo, setFetchDateTo] = useState<string | null>(null);     // 이전 (to)
  const [birthdayMonthFilter, setBirthdayMonthFilter] = useState<string[]>([]);
  const [couponFilter, setCouponFilter] = useState<string[]>([]); // 쿠폰 description 다중 선택
  const [statusFilter, setStatusFilter] = useState<string[]>([]); // 'success' | 'error'
  const [minPoints, setMinPoints] = useState<string>('');
  const [maxPoints, setMaxPoints] = useState<string>('');

  // 뷰 모드: 'card' | 'table'
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');

  // 카드 상세 팝업
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailAccount, setDetailAccount] = useState<AdidasAccount | null>(null);

  // 쿠폰 펼치기 상태 (account id Set)
  const [expandedVouchers, setExpandedVouchers] = useState<Set<string>>(new Set());

  // 일괄 활성화 토글 상태
  const [bulkActiveToggle, setBulkActiveToggle] = useState(true);

  // 바코드 모달 상태
  const [barcodeModalVisible, setBarcodeModalVisible] = useState(false);
  const [selectedBarcode, setSelectedBarcode] = useState<{url: string, email: string} | null>(null);

  // 상대 경로를 nginx 절대 URL로 변환
  // 개발(포트 3000): http://localhost/uploads/... (nginx 포트 80)
  // 운영(포트 80/443): 상대 경로 그대로 사용 (same-origin)
  const getStaticUrl = (path: string): string => {
    if (!path || path.startsWith('http')) return path;
    const { protocol, hostname, port } = window.location;
    if (port && port !== '80' && port !== '443') {
      return `${protocol}//${hostname}${path}`;
    }
    return path;
  };

  // 쿠폰 판매 모달 상태
  const [voucherSaleModalVisible, setVoucherSaleModalVisible] = useState(false);
  const [selectedVoucherInfo, setSelectedVoucherInfo] = useState<{
    accountId: string;
    voucherIndex: number;
    voucher: any;
    isSold: boolean;
  } | null>(null);
  const [voucherSoldTo, setVoucherSoldTo] = useState('');

  // 웹 정보 조회 진행 상황 모니터링 상태
  const [webFetchProgressId, setWebFetchProgressId] = useState<string | null>(null);
  const [webFetchProgress, setWebFetchProgress] = useState<{
    total: number;
    current: number;
    current_email: string;
    status: string;
    results: any[];
    failed_accounts: { id: string; email: string; error: string }[];
  } | null>(null);
  const [webFetchModalVisible, setWebFetchModalVisible] = useState(false);
  const [mobileFallbackModalVisible, setMobileFallbackModalVisible] = useState(false);

  // 웹 조회 모드 선택 상태
  const [webFetchModeModalVisible, setWebFetchModeModalVisible] = useState(false);
  const [selectedWebFetchMode, setSelectedWebFetchMode] = useState<'local' | 'container'>('container');

  // 필터 변경 시 1페이지로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [searchText, birthdayMonthFilter, couponFilter, statusFilter, minPoints, maxPoints]);

  // 페이지네이션 상태 (localStorage에 저장)
  const [currentPage, setCurrentPage] = useState<number>(() => {
    const saved = localStorage.getItem('adidas_accounts_page');
    return saved ? parseInt(saved, 10) : 1;
  });
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = localStorage.getItem('adidas_accounts_pageSize');
    return saved ? parseInt(saved, 10) : 20;
  });

  useEffect(() => {
    loadAccounts();
  }, []);

  // 페이지 상태 저장
  useEffect(() => {
    localStorage.setItem('adidas_accounts_page', currentPage.toString());
  }, [currentPage]);

  useEffect(() => {
    localStorage.setItem('adidas_accounts_pageSize', pageSize.toString());
  }, [pageSize]);

  const autoGenerateMissingBarcodes = async (accountList: AdidasAccount[]) => {
    const missing = accountList.filter(acc => acc.adikr_barcode && !acc.barcode_image_url);
    if (missing.length === 0) return;
    const results = await Promise.allSettled(
      missing.map(acc => api.post(`/adidas-accounts/${acc.id}/generate-barcode`))
    );
    setAccounts(prev => {
      const updated = [...prev];
      missing.forEach((acc, i) => {
        const result = results[i];
        if (result.status === 'fulfilled') {
          const idx = updated.findIndex(a => a.id === acc.id);
          if (idx !== -1) updated[idx] = { ...updated[idx], barcode_image_url: result.value.data.barcode_url };
        }
      });
      return updated;
    });
  };

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const data = await adidasAccountService.getAccounts();
      setAccounts(data);
      autoGenerateMissingBarcodes(data);
    } catch (error) {
      message.error('계정 목록을 불러오는데 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const knownDomains = ['gmail.com', 'naver.com', 'kakao.com', 'daum.net', 'hanmail.net', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'me.com', 'live.com', 'msn.com'];

  // 실제 계정들이 보유한 쿠폰 종류를 추출 (모든 포맷 정규화)
  const availableCouponTypes = useMemo(() => {
    const couponSet = new Set<string>();
    accounts.forEach(account => {
      if (account.owned_vouchers) {
        try {
          const vouchers = JSON.parse(account.owned_vouchers);
          vouchers.forEach((v: any) => {
            let desc = v.description || v.name;
            if (!desc && v.value) {
              const val = Number(v.value);
              desc = val <= 100 ? `${val}% 할인` : `${val.toLocaleString()}원 할인`;
            }
            if (!desc && v.amount) desc = `${Number(v.amount).toLocaleString()}원 할인`;
            if (desc) couponSet.add(desc);
          });
        } catch {}
      }
    });
    return Array.from(couponSet).sort();
  }, [accounts]);

  const handleAdd = () => {
    setEditingAccount(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (account: AdidasAccount) => {
    setEditingAccount(account);
    form.setFieldsValue(account);
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await adidasAccountService.deleteAccount(id);
      message.success('계정이 삭제되었습니다');
      loadAccounts();
    } catch (error) {
      message.error('계정 삭제에 실패했습니다');
    }
  };

  // 계정 정보 조회 (단일)
  const handleFetchAccountInfo = async (accountId: string) => {
    try {
      const account = accounts.find(acc => acc.id === accountId);
      const accountEmail = account?.email || '계정';

      message.loading({ content: '정보 조회 중...', key: 'fetch' });
      await api.post(`/adidas-accounts/${accountId}/fetch-info`);
      message.success({ content: `${accountEmail} 아디다스 쿠폰 조회를 시작합니다.`, key: 'fetch' });
      loadAccounts();
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || '정보 조회에 실패했습니다';
      message.error({ content: errorMsg, key: 'fetch' });
    }
  };

  // 쿠폰 판매 상태 업데이트
  const handleVoucherSaleUpdate = async (sold: boolean) => {
    if (!selectedVoucherInfo) return;

    try {
      await api.post(`/adidas-accounts/${selectedVoucherInfo.accountId}/voucher-sale`, {
        voucher_index: selectedVoucherInfo.voucherIndex,
        sold: sold,
        sold_to: sold ? voucherSoldTo : '',
      });

      message.success(sold ? '판매완료로 표시되었습니다' : '판매 취소되었습니다');
      setVoucherSaleModalVisible(false);
      setSelectedVoucherInfo(null);
      setVoucherSoldTo('');
      loadAccounts();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '업데이트에 실패했습니다');
    }
  };

  // 쿠폰 클릭 핸들러
  const handleVoucherClick = (accountId: string, voucherIndex: number, voucher: any) => {
    setSelectedVoucherInfo({
      accountId,
      voucherIndex,
      voucher,
      isSold: voucher.sold || false,
    });
    setVoucherSoldTo(voucher.sold_to || '');
    setVoucherSaleModalVisible(true);
  };

  // 바코드 이미지 생성 (단일)
  const handleGenerateBarcode = async (accountId: string) => {
    try {
      message.loading({ content: '바코드 이미지 생성 중...', key: 'barcode' });
      const result = await api.post(`/adidas-accounts/${accountId}/generate-barcode`);
      message.success({ content: '바코드 이미지가 생성되었습니다', key: 'barcode' });
      // 전체 재로드 대신 해당 계정만 로컬 업데이트 (정렬 유지)
      setAccounts(prev => prev.map(acc =>
        acc.id === accountId ? { ...acc, barcode_image_url: result.data.barcode_url } : acc
      ));
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || '바코드 생성에 실패했습니다';
      message.error({ content: errorMsg, key: 'barcode' });
    }
  };

  // 선택 계정 일괄 바코드 생성
  const handleBulkGenerateBarcode = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('바코드를 생성할 계정을 선택하세요');
      return;
    }

    try {
      message.loading({ content: `${selectedRowKeys.length}개 바코드 생성 중...`, key: 'bulkBarcode' });

      // 선택된 계정 중 ADIKR 바코드가 있는 계정만 필터링
      const accountsToGenerate = accounts.filter(
        acc => selectedRowKeys.includes(acc.id) && acc.adikr_barcode && !acc.barcode_image_url
      );

      if (accountsToGenerate.length === 0) {
        message.warning('생성할 바코드가 없습니다 (ADIKR 바코드가 없거나 이미 생성됨)');
        return;
      }

      // 순차적으로 바코드 생성
      let successCount = 0;
      let failCount = 0;

      for (const account of accountsToGenerate) {
        try {
          await api.post(`/adidas-accounts/${account.id}/generate-barcode`);
          successCount++;
        } catch (error) {
          failCount++;
        }
      }

      if (failCount === 0) {
        message.success({ content: `${successCount}개 바코드 이미지가 생성되었습니다`, key: 'bulkBarcode' });
      } else {
        message.warning({ content: `${successCount}개 생성 성공, ${failCount}개 실패`, key: 'bulkBarcode' });
      }

      setSelectedRowKeys([]);
      loadAccounts();
    } catch (error) {
      message.error({ content: '일괄 바코드 생성에 실패했습니다', key: 'bulkBarcode' });
    }
  };

  // 선택 바코드 일괄 다운로드
  const handleBulkDownloadBarcode = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('다운로드할 바코드를 선택하세요');
      return;
    }

    const selectedAccounts = accounts.filter(acc => selectedRowKeys.includes(acc.id));
    const accountsWithBarcode = selectedAccounts.filter(acc => acc.barcode_image_url);

    if (accountsWithBarcode.length === 0) {
      message.warning('바코드 이미지가 생성된 계정이 없습니다');
      return;
    }

    message.loading({ content: `${accountsWithBarcode.length}개 바코드 다운로드 중...`, key: 'downloadBarcode' });

    try {
      const zip = new JSZip();

      // 각 바코드 이미지를 fetch하여 zip에 추가
      let successCount = 0;
      for (const account of accountsWithBarcode) {
        try {
          if (!account.barcode_image_url) continue;

          const imageUrl = getStaticUrl(account.barcode_image_url);

          console.log(`Fetching barcode for ${account.email}: ${imageUrl}`);

          const response = await fetch(imageUrl);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const blob = await response.blob();
          const filename = `barcode_${account.email}.png`;
          zip.file(filename, blob);
          successCount++;
        } catch (error) {
          console.error(`Failed to fetch barcode for ${account.email}:`, error);
        }
      }

      if (successCount === 0) {
        message.error({ content: '바코드 이미지를 가져올 수 없습니다', key: 'downloadBarcode' });
        return;
      }

      // zip 파일 생성 및 다운로드
      console.log(`Generating zip with ${successCount} files...`);
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `barcodes_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      message.success({ content: `${successCount}개 바코드가 다운로드되었습니다`, key: 'downloadBarcode' });
    } catch (error) {
      console.error('Bulk barcode download error:', error);
      message.error({ content: `바코드 다운로드에 실패했습니다: ${error}`, key: 'downloadBarcode' });
    }
  };

  // 선택 계정 일괄 정보 조회 (모바일 전용 - 기존)
  const handleBulkFetchInfo = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('조회할 계정을 선택하세요');
      return;
    }

    try {
      // 화면에 표시된 순서(필터링된 accounts 순서)대로 정렬
      const orderedAccountIds = filteredAccounts
        .filter(acc => selectedRowKeys.includes(acc.id))
        .map(acc => acc.id);

      const selectedAccounts = accounts.filter(acc => selectedRowKeys.includes(acc.id));
      const firstAccountEmail = selectedAccounts[0]?.email || '계정';
      const otherCount = selectedRowKeys.length - 1;

      message.loading({ content: `${selectedRowKeys.length}개 계정 정보 조회 중...`, key: 'bulkFetch' });
      await api.post('/adidas-accounts/bulk-fetch-info', {
        account_ids: orderedAccountIds,
      });

      const successMessage = otherCount > 0
        ? `${firstAccountEmail} 외 ${otherCount}건의 아디다스 쿠폰 조회를 시작합니다.`
        : `${firstAccountEmail} 아디다스 쿠폰 조회를 시작합니다.`;

      message.success({ content: successMessage, key: 'bulkFetch' });
      setSelectedRowKeys([]);
      loadAccounts();
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || '일괄 정보 조회에 실패했습니다';
      message.error({ content: errorMsg, key: 'bulkFetch' });
    }
  };

  // 웹 크롤링 일괄 정보 조회 - 모드 선택 모달 표시
  const handleBulkWebFetchInfo = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('조회할 계정을 선택하세요');
      return;
    }
    // 모드 선택 모달 표시
    setWebFetchModeModalVisible(true);
  };

  // 실제 웹 정보 조회 실행 (모드 선택 후)
  const executeWebFetchInfo = async (mode: 'local' | 'container') => {
    try {
      const orderedAccountIds = filteredAccounts
        .filter(acc => selectedRowKeys.includes(acc.id))
        .map(acc => acc.id);

      const modeLabel = mode === 'local' ? '로컬 GUI' : '컨테이너';
      message.loading({ content: `${selectedRowKeys.length}개 계정 ${modeLabel} 웹 정보 조회 시작...`, key: 'webFetch' });

      // 모드 파라미터와 함께 API 호출
      const response = await adidasAccountService.bulkWebFetchInfoWithMode(orderedAccountIds, mode);

      if (response.success && response.progress_id) {
        setWebFetchProgressId(response.progress_id);
        setWebFetchProgress({
          total: selectedRowKeys.length,
          current: 0,
          current_email: '',
          status: 'starting',
          results: [],
          failed_accounts: [],
        });
        setFallbackShown(false);  // 새 조회 시작 시 초기화
        setWebFetchModalVisible(true);
        setWebFetchModeModalVisible(false);
        message.success({ content: response.message, key: 'webFetch' });
        setSelectedRowKeys([]);
      } else {
        message.error({ content: response.message || '웹 정보 조회 시작에 실패했습니다', key: 'webFetch' });
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || '웹 정보 조회에 실패했습니다';
      message.error({ content: errorMsg, key: 'webFetch' });
    }
  };

  // 웹 정보 조회 진행 상황 폴링
  const [fallbackShown, setFallbackShown] = useState(false);

  useEffect(() => {
    if (!webFetchProgressId || !webFetchModalVisible) return;

    // 완료 상태면 더 이상 폴링하지 않음
    if (webFetchProgress?.status === 'completed') return;

    const pollProgress = async () => {
      try {
        const progress = await adidasAccountService.getWebFetchProgress(webFetchProgressId);
        setWebFetchProgress(progress);

        // 완료되면 목록 새로고침
        if (progress.status === 'completed') {
          loadAccounts();

          // 실패한 계정이 있고 아직 폴백 모달을 안 띄웠으면 표시
          if (progress.failed_accounts && progress.failed_accounts.length > 0 && !fallbackShown) {
            setFallbackShown(true);
            setTimeout(() => {
              setMobileFallbackModalVisible(true);
            }, 1000);
          }
        }
      } catch (error) {
        console.error('진행 상황 조회 오류:', error);
      }
    };

    // 1초마다 폴링
    const intervalId = setInterval(pollProgress, 1000);
    pollProgress(); // 즉시 한번 실행

    return () => clearInterval(intervalId);
  }, [webFetchProgressId, webFetchModalVisible, webFetchProgress?.status, fallbackShown]);

  // 실패한 계정 모바일로 재시도
  const handleMobileFallback = async () => {
    if (!webFetchProgress?.failed_accounts || webFetchProgress.failed_accounts.length === 0) {
      return;
    }

    try {
      const failedIds = webFetchProgress.failed_accounts.map(acc => acc.id);

      message.loading({ content: `${failedIds.length}개 계정 모바일 재시도 중...`, key: 'mobileFallback' });

      const response = await adidasAccountService.bulkMobileFetchFailed(failedIds);

      if (response.success) {
        message.success({ content: response.message, key: 'mobileFallback' });
        setMobileFallbackModalVisible(false);
        loadAccounts();
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || '모바일 재시도에 실패했습니다';
      message.error({ content: errorMsg, key: 'mobileFallback' });
    }
  };

  // 선택 삭제
  const handleBulkDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('삭제할 항목을 선택하세요');
      return;
    }

    try {
      await Promise.all(
        selectedRowKeys.map((id) => adidasAccountService.deleteAccount(id as string))
      );
      message.success(`${selectedRowKeys.length}개 계정이 삭제되었습니다`);
      setSelectedRowKeys([]);
      loadAccounts();
    } catch (error) {
      message.error('일괄 삭제에 실패했습니다');
    }
  };

  // 선택 계정 일괄 활성화
  const handleBulkActivate = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('활성화할 계정을 선택하세요');
      return;
    }

    try {
      await api.post('/adidas-accounts/bulk-toggle-active', {
        account_ids: selectedRowKeys,
        is_active: true,
      });
      message.success(`${selectedRowKeys.length}개 계정이 활성화되었습니다`);
      setSelectedRowKeys([]);
      loadAccounts();
    } catch (error) {
      message.error('일괄 활성화에 실패했습니다');
    }
  };

  // 선택 계정 일괄 비활성화
  const handleBulkDeactivate = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('비활성화할 계정을 선택하세요');
      return;
    }

    try {
      await api.post('/adidas-accounts/bulk-toggle-active', {
        account_ids: selectedRowKeys,
        is_active: false,
      });
      message.success(`${selectedRowKeys.length}개 계정이 비활성화되었습니다`);
      setSelectedRowKeys([]);
      loadAccounts();
    } catch (error) {
      message.error('일괄 비활성화에 실패했습니다');
    }
  };

  // 쿠폰 발급
  const handleIssueCoupon = async (accountId: string, couponAmount: string = '100000') => {
    try {
      message.loading({ content: '쿠폰 발급 중...', key: 'coupon' });
      const response = await api.post(`/adidas-accounts/${accountId}/issue-coupon`, {
        coupon_amount: couponAmount,
      });

      if (response.data.success) {
        message.success({ content: response.data.message, key: 'coupon' });

        // 백그라운드 작업이 완료될 때까지 10초마다 자동 새로고침 (최대 10회)
        let refreshCount = 0;
        const maxRefreshCount = 10;
        const refreshInterval = setInterval(() => {
          refreshCount++;
          loadAccounts();

          if (refreshCount >= maxRefreshCount) {
            clearInterval(refreshInterval);
          }
        }, 10000);

        // 초기 로드
        loadAccounts();
      } else {
        message.error({ content: response.data.message, key: 'coupon' });
      }
    } catch (error: any) {
      console.error('쿠폰 발급 오류:', error);
      console.error('에러 응답:', error.response);
      console.error('에러 데이터:', error.response?.data);
      let errorMsg = '쿠폰 발급에 실패했습니다';

      // validation error 처리
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        if (Array.isArray(detail)) {
          errorMsg = detail.map((err: any) => err.msg || JSON.stringify(err)).join(', ');
        } else if (typeof detail === 'string') {
          errorMsg = detail;
        } else {
          errorMsg = JSON.stringify(detail);
        }
      }

      message.error({ content: errorMsg, key: 'coupon' });
    }
  };

  // 선택 계정 일괄 쿠폰 발급
  const handleBulkIssueCoupon = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('쿠폰을 발급할 계정을 선택하세요');
      return;
    }

    try {
      // 화면에 표시된 순서(필터링된 accounts 순서)대로 정렬
      const orderedAccountIds = filteredAccounts
        .filter(acc => selectedRowKeys.includes(acc.id))
        .map(acc => acc.id);

      const selectedAccounts = accounts.filter(acc => selectedRowKeys.includes(acc.id));
      const firstAccountEmail = selectedAccounts[0]?.email || '계정';
      const otherCount = selectedRowKeys.length - 1;

      message.loading({ content: `${selectedRowKeys.length}개 계정 쿠폰 발급 중...`, key: 'bulkCoupon' });
      await api.post('/adidas-accounts/bulk-issue-coupon', {
        account_ids: orderedAccountIds,
      });

      const successMessage = otherCount > 0
        ? `${firstAccountEmail} 외 ${otherCount}건의 쿠폰 발급을 시작합니다.`
        : `${firstAccountEmail} 쿠폰 발급을 시작합니다.`;

      message.success({ content: successMessage, key: 'bulkCoupon' });

      // 백그라운드 작업이 완료될 때까지 10초마다 자동 새로고침 (최대 10회)
      let refreshCount = 0;
      const maxRefreshCount = 10;
      const refreshInterval = setInterval(() => {
        refreshCount++;
        loadAccounts();

        if (refreshCount >= maxRefreshCount) {
          clearInterval(refreshInterval);
        }
      }, 10000);

      setSelectedRowKeys([]);
      loadAccounts();
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || '일괄 쿠폰 발급에 실패했습니다';
      message.error({ content: errorMsg, key: 'bulkCoupon' });
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingAccount) {
        await adidasAccountService.updateAccount(editingAccount.id, values);
        message.success('계정이 수정되었습니다');
      } else {
        await adidasAccountService.createAccount(values as AdidasAccountCreate);
        message.success('계정이 추가되었습니다');
      }
      setModalVisible(false);
      loadAccounts();
    } catch (error) {
      message.error('저장에 실패했습니다');
    }
  };

  // Excel 다운로드
  const handleExcelDownload = () => {
    message.loading('Excel 파일을 생성하고 있습니다...', 0.5);

    setTimeout(() => {
      const data = accounts.map(acc => ({
        '사용': acc.is_active ? '활성' : '비활성',
        '이메일': acc.email,
        '비밀번호': acc.password,
        '이름': acc.name || '',
        '생일': acc.birthday || '',
        'ADIKR바코드': acc.adikr_barcode || '',
        '전화번호': acc.phone || '',
        '웹조회현황': acc.web_fetch_status || '',
        '모바일조회현황': acc.mobile_fetch_status || '',
        '웹발급현황': acc.web_issue_status || '',
        '모바일발급현황': acc.mobile_issue_status || '',
        '메모': acc.memo || '',
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '아디다스계정');
      XLSX.writeFile(wb, `아디다스계정_${new Date().toISOString().split('T')[0]}.xlsx`);
    }, 100);
  };

  // 텍스트 파싱 함수
  const parseBulkText = (text: string) => {
    if (!text.trim()) {
      setParsedAccounts([]);
      return;
    }

    const lines = text.trim().split('\n');
    const parsed: typeof parsedAccounts = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      // (기존) 표시 확인
      const isExisting = line.includes('(기존)');
      // (기존) 제거 후 처리
      const cleanLine = line.replace(/\(기존\)/g, '').trim();

      // 탭 또는 여러 공백으로 분리
      const parts = cleanLine.split(/\t+|\s{2,}/).map(p => p.trim()).filter(p => p);

      if (parts.length >= 5) {
        // 새 형식: 이름 이메일 비밀번호 전화번호 생일
        const name = parts[0];
        const email = parts[1];
        const password = parts[2];
        // 전화번호: 공백 제거하고 하이픈 추가
        const phoneRaw = parts[3].replace(/\s+/g, '');
        const phone = phoneRaw.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
        // 생일: 공백으로 분리된 년 월 일을 YYYY-MM-DD로 변환
        const birthdayParts = parts.slice(4).join(' ').trim().split(/\s+/);
        let birthday = '';
        if (birthdayParts.length >= 3) {
          const year = birthdayParts[0].padStart(4, '0');
          const month = birthdayParts[1].padStart(2, '0');
          const day = birthdayParts[2].padStart(2, '0');
          birthday = `${year}-${month}-${day}`;
        }

        parsed.push({ name, email, password, phone, birthday, isExisting });
      } else if (parts.length >= 2) {
        // 기존 형식: 이메일 비밀번호
        parsed.push({
          name: '',
          email: parts[0],
          password: parts[1],
          phone: '',
          birthday: '',
          isExisting,
        });
      }
    }

    setParsedAccounts(parsed);
  };

  // 텍스트 변경 시 자동 파싱
  const handleBulkTextChange = (text: string) => {
    setBulkPasteText(text);
    parseBulkText(text);
  };

  // 텍스트 붙여넣기 일괄 등록
  const handleBulkPaste = async () => {
    if (parsedAccounts.length === 0) {
      message.warning('데이터를 입력하세요');
      return;
    }

    try {
      // API 호출용 데이터 변환
      const accountsData = parsedAccounts.map(acc => ({
        email: acc.email,
        password: acc.password,
        name: acc.name || undefined,
        phone: acc.phone || undefined,
        birthday: acc.birthday || undefined,
        is_active: true,
        is_existing: acc.isExisting, // 기존 계정 여부 전달
      }));

      // 일괄 등록/수정 API 호출
      const response = await api.post('/adidas-accounts/bulk-upsert', accountsData);
      const { created, updated, skipped, errors, total } = response.data;

      let resultMsg = `총 ${total}개`;
      const parts = [];
      if (created > 0) parts.push(`${created}개 등록`);
      if (updated > 0) parts.push(`${updated}개 수정`);
      if (skipped > 0) parts.push(`${skipped}개 중복`);
      if (errors?.length > 0) parts.push(`${errors.length}개 오류`);

      resultMsg += ` 중 ${parts.join(', ')}`;

      if (errors?.length > 0) {
        message.warning(resultMsg);
        console.error('등록 실패 항목:', errors);
      } else {
        message.success(resultMsg);
      }

      setBulkPasteModalVisible(false);
      setBulkPasteText('');
      setParsedAccounts([]);
      loadAccounts();
    } catch (error) {
      message.error('일괄 등록 중 오류가 발생했습니다');
      console.error('일괄 등록 오류:', error);
    }
  };

  // Excel 일괄 등록
  const handleExcelUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // 모든 계정 데이터 배열로 준비
        const accountsData: AdidasAccountCreate[] = (jsonData as any[]).map((row) => ({
          email: row['이메일'],
          password: row['비밀번호'],
          name: row['이름'] || undefined,
          birthday: row['생일'] || undefined,
          adikr_barcode: row['ADIKR바코드'] || undefined,
          phone: row['전화번호'] || undefined,
          memo: row['비고'] || undefined,
          is_active: row['상태'] === '활성' || row['상태'] === undefined,
        }));

        // 일괄 등록 API 호출
        const response = await api.post('/adidas-accounts/bulk', accountsData);
        const { created, skipped, errors, total } = response.data;

        if (errors.length > 0) {
          message.warning(
            `총 ${total}개 중 ${created}개 등록, ${skipped}개 중복, ${errors.length}개 오류`
          );
          console.error('등록 실패 항목:', errors);
        } else {
          message.success(`총 ${total}개 중 ${created}개 등록, ${skipped}개 중복`);
        }

        loadAccounts();
      } catch (error) {
        message.error('Excel 파일 처리 중 오류가 발생했습니다');
        console.error('Excel 업로드 오류:', error);
      }
    };
    reader.readAsArrayBuffer(file);
    return false;
  };

  // 필터링된 계정 목록
  const filteredAccounts = useMemo(() => {
    let filtered = [...accounts];

    // 1. 검색어 필터 (이메일, 이름, 전화번호, 쿠폰코드)
    if (searchText) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(acc => {
        if (acc.email?.toLowerCase().includes(search)) return true;
        if (acc.name?.toLowerCase().includes(search)) return true;
        if (acc.phone?.toLowerCase().includes(search)) return true;
        // 쿠폰 코드 검색
        if (acc.owned_vouchers) {
          try {
            const vouchers = JSON.parse(acc.owned_vouchers);
            return vouchers.some((v: any) => {
              const code = v.code;
              return code && code.toLowerCase().includes(search);
            });
          } catch {}
        }
        return false;
      });
    }

    // 2. 계정 상태 필터
    if (activeFilter !== 'all') {
      filtered = filtered.filter(acc => activeFilter === 'active' ? acc.is_active : !acc.is_active);
    }

    // 3. 이메일 유형 필터
    if (emailTypeFilter !== 'all') {
      filtered = filtered.filter(acc => {
        const domain = acc.email.split('@')[1]?.toLowerCase() || '';
        const isOfficial = knownDomains.includes(domain);
        return emailTypeFilter === 'official' ? isOfficial : !isOfficial;
      });
    }

    // 4. 조회 일자 필터 (from ~ to 범위)
    if (fetchDateFrom || fetchDateTo) {
      filtered = filtered.filter(acc => {
        const allDates = [acc.web_fetch_status, acc.mobile_fetch_status, acc.web_issue_status, acc.mobile_issue_status, acc.fetch_status]
          .filter(Boolean)
          .map(s => {
            const m = s!.match(/\[(\d{2})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})\]/);
            if (!m) return null;
            return new Date(2000 + parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]), parseInt(m[4]), parseInt(m[5]));
          })
          .filter((d): d is Date => d !== null);
        if (allDates.length === 0) return false;
        const latest = allDates.reduce((a, b) => a > b ? a : b);
        if (fetchDateFrom) {
          const from = dayjs(fetchDateFrom).startOf('day').toDate();
          if (latest < from) return false;
        }
        if (fetchDateTo) {
          const to = dayjs(fetchDateTo).endOf('day').toDate();
          if (latest > to) return false;
        }
        return true;
      });
    }

    // 5. 조회 현황 필터 (가장 최근 상태 기준)
    if (statusFilter.length > 0) {
      filtered = filtered.filter(acc => {
        // getMostRecentStatusStr 인라인 (useMemo 내부라 헬퍼 직접 호출 불가)
        const candidates = [
          acc.web_fetch_status, acc.mobile_fetch_status, acc.web_issue_status, acc.mobile_issue_status,
          (!acc.web_fetch_status && !acc.mobile_fetch_status) ? acc.fetch_status : null,
        ].filter(Boolean) as string[];
        if (candidates.length === 0) return false;
        const withDate = candidates
          .map(s => { const m = s.match(/\[(\d{2})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})\]/); if (!m) return null; return { s, d: new Date(2000+parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]), parseInt(m[4]), parseInt(m[5])) }; })
          .filter((x): x is { s: string; d: Date } => x !== null);
        const latest = withDate.length > 0 ? withDate.reduce((a, b) => a.d > b.d ? a : b).s : candidates[0];
        // 오류: 네트워크/인증 오류만 (포인트 부족/버튼 없음/발급 실패 = 완료 처리)
        const isError = latest.includes('오류') || latest.includes('에러') ||
          latest.includes('차단') || latest.includes('비밀번호') || latest.includes('BOT') ||
          latest.includes('틀림') || latest.includes('중...');
        const isSuccess = !isError && (
          latest.includes('완료') || latest.includes('미경과') ||
          latest.includes('포인트 부족') || latest.includes('버튼 없음') || latest.includes('발급 실패')
        );
        return statusFilter.some(f => {
          if (f === 'error') return isError;
          if (f === 'success') return isSuccess;
          return false;
        });
      });
    }

    // 6. 쿠폰 필터 (카테고리 다중 선택 - OR 조건, getCouponDisplayInfo 정규화 이름 기준)
    if (couponFilter.length > 0) {
      filtered = filtered.filter(acc => {
        if (!acc.owned_vouchers) return false;
        try {
          const voucherList = JSON.parse(acc.owned_vouchers);
          return couponFilter.some(categoryKey => {
            return voucherList.some((v: any) => {
              let desc = v.description || v.name;
              if (!desc && v.value) { const val = Number(v.value); desc = val <= 100 ? `${val}% 할인` : `${val.toLocaleString()}원 할인`; }
              if (!desc && v.amount) desc = `${Number(v.amount).toLocaleString()}원 할인`;
              if (!desc) return false;
              // getCouponDisplayInfo는 컴포넌트 내부에 정의되어 있으므로 인라인 매핑 사용
              const d = desc.toLowerCase();
              let normalized = '';
              if (d === '1원 상품권') normalized = '5% 할인';
              else if (d === '2원 상품권') normalized = '10% 할인';
              else if (d === '3원 상품권') normalized = '15% 할인';
              else if (d === '4원 상품권' || d === '20원 상품권') normalized = '20% 할인';
              else if (d.includes('100,000') || d.includes('100000') || d.includes('10만') || d.includes('100k') || d.includes('_100k')) normalized = '10만원';
              else if (d.includes('50,000') || d.includes('50000') || d.includes('5만') || d.includes('50k')) normalized = '5만원';
              else if (d.includes('30,000') || d.includes('30000') || d.includes('3만') || d.includes('30k')) normalized = '3만원';
              else if (d.includes('20,000') || d.includes('20000') || d.includes('2만') || d.includes('20k')) normalized = '2만원';
              else if (d.includes('10,000') || d.includes('10000') || d.includes('1만') || d.includes('10k')) normalized = '1만원';
              else if (d.includes('5,000') || d.includes('5000') || /\b5k\b/.test(d)) normalized = '5천원';
              else if (d.includes('3,000') || d.includes('3000') || /\b3k\b/.test(d)) normalized = '3천원';
              else if (d.includes('30%')) normalized = '30% 할인';
              else if (d.includes('20%')) normalized = '20% 할인';
              else if (d.includes('15%')) normalized = '15% 할인';
              else if (d.includes('10%')) normalized = '10% 할인';
              else if (d.includes('5%')) normalized = '5% 할인';
              else if (d.includes('스타벅스') || d.includes('starbucks')) normalized = '스타벅스';
              return normalized === categoryKey;
            });
          });
        } catch { return false; }
      });
    }

    // 7. 포인트 범위 필터
    if (minPoints || maxPoints) {
      filtered = filtered.filter(acc => {
        const points = acc.current_points || 0;
        const min = minPoints ? parseInt(minPoints) : 0;
        const max = maxPoints ? parseInt(maxPoints) : Infinity;
        return points >= min && points <= max;
      });
    }

    // 8. 생일 월별 필터 (다중 선택)
    if (birthdayMonthFilter.length > 0) {
      filtered = filtered.filter(acc => {
        if (!acc.birthday) return false;
        const birthday = dayjs(acc.birthday, 'YYYY-MM-DD');
        if (!birthday.isValid()) return false;
        return birthdayMonthFilter.includes((birthday.month() + 1).toString());
      });
    }

    return filtered;
  }, [accounts, searchText, activeFilter, emailTypeFilter, fetchDateFrom, fetchDateTo, birthdayMonthFilter, couponFilter, statusFilter, minPoints, maxPoints]);

  // ===== 쿠폰 유틸리티 =====
  const getCouponDisplayInfo = (description: string) => {
    if (!description) return { name: '기타', sortValue: 0, icon: '🎫' };
    const desc = description.toLowerCase();
    if (desc === '1원 상품권') return { name: '5% 할인', sortValue: 5000, icon: '🏷️' };
    if (desc === '2원 상품권') return { name: '10% 할인', sortValue: 10000, icon: '🏷️' };
    if (desc === '3원 상품권') return { name: '15% 할인', sortValue: 15000, icon: '🏷️' };
    if (desc === '4원 상품권' || desc === '20원 상품권') return { name: '20% 할인', sortValue: 20000, icon: '🏷️' };
    if (desc.includes('100,000') || desc.includes('100000') || desc.includes('10만') || desc.includes('100k') || desc.includes('_100k')) return { name: '10만원', sortValue: 100000, icon: '💰' };
    if (desc.includes('50,000') || desc.includes('50000') || desc.includes('5만') || desc.includes('50k')) return { name: '5만원', sortValue: 50000, icon: '💵' };
    if (desc.includes('30,000') || desc.includes('30000') || desc.includes('3만') || desc.includes('30k')) return { name: '3만원', sortValue: 30000, icon: '💵' };
    if (desc.includes('20,000') || desc.includes('20000') || desc.includes('2만') || desc.includes('20k')) return { name: '2만원', sortValue: 20000, icon: '💵' };
    if (desc.includes('10,000') || desc.includes('10000') || desc.includes('1만') || desc.includes('10k')) return { name: '1만원', sortValue: 10000, icon: '💵' };
    if (desc.includes('5,000') || desc.includes('5000') || /\b5k\b/.test(desc)) return { name: '5천원', sortValue: 5000, icon: '💵' };
    if (desc.includes('3,000') || desc.includes('3000') || /\b3k\b/.test(desc)) return { name: '3천원', sortValue: 3000, icon: '💵' };
    if (desc.includes('30%') || desc.includes('30per')) return { name: '30% 할인', sortValue: 30000, icon: '🏷️' };
    if (desc.includes('20%') || desc.includes('20per')) return { name: '20% 할인', sortValue: 20000, icon: '🏷️' };
    if (desc.includes('15%') || desc.includes('15per')) return { name: '15% 할인', sortValue: 15000, icon: '🏷️' };
    if (desc.includes('10%') || desc.includes('10per')) return { name: '10% 할인', sortValue: 10000, icon: '🏷️' };
    if (desc.includes('5%') || desc.includes('5per')) return { name: '5% 할인', sortValue: 5000, icon: '🏷️' };
    if (desc.includes('네이버') || desc.includes('naver')) return { name: '네이버', sortValue: 1000, icon: '🎁' };
    if (desc.includes('스타벅스') || desc.includes('starbucks')) return { name: '스타벅스', sortValue: 1000, icon: '☕' };
    if (desc.includes('tier') || desc.includes('티어')) return { name: '티어쿠폰', sortValue: 500, icon: '⭐' };
    let name = description.startsWith('KR_') ? description.substring(3) : description;
    name = name.replace(/_/g, ' ').trim();
    if (name.length > 10) name = name.substring(0, 9) + '…';
    return { name, sortValue: 0, icon: '🎫' };
  };

  // DB에 혼재하는 포맷을 통일: {description, code, expiry, sold, sold_to}
  // 포맷1(구): name, expiryDate, code, value
  // 포맷2(신): description, code, expiry, sold, sold_to
  // 포맷3(FastAPI): description, amount, issued_at, type
  const normalizeVoucher = (v: any) => {
    // value 필드(숫자)로 description 보완
    let desc = v.description || v.name;
    if (!desc && v.value) {
      const val = Number(v.value);
      if (val <= 100) desc = `${val}% 할인`;          // 10, 20, 30 등 → 퍼센트
      else desc = `${val.toLocaleString()}원 할인`;   // 3000, 5000 등 → 금액
    }
    if (!desc && v.amount) desc = `${Number(v.amount).toLocaleString()}원 할인`;
    return {
      description: desc || 'N/A',
      code: (v.code && v.code !== 'N/A') ? v.code : undefined,
      expiry: v.expiry || v.expiryDate || undefined,
      sold: v.sold || false,
      sold_to: v.sold_to || '',
    };
  };

  const isVoucherExpired = (expiry: string | undefined): boolean => {
    if (!expiry || expiry === 'N/A') return false;
    try { return new Date(expiry) < new Date(); } catch { return false; }
  };

  const isVoucherExpiringSoon = (expiry: string | undefined): boolean => {
    if (!expiry || expiry === 'N/A') return false;
    try {
      const exp = new Date(expiry);
      const now = new Date();
      return exp >= now && exp <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    } catch { return false; }
  };

  const sortVouchers = (vouchers: any[]): any[] =>
    [...vouchers].sort((a, b) => {
      if (a.sold !== b.sold) return a.sold ? 1 : -1;
      const aExp = isVoucherExpired(a.expiry), bExp = isVoucherExpired(b.expiry);
      if (aExp !== bExp) return aExp ? 1 : -1;
      return getCouponDisplayInfo(b.description).sortValue - getCouponDisplayInfo(a.description).sortValue;
    });

  // ===== 상태 파싱 유틸리티 =====
  // 상태 문자열에서 [YY-MM-DD HH:MM] 패턴으로 날짜 파싱
  const parseStatusDate = (status: string | undefined): Date | null => {
    if (!status) return null;
    const match = status.match(/\[(\d{2})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})\]/);
    if (!match) return null;
    const [, yy, mm, dd, hh, min] = match;
    return new Date(2000 + parseInt(yy), parseInt(mm) - 1, parseInt(dd), parseInt(hh), parseInt(min));
  };

  // 4개 상태 필드 중 가장 최근 날짜 반환
  const getLatestStatusDate = (record: AdidasAccount): Date | null => {
    const dates = [
      parseStatusDate(record.web_fetch_status),
      parseStatusDate(record.mobile_fetch_status),
      parseStatusDate(record.web_issue_status),
      parseStatusDate(record.mobile_issue_status),
      parseStatusDate(record.fetch_status),
    ].filter((d): d is Date => d !== null);
    if (dates.length === 0) return null;
    return dates.reduce((a, b) => (a > b ? a : b));
  };

  // 4개 상태 필드 중 가장 최근 상태 문자열 반환 (날짜 있는 것 우선, 없으면 첫 번째 값)
  const getMostRecentStatusStr = (record: AdidasAccount): string | null => {
    const candidates = [
      record.web_fetch_status,
      record.mobile_fetch_status,
      record.web_issue_status,
      record.mobile_issue_status,
      (!record.web_fetch_status && !record.mobile_fetch_status) ? record.fetch_status : null,
    ].filter(Boolean) as string[];
    if (candidates.length === 0) return null;
    // 날짜 있는 것들로 가장 최근 것 선택
    const withDate = candidates
      .map(s => ({ s, d: parseStatusDate(s) }))
      .filter((x): x is { s: string; d: Date } => x.d !== null);
    if (withDate.length > 0) {
      return withDate.reduce((a, b) => a.d > b.d ? a : b).s;
    }
    return candidates[0];
  };

  // 상태 텍스트에서 색상 결정
  const getStatusColor = (text: string): string => {
    if (text.includes('조회 중') || text.includes('발급 중') || text.includes('처리 중')) return 'processing';
    if (text.includes('완료')) return 'success';
    if (text.includes('실패') || text.includes('오류') || text.includes('포인트 부족') || text.includes('틀림')) return 'error';
    if (text.includes('미경과') || text.includes('부족') || text.includes('없음')) return 'warning';
    return 'default';
  };

  // 만료 임박 쿠폰 알림 (7일 이내)
  const expiringCouponAlerts = useMemo(() => {
    const alerts: { email: string; couponName: string; expiry: string; code?: string }[] = [];
    accounts.forEach(acc => {
      if (!acc.owned_vouchers) return;
      try {
        const vouchers = JSON.parse(acc.owned_vouchers);
        vouchers.forEach((v: any) => {
          const nv = normalizeVoucher(v);
          if (!nv.sold && isVoucherExpiringSoon(nv.expiry) && !isVoucherExpired(nv.expiry)) {
            alerts.push({ email: acc.email, couponName: nv.description, expiry: nv.expiry || '', code: nv.code });
          }
        });
      } catch {}
    });
    return alerts;
  }, [accounts]);

  // 만료 임박 쿠폰 종류별 그룹핑
  const groupedExpiringAlerts = useMemo(() => {
    const map = new Map<string, { couponName: string; expiry: string; code?: string }[]>();
    expiringCouponAlerts.forEach(a => {
      const name = getCouponDisplayInfo(a.couponName).name;
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(a);
    });
    // sortValue 내림차순으로 정렬
    return Array.from(map.entries()).sort((a, b) => {
      const va = getCouponDisplayInfo(a[1][0].couponName).sortValue;
      const vb = getCouponDisplayInfo(b[1][0].couponName).sortValue;
      return vb - va;
    });
  }, [expiringCouponAlerts]);

  const columns = [
    {
      title: 'No',
      key: 'index',
      width: 50,
      render: (_: any, __: any, index: number) => {
        return (currentPage - 1) * pageSize + index + 1;
      },
    },
    {
      title: '사용',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 55,
      align: 'center' as 'center',
      render: (isActive: boolean) =>
        isActive ? (
          <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '18px' }} />
        ) : (
          <CloseCircleOutlined style={{ color: '#d9d9d9', fontSize: '18px' }} />
        ),
    },
    {
      title: '이메일/비밀번호',
      key: 'email_password',
      width: 200,
      render: (_: any, record: AdidasAccount) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span
            onClick={() => {
              navigator.clipboard.writeText(record.email);
              message.success('이메일이 복사되었습니다');
            }}
            style={{ cursor: 'pointer', fontSize: '12px' }}
          >
            {record.email}
          </span>
          <span
            onClick={() => {
              navigator.clipboard.writeText(record.password);
              message.success('비밀번호가 복사되었습니다');
            }}
            style={{ cursor: 'pointer', fontSize: '12px', color: '#888', fontFamily: 'monospace' }}
          >
            {record.password}
          </span>
        </div>
      ),
    },
    {
      title: '생일',
      dataIndex: 'birthday',
      key: 'birthday',
      width: 60,
      render: (birthday: string) => {
        if (!birthday) return '-';
        const parts = birthday.split('-');
        if (parts.length === 3) {
          return <strong>{`${parts[1]}/${parts[2]}`}</strong>;
        }
        return <strong>{birthday}</strong>;
      },
    },
    {
      title: '이름/전화번호',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      render: (name: string, record: AdidasAccount) => {
        const phone = record.phone;
        const convertedPhone = phone ? phone.replace(/^\+82\s*/, '0') : null;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontWeight: '500', fontSize: '12px' }}>{convertedPhone || '-'}</div>
            {name && (
              <div style={{ fontSize: '11px', color: '#999' }}>{name}</div>
            )}
          </div>
        );
      },
    },
    {
      title: '바코드',
      dataIndex: 'adikr_barcode',
      key: 'adikr_barcode',
      width: 115,
      render: (barcode: string) => barcode ? (
        <strong style={{
          fontFamily: 'monospace',
          fontSize: '12px',
          letterSpacing: '1px',
          background: '#f0f0f0',
          padding: '3px 6px',
          borderRadius: '4px',
          display: 'inline-block'
        }}>
          {barcode}
        </strong>
      ) : '-',
    },
    {
      title: '바코드이미지',
      dataIndex: 'barcode_image_url',
      key: 'barcode_image_url',
      width: 100,
      align: 'center' as 'center',
      render: (image: string, record: AdidasAccount) => {
        if (image) {
          const src = getStaticUrl(image);
          return (
            <img
              src={src}
              alt="barcode"
              style={{ maxWidth: '90px', maxHeight: '36px', cursor: 'pointer' }}
              onClick={() => {
                setSelectedBarcode({ url: src, email: record.email });
                setBarcodeModalVisible(true);
              }}
            />
          );
        }
        return <span style={{ color: '#ccc', fontSize: '11px' }}>{record.adikr_barcode ? '생성중…' : '-'}</span>;
      },
    },
    {
      title: '포인트',
      dataIndex: 'current_points',
      key: 'current_points',
      width: 85,
      render: (points: number) => points ? (
        <strong style={{ color: '#1890ff', fontSize: '13px' }}>
          {points.toLocaleString()}P
        </strong>
      ) : '-',
    },
    {
      title: '보유 쿠폰',
      dataIndex: 'owned_vouchers',
      key: 'owned_vouchers',
      width: 190,
      render: (vouchers: string, record: AdidasAccount) => {
        if (!vouchers) return <span style={{ color: '#999', fontSize: '12px' }}>없음</span>;
        try {
          const rawList = JSON.parse(vouchers);
          if (rawList.length === 0) return <span style={{ color: '#999', fontSize: '12px' }}>없음</span>;
          const indexed = rawList.map((v: any, idx: number) => ({ ...normalizeVoucher(v), _idx: idx }));
          const sorted = sortVouchers(indexed);
          const isExpanded = expandedVouchers.has(record.id);

          const renderCard = (v: any) => {
            const info = getCouponDisplayInfo(v.description);
            const expired = isVoucherExpired(v.expiry);
            const expiringSoon = isVoucherExpiringSoon(v.expiry);
            const expiryShort = v.expiry && v.expiry !== 'N/A'
              ? v.expiry.slice(5).replace('-', '/')
              : '-';

            // Electron 앱 색상 그대로
            const bgMain = v.sold || expired ? '#6b7280' : '#166534';
            const bgRight = v.sold || expired ? '#d4d4d4' : '#fef9c3';
            const expiryColor = v.sold || expired ? '#525252' : (expiringSoon ? '#dc2626' : '#713f12');
            const borderStyle = expiringSoon && !v.sold && !expired
              ? '2px solid #ef4444'
              : '2px solid transparent';

            return (
              <div
                key={v._idx}
                style={{
                  display: 'flex',
                  width: '100%',
                  maxWidth: 200,
                  height: 50,
                  borderRadius: 6,
                  overflow: 'hidden',
                  cursor: 'default',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                  border: borderStyle,
                  marginBottom: 4,
                  opacity: v.sold || expired ? 0.65 : 1,
                  filter: v.sold || expired ? 'grayscale(0.6)' : 'none',
                  flexShrink: 0,
                  position: 'relative',
                }}
              >
                {/* 왼쪽: 쿠폰명 + 코드 */}
                <div style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  padding: '5px 8px 5px 10px',
                  background: bgMain,
                  color: 'white',
                  minWidth: 0,
                  overflow: 'hidden',
                  position: 'relative',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.1 }}>
                    {info.name}
                  </div>
                  {v.code && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(v.code);
                        message.success('쿠폰 코드 복사됨');
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 2,
                        marginTop: 3,
                        background: v.sold || expired ? '#d4d4d4' : '#fef9c3',
                        color: v.sold || expired ? '#525252' : '#713f12',
                        fontSize: 9,
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: 3,
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: 'monospace',
                        letterSpacing: '0.3px',
                        cursor: 'pointer',
                      }}
                    >
                      {v.code} 📋
                    </div>
                  )}
                  {v.sold && (
                    <div style={{
                      position: 'absolute', top: '50%', left: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: 10, fontWeight: 600, color: '#fff',
                      background: 'rgba(0,0,0,0.7)', padding: '3px 8px', borderRadius: 4,
                      whiteSpace: 'nowrap',
                    }}>
                      {v.sold_to ? `→ ${v.sold_to}` : '판매완료'}
                    </div>
                  )}
                </div>
                {/* 오른쪽: 유효기간 */}
                <div style={{
                  width: 44,
                  background: bgRight,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: '4px 4px',
                  borderLeft: '1px dashed #a3a3a3',
                  borderRadius: '0 6px 6px 0',
                  flexShrink: 0,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: expiryColor, textAlign: 'center', lineHeight: 1.2 }}>
                    {expiryShort}
                  </div>
                </div>
              </div>
            );
          };

          const visibleCards = isExpanded ? sorted : [sorted[0]];
          const hasMore = sorted.length > 1;

          return (
            <div>
              {visibleCards.map(v => renderCard(v))}
              {hasMore && (
                <div
                  style={{ fontSize: 11, color: '#1890ff', cursor: 'pointer', textAlign: 'center', paddingTop: 1 }}
                  onClick={() => setExpandedVouchers(prev => {
                    const next = new Set(prev);
                    isExpanded ? next.delete(record.id) : next.add(record.id);
                    return next;
                  })}
                >
                  {isExpanded ? '▲ 접기' : `▼ +${sorted.length - 1}개`}
                </div>
              )}
            </div>
          );
        } catch {
          return <span style={{ color: '#999', fontSize: '12px' }}>없음</span>;
        }
      },
    },
    {
      title: '조회일자',
      key: 'latest_status_date',
      width: 80,
      align: 'center' as 'center',
      render: (_: any, record: AdidasAccount) => {
        const latest = getLatestStatusDate(record);
        if (!latest) return <span style={{ color: '#999' }}>-</span>;
        const m = latest.getMonth() + 1;
        const d = latest.getDate();
        const hh = String(latest.getHours()).padStart(2, '0');
        const mm = String(latest.getMinutes()).padStart(2, '0');
        return (
          <div style={{ fontSize: '12px', textAlign: 'center' }}>
            <div>{`${m}/${d}`}</div>
            <div style={{ color: '#888' }}>{`${hh}:${mm}`}</div>
          </div>
        );
      },
    },
    {
      title: '조회상태',
      key: 'status_summary',
      width: 140,
      render: (_: any, record: AdidasAccount) => {
        const allFields = [
          { label: '웹조회', value: record.web_fetch_status },
          { label: '모바일', value: record.mobile_fetch_status },
          { label: '웹발급', value: record.web_issue_status },
          { label: '모발급', value: record.mobile_issue_status },
          ...(!record.web_fetch_status && !record.mobile_fetch_status && record.fetch_status
            ? [{ label: '조회', value: record.fetch_status }]
            : []),
        ].filter(f => f.value);

        if (allFields.length === 0) return <span style={{ color: '#999' }}>-</span>;

        const getShortStatus = (text: string): { label: string; color: string } => {
          if (text.includes('중...')) return { label: '진행중', color: '#1890ff' };
          if (text.includes('완료')) return { label: '완료', color: '#52c41a' };
          if (text.includes('비밀번호') || text.includes('비번')) return { label: '비번오류', color: '#fa8c16' };
          if (text.includes('차단') || text.includes('BOT')) return { label: '차단', color: '#ff4d4f' };
          if (text.includes('포인트 부족')) return { label: 'P부족', color: '#faad14' };
          if (text.includes('미경과')) return { label: '미경과', color: '#faad14' };
          if (text.includes('버튼 없음')) return { label: '버튼없음', color: '#faad14' };
          if (text.includes('실패') || text.includes('오류') || text.includes('에러')) return { label: '오류', color: '#ff4d4f' };
          if (text.includes('대기')) return { label: '대기', color: '#d9d9d9' };
          const core = text.replace(/\[[^\]]*\]/g, '').trim();
          return { label: core.length > 5 ? core.substring(0, 5) + '…' : core, color: '#8c8c8c' };
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {allFields.map((f, i) => {
              const { label: sLabel, color } = getShortStatus(f.value!);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontSize: '10px', color: '#aaa', minWidth: 32 }}>{f.label}</span>
                  <span style={{ fontSize: '11px', color, fontWeight: 600 }}>{sLabel}</span>
                </div>
              );
            })}
          </div>
        );
      },
    },
    {
      title: '작업',
      key: 'action',
      width: 80,
      fixed: 'right' as 'right',
      render: (_: any, record: AdidasAccount) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            size="small"
            style={{ color: '#000', padding: '0 8px' }}
          >
            수정
          </Button>
          <Popconfirm
            title="정말 삭제하시겠습니까?"
            onConfirm={() => handleDelete(record.id)}
            okText="삭제"
            cancelText="취소"
          >
            <Button
              type="text"
              icon={<DeleteOutlined />}
              size="small"
              style={{ color: '#000', padding: '0 8px' }}
            >
              삭제
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  // 웹 스크래핑 방식 제거됨 - Appium 모바일 자동화로 대체 예정

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={
          <div style={{ width: '100%', padding: '8px 0' }}>
            {/* 첫 번째 줄 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              {/* 1줄 왼쪽: 검색 + 전체 선택 */}
              <Space size="middle">
                <Input
                  placeholder="이메일, 이름, 쿠폰코드 검색"
                  prefix={<SearchOutlined />}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  style={{ width: 200 }}
                  allowClear
                />
                <Checkbox
                  checked={filteredAccounts.length > 0 && selectedRowKeys.length === filteredAccounts.length}
                  indeterminate={selectedRowKeys.length > 0 && selectedRowKeys.length < filteredAccounts.length}
                  onChange={e => {
                    if (e.target.checked) setSelectedRowKeys(filteredAccounts.map(a => a.id));
                    else setSelectedRowKeys([]);
                  }}
                >
                  <span style={{ fontSize: 12 }}>전체 선택</span>
                </Checkbox>
              </Space>

              {/* 1줄 오른쪽: 기본 버튼 */}
              <Space size="middle">
                <Radio.Group
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value)}
                  size="small"
                >
                  <Radio.Button value="card" style={{ color: viewMode === 'card' ? '#4a5f7f' : '#888', fontWeight: viewMode === 'card' ? 600 : 400 }}>카드</Radio.Button>
                  <Radio.Button value="table" style={{ color: viewMode === 'table' ? '#4a5f7f' : '#888', fontWeight: viewMode === 'table' ? 600 : 400 }}>표</Radio.Button>
                </Radio.Group>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={loadAccounts}
                  size="small"
                >
                  새로고침
                </Button>
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => setBulkPasteModalVisible(true)}
                  size="small"
                  style={{ backgroundColor: '#4a5f7f', color: '#fff', border: 'none' }}
                >
                  계정 추가
                </Button>
              </Space>
            </div>

            {/* 두 번째 줄: 필터 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <Space size={6} wrap>
                {/* 계정 상태 */}
                <Radio.Group value={activeFilter} onChange={e => setActiveFilter(e.target.value)} size="small" buttonStyle="solid">
                  <Radio.Button value="all">전체</Radio.Button>
                  <Radio.Button value="active">활성</Radio.Button>
                  <Radio.Button value="inactive">비활성</Radio.Button>
                </Radio.Group>

                {/* 이메일 유형 */}
                <Select value={emailTypeFilter} onChange={setEmailTypeFilter} size="small" style={{ width: 110 }}>
                  <Option value="all">이메일 전체</Option>
                  <Option value="official">공식이메일</Option>
                  <Option value="catchall">캐치올</Option>
                </Select>

                {/* 조회 현황 */}
                <Dropdown trigger={['click']} dropdownRender={() => (
                  <div style={{ backgroundColor: 'white', border: '1px solid #d9d9d9', borderRadius: 6, padding: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                    <Checkbox.Group value={statusFilter} onChange={v => setStatusFilter(v as string[])}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <Checkbox value="success">완료</Checkbox>
                        <Checkbox value="error">오류</Checkbox>
                      </div>
                    </Checkbox.Group>
                  </div>
                )}>
                  <Badge count={statusFilter.length} offset={[-5, 5]}>
                    <Button size="small" icon={<FilterOutlined />}>
                      조회현황 {statusFilter.length > 0 && `(${statusFilter.length})`}
                    </Button>
                  </Badge>
                </Dropdown>

                {/* 조회 일자 (from ~ to) */}
                <Space size={2}>
                  <DatePicker
                    size="small"
                    style={{ width: 105 }}
                    value={fetchDateFrom ? dayjs(fetchDateFrom) : null}
                    placeholder="조회일 이후"
                    onChange={date => setFetchDateFrom(date ? date.format('YYYY-MM-DD') : null)}
                    allowClear
                  />
                  <span style={{ fontSize: 11, color: '#aaa' }}>~</span>
                  <DatePicker
                    size="small"
                    style={{ width: 105 }}
                    value={fetchDateTo ? dayjs(fetchDateTo) : null}
                    placeholder="조회일 이전"
                    onChange={date => setFetchDateTo(date ? date.format('YYYY-MM-DD') : null)}
                    allowClear
                  />
                </Space>

                {/* 포인트 */}
                <Dropdown trigger={['click']} dropdownRender={() => (
                  <div style={{ backgroundColor: 'white', border: '1px solid #d9d9d9', borderRadius: 6, padding: '10px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', width: 200 }}>
                    <div style={{ marginBottom: 8, fontSize: 12, color: '#888' }}>포인트 범위</div>
                    <Space size={6}>
                      <Input
                        placeholder="최소P"
                        value={minPoints}
                        onChange={e => setMinPoints(e.target.value.replace(/\D/g, ''))}
                        style={{ width: 84 }}
                        size="small"
                        allowClear
                      />
                      <span style={{ color: '#aaa' }}>~</span>
                      <Input
                        placeholder="최대P"
                        value={maxPoints}
                        onChange={e => setMaxPoints(e.target.value.replace(/\D/g, ''))}
                        style={{ width: 84 }}
                        size="small"
                        allowClear
                      />
                    </Space>
                  </div>
                )}>
                  <Badge dot={!!(minPoints || maxPoints)} offset={[-4, 4]}>
                    <Button size="small" icon={<FilterOutlined />}>
                      포인트 {(minPoints || maxPoints) ? `(${minPoints||'0'}~${maxPoints||'∞'})` : ''}
                    </Button>
                  </Badge>
                </Dropdown>

                {/* 쿠폰 */}
                <Dropdown trigger={['click']} dropdownRender={() => (
                  <div style={{ backgroundColor: 'white', border: '1px solid #d9d9d9', borderRadius: 6, padding: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                    <Checkbox.Group value={couponFilter} onChange={v => setCouponFilter(v as string[])}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {COUPON_CATEGORIES.map(cat => (
                          <Checkbox key={cat.key} value={cat.key}>{cat.label}</Checkbox>
                        ))}
                      </div>
                    </Checkbox.Group>
                  </div>
                )}>
                  <Badge count={couponFilter.length} offset={[-5, 5]}>
                    <Button size="small" icon={<FilterOutlined />}>
                      쿠폰 {couponFilter.length > 0 && `(${couponFilter.length})`}
                    </Button>
                  </Badge>
                </Dropdown>

                {/* 생일 월 */}
                <Dropdown trigger={['click']} dropdownRender={() => (
                  <div style={{ backgroundColor: 'white', border: '1px solid #d9d9d9', borderRadius: 6, padding: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                    <Checkbox.Group value={birthdayMonthFilter} onChange={v => setBirthdayMonthFilter(v as string[])}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {Array.from({ length: 12 }, (_, i) => (
                          <Checkbox key={i+1} value={String(i+1)}>{i+1}월</Checkbox>
                        ))}
                      </div>
                    </Checkbox.Group>
                  </div>
                )}>
                  <Badge count={birthdayMonthFilter.length} offset={[-5, 5]}>
                    <Button size="small" icon={<FilterOutlined />}>
                      생일 {birthdayMonthFilter.length > 0 && `(${birthdayMonthFilter.length})`}
                    </Button>
                  </Badge>
                </Dropdown>

                {/* 필터 초기화 */}
                {(activeFilter !== 'active' || emailTypeFilter !== 'all' || fetchDateFrom || fetchDateTo || statusFilter.length > 0 || couponFilter.length > 0 || minPoints || maxPoints || birthdayMonthFilter.length > 0) && (
                  <Button size="small" onClick={() => { setActiveFilter('active'); setEmailTypeFilter('all'); setFetchDateFrom(null); setFetchDateTo(null); setStatusFilter([]); setCouponFilter([]); setMinPoints(''); setMaxPoints(''); setBirthdayMonthFilter([]); }}>
                    초기화
                  </Button>
                )}
              </Space>

              {/* 2줄 오른쪽: 선택 시 활성화 버튼 */}
              {selectedRowKeys.length > 0 && (
                <Space size={8} align="center">
                  <span style={{ color: '#666', fontWeight: 500, fontSize: '13px' }}>
                    {selectedRowKeys.length}개 선택
                  </span>
                  <Button
                    icon={<DownloadOutlined />}
                    onClick={handleBulkDownloadBarcode}
                    size="small"
                    style={{ backgroundColor: '#237804', color: '#fff', border: 'none' }}
                  >
                    바코드 다운로드
                  </Button>
                  {/* 활성/비활성 토글 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 4px', border: '1px solid #d9d9d9', borderRadius: 6, background: '#fafafa', height: 24 }}>
                    <span style={{ fontSize: 11, color: '#666' }}>비활성</span>
                    <Switch
                      size="small"
                      checked={bulkActiveToggle}
                      onChange={(checked) => {
                        setBulkActiveToggle(checked);
                        if (checked) handleBulkActivate();
                        else handleBulkDeactivate();
                      }}
                    />
                    <span style={{ fontSize: 11, color: '#666' }}>활성</span>
                  </div>
                  <Popconfirm
                    title={`선택한 ${selectedRowKeys.length}개 계정을 삭제하시겠습니까?`}
                    onConfirm={handleBulkDelete}
                    okText="삭제"
                    cancelText="취소"
                  >
                    <Button danger icon={<DeleteOutlined />} size="small">
                      삭제
                    </Button>
                  </Popconfirm>
                </Space>
              )}
            </div>
          </div>
        }
      >

        {viewMode === 'card' ? (
          /* ===== 카드 뷰 ===== */
          <div>
            {/* 만료 임박 쿠폰 알림 배너 - 종류별 그룹 */}
            {groupedExpiringAlerts.length > 0 && (
              <div style={{ marginBottom: 12, padding: '8px 12px', backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e', marginBottom: 8 }}>
                  ⚠️ 만료 임박 쿠폰 {expiringCouponAlerts.length}개 (7일 이내)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {groupedExpiringAlerts.map(([typeName, items]) => (
                    <div
                      key={typeName}
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        border: '1.5px solid #ef4444',
                        borderRadius: 5,
                        overflow: 'hidden',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                        flexShrink: 0,
                      }}
                    >
                      {/* 왼쪽: 종류명 + 개수 */}
                      <div style={{
                        background: '#166534',
                        padding: '4px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        minWidth: 48,
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{typeName}</span>
                        <span style={{ fontSize: 10, color: '#bbf7d0', whiteSpace: 'nowrap' }}>×{items.length}</span>
                      </div>
                      {/* 오른쪽: 쿠폰 목록 (코드 + 만료일) */}
                      <div style={{ background: '#fef9c3', padding: '3px 6px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
                        {items.map((a, j) => {
                          const expiryShort = a.expiry ? a.expiry.slice(5).replace('-', '/') : '-';
                          return (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 4, lineHeight: 1.2 }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap' }}>{expiryShort}</span>
                              {a.code && (
                                <span
                                  onClick={() => { navigator.clipboard.writeText(a.code!); message.success('코드 복사'); }}
                                  style={{ fontSize: 8, color: '#713f12', fontFamily: 'monospace', whiteSpace: 'nowrap', cursor: 'pointer', textDecoration: 'underline dotted' }}
                                >{a.code}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {loading && <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>불러오는 중...</div>}
            {!loading && filteredAccounts.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>계정이 없습니다</div>
            )}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
              gap: 10,
              padding: '4px 0',
              alignItems: 'start',
            }}>
              {filteredAccounts
                .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                .map((record) => {
                  const isSelected = selectedRowKeys.includes(record.id);

                  // 가장 최근 상태 문자열 기준으로 overallStatus 결정
                  const mostRecentStatus = getMostRecentStatusStr(record);
                  let overallStatus: 'success' | 'error' | 'none' = 'none';
                  if (mostRecentStatus) {
                    const isErr = mostRecentStatus.includes('오류') || mostRecentStatus.includes('에러') ||
                      mostRecentStatus.includes('차단') || mostRecentStatus.includes('비밀번호') ||
                      mostRecentStatus.includes('BOT') || mostRecentStatus.includes('틀림') ||
                      mostRecentStatus.includes('중...');
                    const isOk = !isErr && (
                      mostRecentStatus.includes('완료') || mostRecentStatus.includes('미경과') ||
                      mostRecentStatus.includes('포인트 부족') || mostRecentStatus.includes('버튼 없음') ||
                      mostRecentStatus.includes('발급 실패')
                    );
                    if (isErr) overallStatus = 'error';
                    else if (isOk) overallStatus = 'success';
                  }

                  const statusMap = {
                    success: { bg: '#16a34a', label: '완료' },
                    error:   { bg: '#dc2626', label: '오류' },
                    none:    { bg: '#9ca3af', label: '-' },
                  };
                  const { bg: statusBg, label: statusLabel } = statusMap[overallStatus];

                  const latestDate = getLatestStatusDate(record);
                  const dateStr = latestDate
                    ? `${latestDate.getMonth()+1}/${latestDate.getDate()} ${String(latestDate.getHours()).padStart(2,'0')}:${String(latestDate.getMinutes()).padStart(2,'0')}`
                    : null;

                  const bdParts = record.birthday?.split('-');
                  const bdShort = bdParts?.length === 3 ? `${bdParts[1]}/${bdParts[2]}` : null;

                  let sortedVouchers: any[] = [];
                  try {
                    if (record.owned_vouchers) {
                      const raw = JSON.parse(record.owned_vouchers);
                      sortedVouchers = sortVouchers(raw.map((v: any, i: number) => ({ ...normalizeVoucher(v), _idx: i })));
                    }
                  } catch {}

                  // 공식이메일 vs 캐치올 판별
                  const knownDomains = ['gmail.com', 'naver.com', 'kakao.com', 'daum.net', 'hanmail.net', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'me.com', 'live.com', 'msn.com'];
                  const emailDomain = record.email.split('@')[1]?.toLowerCase() || '';
                  const isOfficialEmail = knownDomains.includes(emailDomain);

                  // 헤더 테마
                  // 공식이메일: 하늘색 계열, 캐치올: 연보라 계열 (둘 다 밝은 파스텔)
                  const hdrBg     = !record.is_active ? '#f4f4f4' : isOfficialEmail ? '#f0f9ff' : '#faf5ff';
                  const hdrBorder = !record.is_active ? '#e0e0e0' : isOfficialEmail ? '#bae6fd' : '#e9d5ff';
                  const hdrEmail  = !record.is_active ? '#777' : isOfficialEmail ? '#0369a1' : '#6d28d9';
                  const hdrPw     = !record.is_active ? '#999' : '#374151';
                  const hdrDate   = !record.is_active ? '#999' : '#374151';

                  return (
                    <div
                      key={record.id}
                      onClick={() => { setDetailAccount(record); setDetailModalVisible(true); }}
                      style={{
                        width: '100%',
                        border: isSelected ? '2px solid #1890ff' : '1px solid #e2e8f0',
                        borderRadius: 8,
                        backgroundColor: '#fff',
                        boxShadow: isSelected ? '0 0 0 3px #bfdbfe' : '0 1px 3px rgba(0,0,0,0.07)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        cursor: 'pointer',
                        opacity: record.is_active ? 1 : 0.65,
                      }}
                    >
                      {/* ── 헤더: 활성상태 + 계정정보 + 조회현황 ── */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px 10px 7px',
                        borderBottom: `1px solid ${hdrBorder}`,
                        backgroundColor: hdrBg,
                        gap: 7,
                      }}>
                        {/* 체크박스 + 활성 dot */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              setSelectedRowKeys(prev =>
                                e.target.checked ? [...prev, record.id] : prev.filter(k => k !== record.id)
                              );
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ cursor: 'pointer', width: 13, height: 13 }}
                          />
                          <span style={{
                            width: 7, height: 7, borderRadius: '50%',
                            backgroundColor: record.is_active ? '#22c55e' : '#ef4444',
                            display: 'inline-block',
                          }} />
                        </div>

                        {/* 이메일 + 비밀번호 */}
                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                            <span
                              style={{ color: hdrEmail, cursor: 'copy' }}
                              onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(record.email); message.success('이메일 복사'); }}
                            >{record.email}</span>
                          </div>
                          <div style={{ fontSize: 10, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3, marginTop: 1 }}>
                            <span
                              style={{ color: hdrPw, cursor: 'copy' }}
                              onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(record.password); message.success('비밀번호 복사'); }}
                            >{record.password}</span>
                          </div>
                        </div>

                        {/* 조회일자 + 상태뱃지 */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                          {dateStr && <span style={{ fontSize: 10, fontWeight: 700, color: hdrDate, whiteSpace: 'nowrap' }}>{dateStr}</span>}
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            fontSize: 10, fontWeight: 700,
                            padding: '1px 7px', borderRadius: 8,
                            backgroundColor: statusBg,
                            color: '#fff',
                          }}>
                            {statusLabel}
                          </span>
                        </div>
                      </div>

                      {/* ── 정보 줄: 포인트 | 생일 | 바코드 (3등분) ── */}
                      <div style={{
                        display: 'flex',
                        borderBottom: '1px solid #ebebeb',
                        backgroundColor: '#f7f8fa',
                      }}>
                        <div style={{ flex: 1, padding: '4px 6px', textAlign: 'center', borderRight: '1px solid #ebebeb' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: record.current_points != null && record.current_points > 0 ? '#2563eb' : '#6b7280' }}>
                            {record.current_points != null ? `${record.current_points.toLocaleString()}P` : '-P'}
                          </span>
                        </div>
                        <div style={{ flex: 1, padding: '4px 6px', textAlign: 'center', borderRight: '1px solid #ebebeb' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#111827' }}>🎂 {bdShort || '-'}</span>
                        </div>
                        <div style={{ flex: 1, padding: '4px 6px', textAlign: 'center', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#111827', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {record.adikr_barcode || '-'}
                          </span>
                        </div>
                      </div>

                      {/* ── 쿠폰 목록 (한 줄에 2개) ── */}
                      <div style={{ padding: '6px 8px 7px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {sortedVouchers.length === 0 ? (
                          <span style={{ fontSize: 10, color: '#bbb', padding: '2px 2px' }}>쿠폰 없음</span>
                        ) : (
                          <>
                            {sortedVouchers.slice(0, 2).map((v) => {
                              const info = getCouponDisplayInfo(v.description);
                              const expired = isVoucherExpired(v.expiry);
                              const expiryShort = v.expiry && v.expiry !== 'N/A' ? v.expiry.slice(5).replace('-', '/') : '-';
                              const bgMain = v.sold || expired ? '#6b7280' : '#166534';
                              const bgRight = v.sold || expired ? '#d4d4d4' : '#fef9c3';
                              const expiryColor = v.sold || expired ? '#525252' : '#713f12';
                              const expiringSoon = isVoucherExpiringSoon(v.expiry);
                              return (
                                <div
                                  key={v._idx}
                                  style={{
                                    display: 'flex',
                                    width: 'calc(50% - 2px)',
                                    height: 30,
                                    borderRadius: 3,
                                    overflow: 'hidden',
                                    cursor: 'default',
                                    border: expiringSoon && !v.sold && !expired ? '1.5px solid #ef4444' : '1.5px solid transparent',
                                    opacity: v.sold || expired ? 0.6 : 1,
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                    flexShrink: 0,
                                  }}
                                >
                                  <div style={{ background: bgMain, padding: '2px 6px', display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, position: 'relative', minWidth: 0 }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>{info.name}</span>
                                    {v.code && (
                                      <span
                                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(v.code); message.success('코드 복사'); }}
                                        style={{ fontSize: 8, color: '#fef9c3', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2, cursor: 'pointer' }}
                                      >{v.code}</span>
                                    )}
                                    {v.sold && (
                                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', fontSize: 9, color: '#fff', fontWeight: 600 }}>
                                        {v.sold_to ? `→${v.sold_to}` : '판매'}
                                      </div>
                                    )}
                                  </div>
                                  <div style={{ background: bgRight, width: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: '1px dashed #a3a3a3', flexShrink: 0 }}>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: expiryColor, textAlign: 'center', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{expiryShort}</span>
                                  </div>
                                </div>
                              );
                            })}
                            {sortedVouchers.length > 2 && (
                              <div style={{ width: '100%', fontSize: 9, color: '#4b5563', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                외 {sortedVouchers.slice(2).map(v => getCouponDisplayInfo(v.description).name).join(' · ')} 총 {sortedVouchers.length}개
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
            {/* 페이지네이션 */}
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Space>
                <span style={{ color: '#666', fontSize: 13 }}>총 {filteredAccounts.length}개</span>
                <Select value={pageSize} onChange={(v) => { setPageSize(v); setCurrentPage(1); }} size="small" style={{ width: 90 }}>
                  {[20, 50, 100, 200].map(n => <Option key={n} value={n}>{n}개씩</Option>)}
                </Select>
                <Button size="small" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>«</Button>
                <Button size="small" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>‹</Button>
                <span style={{ fontSize: 13, padding: '0 8px' }}>{currentPage} / {Math.max(1, Math.ceil(filteredAccounts.length / pageSize))}</span>
                <Button size="small" disabled={currentPage >= Math.ceil(filteredAccounts.length / pageSize)} onClick={() => setCurrentPage(p => p + 1)}>›</Button>
                <Button size="small" disabled={currentPage >= Math.ceil(filteredAccounts.length / pageSize)} onClick={() => setCurrentPage(Math.ceil(filteredAccounts.length / pageSize))}>»</Button>
              </Space>
            </div>
          </div>
        ) : (
          /* ===== 표 뷰 (백업) ===== */
          <Table
            columns={columns}
            dataSource={filteredAccounts}
            rowKey="id"
            loading={loading}
            rowSelection={{
              selectedRowKeys,
              onChange: (selectedKeys) => setSelectedRowKeys(selectedKeys),
            }}
            scroll={{ x: 'max-content' }}
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              pageSizeOptions: ['20', '50', '100', '200', '500'],
              showSizeChanger: true,
              showTotal: (total) => `총 ${total}개`,
              onChange: (page, size) => {
                setCurrentPage(page);
                if (size !== pageSize) {
                  setPageSize(size);
                  setCurrentPage(1);
                }
              },
            }}
          />
        )}
      </Card>

      <Modal
        title={editingAccount ? '계정 수정' : '계정 추가'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
        okText="저장"
        cancelText="취소"
      >
        <Form form={form} layout="vertical" initialValues={{ is_active: true }}>
          <Form.Item
            name="email"
            label="이메일 (필수)"
            rules={[
              { required: true, message: '이메일을 입력하세요' },
              { type: 'email', message: '올바른 이메일 형식이 아닙니다' },
            ]}
          >
            <Input placeholder="adidas@example.com" size="large" />
          </Form.Item>

          <Form.Item
            name="password"
            label="비밀번호 (필수)"
            rules={[{ required: !editingAccount, message: '비밀번호를 입력하세요' }]}
          >
            <Input.Password placeholder="비밀번호" size="large" />
          </Form.Item>

          <Form.Item name="birthday" label="생일 (필수)">
            <Input placeholder="YYYY-MM-DD (예: 1990-01-01)" size="large" />
          </Form.Item>

          <Form.Item name="adikr_barcode" label="ADIKR 바코드 (필수)">
            <Input placeholder="바코드 값" size="large" />
          </Form.Item>

          <Form.Item name="name" label="이름">
            <Input placeholder="홍길동" />
          </Form.Item>

          <Form.Item name="phone" label="전화번호">
            <Input placeholder="010-1234-5678" />
          </Form.Item>

          <Form.Item name="memo" label="비고">
            <Input.TextArea rows={3} placeholder="비고" />
          </Form.Item>

          <Form.Item name="is_active" label="상태" valuePropName="checked">
            <Switch checkedChildren="활성" unCheckedChildren="비활성" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="바코드 이미지"
        open={barcodeModalVisible}
        onCancel={() => {
          setBarcodeModalVisible(false);
          setSelectedBarcode(null);
        }}
        footer={[
          <Button key="close" onClick={() => setBarcodeModalVisible(false)}>
            닫기
          </Button>,
          <Button
            key="download"
            type="primary"
            onClick={() => {
              if (selectedBarcode) {
                const link = document.createElement('a');
                link.href = selectedBarcode.url;
                link.download = `barcode_${selectedBarcode.email}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                message.success('바코드 이미지가 다운로드되었습니다');
              }
            }}
          >
            다운로드
          </Button>
        ]}
      >
        {selectedBarcode && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: 16, fontWeight: 500 }}>{selectedBarcode.email}</p>
            <img
              src={selectedBarcode.url}
              alt="barcode"
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>
        )}
      </Modal>

      <Modal
        title={selectedVoucherInfo?.isSold ? "쿠폰 판매 관리" : "쿠폰 판매 등록"}
        open={voucherSaleModalVisible}
        onCancel={() => {
          setVoucherSaleModalVisible(false);
          setSelectedVoucherInfo(null);
          setVoucherSoldTo('');
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setVoucherSaleModalVisible(false);
              setSelectedVoucherInfo(null);
              setVoucherSoldTo('');
            }}
          >
            닫기
          </Button>,
          selectedVoucherInfo?.isSold ? (
            <>
              <Button
                key="edit"
                type="primary"
                onClick={() => handleVoucherSaleUpdate(true)}
              >
                수정
              </Button>
              <Button
                key="unsell"
                danger
                onClick={() => handleVoucherSaleUpdate(false)}
              >
                판매 취소
              </Button>
            </>
          ) : (
            <Button
              key="sell"
              type="primary"
              style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
              onClick={() => handleVoucherSaleUpdate(true)}
            >
              판매완료
            </Button>
          ),
        ]}
        width={400}
      >
        {selectedVoucherInfo && (
          <div>
            <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
              <Tag
                color={selectedVoucherInfo.isSold ? 'default' : 'volcano'}
                style={{
                  borderRadius: '8px',
                  padding: '4px 12px',
                  fontWeight: '500',
                  fontSize: '14px',
                }}
              >
                {selectedVoucherInfo.isSold && <span style={{ color: '#52c41a', marginRight: 4 }}>✓</span>}
                🎫 {selectedVoucherInfo.voucher.description}
              </Tag>
            </div>

            <div>
              <p style={{ marginBottom: 8, fontWeight: 500 }}>
                판매 정보 {!selectedVoucherInfo.isSold && '(선택사항)'}
              </p>
              <Input
                placeholder="예: 12/16 백호"
                value={voucherSoldTo}
                onChange={(e) => setVoucherSoldTo(e.target.value)}
                size="large"
              />
              <p style={{ marginTop: 8, color: '#999', fontSize: '12px' }}>
                언제, 누구에게 판매했는지 메모할 수 있습니다.
              </p>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title="일괄 등록 (붙여넣기)"
        open={bulkPasteModalVisible}
        onOk={handleBulkPaste}
        onCancel={() => {
          setBulkPasteModalVisible(false);
          setBulkPasteText('');
          setParsedAccounts([]);
        }}
        width="90vw"
        style={{ top: 20 }}
        styles={{ body: { height: 'calc(90vh - 110px)', overflow: 'hidden' } }}
        okText={`${parsedAccounts.length}개 등록/수정`}
        cancelText="취소"
        okButtonProps={{ disabled: parsedAccounts.length === 0 }}
      >
        <div style={{ display: 'flex', gap: 20, height: '100%' }}>
          {/* 왼쪽: 텍스트 입력 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: 12 }}>
              <p style={{ marginBottom: 8, fontWeight: 500 }}>
                데이터를 붙여넣으세요
              </p>
              <p style={{ color: '#999', fontSize: '12px', margin: 0 }}>
                형식: 이름 &nbsp; 이메일 &nbsp; 비밀번호 &nbsp; 전화번호 &nbsp; 생일<br />
                (기존) 표시가 있으면 기존 계정 정보를 업데이트합니다.
              </p>
            </div>
            <Input.TextArea
              value={bulkPasteText}
              onChange={(e) => handleBulkTextChange(e.target.value)}
              placeholder="김명진   example@naver.com   Password1!   010 1234 5678   1997 10 26 (기존)"
              style={{ fontFamily: 'monospace', fontSize: '12px', flex: 1, resize: 'none' }}
            />
            <div style={{ marginTop: 8, color: '#666', fontSize: '12px' }}>
              {bulkPasteText.trim() && `${bulkPasteText.trim().split('\n').filter(l => l.trim()).length}줄 입력됨`}
            </div>
          </div>

          {/* 오른쪽: 미리보기 테이블 */}
          <div style={{ flex: 1.3, display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: 12 }}>
              <p style={{ marginBottom: 8, fontWeight: 500 }}>
                미리보기 ({parsedAccounts.length}개)
              </p>
              <Space size="small">
                <Tag color="blue">{parsedAccounts.filter(a => !a.isExisting).length}개 신규</Tag>
                <Tag color="orange">{parsedAccounts.filter(a => a.isExisting).length}개 수정</Tag>
              </Space>
            </div>
            <div style={{ flex: 1, overflow: 'auto', border: '1px solid #d9d9d9', borderRadius: 6 }}>
              <Table
                dataSource={parsedAccounts}
                rowKey={(_, index) => index?.toString() || '0'}
                size="small"
                pagination={false}
                columns={[
                  {
                    title: '상태',
                    key: 'status',
                    width: 60,
                    align: 'center' as 'center',
                    render: (_, record) => (
                      <Tag color={record.isExisting ? 'orange' : 'blue'} style={{ margin: 0 }}>
                        {record.isExisting ? '수정' : '신규'}
                      </Tag>
                    ),
                  },
                  {
                    title: '이름',
                    dataIndex: 'name',
                    width: 70,
                    ellipsis: true,
                  },
                  {
                    title: '이메일',
                    dataIndex: 'email',
                    width: 160,
                    ellipsis: true,
                  },
                  {
                    title: '비밀번호',
                    dataIndex: 'password',
                    width: 100,
                    ellipsis: true,
                  },
                  {
                    title: '전화번호',
                    dataIndex: 'phone',
                    width: 110,
                  },
                  {
                    title: '생일',
                    dataIndex: 'birthday',
                    width: 95,
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* 웹 정보 조회 진행 상황 모달 */}
      <Modal
        title={
          <Space>
            <GlobalOutlined />
            웹 정보 조회 진행 상황
          </Space>
        }
        open={webFetchModalVisible}
        onCancel={() => {
          if (webFetchProgress?.status === 'completed') {
            setWebFetchModalVisible(false);
            setWebFetchProgressId(null);
            setWebFetchProgress(null);
          }
        }}
        footer={
          webFetchProgress?.status === 'completed' ? (
            <Button type="primary" onClick={() => {
              setWebFetchModalVisible(false);
              setWebFetchProgressId(null);
              setWebFetchProgress(null);
            }}>
              닫기
            </Button>
          ) : null
        }
        closable={webFetchProgress?.status === 'completed'}
        maskClosable={false}
        width={600}
      >
        {webFetchProgress && (
          <div style={{ padding: '16px 0' }}>
            {/* 진행률 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 500 }}>
                  {webFetchProgress.status === 'completed' ? '완료' : '처리 중...'}
                </span>
                <span>
                  {webFetchProgress.current} / {webFetchProgress.total}
                </span>
              </div>
              <Progress
                percent={Math.round((webFetchProgress.current / webFetchProgress.total) * 100)}
                status={webFetchProgress.status === 'completed' ? 'success' : 'active'}
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': '#87d068',
                }}
              />
            </div>

            {/* 현재 처리 중인 계정 */}
            {webFetchProgress.status !== 'completed' && webFetchProgress.current_email && (
              <div style={{ marginBottom: 24, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
                <SyncOutlined spin style={{ marginRight: 8, color: '#1890ff' }} />
                <span>현재 처리 중: <strong>{webFetchProgress.current_email}</strong></span>
              </div>
            )}

            {/* 처리 결과 목록 */}
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              <div style={{ fontWeight: 500, marginBottom: 8 }}>처리 결과</div>
              {webFetchProgress.results.length === 0 ? (
                <div style={{ color: '#999', textAlign: 'center', padding: 20 }}>
                  아직 처리된 계정이 없습니다
                </div>
              ) : (
                <Table
                  dataSource={webFetchProgress.results}
                  rowKey="account_id"
                  size="small"
                  pagination={false}
                  columns={[
                    {
                      title: '이메일',
                      dataIndex: 'email',
                      width: 180,
                      ellipsis: true,
                    },
                    {
                      title: '결과',
                      dataIndex: 'success',
                      width: 80,
                      render: (success: boolean) => (
                        <Tag color={success ? 'success' : 'error'}>
                          {success ? '성공' : '실패'}
                        </Tag>
                      ),
                    },
                    {
                      title: '이름',
                      dataIndex: 'name',
                      width: 80,
                      render: (name: string, record: any) => name || record.error || '-',
                    },
                    {
                      title: '포인트',
                      dataIndex: 'points',
                      width: 80,
                      render: (points: number) => points?.toLocaleString() || '-',
                    },
                    {
                      title: '소요시간',
                      dataIndex: 'elapsed',
                      width: 80,
                      render: (elapsed: number) => elapsed ? `${elapsed.toFixed(1)}초` : '-',
                    },
                  ]}
                />
              )}
            </div>

            {/* 완료 시 요약 */}
            {webFetchProgress.status === 'completed' && (
              <div style={{ marginTop: 16, padding: 12, background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f' }}>
                <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                <span>
                  완료: 성공 {webFetchProgress.results.filter(r => r.success).length}개,
                  실패 {webFetchProgress.failed_accounts?.length || 0}개
                </span>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 모바일 폴백 질의 모달 */}
      <Modal
        title={
          <Space>
            <MobileOutlined />
            웹 조회 실패 계정 처리
          </Space>
        }
        open={mobileFallbackModalVisible}
        onOk={handleMobileFallback}
        onCancel={() => {
          setMobileFallbackModalVisible(false);
          // 상태 초기화
          setWebFetchProgressId(null);
          setWebFetchProgress(null);
        }}
        okText="모바일로 재시도"
        cancelText="건너뛰기"
        width={500}
      >
        {webFetchProgress?.failed_accounts && webFetchProgress.failed_accounts.length > 0 && (
          <div>
            <p style={{ marginBottom: 16 }}>
              웹 크롤링으로 정보 조회에 실패한 계정이 {webFetchProgress.failed_accounts.length}개 있습니다.
              <br />
              모바일 앱 자동화로 재시도하시겠습니까?
            </p>
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: 8 }}>
              {webFetchProgress.failed_accounts.map((acc, idx) => (
                <div key={acc.id} style={{ padding: '4px 8px', borderBottom: idx < webFetchProgress.failed_accounts.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                  <span style={{ color: '#ff4d4f' }}>
                    <CloseCircleOutlined style={{ marginRight: 8 }} />
                  </span>
                  <span>{acc.email}</span>
                  <span style={{ color: '#999', marginLeft: 8, fontSize: 12 }}>
                    ({acc.error})
                  </span>
                </div>
              ))}
            </div>
            <p style={{ marginTop: 16, color: '#999', fontSize: 12 }}>
              모바일 자동화는 Appium 서버가 실행 중이어야 합니다.
            </p>
          </div>
        )}
      </Modal>

      {/* 웹 조회 모드 선택 모달 */}
      <Modal
        title={
          <Space>
            <GlobalOutlined />
            웹 정보 조회 모드 선택
          </Space>
        }
        open={webFetchModeModalVisible}
        onOk={() => executeWebFetchInfo(selectedWebFetchMode)}
        onCancel={() => setWebFetchModeModalVisible(false)}
        okText="조회 시작"
        cancelText="취소"
        width={500}
      >
        <div style={{ padding: '16px 0' }}>
          <p style={{ marginBottom: 16 }}>
            {selectedRowKeys.length}개 계정의 웹 정보를 조회합니다.
            <br />
            실행 모드를 선택하세요.
          </p>

          <Radio.Group
            value={selectedWebFetchMode}
            onChange={(e) => setSelectedWebFetchMode(e.target.value)}
            style={{ width: '100%' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Radio.Button
                value="local"
                style={{
                  height: 'auto',
                  padding: '12px 16px',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <DesktopOutlined style={{ fontSize: 24, marginTop: 2 }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>로컬 GUI 모드</div>
                    <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
                      로컬 Windows에서 Chrome 브라우저를 GUI로 실행합니다.
                      <br />
                      봇 차단 우회가 가능하며, 로컬 웹 서버(8002포트)가 필요합니다.
                    </div>
                  </div>
                </div>
              </Radio.Button>

              <Radio.Button
                value="container"
                style={{
                  height: 'auto',
                  padding: '12px 16px',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <CloudServerOutlined style={{ fontSize: 24, marginTop: 2 }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>컨테이너 Xvfb 모드</div>
                    <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
                      Docker 컨테이너에서 Xvfb 가상 디스플레이로 실행합니다.
                      <br />
                      별도 설정 없이 사용 가능하며, 봇 탐지 우회가 적용됩니다.
                    </div>
                  </div>
                </div>
              </Radio.Button>
            </div>
          </Radio.Group>

          {selectedWebFetchMode === 'local' && (
            <div style={{
              marginTop: 16,
              padding: 12,
              background: '#fffbe6',
              border: '1px solid #ffe58f',
              borderRadius: 8
            }}>
              <strong>로컬 웹 서버 실행 필요:</strong>
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <code style={{
                    fontSize: 12,
                    background: '#f5f5f5',
                    padding: '4px 8px',
                    borderRadius: 4,
                    flex: 1
                  }}>
                    backend\start_local_server.bat
                  </code>
                  <Button
                    size="small"
                    onClick={() => {
                      navigator.clipboard.writeText('backend\\start_local_server.bat');
                      message.success('경로가 복사되었습니다');
                    }}
                  >
                    복사
                  </Button>
                </div>
                <span style={{ color: '#666', fontSize: 12 }}>
                  위 배치 파일을 더블클릭하거나, 터미널에서 실행하세요.
                </span>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* 카드 상세 팝업 */}
      <Modal
        title={null}
        open={detailModalVisible}
        onCancel={() => { setDetailModalVisible(false); setDetailAccount(null); }}
        footer={null}
        width={500}
        styles={{ body: { padding: 0 } }}
      >
        {detailAccount && (() => {
          const acc = detailAccount;
          const allStatusValues = [
            acc.web_fetch_status, acc.mobile_fetch_status,
            acc.web_issue_status, acc.mobile_issue_status,
            (!acc.web_fetch_status && !acc.mobile_fetch_status) ? acc.fetch_status : null,
          ].filter(Boolean) as string[];

          let sortedVouchers: any[] = [];
          try {
            if (acc.owned_vouchers) {
              const raw = JSON.parse(acc.owned_vouchers);
              sortedVouchers = sortVouchers(raw.map((v: any, i: number) => ({ ...normalizeVoucher(v), _idx: i })));
            }
          } catch {}

          const StatusRow = ({ label, value }: { label: string; value?: string | null }) => {
            if (!value) return null;
            const isError = value.includes('실패') || value.includes('오류') || value.includes('에러') || value.includes('차단') || value.includes('BOT');
            const isSuccess = value.includes('완료');
            const isWarning = value.includes('미경과') || value.includes('부족') || value.includes('버튼 없음');
            const color = isError ? '#ff4d4f' : isSuccess ? '#52c41a' : isWarning ? '#faad14' : '#666';
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
                <span style={{ fontSize: 12, color: '#999', minWidth: 90 }}>{label}</span>
                <span style={{ fontSize: 12, color, fontWeight: isError || isSuccess ? 600 : 400, textAlign: 'right', flex: 1 }}>{value}</span>
              </div>
            );
          };

          return (
            <div>
              {/* 헤더 */}
              <div style={{
                padding: '16px 20px',
                background: acc.is_active ? '#1e3a5f' : '#4a4a4a',
                borderRadius: '8px 8px 0 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{acc.email}</div>
                  <div style={{ color: '#aac4e0', fontSize: 12, marginTop: 2 }}>{acc.name || ''} {acc.phone || ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    backgroundColor: acc.is_active ? '#52c41a' : '#ff4d4f',
                    display: 'inline-block',
                  }} />
                  <span style={{ color: '#aac4e0', fontSize: 12 }}>{acc.is_active ? '활성' : '비활성'}</span>
                </div>
              </div>

              {/* 본문 */}
              <div style={{ padding: '16px 20px' }}>
                {/* 기본 정보 */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>계정 정보</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <span style={{ fontSize: 12, color: '#999', minWidth: 90 }}>비밀번호</span>
                    <span
                      style={{ fontSize: 12, color: '#333', fontFamily: 'monospace', cursor: 'pointer' }}
                      onClick={() => { navigator.clipboard.writeText(acc.password); message.success('비밀번호 복사'); }}
                    >{acc.password} 📋</span>
                  </div>
                  {acc.birthday && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
                      <span style={{ fontSize: 12, color: '#999', minWidth: 90 }}>생일</span>
                      <span style={{ fontSize: 12, color: '#333' }}>{acc.birthday}</span>
                    </div>
                  )}
                  {acc.current_points != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
                      <span style={{ fontSize: 12, color: '#999', minWidth: 90 }}>포인트</span>
                      <span style={{ fontSize: 12, color: '#1890ff', fontWeight: 700 }}>{acc.current_points.toLocaleString()}P</span>
                    </div>
                  )}
                  {acc.adikr_barcode && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#999', minWidth: 90 }}>ADIKR 바코드</span>
                      <span
                        style={{ fontSize: 11, color: '#333', fontFamily: 'monospace', cursor: 'pointer' }}
                        onClick={() => { navigator.clipboard.writeText(acc.adikr_barcode!); message.success('바코드 복사'); }}
                      >{acc.adikr_barcode} 📋</span>
                    </div>
                  )}
                  {acc.memo && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
                      <span style={{ fontSize: 12, color: '#999', minWidth: 90 }}>메모</span>
                      <span style={{ fontSize: 12, color: '#666' }}>{acc.memo}</span>
                    </div>
                  )}
                </div>

                {/* 바코드 이미지 */}
                {acc.barcode_image_url && (
                  <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img
                      src={getStaticUrl(acc.barcode_image_url)}
                      alt="barcode"
                      style={{ maxWidth: '100%', height: 'auto', maxHeight: 64, borderRadius: 4, flex: 1 }}
                    />
                    <Button
                      size="small"
                      icon={<DownloadOutlined />}
                      onClick={async () => {
                        try {
                          const res = await fetch(getStaticUrl(acc.barcode_image_url!));
                          const blob = await res.blob();
                          const objectUrl = URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = objectUrl;
                          link.download = `barcode_${acc.email}.png`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          URL.revokeObjectURL(objectUrl);
                        } catch {
                          message.error('바코드 다운로드에 실패했습니다');
                        }
                      }}
                      style={{ flexShrink: 0 }}
                    />
                  </div>
                )}

                {/* 조회 상태 */}
                {allStatusValues.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>조회 상태</div>
                    <StatusRow label="웹 정보조회" value={acc.web_fetch_status} />
                    <StatusRow label="웹 쿠폰발급" value={acc.web_issue_status} />
                    <StatusRow label="모바일 정보조회" value={acc.mobile_fetch_status} />
                    <StatusRow label="모바일 쿠폰발급" value={acc.mobile_issue_status} />
                    {!acc.web_fetch_status && !acc.mobile_fetch_status && (
                      <StatusRow label="조회 상태" value={acc.fetch_status} />
                    )}
                  </div>
                )}

                {/* 보유 쿠폰 */}
                {sortedVouchers.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>보유 쿠폰 ({sortedVouchers.length}개)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {sortedVouchers.map((v) => {
                        const info = getCouponDisplayInfo(v.description);
                        const expired = isVoucherExpired(v.expiry);
                        const expiryShort = v.expiry && v.expiry !== 'N/A' ? v.expiry.slice(5).replace('-', '/') : '-';
                        const bgMain = v.sold || expired ? '#6b7280' : '#166534';
                        const bgRight = v.sold || expired ? '#d4d4d4' : '#fef9c3';
                        const expiryColor = v.sold || expired ? '#525252' : '#713f12';
                        return (
                          <div key={v._idx} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {/* 쿠폰 카드 */}
                            <div
                              style={{
                                display: 'flex', height: 40, borderRadius: 5, overflow: 'hidden', flex: 1,
                                opacity: v.sold || expired ? 0.65 : 1,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                              }}
                            >
                              <div style={{ background: bgMain, padding: '4px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, position: 'relative', minWidth: 0 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{info.name}</span>
                                {v.code && (
                                  <span
                                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(v.code); message.success('코드 복사'); }}
                                    style={{ fontSize: 9, background: '#fef9c3', color: '#713f12', borderRadius: 2, padding: '0 3px', marginTop: 1, fontFamily: 'monospace', cursor: 'pointer', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                                  >{v.code} 📋</span>
                                )}
                                {v.sold && (
                                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', fontSize: 10, color: '#fff', fontWeight: 600 }}>
                                    {v.sold_to ? `→ ${v.sold_to}` : '판매완료'}
                                  </div>
                                )}
                              </div>
                              <div style={{ background: bgRight, width: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: '1px dashed #a3a3a3', flexShrink: 0 }}>
                                <span style={{ fontSize: 9, fontWeight: 700, color: expiryColor, textAlign: 'center', lineHeight: 1.3 }}>{expiryShort}</span>
                              </div>
                            </div>
                            {/* 사용 처리 버튼 */}
                            <Button
                              size="small"
                              onClick={() => handleVoucherClick(acc.id, v._idx, v)}
                              style={{
                                flexShrink: 0,
                                fontSize: 11,
                                height: 40,
                                padding: '0 8px',
                                backgroundColor: v.sold ? '#f5f5f5' : '#1e3a5f',
                                color: v.sold ? '#999' : '#fff',
                                border: 'none',
                                borderRadius: 5,
                              }}
                            >
                              {v.sold ? '취소' : '사용'}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 하단 버튼 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Popconfirm
                      title="이 계정을 삭제하시겠습니까?"
                      onConfirm={() => {
                        handleDelete(acc.id);
                        setDetailModalVisible(false);
                        setDetailAccount(null);
                      }}
                      okText="삭제"
                      cancelText="취소"
                    >
                      <Button danger icon={<DeleteOutlined />}>삭제</Button>
                    </Popconfirm>
                    <Button
                      icon={<EditOutlined />}
                      onClick={() => {
                        setDetailModalVisible(false);
                        setDetailAccount(null);
                        handleEdit(acc);
                      }}
                    >
                      수정
                    </Button>
                  </div>
                  <Button onClick={() => { setDetailModalVisible(false); setDetailAccount(null); }}>
                    닫기
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default AdidasAccountListPage;
