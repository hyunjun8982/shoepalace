import React, { useRef } from 'react';
import { Modal, Button, message } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { Purchase } from '../types/purchase';

interface DeliveryNoteModalProps {
  visible: boolean;
  purchases: Purchase[];
  onClose: () => void;
}

export const DeliveryNoteModal: React.FC<DeliveryNoteModalProps> = ({
  visible,
  purchases,
  onClose,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printWindow = window.open('', '', 'width=900,height=600');
    if (printWindow && contentRef.current) {
      printWindow.document.write(contentRef.current.innerHTML);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handlePrintAndSave = () => {
    const printWindow = window.open('', '', 'width=900,height=600');
    if (printWindow && contentRef.current) {
      printWindow.document.write(contentRef.current.innerHTML);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 100);
      message.info('인쇄 또는 "다른 이름으로 저장"에서 PDF로 저장하세요');
    }
  };

  const calculateTotal = () => {
    return purchases.reduce((sum, p) => {
      const itemTotal = p.items?.reduce((itemSum, item) => {
        return itemSum + (item.purchase_price * item.quantity);
      }, 0) || 0;
      return sum + itemTotal;
    }, 0);
  };

  const calculateTotalQuantity = () => {
    return purchases.reduce((sum, p) => {
      const qty = p.items?.reduce((itemSum, item) => itemSum + item.quantity, 0) || 0;
      return sum + qty;
    }, 0);
  };

  return (
    <Modal
      title="입고명세서 추출"
      open={visible}
      onCancel={onClose}
      width={900}
      footer={[
        <Button key="close" onClick={onClose}>
          닫기
        </Button>,
        <Button
          key="print"
          type="primary"
          icon={<PrinterOutlined />}
          onClick={handlePrintAndSave}
          style={{ backgroundColor: '#1890ff' }}
        >
          인쇄 / PDF 저장
        </Button>,
      ]}
      bodyStyle={{ maxHeight: '70vh', overflow: 'auto' }}
    >
      <div
        ref={contentRef}
        style={{
          padding: '40px',
          backgroundColor: '#fff',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
        }}
      >
        {/* 헤더 */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: '0 0 10px 0' }}>
            입 고 명 세 서
          </h1>
          <div style={{ color: '#666', fontSize: '12px' }}>
            {new Date().toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })}
          </div>
        </div>

        {/* 요약 정보 */}
        <table style={{ width: '100%', marginBottom: 30, borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ padding: '8px', borderBottom: '1px solid #ccc', width: '20%' }}>
                <strong>입고 건수</strong>
              </td>
              <td style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>
                {purchases.length}건
              </td>
              <td style={{ padding: '8px', borderBottom: '1px solid #ccc', width: '20%' }}>
                <strong>총 수량</strong>
              </td>
              <td style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>
                {calculateTotalQuantity()}개
              </td>
            </tr>
            <tr>
              <td style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>
                <strong>총 입고금액</strong>
              </td>
              <td style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>
                ₩{calculateTotal().toLocaleString()}
              </td>
              <td style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>
                <strong>작성일</strong>
              </td>
              <td style={{ padding: '8px', borderBottom: '1px solid #ccc' }}>
                {new Date().toLocaleDateString('ko-KR')}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 상세 항목 */}
        {purchases.map((purchase, purchaseIndex) => (
          <div key={purchase.id} style={{ marginBottom: 30 }}>
            {/* 구매 정보 헤더 */}
            <div
              style={{
                backgroundColor: '#f5f5f5',
                padding: '12px',
                marginBottom: 12,
                borderLeft: '4px solid #1890ff',
              }}
            >
              <div>
                <strong>구매 거래번호: {purchase.transaction_no}</strong>
                <span style={{ marginLeft: 20, color: '#666' }}>
                  입고일: {new Date(purchase.purchase_date).toLocaleDateString('ko-KR')}
                </span>
                {purchase.supplier && (
                  <span style={{ marginLeft: 20, color: '#666' }}>
                    공급자: {purchase.supplier}
                  </span>
                )}
              </div>
            </div>

            {/* 상품 항목 테이블 */}
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                marginBottom: 20,
                border: '1px solid #ddd',
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9' }}>
                  <th
                    style={{
                      padding: '12px',
                      textAlign: 'left',
                      borderBottom: '2px solid #ddd',
                      width: '40%',
                    }}
                  >
                    상품명
                  </th>
                  <th
                    style={{
                      padding: '12px',
                      textAlign: 'center',
                      borderBottom: '2px solid #ddd',
                      width: '15%',
                    }}
                  >
                    사이즈
                  </th>
                  <th
                    style={{
                      padding: '12px',
                      textAlign: 'center',
                      borderBottom: '2px solid #ddd',
                      width: '12%',
                    }}
                  >
                    수량
                  </th>
                  <th
                    style={{
                      padding: '12px',
                      textAlign: 'right',
                      borderBottom: '2px solid #ddd',
                      width: '18%',
                    }}
                  >
                    구매가
                  </th>
                  <th
                    style={{
                      padding: '12px',
                      textAlign: 'right',
                      borderBottom: '2px solid #ddd',
                      width: '15%',
                    }}
                  >
                    합계
                  </th>
                </tr>
              </thead>
              <tbody>
                {purchase.items && purchase.items.length > 0 ? (
                  <>
                    {purchase.items.map((item, itemIndex) => (
                      <tr key={itemIndex} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '10px' }}>
                          {item.product?.product_name || '-'}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          {item.size || '-'}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          {item.quantity}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>
                          ₩{item.purchase_price.toLocaleString()}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>
                          ₩{(item.purchase_price * item.quantity).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ backgroundColor: '#fafafa', fontWeight: 'bold' }}>
                      <td colSpan={2} style={{ padding: '10px', textAlign: 'right' }}>
                        소계
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        {purchase.items.reduce((sum, item) => sum + item.quantity, 0)}
                      </td>
                      <td colSpan={2} style={{ padding: '10px', textAlign: 'right' }}>
                        ₩
                        {purchase.items
                          .reduce((sum, item) => sum + item.purchase_price * item.quantity, 0)
                          .toLocaleString()}
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                      상품 항목이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ))}

        {/* 최종 합계 */}
        <div
          style={{
            marginTop: 40,
            padding: '20px',
            backgroundColor: '#f0f0f0',
            borderRadius: '4px',
            textAlign: 'right',
          }}
        >
          <div style={{ marginBottom: 10 }}>
            <strong>총 입고 금액: ₩{calculateTotal().toLocaleString()}</strong>
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            본 명세서는 입고 확인용 문서입니다.
          </div>
        </div>
      </div>
    </Modal>
  );
};
