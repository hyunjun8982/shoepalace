import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Card, Button, Row, Col, Select, DatePicker, Input, Modal, App, Space,
  Descriptions, Form, Spin, Badge, Popconfirm, Tooltip, Tag, Checkbox,
} from 'antd';
import {
  BankOutlined, SearchOutlined, ReloadOutlined, PlusOutlined, DeleteOutlined,
  DisconnectOutlined, LinkOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { bankTransactionService } from '../../services/bankTransaction';
import { cardTransactionService } from '../../services/cardTransaction';
import { BankTransaction, BANK_ORGANIZATION_MAP, BANK_SIGNUP_URLS } from '../../types/bankTransaction';
import { useAuth } from '../../contexts/AuthContext';

const { RangePicker } = DatePicker;

const formatAmount = (amount: number): string => {
  const intAmount = Math.round(amount);
  return `${intAmount.toLocaleString()}원`;
};

const BankTransactionListPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // 데이터 상태
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<BankTransaction[]>([]);
  const [total, setTotal] = useState(0);

  // 필터 상태
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50 });
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(() => {
    const saved = localStorage.getItem('bankTxDateRange');
    if (saved) {
      try {
        const [start, end] = JSON.parse(saved);
        return [dayjs(start), dayjs(end)];
      } catch { return null; }
    }
    return null;
  });
  const [organization, setOrganization] = useState<string | undefined>(undefined);
  const [accountNo, setAccountNo] = useState<string | undefined>(undefined);
  const [searchText, setSearchText] = useState('');
  const [ownerName, setOwnerName] = useState<string | undefined>(undefined);
  const [ownerNameOptions, setOwnerNameOptions] = useState<string[]>([]);

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
  const [accountInfoList, setAccountInfoList] = useState<any[]>([]);
  const [accountPasswords, setAccountPasswords] = useState<Record<string, string>>({});
  const [registeringKey, setRegisteringKey] = useState<string | null>(null);
  const [addOrgValue, setAddOrgValue] = useState<string | undefined>(undefined);
  const [addClientType, setAddClientType] = useState<string>('B');

  const accKey = (org: string, ct: string) => `${org}_${ct}`;

  // 상세 모달
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<BankTransaction | null>(null);

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
      if (accountNo) params.account_no = accountNo;
      if (searchText) params.search = searchText;
      if (ownerName) params.owner_name = ownerName;

      const txResponse = await bankTransactionService.getTransactions(params);
      setItems(txResponse.items);
      setTotal(txResponse.total);
    } catch (error: any) {
      message.error('거래내역 조회 실패: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  }, [pagination, dateRange, organization, accountNo, searchText, ownerName, message]);

  // 초기 로딩 시 계정 정보 + 소유자 목록 수집
  useEffect(() => {
    const loadInitData = async () => {
      try {
        const result = await bankTransactionService.getAccountInfo();
        setAccountInfoList(result.accounts);
        const names = new Set<string>();
        result.accounts.forEach((acc: any) => {
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

  useEffect(() => {
    if (dateRange) {
      localStorage.setItem('bankTxDateRange', JSON.stringify([
        dateRange[0].format('YYYY-MM-DD'),
        dateRange[1].format('YYYY-MM-DD'),
      ]));
    } else {
      localStorage.removeItem('bankTxDateRange');
    }
  }, [dateRange]);

  // 선택 삭제
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      setDeleteLoading(true);
      const result = await bankTransactionService.deleteTransactionsBatch(selectedRowKeys as string[]);
      message.success(result.message);
      setSelectedRowKeys([]);
      fetchData();
    } catch (error: any) {
      message.error('삭제 실패: ' + (error.response?.data?.detail || error.message));
    } finally {
      setDeleteLoading(false);
    }
  };

  // 내역 조회 실행 (여러 은행 동시)
  const handleSync = async () => {
    try {
      await syncForm.validateFields();
      const values = syncForm.getFieldsValue();
      setSyncLoading(true);

      const selectedKeys: string[] = values.organizations;
      const startDate = values.syncDateRange[0].format('YYYYMMDD');
      const endDate = values.syncDateRange[1].format('YYYYMMDD');

      const results: string[] = [];
      for (const orgKey of selectedKeys) {
        const [org, ct] = orgKey.split('_');
        const acc = accountInfoList.find((a: any) => a.organization === org && a.client_type === ct);
        const accountNo = acc?.account_no;
        if (!accountNo) {
          results.push(`${BANK_ORGANIZATION_MAP[org] || org}: 실패 - 계좌번호 없음`);
          continue;
        }

        try {
          const result = await bankTransactionService.syncTransactions({
            organization: org,
            account_no: accountNo,
            start_date: startDate,
            end_date: endDate,
            client_type: ct,
          });
          results.push(`${BANK_ORGANIZATION_MAP[org] || org} (${accountNo}): ${result.message}`);
        } catch (error: any) {
          const detail = error.response?.data?.detail || error.message;
          results.push(`${BANK_ORGANIZATION_MAP[org] || org}: 실패 - ${detail}`);
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

  // 은행별 계정 정보 로드
  const loadAccountInfo = async () => {
    try {
      setAccountInfoLoading(true);
      const result = await bankTransactionService.getAccountInfo();
      setAccountInfoList(result.accounts);
    } catch {
      // 조회 실패 시 무시
    } finally {
      setAccountInfoLoading(false);
    }
  };

  const updateAccountField = (org: string, ct: string, field: 'login_id' | 'card_no' | 'account_no', value: string) => {
    setAccountInfoList(prev =>
      prev.map((acc: any) => (acc.organization === org && acc.client_type === ct) ? { ...acc, [field]: value } : acc)
    );
  };

  // 계좌번호 저장 (blur 시)
  const handleSaveAccountNo = async (org: string, ct: string, accountNo: string) => {
    try {
      await bankTransactionService.saveAccountInfo({
        organization: org,
        client_type: ct,
        account_no: accountNo,
      });
    } catch {
      // 저장 실패 무시
    }
  };

  const handleRegisterOrg = async (org: string, ct: string) => {
    const acc = accountInfoList.find((a: any) => a.organization === org && a.client_type === ct);
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
      // 카드 서비스의 register_account 재사용 (codef_accounts 공유, businessType=BK)
      const result = await cardTransactionService.registerAccount({
        organization: org,
        login_id: acc.login_id,
        password,
        client_type: ct,
        business_type: 'BK',
      });

      message.success(result.message);
      setAccountPasswords(prev => ({ ...prev, [key]: '' }));
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
    const existing = accountInfoList.find((a: any) => a.organization === addOrgValue && a.client_type === addClientType);
    if (existing) {
      message.warning('이미 등록된 은행입니다.');
      return;
    }
    setAccountInfoList(prev => [...prev, {
      organization: addOrgValue,
      organization_name: BANK_ORGANIZATION_MAP[addOrgValue] || addOrgValue,
      client_type: addClientType,
      is_connected: false,
    }]);
    setAddOrgValue(undefined);
    setAddClientType('B');
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
  const columns: ColumnsType<BankTransaction> = [
    {
      title: '거래일시',
      dataIndex: 'tr_date',
      key: 'tr_date',
      width: 140,
      render: (date: string, record) => {
        const time = record.tr_time && record.tr_time.length >= 4
          ? `${record.tr_time.slice(0, 2)}:${record.tr_time.slice(2, 4)}`
          : '';
        return `${dayjs(date).format('YYYY-MM-DD')}${time ? ` ${time}` : ''}`;
      },
    },
    {
      title: '은행',
      dataIndex: 'organization',
      key: 'organization',
      width: 100,
      render: (org: string) => BANK_ORGANIZATION_MAP[org] || org,
    },
    ...(isAdmin ? [{
      title: '소유자',
      dataIndex: 'owner_name',
      key: 'owner_name',
      width: 70,
      render: (name: string) => name || '-',
    }] : []) as ColumnsType<BankTransaction>,
    {
      title: '계좌번호',
      dataIndex: 'account_no',
      key: 'account_no',
      width: 150,
      render: (no: string) => <span style={{ fontSize: 12 }}>{no || '-'}</span>,
    },
    {
      title: '적요',
      dataIndex: 'description1',
      key: 'description1',
      width: 200,
      ellipsis: true,
      render: (desc: string) => desc || '-',
    },
    {
      title: '출금',
      dataIndex: 'tr_amount_out',
      key: 'tr_amount_out',
      width: 120,
      align: 'right',
      render: (amount: number) => amount > 0 ? (
        <span style={{ fontWeight: 600, color: '#ff4d4f' }}>
          {formatAmount(amount)}
        </span>
      ) : '-',
    },
    {
      title: '입금',
      dataIndex: 'tr_amount_in',
      key: 'tr_amount_in',
      width: 120,
      align: 'right',
      render: (amount: number) => amount > 0 ? (
        <span style={{ fontWeight: 600, color: '#1890ff' }}>
          {formatAmount(amount)}
        </span>
      ) : '-',
    },
    {
      title: '잔액',
      dataIndex: 'balance',
      key: 'balance',
      width: 130,
      align: 'right',
      render: (amount: number) => (
        <span style={{ fontWeight: 500 }}>
          {formatAmount(amount)}
        </span>
      ),
    },
    {
      title: '거래구분',
      dataIndex: 'description4',
      key: 'description4',
      width: 100,
      render: (desc: string) => desc ? <Tag>{desc}</Tag> : '-',
    },
  ];

  // 등록된 은행 옵션 (내역 조회용)
  const registeredBankOptions = accountInfoList
    .filter((a: any) => a.is_connected)
    .map((a: any) => {
      const bankName = a.organization_name || BANK_ORGANIZATION_MAP[a.organization] || a.organization;
      const typeLabel = a.client_type === 'B' ? '법인' : '개인';
      const acctNo = a.account_no ? ` ${a.account_no}` : '';
      return {
        value: `${a.organization}_${a.client_type}`,
        label: `${bankName} (${typeLabel})${acctNo}`,
        hasAccount: !!a.account_no,
      };
    });

  // 내역 조회 모달이 열릴 때 연동된 은행 전체 선택
  useEffect(() => {
    if (syncModalVisible && accountInfoList.length > 0) {
      const currentVal = syncForm.getFieldValue('organizations');
      if (!currentVal || currentVal.length === 0) {
        const allConnected = accountInfoList
          .filter((a: any) => a.is_connected && a.account_no)
          .map((a: any) => `${a.organization}_${a.client_type}`);
        if (allConnected.length > 0) {
          syncForm.setFieldsValue({ organizations: allConnected });
        }
      }
    }
  }, [syncModalVisible, accountInfoList, syncForm]);

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
              onChange={(val) => {
                setOrganization(val);
                setAccountNo(undefined); // 은행 바뀌면 계좌번호 초기화
                setPagination({ ...pagination, current: 1 });
              }}
              placeholder="은행"
              allowClear
              style={{ width: 130 }}
              options={[...new Map(
                accountInfoList.map((a: any) => [a.organization, {
                  value: a.organization,
                  label: a.organization_name || BANK_ORGANIZATION_MAP[a.organization] || a.organization,
                }])
              ).values()]}
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
            <Select
              value={accountNo}
              onChange={(val) => { setAccountNo(val); setPagination({ ...pagination, current: 1 }); }}
              placeholder="계좌번호"
              allowClear
              style={{ width: 170 }}
              options={accountInfoList
                .filter((a: any) => a.account_no && (!organization || a.organization === organization))
                .map((a: any) => ({
                  value: a.account_no,
                  label: `${a.account_no} (${a.organization_name || BANK_ORGANIZATION_MAP[a.organization] || a.organization})`,
                }))}
            />
          </Col>
          <Col>
            <Input
              placeholder="적요 검색"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={() => { setPagination({ ...pagination, current: 1 }); fetchData(); }}
              style={{ width: 170 }}
              allowClear
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
        title="은행 거래내역 조회"
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
                <span>조회할 은행</span>
                {registeredBankOptions.length > 0 && (
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, fontSize: 12 }}
                    onClick={() => {
                      const current = syncForm.getFieldValue('organizations') || [];
                      const allValues = registeredBankOptions.filter(o => o.hasAccount).map(o => o.value);
                      syncForm.setFieldsValue({
                        organizations: current.length === allValues.length ? [] : allValues,
                      });
                    }}
                  >
                    {(syncForm.getFieldValue('organizations') || []).length ===
                      registeredBankOptions.filter(o => o.hasAccount).length
                      ? '전체 해제' : '전체 선택'}
                  </Button>
                )}
              </Space>
            }
            rules={[{ required: true, message: '은행을 선택해주세요' }]}
          >
            <Checkbox.Group style={{ width: '100%' }}>
              {registeredBankOptions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '8px', color: '#999' }}>
                  등록된 은행이 없습니다. 계정 관리에서 먼저 은행을 연동해주세요.
                </div>
              ) : (
                <div>
                  {registeredBankOptions.map(opt => (
                    <div key={opt.value} style={{ marginBottom: 4 }}>
                      <Checkbox value={opt.value} disabled={!opt.hasAccount}>
                        {opt.label}
                        {!opt.hasAccount && (
                          <span style={{ color: '#ff4d4f', fontSize: 11, marginLeft: 4 }}>
                            (계좌번호 미등록)
                          </span>
                        )}
                      </Checkbox>
                    </div>
                  ))}
                </div>
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
          * 은행별 조회 가능 기간이 다릅니다.<br />
          * 계정 관리에서 연동된 은행만 선택할 수 있습니다.<br />
          * 계좌번호가 등록된 은행만 조회 가능합니다. (계정 관리에서 등록)
        </div>
      </Modal>

      {/* 계정 관리 모달 */}
      <Modal
        title="은행 계정 관리"
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
                  placeholder="은행 검색..."
                  style={{ width: '100%' }}
                  value={addOrgValue}
                  onChange={(val) => setAddOrgValue(val)}
                  showSearch
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={Object.entries(BANK_ORGANIZATION_MAP).map(([code, name]) => ({
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
                    { value: 'B', label: '법인' },
                    { value: 'P', label: '개인' },
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
                등록된 은행이 없습니다. 위에서 은행을 추가해주세요.
              </div>
            )}
            {accountInfoList.map((acc: any) => {
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 0, whiteSpace: 'nowrap', minWidth: 210 }}>
                        <Badge status={acc.is_connected ? 'success' : 'default'} />
                        <span style={{ fontWeight: 600, fontSize: 13, width: 80, marginLeft: 6 }}>{acc.organization_name}</span>
                        <Tag color={acc.client_type === 'B' ? 'orange' : 'blue'} style={{ fontSize: 11, margin: '0 8px 0 4px' }}>{typeLabel}</Tag>
                        {BANK_SIGNUP_URLS[acc.organization] && (
                          <a
                            href={BANK_SIGNUP_URLS[acc.organization]}
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
                      <Row gutter={8} style={{ marginTop: 6 }}>
                        <Col flex="auto">
                          <Input
                            size="small"
                            placeholder="계좌번호 (내역 조회 시 자동 입력됨)"
                            value={acc.account_no || ''}
                            autoComplete="off"
                            onChange={(e) => updateAccountField(acc.organization, acc.client_type, 'account_no', e.target.value)}
                            onBlur={(e) => handleSaveAccountNo(acc.organization, acc.client_type, e.target.value)}
                          />
                        </Col>
                      </Row>
                    </Col>
                  </Row>
                </div>
              );
            })}
          </div>
          <div style={{ color: '#999', fontSize: 12, marginTop: 12 }}>
            * 로그인 ID는 자동 저장됩니다. 비밀번호는 보안상 저장되지 않습니다.<br />
            * 계좌번호를 저장해두면 내역 조회 시 자동으로 채워집니다.<br />
            * 비밀번호는 RSA 암호화 후 CODEF에 전달됩니다.
          </div>
        </Spin>
      </Modal>

      {/* 상세 모달 */}
      <Modal
        title={
          <Space>
            <BankOutlined />
            <span>은행 거래내역 상세</span>
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
                <Descriptions.Item label="거래일시">
                  {dayjs(tx.tr_date).format('YYYY-MM-DD')}
                  {tx.tr_time && ` ${tx.tr_time.slice(0, 2)}:${tx.tr_time.slice(2, 4)}:${tx.tr_time.slice(4, 6)}`}
                </Descriptions.Item>
                <Descriptions.Item label="은행">
                  {BANK_ORGANIZATION_MAP[tx.organization] || tx.organization}
                </Descriptions.Item>
                <Descriptions.Item label="계좌번호">{tx.account_no || '-'}</Descriptions.Item>
                <Descriptions.Item label="계좌명">{tx.account_name || '-'}</Descriptions.Item>
                <Descriptions.Item label="예금주">{tx.account_holder || '-'}</Descriptions.Item>
                {tx.owner_name && (
                  <Descriptions.Item label="소유자">{tx.owner_name}</Descriptions.Item>
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
                <Descriptions.Item label="출금">
                  {tx.tr_amount_out > 0 ? (
                    <span style={{ fontWeight: 600, color: '#ff4d4f', fontSize: 14 }}>
                      {formatAmount(tx.tr_amount_out)}
                    </span>
                  ) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="입금">
                  {tx.tr_amount_in > 0 ? (
                    <span style={{ fontWeight: 600, color: '#1890ff', fontSize: 14 }}>
                      {formatAmount(tx.tr_amount_in)}
                    </span>
                  ) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="잔액" span={2}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {formatAmount(tx.balance)}
                  </span>
                </Descriptions.Item>
              </Descriptions>

              <Descriptions
                column={1}
                size="small"
                bordered
                style={{ marginTop: 12 }}
                labelStyle={{ width: 110, padding: '8px 12px', background: '#fafafa', fontWeight: 500 }}
                contentStyle={{ padding: '8px 12px' }}
              >
                <Descriptions.Item label="적요1 (입금처)">{tx.description1 || '-'}</Descriptions.Item>
                <Descriptions.Item label="적요2 (거래점)">{tx.description2 || '-'}</Descriptions.Item>
                <Descriptions.Item label="적요3 (메모)">{tx.description3 || '-'}</Descriptions.Item>
                <Descriptions.Item label="적요4 (구분)">{tx.description4 || '-'}</Descriptions.Item>
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

export default BankTransactionListPage;
