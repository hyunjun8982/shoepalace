import React, { useState, useEffect } from 'react';
import {
  Card,
  Select,
  Button,
  Descriptions,
  Space,
  message,
  Row,
  Col,
  Statistic,
  Divider,
  Tag,
  Alert,
} from 'antd';
import {
  ReloadOutlined,
  GiftOutlined,
  UserOutlined,
  BarcodeOutlined,
  CalendarOutlined,
  PhoneOutlined,
} from '@ant-design/icons';
import { adidasAccountService } from '../../services/adidasAccount';
import { AdidasAccount, AdidasAccountInfo, CouponStatus } from '../../types/adidasAccount';

const { Option } = Select;

const AdidasCouponPage: React.FC = () => {
  const [accounts, setAccounts] = useState<AdidasAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [accountInfo, setAccountInfo] = useState<AdidasAccountInfo | null>(null);
  const [couponStatus, setCouponStatus] = useState<CouponStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingInfo, setFetchingInfo] = useState(false);
  const [checkingCoupons, setCheckingCoupons] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await adidasAccountService.getAccounts();
      setAccounts(data.filter(acc => acc.is_active));
    } catch (error) {
      message.error('계정 목록을 불러오는데 실패했습니다');
    }
  };

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
    setAccountInfo(null);
    setCouponStatus(null);
  };

  const handleFetchInfo = async () => {
    if (!selectedAccountId) {
      message.warning('계정을 선택하세요');
      return;
    }

    setFetchingInfo(true);
    try {
      const info = await adidasAccountService.fetchAccountInfo(selectedAccountId);
      setAccountInfo(info);
      message.success('계정 정보를 가져왔습니다');
    } catch (error) {
      message.error('계정 정보를 가져오는데 실패했습니다');
    } finally {
      setFetchingInfo(false);
    }
  };

  const handleCheckCoupons = async () => {
    if (!selectedAccountId) {
      message.warning('계정을 선택하세요');
      return;
    }

    setCheckingCoupons(true);
    try {
      const status = await adidasAccountService.checkCoupons(selectedAccountId);
      setCouponStatus(status);
      message.success('쿠폰 현황을 조회했습니다');
    } catch (error) {
      message.error('쿠폰 조회에 실패했습니다');
    } finally {
      setCheckingCoupons(false);
    }
  };

  const handleIssueCoupon = async (couponType: string) => {
    if (!selectedAccountId) {
      message.warning('계정을 선택하세요');
      return;
    }

    setLoading(true);
    try {
      await adidasAccountService.issueCoupon(selectedAccountId, couponType);
      message.success(`${couponType} 쿠폰 발급이 완료되었습니다`);
      // 쿠폰 현황 재조회
      handleCheckCoupons();
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || '쿠폰 발급에 실패했습니다';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const selectedAccount = accounts.find(acc => acc.id === selectedAccountId);

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={[24, 24]}>
        {/* 좌측: 계정 선택 및 기본 정보 */}
        <Col xs={24} lg={10}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* 계정 선택 */}
            <Card title="🏃 아디다스 계정 선택">
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Select
                  showSearch
                  style={{ width: '100%' }}
                  placeholder="계정을 선택하세요"
                  optionFilterProp="children"
                  onChange={handleAccountChange}
                  value={selectedAccountId || undefined}
                  size="large"
                >
                  {accounts.map(account => (
                    <Option key={account.id} value={account.id}>
                      {account.email} {account.name && `(${account.name})`}
                    </Option>
                  ))}
                </Select>

                {selectedAccount && (
                  <Alert
                    message="선택된 계정"
                    description={
                      <div>
                        <div><strong>이메일:</strong> {selectedAccount.email}</div>
                        {selectedAccount.name && <div><strong>이름:</strong> {selectedAccount.name}</div>}
                        {selectedAccount.memo && <div><strong>메모:</strong> {selectedAccount.memo}</div>}
                      </div>
                    }
                    type="info"
                    showIcon
                  />
                )}
              </Space>
            </Card>

            {/* 기본 정보 조회 */}
            <Card
              title="📋 기본 정보"
              extra={
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  onClick={handleFetchInfo}
                  loading={fetchingInfo}
                  disabled={!selectedAccountId}
                >
                  정보 가져오기
                </Button>
              }
            >
              {accountInfo ? (
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label={<><UserOutlined /> 이메일</>}>
                    {accountInfo.email}
                  </Descriptions.Item>
                  <Descriptions.Item label={<><UserOutlined /> 이름</>}>
                    {accountInfo.name || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={<><CalendarOutlined /> 생일</>}>
                    {accountInfo.birthday || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={<><BarcodeOutlined /> ADIKR 바코드</>}>
                    {accountInfo.adikr_barcode || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={<><PhoneOutlined /> 전화번호</>}>
                    {accountInfo.phone || '-'}
                  </Descriptions.Item>
                </Descriptions>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
                  계정을 선택하고 "정보 가져오기" 버튼을 클릭하세요
                </div>
              )}
            </Card>
          </Space>
        </Col>

        {/* 우측: 쿠폰 관리 */}
        <Col xs={24} lg={14}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* 쿠폰 보유 현황 */}
            <Card
              title="🎁 쿠폰 보유 현황"
              extra={
                <Button
                  icon={<ReloadOutlined />}
                  onClick={handleCheckCoupons}
                  loading={checkingCoupons}
                  disabled={!selectedAccountId}
                >
                  조회
                </Button>
              }
            >
              {couponStatus ? (
                <>
                  <Row gutter={16}>
                    <Col span={6}>
                      <Statistic
                        title="15% 할인"
                        value={couponStatus.discount_15}
                        suffix="개"
                        valueStyle={{ color: '#3f8600' }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="20% 할인"
                        value={couponStatus.discount_20}
                        suffix="개"
                        valueStyle={{ color: '#cf1322' }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="10만원 쿠폰"
                        value={couponStatus.amount_100k}
                        suffix="개"
                        valueStyle={{ color: '#1890ff' }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="5만원 쿠폰"
                        value={couponStatus.amount_50k}
                        suffix="개"
                        valueStyle={{ color: '#faad14' }}
                      />
                    </Col>
                  </Row>
                  <Divider />
                  <Row>
                    <Col span={24}>
                      <Statistic
                        title="총 보유 쿠폰"
                        value={couponStatus.total_coupons}
                        suffix="개"
                        valueStyle={{ fontSize: 24, fontWeight: 'bold' }}
                      />
                    </Col>
                  </Row>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
                  계정을 선택하고 "조회" 버튼을 클릭하세요
                </div>
              )}
            </Card>

            {/* 쿠폰 발급 */}
            <Card title="💳 쿠폰 발급">
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Alert
                  message="쿠폰 발급 안내"
                  description="아래 버튼을 클릭하면 해당 쿠폰이 자동으로 발급됩니다. 쿠폰 발급 조건을 만족하는지 확인하세요."
                  type="info"
                  showIcon
                />

                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Card
                      hoverable
                      style={{ borderRadius: 8, border: '2px solid #1890ff' }}
                      bodyStyle={{ padding: '20px', textAlign: 'center' }}
                      onClick={() => handleIssueCoupon('100k')}
                    >
                      <GiftOutlined style={{ fontSize: 32, color: '#1890ff', marginBottom: 8 }} />
                      <div style={{ fontSize: 16, fontWeight: 'bold', color: '#1890ff' }}>
                        10만원 쿠폰
                      </div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                        클릭하여 발급
                      </div>
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card
                      hoverable
                      style={{ borderRadius: 8, border: '2px solid #faad14' }}
                      bodyStyle={{ padding: '20px', textAlign: 'center' }}
                      onClick={() => handleIssueCoupon('50k')}
                    >
                      <GiftOutlined style={{ fontSize: 32, color: '#faad14', marginBottom: 8 }} />
                      <div style={{ fontSize: 16, fontWeight: 'bold', color: '#faad14' }}>
                        5만원 쿠폰
                      </div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                        클릭하여 발급
                      </div>
                    </Card>
                  </Col>
                </Row>
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
};

export default AdidasCouponPage;
