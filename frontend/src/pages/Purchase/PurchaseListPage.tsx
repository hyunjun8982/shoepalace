import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  Card,
  Button,
  Space,
  Tag,
  DatePicker,
  Select,
  Input,
  Popconfirm,
  Modal,
  App,
  Row,
  Col,
  Statistic,
  Image,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ShoppingCartOutlined,
  CalendarOutlined,
  RiseOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import { Purchase, PaymentType, PurchaseStatus } from '../../types/purchase';
import { purchaseService } from '../../services/purchase';
import { getColumns } from './PurchaseListPageColumns';
import { brandService, Brand } from '../../services/brand';
import { userService } from '../../services/user';
import { User } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import dayjs from 'dayjs';
import './PurchaseListPage.css';

const { RangePicker } = DatePicker;
const { Option } = Select;

const PurchaseListPage: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [allPurchases, setAllPurchases] = useState<Purchase[]>([]); // 통계용 전체 데이터
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 5,
  });
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // 필터 상태
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [paymentType, setPaymentType] = useState<string[]>([]);
  const [brandFilter, setBrandFilter] = useState<string[]>([]);
  const [buyerFilter, setBuyerFilter] = useState<string[]>([]);
  const [searchText, setSearchText] = useState<string>('');

  // 전체 데이터 로드 (통계용)
  const fetchAllPurchases = async () => {
    try {
      const response = await purchaseService.getPurchases({
        skip: 0,
        limit: 10000, // 전체 데이터
      });
      setAllPurchases(response.items);
    } catch (error) {
      console.error('전체 구매 목록 조회 실패:', error);
    }
  };

  // 데이터 로드
  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const params = {
        skip: (pagination.current - 1) * pagination.pageSize,
        limit: pagination.pageSize,
        ...(dateRange && {
          start_date: dateRange[0].format('YYYY-MM-DD'),
          end_date: dateRange[1].format('YYYY-MM-DD'),
        }),
        ...(paymentType.length > 0 && { payment_type: paymentType }),
        ...(brandFilter.length > 0 && { brand_name: brandFilter }),
        ...(buyerFilter.length > 0 && { buyer_id: buyerFilter }),
        ...(searchText && { search: searchText }),
      };

      const response = await purchaseService.getPurchases(params);
      setPurchases(response.items);
      setTotal(response.total);
    } catch (error) {
      message.error('구매 목록 조회 실패');
    } finally {
      setLoading(false);
    }
  };

  // 브랜드 및 사용자 목록 로드
  useEffect(() => {
    const fetchBrands = async () => {
      try {
        const response = await brandService.getBrands();
        setBrands(response.items);
      } catch (error) {
        console.error('브랜드 목록 조회 실패:', error);
      }
    };
    const fetchUsers = async () => {
      try {
        const response = await userService.getUsers({ is_active: true });
        setUsers(response);
      } catch (error) {
        console.error('사용자 목록 조회 실패:', error);
      }
    };
    fetchBrands();
    fetchUsers();
    fetchAllPurchases(); // 통계용 전체 데이터 로드
  }, []);

  useEffect(() => {
    fetchPurchases();
  }, [pagination.current, pagination.pageSize, dateRange, paymentType, brandFilter, buyerFilter, searchText]);

  // 구매 삭제
  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '구매 삭제',
      content: (
        <div>
          <p>구매 이력을 삭제하시겠습니까?</p>
          <p style={{ marginTop: 12, color: '#ff4d4f', fontWeight: 500 }}>
            재고도 함께 삭제하려면 "재고 포함 삭제"를 선택하세요.
          </p>
        </div>
      ),
      okText: '이력만 삭제',
      cancelText: '취소',
      onOk: async () => {
        try {
          await purchaseService.deletePurchase(id, false);
          message.success('구매 이력이 삭제되었습니다');
          fetchPurchases();
        } catch (error) {
          message.error('삭제 실패');
        }
      },
      footer: (_, { OkBtn, CancelBtn }) => (
        <>
          <CancelBtn />
          <Button
            danger
            onClick={async () => {
              Modal.destroyAll();
              try {
                await purchaseService.deletePurchase(id, true);
                message.success('구매 이력과 재고가 삭제되었습니다');
                fetchPurchases();
              } catch (error) {
                message.error('삭제 실패');
              }
            }}
          >
            재고 포함 삭제
          </Button>
          <OkBtn />
        </>
      ),
    });
  };

  // 선택된 구매 삭제
  const handleBulkDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('삭제할 항목을 선택해주세요');
      return;
    }

    Modal.confirm({
      title: `${selectedRowKeys.length}개 구매 삭제`,
      content: (
        <div>
          <p>선택한 {selectedRowKeys.length}개의 구매 이력을 삭제하시겠습니까?</p>
          <p style={{ marginTop: 12, color: '#ff4d4f', fontWeight: 500 }}>
            재고도 함께 삭제하려면 "재고 포함 삭제"를 선택하세요.
          </p>
        </div>
      ),
      okText: '이력만 삭제',
      cancelText: '취소',
      onOk: async () => {
        try {
          setLoading(true);
          for (const key of selectedRowKeys) {
            await purchaseService.deletePurchase(key as string, false);
          }
          message.success(`${selectedRowKeys.length}개 항목의 이력이 삭제되었습니다`);
          setSelectedRowKeys([]);
          fetchPurchases();
        } catch (error) {
          message.error('일부 항목 삭제 실패');
        } finally {
          setLoading(false);
        }
      },
      footer: (_, { OkBtn, CancelBtn }) => (
        <>
          <CancelBtn />
          <Button
            danger
            onClick={async () => {
              Modal.destroyAll();
              try {
                setLoading(true);
                for (const key of selectedRowKeys) {
                  await purchaseService.deletePurchase(key as string, true);
                }
                message.success(`${selectedRowKeys.length}개 항목의 이력과 재고가 삭제되었습니다`);
                setSelectedRowKeys([]);
                fetchPurchases();
              } catch (error) {
                message.error('일부 항목 삭제 실패');
              } finally {
                setLoading(false);
              }
            }}
          >
            재고 포함 삭제
          </Button>
          <OkBtn />
        </>
      ),
    });
  };

  // 입고 확인 (모달은 PurchaseListPageColumns에서 처리)
  const handleConfirm = async (id: string) => {
    try {
      await purchaseService.confirmPurchase(id);
      message.success('입고 확인이 완료되었습니다');
      fetchPurchases();
      fetchAllPurchases();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '입고 확인 실패');
    }
  };

  // 입고 확인 취소 (모달은 PurchaseListPageColumns에서 처리)
  const handleUnconfirm = async (id: string) => {
    try {
      await purchaseService.unconfirmPurchase(id);
      message.success('입고 확인이 취소되었습니다');
      fetchPurchases();
      fetchAllPurchases();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '입고 확인 취소 실패');
    }
  };

  // 테이블 컬럼 정의
  const columns = getColumns(navigate, handleDelete, handleConfirm, handleUnconfirm, currentUser?.role);

  // 행 선택 설정
  const rowSelection = {
    selectedRowKeys,
    onChange: (selectedKeys: React.Key[]) => {
      setSelectedRowKeys(selectedKeys);
    },
  };

  // Old columns removed - using getColumns from PurchaseListPageColumns.tsx

  // 통계 계산 (전체 데이터 기준)
  const today = dayjs().startOf('day');
  const thisWeekStart = dayjs().startOf('week');
  const thisWeekEnd = dayjs().endOf('week');
  const thisMonthStart = dayjs().startOf('month');
  const thisMonthEnd = dayjs().endOf('month');

  // 전체 통계
  const totalAmount = allPurchases.reduce((sum, purchase) => {
    const amount = Number(purchase.total_amount) || 0;
    return sum + amount;
  }, 0);

  const totalQuantity = allPurchases.reduce((sum, purchase) => {
    const quantity = purchase.items?.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0) || 0;
    return sum + quantity;
  }, 0);

  // 이번달 통계
  const thisMonthPurchases = allPurchases.filter(p => {
    const purchaseDate = dayjs(p.purchase_date);
    return purchaseDate.isAfter(thisMonthStart) || purchaseDate.isSame(thisMonthStart, 'day');
  });
  const thisMonthAmount = thisMonthPurchases.reduce((sum, purchase) => {
    const amount = Number(purchase.total_amount) || 0;
    return sum + amount;
  }, 0);
  const thisMonthQuantity = thisMonthPurchases.reduce((sum, purchase) => {
    const quantity = purchase.items?.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0) || 0;
    return sum + quantity;
  }, 0);

  // 이번주 통계
  const thisWeekPurchases = allPurchases.filter(p => {
    const purchaseDate = dayjs(p.purchase_date);
    return purchaseDate.isAfter(thisWeekStart) || purchaseDate.isSame(thisWeekStart, 'day');
  });
  const thisWeekAmount = thisWeekPurchases.reduce((sum, purchase) => {
    const amount = Number(purchase.total_amount) || 0;
    return sum + amount;
  }, 0);
  const thisWeekQuantity = thisWeekPurchases.reduce((sum, purchase) => {
    const quantity = purchase.items?.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0) || 0;
    return sum + quantity;
  }, 0);

  // 오늘 통계
  const todayPurchases = allPurchases.filter(p =>
    dayjs(p.purchase_date).isSame(today, 'day')
  );
  const todayAmount = todayPurchases.reduce((sum, purchase) => {
    const amount = Number(purchase.total_amount) || 0;
    return sum + amount;
  }, 0);
  const todayQuantity = todayPurchases.reduce((sum, purchase) => {
    const quantity = purchase.items?.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0) || 0;
    return sum + quantity;
  }, 0);

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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>총 구매</span>
              </div>
            </div>
            <Row>
              <Col span={12} style={{
                borderRight: '1px solid #f0f0f0',
                padding: '14px 12px',
                background: 'white'
              }}>
                <div style={{ fontSize: '11px', color: '#8c8c8c', marginBottom: 8, fontWeight: 500 }}>금액</div>
                <div className="statistics-value" style={{ fontSize: '20px', fontWeight: 700, color: '#262626' }}>
                  ₩{totalAmount.toLocaleString()}
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
                <span style={{ fontSize: '14px', fontWeight: 500 }}>이번달 구매 ({thisMonthStart.format('M.D')}~{thisMonthEnd.format('M.D')})</span>
              </div>
            </div>
            <Row>
              <Col span={12} style={{
                borderRight: '1px solid #f0f0f0',
                padding: '14px 12px',
                background: 'white'
              }}>
                <div style={{ fontSize: '11px', color: '#8c8c8c', marginBottom: 8, fontWeight: 500 }}>금액</div>
                <div className="statistics-value" style={{ fontSize: '20px', fontWeight: 700, color: '#262626' }}>
                  ₩{thisMonthAmount.toLocaleString()}
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
                <span style={{ fontSize: '14px', fontWeight: 500 }}>이번주 구매 ({thisWeekStart.format('M.D')}~{thisWeekEnd.format('M.D')})</span>
              </div>
            </div>
            <Row>
              <Col span={12} style={{
                borderRight: '1px solid #f0f0f0',
                padding: '14px 12px',
                background: 'white'
              }}>
                <div style={{ fontSize: '11px', color: '#8c8c8c', marginBottom: 8, fontWeight: 500 }}>금액</div>
                <div className="statistics-value" style={{ fontSize: '20px', fontWeight: 700, color: '#262626' }}>
                  ₩{thisWeekAmount.toLocaleString()}
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
                <span style={{ fontSize: '14px', fontWeight: 500 }}>오늘 구매 ({today.format('M.D')})</span>
              </div>
            </div>
            <Row>
              <Col span={12} style={{
                borderRight: '1px solid #f0f0f0',
                padding: '14px 12px',
                background: 'white'
              }}>
                <div style={{ fontSize: '11px', color: '#8c8c8c', marginBottom: 8, fontWeight: 500 }}>금액</div>
                <div className="statistics-value" style={{ fontSize: '20px', fontWeight: 700, color: '#262626' }}>
                  ₩{todayAmount.toLocaleString()}
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
              placeholder="거래번호, 구매처, 상품명 검색"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={() => fetchPurchases()}
              allowClear
            />
          </Col>
          <Col span={6}>
            <RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
              placeholder={['시작일', '종료일']}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={3}>
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              placeholder="브랜드"
              allowClear
              value={brandFilter}
              onChange={setBrandFilter}
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
              placeholder="결제방식"
              allowClear
              value={paymentType}
              onChange={setPaymentType}
              maxTagCount={0}
              maxTagPlaceholder={(omittedValues) => `결제방식 ${omittedValues.length}개`}
            >
              <Option value="corp_card">법인카드</Option>
              <Option value="corp_account">법인계좌</Option>
              <Option value="personal_card">개인카드</Option>
            </Select>
          </Col>
          <Col span={3}>
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              placeholder="구매자"
              allowClear
              value={buyerFilter}
              onChange={setBuyerFilter}
              showSearch
              filterOption={(input, option) =>
                String(option?.children ?? '').toLowerCase().includes(input.toLowerCase())
              }
              maxTagCount={0}
              maxTagPlaceholder={(omittedValues) => `구매자 ${omittedValues.length}명`}
            >
              {users.map(user => (
                <Option key={user.id} value={user.id}>{user.full_name}</Option>
              ))}
            </Select>
          </Col>
          <Col span={4} style={{ textAlign: 'right' }}>
            <Space>
              {selectedRowKeys.length > 0 && (
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={handleBulkDelete}
                  >
                    선택 삭제 ({selectedRowKeys.length})
                  </Button>
              )}
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate('/purchases/new')}
                style={{ backgroundColor: '#0d1117', borderColor: '#0d1117' }}
              >
                구매 등록
              </Button>
            </Space>
          </Col>
        </Row>

        {/* 테이블 */}
        <Table
          loading={loading}
          columns={columns}
          dataSource={purchases}
          rowKey="id"
          rowSelection={rowSelection}
          onRow={(record) => ({
            onClick: () => navigate(`/purchases/${record.id}`),
            style: { cursor: 'pointer' }
          })}
          pagination={{
            ...pagination,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['5', '10', '50'],
            showTotal: (total) => `총 ${total}건`,
            onChange: (page, pageSize) => {
              setPagination({ current: page, pageSize: pageSize || 5 });
            },
          }}
        />
      </Card>
    </div>
  );
};

export default PurchaseListPage;