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
  const [birthdayMonthFilter, setBirthdayMonthFilter] = useState<string[]>([]); // 다중 선택: ['1', '2', '3', ...]
  const [couponFilter, setCouponFilter] = useState<string[]>([]); // 다중 선택: ['has_coupon', 'no_coupon', '5%', '10%', '15%', '100000']
  const [statusFilter, setStatusFilter] = useState<string[]>([]); // 다중 선택: ['info_error', 'coupon_error', 'success', 'processing']
  const [minPoints, setMinPoints] = useState<string>('');
  const [maxPoints, setMaxPoints] = useState<string>('');

  // 바코드 모달 상태
  const [barcodeModalVisible, setBarcodeModalVisible] = useState(false);
  const [selectedBarcode, setSelectedBarcode] = useState<{url: string, email: string} | null>(null);

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

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const data = await adidasAccountService.getAccounts();
      setAccounts(data);
    } catch (error) {
      message.error('계정 목록을 불러오는데 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  // 실제 계정들이 보유한 쿠폰 종류를 추출
  const availableCouponTypes = useMemo(() => {
    const couponSet = new Set<string>();

    accounts.forEach(account => {
      if (account.owned_vouchers) {
        try {
          const vouchers = JSON.parse(account.owned_vouchers);
          vouchers.forEach((voucher: any) => {
            if (voucher.description) {
              couponSet.add(voucher.description);
            }
          });
        } catch (e) {
          // JSON 파싱 실패 시 무시
        }
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
      await api.post(`/adidas-accounts/${accountId}/generate-barcode`);
      message.success({ content: '바코드 이미지가 생성되었습니다', key: 'barcode' });
      loadAccounts();
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

          // 절대 URL로 변환
          const imageUrl = account.barcode_image_url.startsWith('http')
            ? account.barcode_image_url
            : `${window.location.origin}${account.barcode_image_url}`;

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
        '조회현황': acc.fetch_status || '',
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

    // 검색어 필터
    if (searchText) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(acc =>
        acc.email?.toLowerCase().includes(search) ||
        acc.name?.toLowerCase().includes(search) ||
        acc.phone?.toLowerCase().includes(search)
      );
    }

    // 생일 월별 필터 (다중 선택)
    if (birthdayMonthFilter.length > 0) {
      filtered = filtered.filter(acc => {
        if (!acc.birthday) return false;
        const birthday = dayjs(acc.birthday, 'YYYY-MM-DD');
        if (!birthday.isValid()) return false;
        const month = (birthday.month() + 1).toString(); // dayjs month는 0부터 시작
        return birthdayMonthFilter.includes(month);
      });
    }

    // 쿠폰 필터 (다중 선택 - OR 조건)
    if (couponFilter.length > 0) {
      filtered = filtered.filter(acc => {
        const vouchers = acc.owned_vouchers;

        // 각 필터 조건을 체크
        return couponFilter.some(filterValue => {
          if (filterValue === 'no_coupon') {
            // 쿠폰 없음
            if (!vouchers) return true;
            try {
              const voucherList = JSON.parse(vouchers);
              return voucherList.length === 0;
            } catch {
              return true;
            }
          } else if (filterValue === 'has_coupon') {
            // 쿠폰 있음
            if (!vouchers) return false;
            try {
              const voucherList = JSON.parse(vouchers);
              return voucherList.length > 0;
            } catch {
              return false;
            }
          } else {
            // 특정 쿠폰 종류 (5%, 10%, 15%, 100,000)
            if (!vouchers) return false;
            try {
              const voucherList = JSON.parse(vouchers);
              return voucherList.some((v: any) =>
                v.description?.includes(filterValue)
              );
            } catch {
              return false;
            }
          }
        });
      });
    }

    // 조회 현황 필터 (다중 선택 - OR 조건)
    if (statusFilter.length > 0) {
      filtered = filtered.filter(acc => {
        const fetchStatus = acc.fetch_status?.toLowerCase() || '';

        // 각 필터 조건을 체크
        return statusFilter.some(filterValue => {
          if (filterValue === 'info_error') {
            // 정보 조회 오류 (로그인 실패, 인증 오류 등)
            return (
              fetchStatus.includes('로그인 실패') ||
              fetchStatus.includes('로그인 오류') ||
              fetchStatus.includes('인증 실패') ||
              fetchStatus.includes('인증 오류') ||
              (fetchStatus.includes('정보') && fetchStatus.includes('오류'))
            );
          } else if (filterValue === 'coupon_error') {
            // 쿠폰 발급 실패/오류
            return (
              fetchStatus.includes('포인트 부족') ||
              (fetchStatus.includes('쿠폰') && (fetchStatus.includes('실패') || fetchStatus.includes('오류')))
            );
          } else if (filterValue === 'success') {
            // 조회 완료
            return fetchStatus.includes('완료');
          } else if (filterValue === 'processing') {
            // 조회 중
            return fetchStatus.includes('조회 중');
          }
          return false;
        });
      });
    }

    // 포인트 범위 필터
    if (minPoints || maxPoints) {
      filtered = filtered.filter(acc => {
        const points = acc.current_points || 0;
        const min = minPoints ? parseInt(minPoints) : 0;
        const max = maxPoints ? parseInt(maxPoints) : Infinity;
        return points >= min && points <= max;
      });
    }

    return filtered;
  }, [accounts, searchText, birthdayMonthFilter, couponFilter, statusFilter, minPoints, maxPoints]);

  const columns = [
    {
      title: 'No',
      key: 'index',
      width: 50,
      render: (_: any, __: any, index: number) => {
        // 페이지당 연속 번호 계산
        return (currentPage - 1) * pageSize + index + 1;
      },
    },
    {
      title: '사용',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 70,
      align: 'center' as 'center',
      render: (isActive: boolean) =>
        isActive ? (
          <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '18px' }} />
        ) : (
          <CloseCircleOutlined style={{ color: '#d9d9d9', fontSize: '18px' }} />
        ),
    },
    {
      title: '이메일',
      dataIndex: 'email',
      key: 'email',
      width: 180,
      render: (email: string) => (
        <span
          onClick={() => {
            navigator.clipboard.writeText(email);
            message.success('이메일이 복사되었습니다');
          }}
          style={{ cursor: 'pointer' }}
        >
          {email}
        </span>
      ),
    },
    {
      title: '비밀번호',
      dataIndex: 'password',
      key: 'password',
      width: 100,
      render: (password: string) => (
        <span
          onClick={() => {
            navigator.clipboard.writeText(password);
            message.success('비밀번호가 복사되었습니다');
          }}
          style={{ cursor: 'pointer' }}
        >
          {password}
        </span>
      ),
    },
    {
      title: '생일',
      dataIndex: 'birthday',
      key: 'birthday',
      width: 70,
      render: (birthday: string) => {
        if (!birthday) return '-';
        // YYYY-MM-DD -> MM/DD 형식으로 변환
        const parts = birthday.split('-');
        if (parts.length === 3) {
          const monthDay = `${parts[1]}/${parts[2]}`;
          return <strong>{monthDay}</strong>;
        }
        return <strong>{birthday}</strong>;
      },
    },
    {
      title: 'ADIKR 바코드',
      dataIndex: 'adikr_barcode',
      key: 'adikr_barcode',
      width: 125,
      render: (barcode: string) => barcode ? (
        <strong style={{
          fontFamily: 'monospace',
          letterSpacing: '1px',
          background: '#f0f0f0',
          padding: '4px 8px',
          borderRadius: '4px',
          display: 'inline-block'
        }}>
          {barcode}
        </strong>
      ) : '-',
    },
    {
      title: '바코드 이미지',
      dataIndex: 'barcode_image_url',
      key: 'barcode_image_url',
      width: 120,
      align: 'center' as 'center',
      render: (image: string, record: AdidasAccount) => {
        if (image) {
          return (
            <img
              src={image}
              alt="barcode"
              style={{ maxWidth: '100px', maxHeight: '40px', cursor: 'pointer' }}
              onClick={() => {
                setSelectedBarcode({ url: image, email: record.email });
                setBarcodeModalVisible(true);
              }}
            />
          );
        } else if (record.adikr_barcode) {
          return (
            <Button
              size="small"
              onClick={() => handleGenerateBarcode(record.id)}
              style={{
                backgroundColor: '#4a5f7f',
                color: '#fff',
                border: 'none'
              }}
            >
              생성
            </Button>
          );
        } else {
          return '-';
        }
      },
    },
    {
      title: '이름/전화번호',
      dataIndex: 'name',
      key: 'name',
      width: 130,
      render: (name: string, record: AdidasAccount) => {
        const phone = record.phone;
        const convertedPhone = phone ? phone.replace(/^\+82\s*/, '0') : null;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontWeight: '500' }}>{convertedPhone || '-'}</div>
            {name && (
              <div style={{ fontSize: '12px', color: '#999' }}>{name}</div>
            )}
          </div>
        );
      },
    },
    {
      title: '현재 포인트',
      dataIndex: 'current_points',
      key: 'current_points',
      width: 110,
      render: (points: number) => points ? (
        <strong style={{ color: '#1890ff', fontSize: '14px' }}>
          {points.toLocaleString()}P
        </strong>
      ) : '-',
    },
    {
      title: '보유 쿠폰',
      dataIndex: 'owned_vouchers',
      key: 'owned_vouchers',
      width: 180,
      render: (vouchers: string, record: AdidasAccount) => {
        if (!vouchers) return <span style={{ color: '#999' }}>없음</span>;
        try {
          const voucherList = JSON.parse(vouchers);
          if (voucherList.length === 0) {
            return <span style={{ color: '#999' }}>없음</span>;
          }
          // 할인율 내림차순 정렬 (원본 인덱스 유지)
          const indexedVouchers = voucherList.map((v: any, idx: number) => ({ ...v, originalIndex: idx }));
          const sortedVouchers = indexedVouchers.sort((a: any, b: any) => {
            const getPercent = (desc: string) => {
              const match = desc.match(/(\d+)%/);
              return match ? parseInt(match[1]) : 0;
            };
            return getPercent(b.description) - getPercent(a.description);
          });

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {sortedVouchers.map((v: any) => (
                <div
                  key={v.originalIndex}
                  onClick={() => handleVoucherClick(record.id, v.originalIndex, v)}
                  style={{ cursor: 'pointer', position: 'relative' }}
                >
                  <Tag
                    color={v.sold ? 'default' : 'volcano'}
                    style={{
                      borderRadius: '8px',
                      padding: '2px 8px',
                      fontWeight: '500',
                      fontSize: '12px',
                      border: v.sold ? '1px solid #d9d9d9' : '1px solid #ff7875',
                      margin: 0,
                      width: 'fit-content',
                      opacity: v.sold ? 0.7 : 1,
                      textDecoration: v.sold ? 'line-through' : 'none',
                    }}
                  >
                    {v.sold && <span style={{ color: '#52c41a', marginRight: 4 }}>✓</span>}
                    🎫 {v.description}
                  </Tag>
                  {v.sold && v.sold_to && (
                    <div style={{ fontSize: '10px', color: '#52c41a', marginTop: 1 }}>
                      판매: {v.sold_to}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        } catch {
          return <span style={{ color: '#999' }}>없음</span>;
        }
      },
    },
    {
      title: '조회 현황',
      dataIndex: 'fetch_status',
      key: 'fetch_status',
      width: 220,
      render: (fetchStatus: string) => {
        if (!fetchStatus) return '-';

        // 줄바꿈으로 분리 (정보조회 + 쿠폰발급)
        const lines = fetchStatus.split('\n');

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {lines.map((line, index) => {
              // 각 줄에 따라 색상 지정
              let color = 'default';
              if (line.includes('조회 중')) {
                color = 'processing';
              } else if (line.includes('완료')) {
                color = 'success';
              } else if (line.includes('실패') || line.includes('오류') || line.includes('포인트 부족')) {
                color = 'error';
              } else if (line.includes('다음 발급일')) {
                color = 'warning';
              }

              return (
                <Tag key={index} color={color}>
                  {line}
                </Tag>
              );
            })}
          </div>
        );
      },
    },
    {
      title: '작업',
      key: 'action',
      width: 170,
      fixed: 'right' as 'right',
      render: (_: any, record: AdidasAccount) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          {record.is_active && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Button
                size="small"
                onClick={() => handleFetchAccountInfo(record.id)}
                style={{
                  backgroundColor: '#4a5f7f',
                  color: '#fff',
                  border: 'none',
                  padding: '0 12px'
                }}
              >
                정보조회
              </Button>
              <Button
                size="small"
                onClick={() => handleIssueCoupon(record.id)}
                style={{
                  backgroundColor: '#4a5f7f',
                  color: '#fff',
                  border: 'none',
                  padding: '0 12px'
                }}
              >
                쿠폰발급
              </Button>
            </div>
          )}
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
              {/* 1줄 왼쪽: 검색, 포인트 필터 */}
              <Space size="middle">
                <Input
                  placeholder="이메일, 이름 검색"
                  prefix={<SearchOutlined />}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  style={{ width: 200 }}
                  allowClear
                />
                <Input
                  placeholder="최소 포인트"
                  value={minPoints}
                  onChange={(e) => setMinPoints(e.target.value.replace(/\D/g, ''))}
                  style={{ width: 110 }}
                  allowClear
                />
                <Input
                  placeholder="최대 포인트"
                  value={maxPoints}
                  onChange={(e) => setMaxPoints(e.target.value.replace(/\D/g, ''))}
                  style={{ width: 110 }}
                  allowClear
                />
              </Space>

              {/* 1줄 오른쪽: 기본 버튼 */}
              <Space size="middle">
                <Button
                  icon={<ReloadOutlined />}
                  onClick={loadAccounts}
                  size="small"
                >
                  새로고침
                </Button>
                <Button
                  icon={<UploadOutlined />}
                  onClick={() => setBulkPasteModalVisible(true)}
                  size="small"
                >
                  일괄 등록
                </Button>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={handleExcelDownload}
                  disabled={accounts.length === 0}
                  size="small"
                >
                  Excel 다운로드
                </Button>
                <Button
                  icon={<PlusOutlined />}
                  onClick={handleAdd}
                  size="small"
                  style={{
                    backgroundColor: '#4a5f7f',
                    color: '#fff',
                    border: 'none'
                  }}
                >
                  계정 추가
                </Button>
              </Space>
            </div>

            {/* 두 번째 줄 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {/* 2줄 왼쪽: 생일, 쿠폰, 상태 필터 */}
              <Space size="middle">
                {/* 생일 월 필터 */}
                <Dropdown
                  trigger={['click']}
                  dropdownRender={() => (
                    <div style={{
                      backgroundColor: 'white',
                      border: '1px solid #d9d9d9',
                      borderRadius: 6,
                      padding: '8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                    }}>
                      <Checkbox.Group
                        value={birthdayMonthFilter}
                        onChange={(values) => setBirthdayMonthFilter(values as string[])}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                          <Checkbox value="1">1월</Checkbox>
                          <Checkbox value="2">2월</Checkbox>
                          <Checkbox value="3">3월</Checkbox>
                          <Checkbox value="4">4월</Checkbox>
                          <Checkbox value="5">5월</Checkbox>
                          <Checkbox value="6">6월</Checkbox>
                          <Checkbox value="7">7월</Checkbox>
                          <Checkbox value="8">8월</Checkbox>
                          <Checkbox value="9">9월</Checkbox>
                          <Checkbox value="10">10월</Checkbox>
                          <Checkbox value="11">11월</Checkbox>
                          <Checkbox value="12">12월</Checkbox>
                        </div>
                      </Checkbox.Group>
                    </div>
                  )}
                >
                  <Badge count={birthdayMonthFilter.length} offset={[-5, 5]}>
                    <Button size="small" icon={<FilterOutlined />}>
                      생일 월 {birthdayMonthFilter.length > 0 && `(${birthdayMonthFilter.length})`}
                    </Button>
                  </Badge>
                </Dropdown>

                {/* 쿠폰 필터 */}
                <Dropdown
                  trigger={['click']}
                  dropdownRender={() => (
                    <div style={{
                      backgroundColor: 'white',
                      border: '1px solid #d9d9d9',
                      borderRadius: 6,
                      padding: '8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      maxHeight: '400px',
                      overflowY: 'auto'
                    }}>
                      <Checkbox.Group
                        value={couponFilter}
                        onChange={(values) => setCouponFilter(values as string[])}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <Checkbox value="has_coupon">쿠폰 있음</Checkbox>
                          <Checkbox value="no_coupon">쿠폰 없음</Checkbox>
                          {availableCouponTypes.length > 0 && <div style={{ borderTop: '1px solid #d9d9d9', margin: '4px 0' }} />}
                          {availableCouponTypes.map(couponType => (
                            <Checkbox key={couponType} value={couponType}>
                              {couponType}
                            </Checkbox>
                          ))}
                        </div>
                      </Checkbox.Group>
                    </div>
                  )}
                >
                  <Badge count={couponFilter.length} offset={[-5, 5]}>
                    <Button size="small" icon={<FilterOutlined />}>
                      쿠폰 {couponFilter.length > 0 && `(${couponFilter.length})`}
                    </Button>
                  </Badge>
                </Dropdown>

                {/* 상태 필터 */}
                <Dropdown
                  trigger={['click']}
                  dropdownRender={() => (
                    <div style={{
                      backgroundColor: 'white',
                      border: '1px solid #d9d9d9',
                      borderRadius: 6,
                      padding: '8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                    }}>
                      <Checkbox.Group
                        value={statusFilter}
                        onChange={(values) => setStatusFilter(values as string[])}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <Checkbox value="info_error">정보 조회 오류</Checkbox>
                          <Checkbox value="coupon_error">쿠폰 발급 실패</Checkbox>
                          <Checkbox value="success">조회 완료</Checkbox>
                          <Checkbox value="processing">조회 중</Checkbox>
                        </div>
                      </Checkbox.Group>
                    </div>
                  )}
                >
                  <Badge count={statusFilter.length} offset={[-5, 5]}>
                    <Button size="small" icon={<FilterOutlined />}>
                      상태 {statusFilter.length > 0 && `(${statusFilter.length})`}
                    </Button>
                  </Badge>
                </Dropdown>
              </Space>

              {/* 2줄 오른쪽: 선택 시 활성화 버튼 */}
              {selectedRowKeys.length > 0 && (
                <Space size="middle">
                  <span style={{ color: '#666', fontWeight: 500, fontSize: '13px' }}>
                    {selectedRowKeys.length}개 선택
                  </span>
                  <Button
                    icon={<GlobalOutlined />}
                    onClick={handleBulkWebFetchInfo}
                    size="small"
                    style={{
                      backgroundColor: '#1890ff',
                      color: '#fff',
                      border: 'none'
                    }}
                  >
                    웹 정보조회
                  </Button>
                  <Button
                    icon={<MobileOutlined />}
                    onClick={handleBulkFetchInfo}
                    size="small"
                    style={{
                      backgroundColor: '#4a5f7f',
                      color: '#fff',
                      border: 'none'
                    }}
                  >
                    모바일 정보조회
                  </Button>
                  <Button
                    onClick={handleBulkIssueCoupon}
                    size="small"
                    style={{
                      backgroundColor: '#4a5f7f',
                      color: '#fff',
                      border: 'none'
                    }}
                  >
                    선택 쿠폰발급
                  </Button>
                  <Button
                    onClick={handleBulkGenerateBarcode}
                    size="small"
                    style={{
                      backgroundColor: '#4a5f7f',
                      color: '#fff',
                      border: 'none'
                    }}
                  >
                    선택 바코드 생성
                  </Button>
                  <Button
                    icon={<DownloadOutlined />}
                    onClick={handleBulkDownloadBarcode}
                    size="small"
                    style={{
                      backgroundColor: '#237804',
                      color: '#fff',
                      border: 'none'
                    }}
                  >
                    선택 바코드 다운로드
                  </Button>
                  <Button
                    icon={<CheckCircleOutlined />}
                    onClick={handleBulkActivate}
                    size="small"
                    style={{
                      backgroundColor: '#52c41a',
                      color: '#fff',
                      border: 'none'
                    }}
                  >
                    선택 활성화
                  </Button>
                  <Button
                    icon={<CloseCircleOutlined />}
                    onClick={handleBulkDeactivate}
                    size="small"
                    style={{
                      backgroundColor: '#faad14',
                      color: '#fff',
                      border: 'none'
                    }}
                  >
                    선택 비활성화
                  </Button>
                  <Popconfirm
                    title={`선택한 ${selectedRowKeys.length}개 계정을 삭제하시겠습니까?`}
                    onConfirm={handleBulkDelete}
                    okText="삭제"
                    cancelText="취소"
                  >
                    <Button danger icon={<DeleteOutlined />} size="small">
                      선택 삭제
                    </Button>
                  </Popconfirm>
                </Space>
              )}
            </div>
          </div>
        }
      >

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
                setCurrentPage(1); // 페이지 크기 변경 시 1페이지로
              }
            },
          }}
        />
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
    </div>
  );
};

export default AdidasAccountListPage;
