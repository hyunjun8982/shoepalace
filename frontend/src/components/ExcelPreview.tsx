import React, { useState, useEffect } from 'react';
import { Table, Spin, Alert, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import api from '../services/api';

const { Title } = Typography;

interface ExcelPreviewProps {
  saleId: string;
  type: 'transaction-statement' | 'tax-invoice';
}

interface PreviewData {
  columns: string[];
  data: any[][];
  total_rows: number;
  file_name: string;
}

const ExcelPreview: React.FC<ExcelPreviewProps> = ({ saleId, type }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);

  useEffect(() => {
    fetchPreviewData();
  }, [saleId, type]);

  const fetchPreviewData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get(`/sales/${saleId}/transaction-statement-preview`);
      setPreviewData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || '파일을 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 20 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return <Alert message="오류" description={error} type="error" />;
  }

  if (!previewData) {
    return <Alert message="데이터가 없습니다." type="info" />;
  }

  // Ant Design Table 컬럼 생성
  const columns: ColumnsType<any> = previewData.columns.map((col, index) => ({
    title: col,
    dataIndex: index.toString(),
    key: index.toString(),
    ellipsis: true,
    width: 150,
  }));

  // 데이터 변환 (배열을 객체로)
  const dataSource = previewData.data.map((row, rowIndex) => {
    const rowData: any = { key: rowIndex };
    row.forEach((cell, cellIndex) => {
      rowData[cellIndex.toString()] = cell;
    });
    return rowData;
  });

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Typography.Text type="secondary">
          파일명: {previewData.file_name} | 총 {previewData.total_rows}행 (최대 100행 표시)
        </Typography.Text>
      </div>
      <Table
        columns={columns}
        dataSource={dataSource}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showTotal: (total) => `총 ${total}개`,
        }}
        scroll={{ x: 'max-content' }}
        size="small"
        bordered
      />
    </div>
  );
};

export default ExcelPreview;