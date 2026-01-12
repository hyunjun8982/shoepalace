import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  DatePicker,
  Select,
  Row,
  Col,
  App,
  Popconfirm,
  Input,
  InputNumber,
  Modal,
  Radio,
  Image,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  SearchOutlined,
  CalculatorOutlined,
  DollarOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { Sale, SaleStatus, SaleListParams } from '../../types/sale';
import { saleService } from '../../services/sale';
import { brandService, Brand } from '../../services/brand';
import { useAuth } from '../../contexts/AuthContext';
import './SaleListPage.css';
import { getFileUrl } from '../../utils/urlUtils';
import { formatCurrencyWithKoreanSeparate, roundToWon } from '../../utils/currencyUtils';

const { RangePicker } = DatePicker;
const { Option } = Select;

const SaleListPage: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { user } = useAuth();

  // 연락처 포맷팅 함수
  const formatPhoneNumber = (phone: string) => {
    if (!phone) return '-';
    const numbers = phone.replace(/[^\d]/g, '');
    if (numbers.length === 11) {
      return numbers.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    }
    return phone;
  };
  const [sales, setSales] = useState<Sale[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]); // 통계용 전체 데이터
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState(() => {
    const saved = localStorage.getItem('saleListPagination');
    return saved ? JSON.parse(saved) : { current: 1, pageSize: 10 };
  });
  const [filters, setFilters] = useState<SaleListParams>(() => {
    const saved = localStorage.getItem('saleListFilters');
    return saved ? JSON.parse(saved) : {};
  });
  const [searchText, setSearchText] = useState<string>(() => {
    const saved = localStorage.getItem('saleListSearchText');
    return saved || '';
  });
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [updating, setUpdating] = useState(false);
  const [bulkPriceModalVisible, setBulkPriceModalVisible] = useState(false);
  const [pendingSales, setPendingSales] = useState<Sale[]>([]);
  const [bulkPrices, setBulkPrices] = useState<{[key: string]: number}>({});
  const [modalSearchText, setModalSearchText] = useState<string>('');
  const [bulkMarginPercent, setBulkMarginPercent] = useState<number>(30);
  const [defaultMarginPercent, setDefaultMarginPercent] = useState<number>(() => {
    // 로컬 스토리지에서 기본 마진율 불러오기
    const saved = localStorage.getItem('defaultMarginPercent');
    return saved ? Number(saved) : 30;
  });
  const [statsYear, setStatsYear] = useState<number | null>(null); // null = 전체, 숫자 = 해당 연도

  // 전체 데이터 로드 (통계용)
  const fetchAllSales = async () => {
    try {
      const response = await saleService.getSales({
        skip: 0,
        limit: 10000, // 전체 데이터
      });
      setAllSales(response.items);
    } catch (error) {
      console.error('전체 판매 목록 조회 실패:', error);
    }
  };

  // 브랜드 목록 로드
  useEffect(() => {
    const fetchBrands = async () => {
      try {
        const response = await brandService.getBrands();
        setBrands(response.items);
      } catch (error) {
        console.error('브랜드 목록 조회 실패:', error);
      }
    };
    fetchBrands();
    fetchAllSales(); // 통계용 전체 데이터 로드
  }, []);

  useEffect(() => {
    fetchSales();
  }, [pagination.current, pagination.pageSize, filters, searchText]);

  // 상태를 localStorage에 저장
  useEffect(() => {
    localStorage.setItem('saleListPagination', JSON.stringify(pagination));
  }, [pagination]);

  useEffect(() => {
    localStorage.setItem('saleListFilters', JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    localStorage.setItem('saleListSearchText', searchText);
  }, [searchText]);

  const fetchSales = async () => {
    try {
      setLoading(true);
      const params: SaleListParams = {
        skip: (pagination.current - 1) * pagination.pageSize,
        limit: pagination.pageSize,
        ...filters,
        ...(searchText && { search: searchText }),
      };

      const response = await saleService.getSales(params);
      // 백엔드에서 이미 최신순 정렬됨
      setSales(response.items);
      setTotal(response.total);
    } catch (error) {
      message.error('판매 목록 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSale = async (saleId: string) => {
    try {
      await saleService.deleteSale(saleId);
      message.success('판매가 삭제되었습니다.');
      fetchSales();
    } catch (error) {
      message.error('판매 삭제에 실패했습니다.');
    }
  };

  // 선택된 판매 삭제
  const handleBulkDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('삭제할 항목을 선택해주세요');
      return;
    }

    try {
      setLoading(true);
      for (const key of selectedRowKeys) {
        await saleService.deleteSale(key as string);
      }
      message.success(`${selectedRowKeys.length}개 항목이 삭제되었습니다`);
      setSelectedRowKeys([]);
      fetchSales();
    } catch (error) {
      message.error('일부 항목 삭제 실패');
    } finally {
      setLoading(false);
    }
  };

  // 행 선택 설정
  const rowSelection = {
    selectedRowKeys,
    onChange: (selectedKeys: React.Key[]) => {
      setSelectedRowKeys(selectedKeys);
    },
  };

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
    }));
    setPagination((prev: { current: number; pageSize: number }) => ({ ...prev, current: 1 }));
  };

  const handleDateRangeChange = (dates: any) => {
    if (dates && dates.length === 2) {
      setFilters(prev => ({
        ...prev,
        start_date: dates[0].format('YYYY-MM-DD'),
        end_date: dates[1].format('YYYY-MM-DD'),
      }));
    } else {
      setFilters(prev => ({
        ...prev,
        start_date: undefined,
        end_date: undefined,
      }));
    }
    setPagination((prev: { current: number; pageSize: number }) => ({ ...prev, current: 1 }));
  };

  const getStatusTag = (status: SaleStatus) => {
    const statusConfig = {
      [SaleStatus.PENDING]: { color: 'orange', text: '마진 입력 대기중' },
      [SaleStatus.COMPLETED]: { color: 'green', text: '완료' },
      [SaleStatus.CANCELLED]: { color: 'red', text: '취소' },
      [SaleStatus.RETURNED]: { color: 'purple', text: '반품' },
    };

    const config = statusConfig[status] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 반품 처리
  const handleReturnSale = async (saleId: string) => {
    try {
      await saleService.processReturn(saleId);
      message.success('반품 처리되었습니다.');
      fetchSales();
      fetchAllSales();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '반품 처리에 실패했습니다.');
    }
  };

  // 마진 비율로 회사 판매가 계산
  const calculatePriceByMargin = (sellerAmount: number, marginPercent: number) => {
    const marginAmount = Math.round(sellerAmount * marginPercent / 100);
    return sellerAmount - marginAmount;
  };

  // 기본 마진율 저장
  const handleDefaultMarginChange = (value: number) => {
    setDefaultMarginPercent(value);
    localStorage.setItem('defaultMarginPercent', value.toString());
  };

  // 모달 내 일괄 마진 적용
  const handleApplyBulkMargin = () => {
    const newPrices: {[key: string]: number} = {};
    filteredPendingSales.forEach(sale => {
      const sellerAmount = Number(sale.total_seller_amount || 0);
      const companyPrice = calculatePriceByMargin(sellerAmount, bulkMarginPercent);
      newPrices[sale.id!] = companyPrice;
    });
    setBulkPrices(prev => ({ ...prev, ...newPrices }));
    message.success(`${filteredPendingSales.length}건에 마진 ${bulkMarginPercent}% 적용되었습니다.`);
  };

  // 일괄 회사 판매가 저장
  const handleBulkPriceSave = async () => {
    try {
      setUpdating(true);
      let updatedCount = 0;

      for (const sale of pendingSales) {
        const companyPrice = bulkPrices[sale.id!];
        if (!companyPrice || companyPrice <= 0) {
          continue;
        }

        const sellerAmount = Number(sale.total_seller_amount || 0);
        const margin = sellerAmount - companyPrice;

        await saleService.updateSale(sale.id!, {
          total_company_amount: companyPrice,
          total_seller_margin: margin,
        });
        updatedCount++;
      }

      setSales(prevSales =>
        prevSales.map(sale => {
          const companyPrice = bulkPrices[sale.id!];
          if (companyPrice && companyPrice > 0) {
            const sellerAmount = Number(sale.total_seller_amount || 0);
            const margin = sellerAmount - companyPrice;
            return { ...sale, total_company_amount: companyPrice, total_seller_margin: margin };
          }
          return sale;
        })
      );

      message.success(`${updatedCount}건의 회사 판매가가 저장되었습니다.`);
      setBulkPriceModalVisible(false);
      setPendingSales([]);
      setBulkPrices({});
    } catch (error: any) {
      message.error(error.message || '회사 판매가 저장에 실패했습니다.');
    } finally {
      setUpdating(false);
    }
  };

  const columns: ColumnsType<Sale> = [
    {
      title: '판매번호',
      key: 'sale_info',
      width: 130,
      render: (_, record) => (
        <div style={{ lineHeight: '1.4' }}>
          <div style={{ fontWeight: 500, fontSize: '13px' }}>
            {record.sale_number || '-'}
          </div>
          <div style={{ fontSize: '11px', color: '#888' }}>
            {dayjs(record.sale_date).format('YYYY-MM-DD')}
          </div>
        </div>
      ),
    },
    {
      title: '고객 정보',
      key: 'customer_info',
      width: 120,
      render: (_, record) => (
        <div style={{ lineHeight: '1.4' }}>
          <div style={{ fontWeight: 500, fontSize: '13px' }}>{record.customer_name || '-'}</div>
          <div style={{ fontSize: '11px', color: '#888' }}>{formatPhoneNumber(record.customer_contact || '')}</div>
        </div>
      ),
    },
    {
      title: '브랜드',
      key: 'brand',
      width: 100,
      render: (_, record) => {
        if (!record.items || record.items.length === 0) return '-';
        const brandName = record.items[0]?.brand_name;
        if (!brandName) return '-';

        const iconUrl = getFileUrl(`/uploads/brands/${brandName.toLowerCase()}.png`);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {iconUrl && (
              <img
                src={iconUrl}
                alt={brandName}
                style={{ width: 20, height: 20, objectFit: 'contain' }}
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
      title: '상품',
      key: 'product_image',
      width: 60,
      render: (_, record) => {
        if (!record.items || record.items.length === 0) {
          return (
            <div style={{
              width: 44,
              height: 44,
              backgroundColor: '#f5f5f5',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              color: '#bbb'
            }}>
              No Image
            </div>
          );
        }
        const firstItem = record.items[0];
        if (firstItem.product_image_url) {
          const imageUrl = getFileUrl(firstItem.product_image_url) || undefined;

          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Image
                src={imageUrl}
                width={44}
                height={44}
                style={{ objectFit: 'cover', borderRadius: 4 }}
                preview={{ mask: '확대' }}
                fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5QkbBQEfH0J0gAAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAACNUlEQVRo3u2ZT0gUURjAf++dmZ3d3V1X13+5mrqmYhYdCqKDRX+gQ0QHRQ8FQUFBh4IOQdChCLoERUGHoEMQFEUQBEUQBR0iKII0TcvM1DL/rbq77szs7MybDgaytjO7s+4W9L7TvO+9N9/3vu+9N/MGhBBCCCGEEEIIIYQQQgghhBBCCOEVSk4N7D9wEIDW1lYAmpqaANi5cycAnZ2dAKiqCkBfXx8Aw8PD3hZq27YUGBkZkQKDg4NSYGpqSgpMTEzI/unpaSng8/mkgNfrBaCoqAiA8vJyACorKwEoLS0FIC8vD4Dbt2/PvoC1a9cCcOTIEQAKCgoAmJiY4M2bNwDcu3ePeDyeEdi7dy8A586dA2DRokUAPHjwgGvXrgFgGMacF7B//34ALl++DEBZWRkAHz584MKFC1y9ejEjfW/fvgXg5MmTANTW1gLw6NEjzp49y9jYmLcCFhY27qqqSvv27aNQT4/kdDqd5cuXUygQCEihqqoqKRQKhaRQTU2NFKqpqZFCVVVVUigYDEqhsrIyKeT3+6VQIBCQ444ePSqNnzhxAoDCwkIA4vE4T58+5e7duwBEo1FvBUSjUS5evMjz588B0HXdk/4jkQg3b97k+vXrjI6OArMooKGhgc7OTlauXJm13kajUW7dusXVq1eJRCLeCti0aRN79uyhvr7e0046nc6HDx+4c+cOr1+/9lZAbW0t69evZ+3atYRCIdLF6XRy//59Hjx4wOjoqBS4cuUKFy9elGshT548kcGRI0eGzp8/f0YIIYQQ4n/iN5kkr0OZF2IAAAAAAElFTkSuQmCC"
              />
            </div>
          );
        }
        return (
          <div style={{
            width: 44,
            height: 44,
            backgroundColor: '#f5f5f5',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            color: '#bbb'
          }}>
            No Image
          </div>
        );
      },
    },
    {
      title: '상품번호',
      key: 'product_codes',
      width: 120,
      render: (_, record) => {
        if (!record.items || record.items.length === 0) return '-';
        const code = record.items[0]?.product?.product_code || record.items[0]?.product_code || '-';
        return <span style={{ fontWeight: 500, fontSize: '12px', whiteSpace: 'normal', wordBreak: 'break-all' }}>{code}</span>;
      },
    },
    {
      title: '상품명',
      key: 'product_names',
      width: 180,
      render: (_, record) => {
        if (!record.items || record.items.length === 0) return '-';
        const name = record.items[0]?.product?.product_name || record.items[0]?.product_name || '-';
        return <span style={{ fontSize: '12px', whiteSpace: 'normal', wordBreak: 'break-word', color: '#333' }}>{name}</span>;
      },
    },
    {
      title: '수량',
      key: 'sizes_quantity',
      width: 60,
      render: (_, record) => {
        if (!record.items || record.items.length === 0) return '-';
        const sizeMap = new Map<string, number>();
        record.items.forEach(item => {
          const size = item.size || 'FREE';
          const current = sizeMap.get(size) || 0;
          sizeMap.set(size, current + (item.quantity || 1));
        });

        const sortedEntries = Array.from(sizeMap.entries()).sort(([a], [b]) => {
          const aNum = parseFloat(a);
          const bNum = parseFloat(b);
          if (!isNaN(aNum) && !isNaN(bNum)) {
            return aNum - bNum;
          }
          return a.localeCompare(b);
        });

        const total = record.items.reduce((sum, item) => sum + (item.quantity || 0), 0);

        const tooltipContent = (
          <div style={{ minWidth: 100 }}>
            <div style={{ fontWeight: 600, marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.2)' }}>사이즈별 수량</div>
            {sortedEntries.map(([size, qty], idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ color: 'rgba(255,255,255,0.85)' }}>{size}</span>
                <span style={{ fontWeight: 500 }}>{qty}개</span>
              </div>
            ))}
          </div>
        );

        return (
          <Tooltip title={tooltipContent} placement="left">
            <span style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: '#1890ff' }}>
              {total}개
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: '판매자 판매가',
      key: 'seller_price',
      width: 120,
      align: 'left',
      render: (_, record) => {
        const totalOriginal = record.items?.reduce((sum, item) => sum + Number(item.seller_sale_price_original || 0), 0) || 0;
        const currency = record.items?.[0]?.seller_sale_currency || '';
        const totalKrw = record.total_seller_amount ? Number(record.total_seller_amount) : 0;

        return (
          <div style={{ lineHeight: '1.4' }}>
            <div style={{ fontSize: '12px', color: '#666' }}>{currency} {Math.floor(totalOriginal).toLocaleString()}</div>
            <div style={{ fontWeight: 600 }}>₩{Math.floor(totalKrw).toLocaleString()}</div>
          </div>
        );
      },
    },
    {
      title: '회사 판매가',
      key: 'company_price',
      width: 110,
      align: 'left',
      render: (_, record) => {
        return record.total_company_amount ? `₩${Math.floor(Number(record.total_company_amount)).toLocaleString()}` : '-';
      },
    },
    {
      title: '판매자 마진',
      key: 'seller_margin',
      width: 110,
      align: 'left',
      render: (_, record) => {
        return record.total_seller_margin ? `₩${Math.floor(Number(record.total_seller_margin)).toLocaleString()}` : '-';
      },
    },
    {
      title: '판매자',
      dataIndex: 'seller_name',
      key: 'seller_name',
      width: 85,
      render: (name: string) => name || '알 수 없음',
    },
    {
      title: '상태',
      key: 'margin_status',
      width: 110,
      render: (_, record) => {
        // 반품 상태인 경우 반품 태그 표시
        if (record.status === SaleStatus.RETURNED) {
          return <Tag color="purple">반품</Tag>;
        }
        // 취소 상태인 경우 취소 태그 표시
        if (record.status === SaleStatus.CANCELLED) {
          return <Tag color="red">취소</Tag>;
        }
        // 그 외에는 회사 판매가 입력 여부로 표시
        const hasMargin = record.total_company_amount && Number(record.total_company_amount) > 0;
        return hasMargin ? (
          <Tag color="green">완료</Tag>
        ) : (
          <Tag color="orange">마진 입력 대기중</Tag>
        );
      },
    },
    {
      title: '작업',
      key: 'action',
      width: 80,
      align: 'center' as 'center',
      render: (_, record) => {
        // 이미 반품 또는 취소된 경우 버튼 숨김
        if (record.status === SaleStatus.RETURNED || record.status === SaleStatus.CANCELLED) {
          return null;
        }
        return (
          <Button
            size="small"
            icon={<RollbackOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              Modal.confirm({
                title: '반품 처리',
                icon: <RollbackOutlined style={{ color: '#0d1117' }} />,
                content: '해당 판매를 반품 처리하시겠습니까?',
                okText: '반품',
                cancelText: '취소',
                okButtonProps: { style: { backgroundColor: '#0d1117', borderColor: '#0d1117' } },
                onOk: () => handleReturnSale(record.id!),
              });
            }}
            style={{
              backgroundColor: '#0d1117',
              borderColor: '#0d1117',
              color: '#fff',
            }}
          >
            반품
          </Button>
        );
      },
    },
  ];

  // 통계 계산
  const today = dayjs().startOf('day');
  const thisWeekStart = dayjs().startOf('week');
  const thisWeekEnd = dayjs().endOf('week');
  const thisMonthStart = dayjs().startOf('month');
  const thisMonthEnd = dayjs().endOf('month');

  // 연도 필터가 적용된 판매 데이터
  const filteredSales = statsYear
    ? allSales.filter(s => dayjs(s.sale_date).year() === statsYear)
    : allSales;

  // 전체 통계 (연도 필터 적용)
  const totalSellerAmount = filteredSales.reduce((sum, sale) => sum + Number(sale.total_seller_amount || 0), 0);
  const totalQuantity = filteredSales.reduce((sum, sale) => sum + (sale.items?.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0) || 0), 0);

  // 이번달 통계 (연도 필터 적용)
  const thisMonthSales = filteredSales.filter(s => {
    const saleDate = dayjs(s.sale_date);
    return saleDate.isAfter(thisMonthStart) || saleDate.isSame(thisMonthStart, 'day');
  });
  const thisMonthAmount = thisMonthSales.reduce((sum, sale) => sum + Number(sale.total_seller_amount || 0), 0);
  const thisMonthQuantity = thisMonthSales.reduce((sum, sale) => sum + (sale.items?.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0) || 0), 0);

  // 이번주 통계 (연도 필터 적용)
  const thisWeekSales = filteredSales.filter(s => {
    const saleDate = dayjs(s.sale_date);
    return saleDate.isAfter(thisWeekStart) || saleDate.isSame(thisWeekStart, 'day');
  });
  const thisWeekAmount = thisWeekSales.reduce((sum, sale) => sum + Number(sale.total_seller_amount || 0), 0);
  const thisWeekQuantity = thisWeekSales.reduce((sum, sale) => sum + (sale.items?.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0) || 0), 0);

  // 오늘 통계 (연도 필터 적용)
  const todaySales = filteredSales.filter(s =>
    dayjs(s.sale_date).isSame(today, 'day')
  );
  const todayAmount = todaySales.reduce((sum, sale) => sum + Number(sale.total_seller_amount || 0), 0);
  const todayQuantity = todaySales.reduce((sum, sale) => sum + (sale.items?.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0) || 0), 0);

  // 연도 목록 생성 (판매 데이터가 있는 연도들)
  const availableYears = Array.from(new Set(allSales.map(s => dayjs(s.sale_date).year()))).sort((a, b) => b - a);

  // 모달 내 필터링된 판매 목록
  const filteredPendingSales = pendingSales.filter(sale => {
    if (!modalSearchText) return true;
    const searchLower = modalSearchText.toLowerCase();
    const productCode = sale.items?.[0]?.product?.product_code || sale.items?.[0]?.product_code || '';
    const productName = sale.items?.[0]?.product?.product_name || sale.items?.[0]?.product_name || '';
    const sellerName = sale.seller_name || '';
    return productCode.toLowerCase().includes(searchLower) ||
           productName.toLowerCase().includes(searchLower) ||
           sellerName.toLowerCase().includes(searchLower);
  });

  return (
    <div style={{ padding: '24px' }}>

      {/* 통계 카드 - 한줄로 4개 표시 (금액/개수 2분할) */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card
            className="statistics-card"
            bodyStyle={{ padding: 0 }}
            style={{
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              border: 'none'
            }}
          >
            <div className="card-header-gradient" style={{
              background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
              padding: '12px',
              color: 'white'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>총 판매</span>
                <Select
                  size="small"
                  value={statsYear}
                  onChange={setStatsYear}
                  style={{ width: 90 }}
                  dropdownStyle={{ minWidth: 90 }}
                >
                  <Option value={null}>전체</Option>
                  {availableYears.map(year => (
                    <Option key={year} value={year}>{year}년</Option>
                  ))}
                </Select>
              </div>
            </div>
            <Row>
              <Col span={12} style={{
                borderRight: '1px solid #f0f0f0',
                padding: '14px 12px',
                background: 'white'
              }}>
                <div style={{ fontSize: '11px', color: '#8c8c8c', marginBottom: 8, fontWeight: 500 }}>금액</div>
                <div className="statistics-value" style={{ fontSize: '20px', fontWeight: 700, color: '#262626', lineHeight: '1.3' }}>
                  <div>{formatCurrencyWithKoreanSeparate(roundToWon(totalSellerAmount)).amount}</div>
                  <div style={{ fontSize: '11px', fontWeight: 400, color: '#999', marginTop: '2px' }}>
                    ({formatCurrencyWithKoreanSeparate(roundToWon(totalSellerAmount)).korean})
                  </div>
                </div>
              </Col>
              <Col span={12} style={{
                padding: '14px 12px',
                background: 'white'
              }}>
                <div style={{ fontSize: '11px', color: '#8c8c8c', marginBottom: 8, fontWeight: 500 }}>개수</div>
                <div className="statistics-value" style={{ fontSize: '20px', fontWeight: 700, color: '#262626' }}>
                  {totalQuantity.toLocaleString()}<span style={{ fontSize: '14px', fontWeight: 400 }}>개</span>
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
        <Col span={6}>
          <Card
            className="statistics-card"
            bodyStyle={{ padding: 0 }}
            style={{
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              border: 'none'
            }}
          >
            <div className="card-header-gradient" style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #60a5fa 100%)',
              padding: '12px',
              color: 'white'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>이번달 판매 ({thisMonthStart.format('M.D')}~{thisMonthEnd.format('M.D')})</span>
              </div>
            </div>
            <Row>
              <Col span={12} style={{
                borderRight: '1px solid #f0f0f0',
                padding: '14px 12px',
                background: 'white'
              }}>
                <div style={{ fontSize: '11px', color: '#8c8c8c', marginBottom: 8, fontWeight: 500 }}>금액</div>
                <div className="statistics-value" style={{ fontSize: '20px', fontWeight: 700, color: '#262626', lineHeight: '1.3' }}>
                  <div>{formatCurrencyWithKoreanSeparate(roundToWon(thisMonthAmount)).amount}</div>
                  <div style={{ fontSize: '11px', fontWeight: 400, color: '#999', marginTop: '2px' }}>
                    ({formatCurrencyWithKoreanSeparate(roundToWon(thisMonthAmount)).korean})
                  </div>
                </div>
              </Col>
              <Col span={12} style={{
                padding: '14px 12px',
                background: 'white'
              }}>
                <div style={{ fontSize: '11px', color: '#8c8c8c', marginBottom: 8, fontWeight: 500 }}>개수</div>
                <div className="statistics-value" style={{ fontSize: '20px', fontWeight: 700, color: '#262626' }}>
                  {thisMonthQuantity.toLocaleString()}<span style={{ fontSize: '14px', fontWeight: 400 }}>개</span>
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
        <Col span={6}>
          <Card
            className="statistics-card"
            bodyStyle={{ padding: 0 }}
            style={{
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              border: 'none'
            }}
          >
            <div className="card-header-gradient" style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #93c5fd 100%)',
              padding: '12px',
              color: 'white'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>이번주 판매 ({thisWeekStart.format('M.D')}~{thisWeekEnd.format('M.D')})</span>
              </div>
            </div>
            <Row>
              <Col span={12} style={{
                borderRight: '1px solid #f0f0f0',
                padding: '14px 12px',
                background: 'white'
              }}>
                <div style={{ fontSize: '11px', color: '#8c8c8c', marginBottom: 8, fontWeight: 500 }}>금액</div>
                <div className="statistics-value" style={{ fontSize: '20px', fontWeight: 700, color: '#262626', lineHeight: '1.3' }}>
                  <div>{formatCurrencyWithKoreanSeparate(roundToWon(thisWeekAmount)).amount}</div>
                  <div style={{ fontSize: '11px', fontWeight: 400, color: '#999', marginTop: '2px' }}>
                    ({formatCurrencyWithKoreanSeparate(roundToWon(thisWeekAmount)).korean})
                  </div>
                </div>
              </Col>
              <Col span={12} style={{
                padding: '14px 12px',
                background: 'white'
              }}>
                <div style={{ fontSize: '11px', color: '#8c8c8c', marginBottom: 8, fontWeight: 500 }}>개수</div>
                <div className="statistics-value" style={{ fontSize: '20px', fontWeight: 700, color: '#262626' }}>
                  {thisWeekQuantity.toLocaleString()}<span style={{ fontSize: '14px', fontWeight: 400 }}>개</span>
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
        <Col span={6}>
          <Card
            className="statistics-card"
            bodyStyle={{ padding: 0 }}
            style={{
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              border: 'none'
            }}
          >
            <div className="card-header-gradient" style={{
              background: 'linear-gradient(135deg, #60a5fa 0%, #06b6d4 100%)',
              padding: '12px',
              color: 'white'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>오늘 판매 ({today.format('M.D')})</span>
              </div>
            </div>
            <Row>
              <Col span={12} style={{
                borderRight: '1px solid #f0f0f0',
                padding: '14px 12px',
                background: 'white'
              }}>
                <div style={{ fontSize: '11px', color: '#8c8c8c', marginBottom: 8, fontWeight: 500 }}>금액</div>
                <div className="statistics-value" style={{ fontSize: '20px', fontWeight: 700, color: '#262626', lineHeight: '1.3' }}>
                  <div>{formatCurrencyWithKoreanSeparate(roundToWon(todayAmount)).amount}</div>
                  <div style={{ fontSize: '11px', fontWeight: 400, color: '#999', marginTop: '2px' }}>
                    ({formatCurrencyWithKoreanSeparate(roundToWon(todayAmount)).korean})
                  </div>
                </div>
              </Col>
              <Col span={12} style={{
                padding: '14px 12px',
                background: 'white'
              }}>
                <div style={{ fontSize: '11px', color: '#8c8c8c', marginBottom: 8, fontWeight: 500 }}>개수</div>
                <div className="statistics-value" style={{ fontSize: '20px', fontWeight: 700, color: '#262626' }}>
                  {todayQuantity.toLocaleString()}<span style={{ fontSize: '14px', fontWeight: 400 }}>개</span>
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Card>
        {/* 필터 영역 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={5}>
            <Input
              placeholder="거래처, 상품번호 등 검색"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={() => fetchSales()}
              allowClear
            />
          </Col>
          <Col span={5}>
            <RangePicker
              placeholder={['시작일', '종료일']}
              onChange={handleDateRangeChange}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={3}>
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              placeholder="브랜드"
              allowClear
              value={filters.brand_name as string[] | undefined}
              onChange={(value) => handleFilterChange('brand_name', value.length > 0 ? value : undefined)}
              showSearch
              filterOption={(input, option) =>
                String(option?.children ?? '').toLowerCase().includes(input.toLowerCase())
              }
              maxTagCount={0}
              maxTagPlaceholder={(omittedValues) => `브랜드 ${omittedValues.length}개`}
            >
              {brands.map(brand => (
                <Option key={brand.id} value={brand.name}>{brand.name}</Option>
              ))}
            </Select>
          </Col>
          <Col span={3}>
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              placeholder="상태"
              allowClear
              value={filters.status as string[] | undefined}
              onChange={(value) => handleFilterChange('status', value.length > 0 ? value : undefined)}
              maxTagCount={0}
              maxTagPlaceholder={(omittedValues) => `상태 ${omittedValues.length}개`}
            >
              <Option value="pending">마진 입력 대기중</Option>
              <Option value="completed">완료</Option>
              <Option value="cancelled">취소</Option>
              <Option value="returned">반품</Option>
            </Select>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <Space>
              {selectedRowKeys.length > 0 && user?.role === 'admin' && (
                <Popconfirm
                  title={`선택한 ${selectedRowKeys.length}개 항목을 삭제하시겠습니까?`}
                  onConfirm={handleBulkDelete}
                  okText="삭제"
                  cancelText="취소"
                >
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    style={{ marginRight: 8 }}
                  >
                    선택 삭제 ({selectedRowKeys.length})
                  </Button>
                </Popconfirm>
              )}
              {selectedRowKeys.length > 0 && user?.role !== 'admin' && (
                <Popconfirm
                  title={`선택한 ${selectedRowKeys.length}개 항목을 삭제하시겠습니까?`}
                  onConfirm={handleBulkDelete}
                  okText="삭제"
                  cancelText="취소"
                >
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                  >
                    선택 삭제 ({selectedRowKeys.length})
                  </Button>
                </Popconfirm>
              )}
              {user?.role === 'admin' && (
                <Button
                  type="primary"
                  icon={<DollarOutlined />}
                  onClick={() => {
                    // 반품/취소 상태를 제외하고 회사 판매가가 없는 항목만 필터링
                    const pending = sales.filter(sale =>
                      (!sale.total_company_amount || Number(sale.total_company_amount) === 0) &&
                      sale.status !== SaleStatus.RETURNED &&
                      sale.status !== SaleStatus.CANCELLED
                    );
                    if (pending.length === 0) {
                      message.info('입력할 회사 판매가가 없습니다.');
                      return;
                    }
                    setPendingSales(pending);
                    const initialPrices: {[key: string]: number} = {};
                    pending.forEach(sale => {
                      initialPrices[sale.id!] = 0;
                    });
                    setBulkPrices(initialPrices);
                    setBulkPriceModalVisible(true);
                  }}
                  style={{ marginRight: 8, backgroundColor: '#0d1117', borderColor: '#0d1117' }}
                >
                  회사 판매가(마진) 입력
                </Button>
              )}
              {(user?.role === 'seller' || user?.role === 'admin') && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => navigate('/sales/new')}
                  style={{ backgroundColor: '#0d1117', borderColor: '#0d1117' }}
                >
                  판매 등록
                </Button>
              )}
            </Space>
          </Col>
        </Row>

        {/* 테이블 */}
        <Table
          columns={columns}
          dataSource={sales}
          loading={loading}
          rowKey="id"
          rowSelection={rowSelection}
          scroll={{ x: 1200 }}
          onRow={(record) => ({
            onClick: () => navigate(`/sales/${record.id}`),
            style: { cursor: 'pointer' },
            className: record.status === SaleStatus.RETURNED
              ? 'sale-row-returned'
              : record.status === SaleStatus.CANCELLED
                ? 'sale-row-cancelled'
                : '',
          })}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total) => `총 ${total}건`,
            onChange: (page, pageSize) => {
              setPagination({ current: page, pageSize: pageSize || 10 });
            },
          }}
        />
      </Card>

      {/* 회사 판매가 입력 모달 */}
      <Modal
        title={`회사 판매가 입력 (전체: ${pendingSales.length}건, 필터: ${filteredPendingSales.length}건)`}
        open={bulkPriceModalVisible}
        onOk={handleBulkPriceSave}
        onCancel={() => {
          setBulkPriceModalVisible(false);
          setPendingSales([]);
          setBulkPrices({});
          setModalSearchText('');
        }}
        okText="저장"
        cancelText="취소"
        confirmLoading={updating}
        width={1200}
        style={{ top: 20 }}
      >
        {/* 필터 및 일괄 마진 적용 영역 */}
        <div style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Input
                placeholder="상품코드, 상품명, 판매자 검색"
                prefix={<SearchOutlined />}
                value={modalSearchText}
                onChange={(e) => setModalSearchText(e.target.value)}
                allowClear
              />
            </Col>
            <Col span={12} style={{ textAlign: 'right' }}>
              <Space>
                <span style={{ fontSize: '13px' }}>마진율:</span>
                <InputNumber
                  size="small"
                  min={0}
                  max={100}
                  value={bulkMarginPercent}
                  onChange={(value) => setBulkMarginPercent(value || 30)}
                  style={{ width: 80 }}
                  addonAfter="%"
                />
                <Button
                  type="primary"
                  size="small"
                  onClick={handleApplyBulkMargin}
                  disabled={filteredPendingSales.length === 0}
                  style={{ backgroundColor: '#0d1117', borderColor: '#0d1117' }}
                >
                  현재 목록 일괄 적용
                </Button>
              </Space>
            </Col>
          </Row>
        </div>

        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <Table
            dataSource={filteredPendingSales}
            rowKey="id"
            pagination={false}
            size="small"
            scroll={{ x: 1000 }}
            columns={[
              {
                title: '판매일',
                dataIndex: 'sale_date',
                key: 'sale_date',
                width: 100,
                render: (date: string) => dayjs(date).format('YYYY-MM-DD'),
              },
              {
                title: '상품사진',
                key: 'product_image',
                width: 60,
                render: (_, record) => {
                  const firstItem = record.items?.[0];
                  if (!firstItem?.product_image_url) return '-';
                  const imageUrl = getFileUrl(firstItem.product_image_url) || undefined;
                  return <img src={imageUrl} alt="product" style={{ width: 40, height: 40, objectFit: 'cover' }} />;
                },
              },
              {
                title: '상품코드',
                key: 'product_code',
                width: 120,
                render: (_, record) => {
                  const code = record.items?.[0]?.product?.product_code || record.items?.[0]?.product_code || '-';
                  return <span style={{ fontSize: '12px', fontWeight: 600 }}>{code}</span>;
                },
              },
              {
                title: '상품명',
                key: 'product_name',
                width: 200,
                render: (_, record) => {
                  const name = record.items?.[0]?.product?.product_name || record.items?.[0]?.product_name || '-';
                  return <span style={{ fontSize: '12px' }}>{name}</span>;
                },
              },
              {
                title: '사이즈별 수량',
                key: 'sizes',
                width: 150,
                render: (_, record) => {
                  if (!record.items || record.items.length === 0) return '-';
                  const sizeMap = new Map<string, number>();
                  record.items.forEach(item => {
                    const size = item.size || 'FREE';
                    const current = sizeMap.get(size) || 0;
                    sizeMap.set(size, current + (item.quantity || 1));
                  });

                  const sortedEntries = Array.from(sizeMap.entries()).sort(([a], [b]) => {
                    const aNum = parseFloat(a);
                    const bNum = parseFloat(b);
                    if (!isNaN(aNum) && !isNaN(bNum)) {
                      return aNum - bNum;
                    }
                    return a.localeCompare(b);
                  });

                  const total = record.items.reduce((sum, item) => sum + (item.quantity || 0), 0);

                  return (
                    <div style={{
                      width: '100%',
                      fontSize: '11px',
                      margin: '-8px -16px',
                    }}>
                      <table style={{
                        borderCollapse: 'collapse',
                        width: '100%',
                      }}>
                        <tbody>
                          {sortedEntries.map(([size, qty], idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                              <td style={{ padding: '2px 4px', textAlign: 'left', fontWeight: 500, color: '#666' }}>{size}</td>
                              <td style={{ padding: '2px 4px', textAlign: 'right' }}>{qty}개</td>
                            </tr>
                          ))}
                          <tr style={{ backgroundColor: '#f0f7ff' }}>
                            <td colSpan={2} style={{
                              padding: '3px 4px',
                              fontWeight: 700,
                              fontSize: '11px',
                              color: '#1890ff',
                              textAlign: 'right',
                              borderTop: '1px solid #1890ff'
                            }}>
                              총 {total}개
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                },
              },
              {
                title: '판매자',
                dataIndex: 'seller_name',
                key: 'seller_name',
                width: 80,
                render: (name: string) => <span style={{ fontSize: '12px' }}>{name || '-'}</span>,
              },
              {
                title: '판매자 판매가',
                key: 'seller_amount',
                width: 120,
                align: 'left',
                render: (_, record) => {
                  return <span style={{ fontSize: '13px', fontWeight: 600 }}>₩{Math.floor(Number(record.total_seller_amount || 0)).toLocaleString()}</span>;
                },
              },
              {
                title: '회사 판매가',
                key: 'company_price_input',
                width: 140,
                render: (_, record) => (
                  <InputNumber
                    size="small"
                    min={0}
                    step={1000}
                    value={bulkPrices[record.id!] || undefined}
                    placeholder="가격 입력"
                    formatter={(value) => value ? `₩${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                    parser={(value) => value!.replace(/₩\s?|(,*)/g, '') as any}
                    onChange={(value) => {
                      if (value !== null && value !== undefined) {
                        setBulkPrices(prev => ({ ...prev, [record.id!]: value }));
                      }
                    }}
                    style={{ width: '100%' }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ),
              },
              {
                title: '마진',
                key: 'margin_preview',
                width: 100,
                align: 'left',
                render: (_, record) => {
                  const companyPrice = bulkPrices[record.id!];
                  if (!companyPrice || companyPrice <= 0) return '-';
                  const sellerAmount = Number(record.total_seller_amount || 0);
                  const margin = Math.floor(sellerAmount - companyPrice);
                  return <span style={{ fontSize: '12px', color: margin > 0 ? '#52c41a' : '#ff4d4f' }}>₩{margin.toLocaleString()}</span>;
                },
              },
            ]}
          />
        </div>
      </Modal>
    </div>
  );
};

export default SaleListPage;