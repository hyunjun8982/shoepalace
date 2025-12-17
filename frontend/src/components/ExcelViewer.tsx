import React, { useState, useEffect } from 'react';
import { Spin, Alert, Modal, Button } from 'antd';
import { ExpandOutlined } from '@ant-design/icons';
import api from '../services/api';

interface ExcelViewerProps {
  saleId: string;
  type: 'transaction-statement' | 'tax-invoice';
}

interface CellInfo {
  value: any;
  row: number;
  col: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  backgroundColor?: string;
  align?: string;
  valign?: string;
  borders?: {
    top?: boolean;
    bottom?: boolean;
    left?: boolean;
    right?: boolean;
  };
}

interface MergedCell {
  min_row: number;
  max_row: number;
  min_col: number;
  max_col: number;
}

interface PreviewData {
  type: 'simple' | 'styled';
  columns?: string[];
  data?: any[][];
  merged_cells?: MergedCell[];
  total_rows: number;
  total_cols?: number;
  file_name: string;
}

const ExcelViewer: React.FC<ExcelViewerProps> = ({ saleId, type }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

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

  // 간단한 CSV 형식 렌더링
  if (previewData.type === 'simple' && previewData.columns && previewData.data) {
    return (
      <div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '14px'
          }}>
            <thead>
              <tr>
                {previewData.columns.map((col, idx) => (
                  <th key={idx} style={{
                    border: '1px solid #d9d9d9',
                    padding: '8px',
                    backgroundColor: '#fafafa',
                    fontWeight: 'bold',
                    textAlign: 'left'
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewData.data.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} style={{
                      border: '1px solid #d9d9d9',
                      padding: '8px'
                    }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 스타일이 있는 Excel 형식 렌더링
  if (previewData.type === 'styled' && previewData.data) {
    const isMerged = (row: number, col: number): MergedCell | null => {
      if (!previewData.merged_cells) return null;

      for (const merge of previewData.merged_cells) {
        if (row >= merge.min_row && row <= merge.max_row &&
            col >= merge.min_col && col <= merge.max_col) {
          return merge;
        }
      }
      return null;
    };

    const shouldRenderCell = (row: number, col: number): boolean => {
      const merge = isMerged(row, col);
      if (!merge) return true;
      return row === merge.min_row && col === merge.min_col;
    };

    const getCellSpan = (row: number, col: number): { rowSpan: number; colSpan: number } => {
      const merge = isMerged(row, col);
      if (!merge || (row !== merge.min_row || col !== merge.min_col)) {
        return { rowSpan: 1, colSpan: 1 };
      }
      return {
        rowSpan: merge.max_row - merge.min_row + 1,
        colSpan: merge.max_col - merge.min_col + 1
      };
    };

    const renderTable = (scaled: boolean = true) => (
      <div style={{
        overflowX: 'auto',
        overflowY: 'auto',
        maxHeight: scaled ? '400px' : 'none',
        border: scaled ? '1px solid #d9d9d9' : 'none',
        borderRadius: scaled ? '4px' : '0',
        padding: scaled ? '8px' : '0'
      }}>
        <div style={{
          transform: scaled ? 'scale(0.7)' : 'scale(1)',
          transformOrigin: 'top left',
          width: scaled ? '142.86%' : '100%'
        }}>
          <table style={{
            borderCollapse: 'collapse',
            fontSize: '13px',
            fontFamily: 'Calibri, Arial, sans-serif'
          }}>
            <tbody>
              {previewData.data!.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {row.map((cell, colIdx) => {
                    if (!shouldRenderCell(rowIdx + 1, colIdx + 1)) {
                      return null;
                    }

                    const { rowSpan, colSpan } = getCellSpan(rowIdx + 1, colIdx + 1);

                    const cellStyle: React.CSSProperties = {
                      border: '1px solid #d0d0d0',
                      padding: '4px 8px',
                      minWidth: '60px',
                      verticalAlign: cell.valign || 'middle',
                      textAlign: (cell.align || 'left') as any,
                      fontWeight: cell.bold ? 'bold' : 'normal',
                      fontStyle: cell.italic ? 'italic' : 'normal',
                      color: cell.color || '#000000',
                      backgroundColor: cell.backgroundColor || '#ffffff',
                      whiteSpace: 'nowrap'
                    };

                    // 테두리 스타일 적용
                    if (cell.borders) {
                      if (cell.borders.top) cellStyle.borderTop = '1px solid #000';
                      if (cell.borders.bottom) cellStyle.borderBottom = '1px solid #000';
                      if (cell.borders.left) cellStyle.borderLeft = '1px solid #000';
                      if (cell.borders.right) cellStyle.borderRight = '1px solid #000';
                    }

                    return (
                      <td
                        key={colIdx}
                        rowSpan={rowSpan}
                        colSpan={colSpan}
                        style={cellStyle}
                      >
                        {cell.value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );

    return (
      <div>
        <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setIsModalVisible(true)}>
          {renderTable(true)}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '4px',
            pointerEvents: 'none',
            opacity: 0,
            transition: 'opacity 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}>
            <ExpandOutlined /> 크게 보기
          </div>
        </div>

        <Modal
          title="거래명세서 미리보기"
          open={isModalVisible}
          onCancel={() => setIsModalVisible(false)}
          footer={null}
          width="90%"
          style={{ top: 20 }}
        >
          <div style={{ maxHeight: '80vh', overflowY: 'auto' }}>
            {renderTable(false)}
          </div>
        </Modal>
      </div>
    );
  }

  return <Alert message="지원하지 않는 파일 형식입니다." type="warning" />;
};

export default ExcelViewer;