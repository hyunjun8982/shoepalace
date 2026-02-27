import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Switch, App, Spin, Descriptions, Tag } from 'antd';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import { cardTransactionService } from '../../services/cardTransaction';
import { CodefSetting } from '../../types/cardTransaction';

const SETTING_LABELS: Record<string, string> = {
  client_id: 'Client ID',
  client_secret: 'Client Secret',
  public_key: 'RSA Public Key',
  use_demo: 'DEMO 서버 사용',
};

const CodefSettingsPage: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<CodefSetting[]>([]);
  const [apiUsage, setApiUsage] = useState<{ daily_count: number; daily_limit: number; remaining: number; last_call_at: string | null } | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await cardTransactionService.getSettings();
      setSettings(res.items);
      const values: Record<string, any> = {};
      for (const s of res.items) {
        if (s.setting_key === 'use_demo') {
          values[s.setting_key] = s.setting_value === 'true';
        } else if (s.setting_key === 'connected_id') {
          // connected_id는 사용자별 관리로 이동했으므로 표시만
          continue;
        } else {
          values[s.setting_key] = s.setting_value;
        }
      }
      form.setFieldsValue(values);
    } catch {
      message.error('설정 조회 실패');
    } finally {
      setLoading(false);
    }
  };

  const loadApiUsage = async () => {
    try {
      const res = await cardTransactionService.getApiUsage();
      setApiUsage(res);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadSettings();
    loadApiUsage();
  }, []);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const payload: Record<string, string> = {};
      for (const [key, val] of Object.entries(values)) {
        if (key === 'use_demo') {
          payload[key] = val ? 'true' : 'false';
        } else {
          payload[key] = val as string;
        }
      }

      await cardTransactionService.updateSettings(payload);
      message.success('설정이 저장되었습니다');
      loadSettings();
    } catch {
      message.error('설정 저장 실패');
    } finally {
      setSaving(false);
    }
  };

  // connected_id를 제외한 설정만 표시
  const displaySettings = settings.filter(s => s.setting_key !== 'connected_id');

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <Card
        title="CODEF API 설정"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => { loadSettings(); loadApiUsage(); }}>
            새로고침
          </Button>
        }
      >
        <Spin spinning={loading}>
          <Form form={form} layout="vertical">
            {displaySettings.map(s => {
              const label = SETTING_LABELS[s.setting_key] || s.setting_key;

              if (s.setting_key === 'use_demo') {
                return (
                  <Form.Item key={s.setting_key} name={s.setting_key} label={label} valuePropName="checked">
                    <Switch checkedChildren="DEMO" unCheckedChildren="운영" />
                  </Form.Item>
                );
              }

              return (
                <Form.Item key={s.setting_key} name={s.setting_key} label={label}>
                  <Input.TextArea
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    placeholder={s.description || ''}
                  />
                </Form.Item>
              );
            })}

            <Form.Item>
              <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
                저장
              </Button>
            </Form.Item>
          </Form>
        </Spin>
      </Card>

      {apiUsage && (
        <Card title="API 호출 현황" style={{ marginTop: 16 }}>
          <Descriptions column={2} size="small">
            <Descriptions.Item label="오늘 호출">
              {apiUsage.daily_count}회
            </Descriptions.Item>
            <Descriptions.Item label="일일 한도">
              {apiUsage.daily_limit}회
            </Descriptions.Item>
            <Descriptions.Item label="남은 횟수">
              <Tag color={apiUsage.remaining > 20 ? 'green' : apiUsage.remaining > 0 ? 'orange' : 'red'}>
                {apiUsage.remaining}회
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="마지막 호출">
              {apiUsage.last_call_at
                ? new Date(apiUsage.last_call_at).toLocaleString('ko-KR')
                : '-'}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </div>
  );
};

export default CodefSettingsPage;
