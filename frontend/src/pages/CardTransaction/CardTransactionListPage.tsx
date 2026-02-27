import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Card, Button, Row, Col, Select, DatePicker, Input, Modal, App, Tag, Space,
  Descriptions, Form, Spin, Badge, Popconfirm, Tooltip, Checkbox,
} from 'antd';
import {
  SyncOutlined, CreditCardOutlined,
  SearchOutlined, ReloadOutlined, PlusOutlined, DeleteOutlined,
  DisconnectOutlined, LinkOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { cardTransactionService } from '../../services/cardTransaction';
import {
  CardTransaction, CodefAccountInfo,
  ORGANIZATION_MAP, PAYMENT_TYPE_MAP, CANCEL_STATUS_MAP, CARD_SIGNUP_URLS,
} from '../../types/cardTransaction';
import { useAuth } from '../../contexts/AuthContext';

const { RangePicker } = DatePicker;

// 금액을 "1,234원" 형식으로 포맷
const formatAmount = (amount: number): string => {
  const intAmount = Math.round(amount);
  return `${intAmount.toLocaleString()}원`;
};

const CardTransactionListPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // 데이터 상태
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CardTransaction[]>([]);
  const [total, setTotal] = useState(0);

  // 필터 상태
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50 });
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(() => {
    const saved = localStorage.getItem('cardTxDateRange');
    if (saved) {
      try {
        const [start, end] = JSON.parse(saved);
        return [dayjs(start), dayjs(end)];
      } catch { return null; }
    }
    return null;
  });
  const [organization, setOrganization] = useState<string | undefined>(undefined);
  const [searchText, setSearchText] = useState('');
  const [paymentType, setPaymentType] = useState<string | undefined>(undefined);
  const [cancelStatus, setCancelStatus] = useState<string | undefined>(undefined);
  const [ownerName, setOwnerName] = useState<string | undefined>(undefined);
  const [ownerNameOptions, setOwnerNameOptions] = useState<string[]>([]);
  const [clientType, setClientType] = useState<string | undefined>(undefined);

  // 선택 삭제
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 내역 조회 모달
  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncForm] = Form.useForm();

  // 계정 관리 모달
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [accountInfoLoading, setAccountInfoLoading] = useState(false);
  const [accountInfoList, setAccountInfoList] = useState<CodefAccountInfo[]>([]);
  const [accountPasswords, setAccountPasswords] = useState<Record<string, string>>({});
  const [accountCardPasswords, setAccountCardPasswords] = useState<Record<string, string>>({});
  const [registeringKey, setRegisteringKey] = useState<string | null>(null);
  const [addOrgValue, setAddOrgValue] = useState<string | undefined>(undefined);
  const [addClientType, setAddClientType] = useState<string>('P');

  const accKey = (org: string, ct: string) => `${org}_${ct}`;

  // 상세 모달
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<CardTransaction | null>(null);

  const { message, modal } = App.useApp();

  // 데이터 조회
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        skip: (pagination.current - 1) * pagination.pageSize,
        limit: pagination.pageSize,
      };
      if (dateRange) {
        params.start_date = dateRange[0].format('YYYY-MM-DD');
        params.end_date = dateRange[1].format('YYYY-MM-DD');
      }
      if (organization) params.organization = organization;
      if (searchText) params.search = searchText;
      if (paymentType) params.payment_type = paymentType;
      if (cancelStatus) params.cancel_status = cancelStatus;
      if (ownerName) params.owner_name = ownerName;
      if (clientType) params.client_type = clientType;

      const txResponse = await cardTransactionService.getTransactions(params);
      setItems(txResponse.items);
      setTotal(txResponse.total);
    } catch (error: any) {
      message.error('카드 내역 조회 실패: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  }, [pagination, dateRange, organization, searchText, paymentType, cancelStatus, ownerName, clientType, message]);

  // 초기 로딩 시 계정 정보 + 소유자 목록 수집
  useEffect(() => {
    const loadInitData = async () => {
      try {
        const result = await cardTransactionService.getAccountInfo();
        setAccountInfoList(result.accounts);
        const names = new Set<string>();
        result.accounts.forEach(acc => {
          if (acc.owner_name) names.add(acc.owner_name);
        });
        if (names.size > 0) setOwnerNameOptions(Array.from(names).sort());
      } catch {
        // ignore
      }
    };
    loadInitData();
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 내역 조회 모달이 열릴 때 연동된 카드사 전체 선택
  useEffect(() => {
    if (syncModalVisible && accountInfoList.length > 0) {
      const currentVal = syncForm.getFieldValue('organizations');
      if (!currentVal || currentVal.length === 0) {
        const allConnected = accountInfoList
          .filter(a => a.is_connected)
          .map(a => `${a.organization}_${a.client_type}`);
        if (allConnected.length > 0) {
          syncForm.setFieldsValue({ organizations: allConnected });
        }
      }
    }
  }, [syncModalVisible, accountInfoList, syncForm]);

  useEffect(() => {
    if (dateRange) {
      localStorage.setItem('cardTxDateRange', JSON.stringify([
        dateRange[0].format('YYYY-MM-DD'),
        dateRange[1].format('YYYY-MM-DD'),
      ]));
    } else {
      localStorage.removeItem('cardTxDateRange');
    }
  }, [dateRange]);

  // 선택 삭제
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      setDeleteLoading(true);
      const result = await cardTransactionService.deleteTransactionsBatch(selectedRowKeys as string[]);
      message.success(result.message);
      setSelectedRowKeys([]);
      fetchData();
    } catch (error: any) {
      message.error('삭제 실패: ' + (error.response?.data?.detail || error.message));
    } finally {
      setDeleteLoading(false);
    }
  };

  // 내역 조회 실행 (여러 카드사 동시)
  const handleSync = async () => {
    try {
      await syncForm.validateFields();
      const values = syncForm.getFieldsValue();
      setSyncLoading(true);

      const organizations: string[] = values.organizations;
      const startDate = values.syncDateRange[0].format('YYYYMMDD');
      const endDate = values.syncDateRange[1].format('YYYYMMDD');

      const results: string[] = [];
      for (const orgKey of organizations) {
        const [org, ct] = orgKey.split('_');
        try {
          const result = await cardTransactionService.syncTransactions({
            organization: org,
            start_date: startDate,
            end_date: endDate,
            inquiry_type: '1',
            member_store_info_type: '3',
            client_type: ct,
          });
          results.push(`${ORGANIZATION_MAP[org] || org}: ${result.message}`);
        } catch (error: any) {
          const detail = error.response?.data?.detail || error.message;
          results.push(`${ORGANIZATION_MAP[org] || org}: 실패 - ${detail}`);
        }
      }

      modal.info({
        title: '내역 조회 결과',
        content: (
          <div style={{ marginTop: 12 }}>
            {results.map((r, i) => (
              <div key={i} style={{ marginBottom: 4 }}>{r}</div>
            ))}
          </div>
        ),
      });

      setSyncModalVisible(false);
      syncForm.resetFields();
      fetchData();
    } catch (error: any) {
      if (error.response?.data?.detail) {
        message.error('조회 실패: ' + error.response.data.detail);
      } else if (error.errorFields) {
        // validation error
      } else {
        message.error('조회 실패: ' + error.message);
      }
    } finally {
      setSyncLoading(false);
    }
  };

  // 카드사별 계정 정보 로드
  const loadAccountInfo = async () => {
    try {
      setAccountInfoLoading(true);
      const result = await cardTransactionService.getAccountInfo();
      setAccountInfoList(result.accounts);
    } catch {
      // 조회 실패 시 무시
    } finally {
      setAccountInfoLoading(false);
    }
  };

  const updateAccountField = (org: string, ct: string, field: 'login_id' | 'card_no', value: string) => {
    setAccountInfoList(prev =>
      prev.map(acc => (acc.organization === org && acc.client_type === ct) ? { ...acc, [field]: value } : acc)
    );
  };

  const handleRegisterOrg = async (org: string, ct: string) => {
    const acc = accountInfoList.find(a => a.organization === org && a.client_type === ct);
    if (!acc?.login_id) {
      message.warning('로그인 ID를 입력해주세요.');
      return;
    }
    const key = accKey(org, ct);
    const password = accountPasswords[key];
    if (!password) {
      message.warning('비밀번호를 입력해주세요.');
      return;
    }

    try {
      setRegisteringKey(key);
      const result = await cardTransactionService.registerAccount({
        organization: org,
        login_id: acc.login_id,
        password,
        card_no: acc.card_no || undefined,
        card_password: accountCardPasswords[key] || undefined,
        client_type: ct,
      });

      message.success(result.message);
      setAccountPasswords(prev => ({ ...prev, [key]: '' }));
      setAccountCardPasswords(prev => ({ ...prev, [key]: '' }));
      loadAccountInfo();
    } catch (error: any) {
      if (error.response?.data?.detail) {
        message.error('연동 실패: ' + error.response.data.detail);
      } else {
        message.error('연동 실패: ' + error.message);
      }
    } finally {
      setRegisteringKey(null);
    }
  };

  const handleAddOrganization = () => {
    if (!addOrgValue) return;
    const existing = accountInfoList.find(a => a.organization === addOrgValue && a.client_type === addClientType);
    if (existing) {
      message.warning('이미 등록된 카드사입니다.');
      return;
    }
    setAccountInfoList(prev => [...prev, {
      organization: addOrgValue,
      organization_name: ORGANIZATION_MAP[addOrgValue] || addOrgValue,
      client_type: addClientType,
      is_connected: false,
    }]);
    setAddOrgValue(undefined);
    setAddClientType('P');
  };

  const handleDeleteAccount = async (org: string, ct: string) => {
    try {
      const result = await cardTransactionService.deleteAccount(org, ct);
      message.success(result.message);
      loadAccountInfo();
    } catch (error: any) {
      if (error.response?.data?.detail) {
        message.error(error.response.data.detail);
      } else {
        message.error('연동 해제 실패: ' + error.message);
      }
    }
  };

  // 테이블 컬럼
  const columns: ColumnsType<CardTransaction> = [
    {
      title: '사용일시',
      dataIndex: 'used_date',
      key: 'used_date',
      width: 140,
      render: (date: string, record) => {
        const time = record.used_time && record.used_time.length >= 4
          ? `${record.used_time.slice(0, 2)}:${record.used_time.slice(2, 4)}`
          : '';
        return `${dayjs(date).format('YYYY-MM-DD')}${time ? ` ${time}` : ''}`;
      },
    },
    {
      title: '카드사',
      dataIndex: 'organization',
      key: 'organization',
      width: 80,
      render: (org: string) => ORGANIZATION_MAP[org] || org,
    },
    {
      title: '구분',
      dataIndex: 'client_type',
      key: 'client_type',
      width: 55,
      align: 'center' as const,
      render: (type: string) => (
        <Tag color={type === 'B' ? 'orange' : 'blue'} style={{ margin: 0 }}>
          {type === 'B' ? '법인' : '개인'}
        </Tag>
      ),
    },
    ...(isAdmin ? [{
      title: '소유자',
      dataIndex: 'owner_name',
      key: 'owner_name',
      width: 70,
      render: (name: string) => name || '-',
    }] : []) as ColumnsType<CardTransaction>,
    {
      title: '카드번호',
      dataIndex: 'card_no',
      key: 'card_no',
      width: 160,
      render: (no: string) => <span style={{ fontSize: 12 }}>{no || '-'}</span>,
    },
    {
      title: '가맹점명',
      dataIndex: 'merchant_name',
      key: 'merchant_name',
      width: 200,
      ellipsis: true,
      render: (name: string) => name || '-',
    },
    {
      title: '이용금액',
      dataIndex: 'used_amount',
      key: 'used_amount',
      width: 120,
      align: 'right',
      render: (amount: number, record) => {
        const isCancel = record.cancel_status !== 'normal';
        return (
          <span style={{
            fontWeight: 600,
            color: isCancel ? '#ff4d4f' : amount < 0 ? '#ff4d4f' : '#1890ff',
            textDecoration: isCancel ? 'line-through' : 'none',
          }}>
            {formatAmount(amount)}
          </span>
        );
      },
    },
    {
      title: '결제',
      dataIndex: 'payment_type',
      key: 'payment_type',
      width: 70,
      align: 'center',
      render: (type: string, record) => {
        if (type === '2' && record.installment_month) {
          return <span>{record.installment_month}개월</span>;
        }
        return PAYMENT_TYPE_MAP[type] || type || '-';
      },
    },
    {
      title: '상태',
      dataIndex: 'cancel_status',
      key: 'cancel_status',
      width: 70,
      align: 'center',
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          normal: 'green', cancelled: 'red', partial: 'orange', rejected: 'volcano',
        };
        return (
          <Tag color={colorMap[status] || 'default'}>
            {CANCEL_STATUS_MAP[status] || status}
          </Tag>
        );
      },
    },
    {
      title: '결제예정일',
      dataIndex: 'payment_due_date',
      key: 'payment_due_date',
      width: 100,
      render: (d: string) => d || '-',
    },
    {
      title: '주소',
      dataIndex: 'merchant_addr',
      key: 'merchant_addr',
      width: 200,
      ellipsis: true,
      render: (addr: string) => addr || '-',
    },
  ];

  // 등록된 카드사 옵션 (내역 조회용)
  const registeredCardOptions = accountInfoList
    .filter(a => a.is_connected)
    .map(a => ({
      value: `${a.organization}_${a.client_type}`,
      label: `${a.organization_name || ORGANIZATION_MAP[a.organization] || a.organization} (${a.client_type === 'B' ? '법인' : '개인'})`,
    }));

  // 필터용 카드사 목록 (등록된 카드사만, 중복 제거)
  const filterOrgOptions = Array.from(new Map(
    accountInfoList.map(a => [a.organization, {
      value: a.organization,
      label: a.organization_name || ORGANIZATION_MAP[a.organization] || a.organization,
    }] as [string, { value: string; label: string }])
  ).values());

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        {/* 필터 영역 */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col>
            <RangePicker
              value={dateRange}
              onChange={(dates) => {
                setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null);
                setPagination({ ...pagination, current: 1 });
              }}
              style={{ width: 260 }}
              placeholder={['시작일', '종료일']}
            />
          </Col>
          <Col>
            <Select
              value={organization}
              onChange={(val) => { setOrganization(val); setPagination({ ...pagination, current: 1 }); }}
              placeholder="카드사"
              allowClear
              style={{ width: 120 }}
              options={filterOrgOptions}
            />
          </Col>
          <Col>
            <Select
              value={clientType}
              onChange={(val) => { setClientType(val); setPagination({ ...pagination, current: 1 }); }}
              placeholder="구분"
              allowClear
              style={{ width: 90 }}
              options={[
                { value: 'P', label: '개인' },
                { value: 'B', label: '법인' },
              ]}
            />
          </Col>
          <Col>
            <Select
              value={ownerName}
              onChange={(val) => { setOwnerName(val); setPagination({ ...pagination, current: 1 }); }}
              placeholder="소유자"
              allowClear
              style={{ width: 110 }}
              options={ownerNameOptions.map(name => ({ value: name, label: name }))}
            />
          </Col>
          <Col>
            <Input
              placeholder="가맹점명/카드번호/승인번호"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={() => { setPagination({ ...pagination, current: 1 }); fetchData(); }}
              style={{ width: 230 }}
              allowClear
            />
          </Col>
          <Col>
            <Select
              value={paymentType}
              onChange={(val) => { setPaymentType(val); setPagination({ ...pagination, current: 1 }); }}
              placeholder="결제방법"
              allowClear
              style={{ width: 110 }}
              options={Object.entries(PAYMENT_TYPE_MAP).map(([code, name]) => ({ value: code, label: name }))}
            />
          </Col>
          <Col>
            <Select
              value={cancelStatus}
              onChange={(val) => { setCancelStatus(val); setPagination({ ...pagination, current: 1 }); }}
              placeholder="상태"
              allowClear
              style={{ width: 110 }}
              options={Object.entries(CANCEL_STATUS_MAP).map(([code, name]) => ({ value: code, label: name }))}
            />
          </Col>
          <Col flex="auto" style={{ textAlign: 'right' }}>
            <Space>
              {selectedRowKeys.length > 0 && (
                <Popconfirm
                  title={`선택한 ${selectedRowKeys.length}건을 삭제하시겠습니까?`}
                  onConfirm={handleBatchDelete}
                  okText="삭제"
                  cancelText="취소"
                >
                  <Button danger icon={<DeleteOutlined />} loading={deleteLoading}>
                    {selectedRowKeys.length}건 삭제
                  </Button>
                </Popconfirm>
              )}
              <Tooltip title="새로고침">
                <Button icon={<ReloadOutlined />} onClick={fetchData} />
              </Tooltip>
              <Button
                type="primary"
                onClick={() => {
                  setSyncModalVisible(true);
                  if (accountInfoList.length === 0) loadAccountInfo();
                }}
              >
                내역 조회
              </Button>
              <Button
                onClick={() => {
                  setAccountModalVisible(true);
                  loadAccountInfo();
                }}
              >
                계정 관리
              </Button>
            </Space>
          </Col>
        </Row>

        {/* 테이블 */}
        <Table
          loading={loading}
          columns={columns}
          dataSource={items}
          rowKey="id"
          size="small"
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
          }}
          pagination={{
            ...pagination,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100', '200'],
            showTotal: (t) => `총 ${t}건`,
            onChange: (page, pageSize) => {
              setPagination({ current: page, pageSize: pageSize || 50 });
            },
          }}
          scroll={{ x: 1200 }}
          onRow={(record) => ({
            onClick: () => {
              setSelectedTransaction(record);
              setDetailModalVisible(true);
            },
            style: { cursor: 'pointer' },
          })}
        />
      </Card>

      {/* 내역 조회 모달 */}
      <Modal
        title="카드 내역 조회"
        open={syncModalVisible}
        onOk={handleSync}
        onCancel={() => { setSyncModalVisible(false); syncForm.resetFields(); }}
        confirmLoading={syncLoading}
        okText="조회 시작"
        cancelText="취소"
        width={500}
      >
        <Form form={syncForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="organizations"
            label={
              <Space>
                <span>조회할 카드사</span>
                {registeredCardOptions.length > 0 && (
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, fontSize: 12 }}
                    onClick={() => {
                      const current = syncForm.getFieldValue('organizations') || [];
                      const allValues = registeredCardOptions.map(o => o.value);
                      syncForm.setFieldsValue({
                        organizations: current.length === allValues.length ? [] : allValues,
                      });
                    }}
                  >
                    {(syncForm.getFieldValue('organizations') || []).length === registeredCardOptions.length
                      ? '전체 해제' : '전체 선택'}
                  </Button>
                )}
              </Space>
            }
            rules={[{ required: true, message: '카드사를 선택해주세요' }]}
          >
            <Checkbox.Group style={{ width: '100%' }}>
              {registeredCardOptions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '8px', color: '#999' }}>
                  등록된 카드사가 없습니다. 계정 관리에서 먼저 카드사를 연동해주세요.
                </div>
              ) : (
                <Row gutter={[8, 4]}>
                  {registeredCardOptions.map(opt => (
                    <Col span={12} key={opt.value}>
                      <Checkbox value={opt.value}>{opt.label}</Checkbox>
                    </Col>
                  ))}
                </Row>
              )}
            </Checkbox.Group>
          </Form.Item>
          <Form.Item
            name="syncDateRange"
            label="조회 기간"
            rules={[{ required: true, message: '조회 기간을 선택해주세요' }]}
          >
            <RangePicker
              style={{ width: '100%' }}
              disabledDate={(current) => current && current > dayjs().endOf('day')}
            />
          </Form.Item>
        </Form>
        <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
          * 카드사별 조회 가능 기간이 다릅니다. (최근 3개월~12개월)<br />
          * 계정 관리에서 연동된 카드사만 선택할 수 있습니다.
        </div>
      </Modal>

      {/* 계정 관리 모달 */}
      <Modal
        title="카드사 계정 관리"
        open={accountModalVisible}
        onCancel={() => setAccountModalVisible(false)}
        footer={null}
        width={850}
      >
        <Spin spinning={accountInfoLoading}>
          <div style={{ marginTop: 16, marginBottom: 12 }}>
            <Row gutter={8}>
              <Col flex="auto">
                <Select
                  placeholder="카드사 검색..."
                  style={{ width: '100%' }}
                  value={addOrgValue}
                  onChange={(val) => setAddOrgValue(val)}
                  showSearch
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={Object.entries(ORGANIZATION_MAP).map(([code, name]) => ({
                    value: code, label: name,
                  }))}
                  allowClear
                />
              </Col>
              <Col>
                <Select
                  value={addClientType}
                  onChange={setAddClientType}
                  style={{ width: 90 }}
                  options={[
                    { value: 'P', label: '개인' },
                    { value: 'B', label: '법인' },
                  ]}
                />
              </Col>
              <Col>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleAddOrganization}
                  disabled={!addOrgValue}
                >
                  추가
                </Button>
              </Col>
            </Row>
          </div>

          <div>
            {accountInfoList.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#999' }}>
                등록된 카드사가 없습니다. 위에서 카드사를 추가해주세요.
              </div>
            )}
            {accountInfoList.map((acc) => {
              const isHyundai = acc.organization === '0302';
              const key = accKey(acc.organization, acc.client_type);
              const isRegistering = registeringKey === key;
              const typeLabel = acc.client_type === 'B' ? '법인' : '개인';
              return (
                <div
                  key={key}
                  style={{
                    padding: '12px 16px',
                    marginBottom: 8,
                    borderRadius: 6,
                    border: `1px solid ${acc.is_connected ? '#b7eb8f' : '#d9d9d9'}`,
                    background: acc.is_connected ? '#f6ffed' : '#fafafa',
                  }}
                >
                  <Row gutter={8} align="middle">
                    <Col flex="none">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 0, whiteSpace: 'nowrap', minWidth: 200 }}>
                        <Badge status={acc.is_connected ? 'success' : 'default'} />
                        <span style={{ fontWeight: 600, fontSize: 13, width: 60, marginLeft: 6 }}>{acc.organization_name}</span>
                        <Tag color={acc.client_type === 'B' ? 'orange' : 'blue'} style={{ fontSize: 11, margin: '0 8px 0 4px' }}>{typeLabel}</Tag>
                        {CARD_SIGNUP_URLS[acc.organization] && (
                          <a
                            href={CARD_SIGNUP_URLS[acc.organization]}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 11, color: '#999' }}
                          >
                            홈페이지
                          </a>
                        )}
                      </div>
                    </Col>
                    <Col flex="auto">
                      <Row gutter={8}>
                        <Col flex="1">
                          <Input
                            size="small"
                            placeholder="로그인 ID"
                            value={acc.login_id || ''}
                            autoComplete="off"
                            onChange={(e) => updateAccountField(acc.organization, acc.client_type, 'login_id', e.target.value)}
                          />
                        </Col>
                        <Col flex="1">
                          <Input.Password
                            size="small"
                            placeholder="비밀번호"
                            value={accountPasswords[key] || ''}
                            autoComplete="new-password"
                            onChange={(e) => setAccountPasswords(prev => ({
                              ...prev, [key]: e.target.value,
                            }))}
                          />
                        </Col>
                        <Col>
                          <Button
                            size="small"
                            type={acc.is_connected ? 'default' : 'primary'}
                            loading={isRegistering}
                            onClick={() => handleRegisterOrg(acc.organization, acc.client_type)}
                          >
                            {acc.is_connected ? '재연동' : '연동'}
                          </Button>
                        </Col>
                        <Col>
                          <Popconfirm
                            title={`${acc.organization_name} (${typeLabel}) 계정을 해제하시겠습니까?`}
                            onConfirm={() => handleDeleteAccount(acc.organization, acc.client_type)}
                            okText="해제"
                            cancelText="취소"
                          >
                            <Tooltip title="연동 해제">
                              <Button size="small" danger icon={<DisconnectOutlined />} />
                            </Tooltip>
                          </Popconfirm>
                        </Col>
                      </Row>
                      {isHyundai && (
                        <Row gutter={8} style={{ marginTop: 6 }}>
                          <Col flex="1">
                            <Input
                              size="small"
                              placeholder="카드번호 (필수)"
                              value={acc.card_no || ''}
                              autoComplete="off"
                              onChange={(e) => updateAccountField(acc.organization, acc.client_type, 'card_no', e.target.value)}
                            />
                          </Col>
                          <Col flex="1">
                            <Input.Password
                              size="small"
                              placeholder="카드 비밀번호"
                              value={accountCardPasswords[key] || ''}
                              autoComplete="new-password"
                              onChange={(e) => setAccountCardPasswords(prev => ({
                                ...prev, [key]: e.target.value,
                              }))}
                            />
                          </Col>
                          <Col><div style={{ width: 86 }} /></Col>
                        </Row>
                      )}
                    </Col>
                  </Row>
                </div>
              );
            })}
          </div>
          <div style={{ color: '#999', fontSize: 12, marginTop: 12 }}>
            * 로그인 ID는 자동 저장됩니다. 비밀번호는 보안상 저장되지 않습니다.<br />
            * 현대카드는 카드번호/비밀번호가 추가로 필요합니다.<br />
            * 비밀번호는 RSA 암호화 후 CODEF에 전달됩니다.
          </div>
        </Spin>
      </Modal>

      {/* 상세 모달 */}
      <Modal
        title={
          <Space>
            <CreditCardOutlined />
            <span>카드 이용 내역 상세</span>
          </Space>
        }
        open={detailModalVisible}
        onCancel={() => { setDetailModalVisible(false); setSelectedTransaction(null); }}
        footer={null}
        width={640}
      >
        {selectedTransaction && (() => {
          const tx = selectedTransaction;
          return (
            <div style={{ marginTop: 16 }}>
              <Descriptions
                column={2}
                size="small"
                bordered
                labelStyle={{ width: 110, padding: '8px 12px', background: '#fafafa', fontWeight: 500 }}
                contentStyle={{ padding: '8px 12px' }}
              >
                <Descriptions.Item label="사용일시">
                  {dayjs(tx.used_date).format('YYYY-MM-DD')}
                  {tx.used_time && ` ${tx.used_time.slice(0, 2)}:${tx.used_time.slice(2, 4)}`}
                </Descriptions.Item>
                <Descriptions.Item label="카드사">
                  {ORGANIZATION_MAP[tx.organization] || tx.organization}
                  {' '}
                  <Tag color={tx.client_type === 'B' ? 'orange' : 'blue'} style={{ marginLeft: 4 }}>
                    {tx.client_type === 'B' ? '법인' : '개인'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="카드명">{tx.card_name || '-'}</Descriptions.Item>
                <Descriptions.Item label="카드번호">{tx.card_no || '-'}</Descriptions.Item>
                {tx.owner_name && (
                  <Descriptions.Item label="소유자" span={2}>{tx.owner_name}</Descriptions.Item>
                )}
              </Descriptions>

              <Descriptions
                column={2}
                size="small"
                bordered
                style={{ marginTop: 12 }}
                labelStyle={{ width: 110, padding: '8px 12px', background: '#fafafa', fontWeight: 500 }}
                contentStyle={{ padding: '8px 12px' }}
              >
                <Descriptions.Item label="이용금액">
                  <span style={{ fontWeight: 600, color: '#1890ff', fontSize: 14 }}>
                    {formatAmount(tx.used_amount)}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="상태">
                  <Tag color={tx.cancel_status === 'normal' ? 'green' : 'red'}>
                    {CANCEL_STATUS_MAP[tx.cancel_status] || tx.cancel_status}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="결제방법">
                  {PAYMENT_TYPE_MAP[tx.payment_type || ''] || tx.payment_type || '-'}
                  {tx.installment_month ? ` (${tx.installment_month}개월)` : ''}
                </Descriptions.Item>
                <Descriptions.Item label="승인번호">{tx.approval_no || '-'}</Descriptions.Item>
                {tx.cancel_amount != null && tx.cancel_amount > 0 && (
                  <Descriptions.Item label="취소금액">
                    <span style={{ color: '#ff4d4f' }}>{formatAmount(tx.cancel_amount)}</span>
                  </Descriptions.Item>
                )}
                {tx.payment_due_date && (
                  <Descriptions.Item label="결제예정일">{tx.payment_due_date}</Descriptions.Item>
                )}
                <Descriptions.Item label="국내/해외">{tx.is_domestic ? '국내' : `해외 (${tx.currency_code || ''})`}</Descriptions.Item>
                {!tx.is_domestic && tx.krw_amount != null && (
                  <Descriptions.Item label="원화금액">{formatAmount(tx.krw_amount)}</Descriptions.Item>
                )}
              </Descriptions>

              <Descriptions
                column={2}
                size="small"
                bordered
                style={{ marginTop: 12 }}
                labelStyle={{ width: 110, padding: '8px 12px', background: '#fafafa', fontWeight: 500 }}
                contentStyle={{ padding: '8px 12px' }}
              >
                <Descriptions.Item label="가맹점명" span={2}>{tx.merchant_name || '-'}</Descriptions.Item>
                {tx.merchant_corp_no && (
                  <Descriptions.Item label="사업자번호">{tx.merchant_corp_no}</Descriptions.Item>
                )}
                {tx.merchant_type && (
                  <Descriptions.Item label="업종">{tx.merchant_type}</Descriptions.Item>
                )}
                {tx.merchant_tel && (
                  <Descriptions.Item label="전화번호" span={tx.merchant_corp_no && tx.merchant_type ? 2 : 1}>{tx.merchant_tel}</Descriptions.Item>
                )}
                {tx.merchant_addr && (
                  <Descriptions.Item label="주소" span={2}>{tx.merchant_addr}</Descriptions.Item>
                )}
              </Descriptions>

              <div style={{ marginTop: 12, textAlign: 'right', color: '#999', fontSize: 12 }}>
                조회일자: {tx.synced_at ? dayjs(tx.synced_at).format('YYYY-MM-DD HH:mm') : '-'}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default CardTransactionListPage;
