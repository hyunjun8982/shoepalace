import React, { useState, useEffect, useRef } from 'react';
import { Input, Spin, message } from 'antd';
import { BarcodeOutlined } from '@ant-design/icons';
import { barcodeService, BarcodeSearchResult } from '../services/barcode';

interface BarcodeInputProps {
  onBarcodeFound: (result: BarcodeSearchResult) => void;
  onBarcodeNotFound?: (barcode: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const BarcodeInput: React.FC<BarcodeInputProps> = ({
  onBarcodeFound,
  onBarcodeNotFound,
  placeholder = '바코드 스캔 또는 검색...',
  disabled = false,
}) => {
  const [barcode, setBarcode] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<any>(null);
  const barcodeBufferRef = useRef('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 포커스 효과 (마운트 시 자동 포커스)
  useEffect(() => {
    if (inputRef.current && !disabled) {
      inputRef.current.focus();
    }
  }, [disabled]);

  // 바코드 검색
  const handleBarcodeSearch = async (barcodeValue: string) => {
    if (!barcodeValue) return;

    setLoading(true);
    try {
      const result = await barcodeService.searchByBarcode(barcodeValue);
      // 성공 메시지 제거 (onBarcodeFound에서 처리)
      onBarcodeFound(result);
      setBarcode('');
    } catch (error: any) {
      if (error.message.includes('등록되지 않았습니다')) {
        // 미등록 바코드
        if (onBarcodeNotFound) {
          onBarcodeNotFound(barcodeValue);
        }
      } else {
        message.error(error.message || '바코드 검색에 실패했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  // 수동 입력 후 Enter 키
  const handleInputChange = (value: string) => {
    setBarcode(value);
  };

  const handleInputPressEnter = async () => {
    if (barcode) {
      await handleBarcodeSearch(barcode);
    }
  };

  // 복사-붙여넣기 지원
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text').trim();
    if (pastedText) {
      setBarcode(pastedText);
      setTimeout(() => handleBarcodeSearch(pastedText), 0);
    }
  };

  return (
    <Input
      ref={inputRef}
      prefix={<BarcodeOutlined />}
      placeholder={placeholder}
      value={barcode}
      onChange={(e) => handleInputChange(e.target.value)}
      onPressEnter={handleInputPressEnter}
      onPaste={handlePaste}
      disabled={disabled || loading}
      suffix={loading && <Spin size="small" />}
      allowClear
      size="large"
      style={{ fontSize: '16px' }}
    />
  );
};
