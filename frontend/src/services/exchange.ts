// 간단한 환율 변환 서비스
// 실제 환경에서는 외부 API나 정확한 환율 데이터를 사용해야 합니다.

export interface ExchangeRates {
  [currency: string]: number;
}

// 고정 환율 (실제로는 API에서 가져와야 함)
const FIXED_RATES: ExchangeRates = {
  USD: 1350, // 1 USD = 1350 KRW
  EUR: 1450, // 1 EUR = 1450 KRW
  JPY: 9.5,  // 1 JPY = 9.5 KRW
  CNY: 185,  // 1 CNY = 185 KRW
};

export class ExchangeService {
  static convertToKRW(amount: number, currency: string): number {
    if (currency === 'KRW') return amount;

    const rate = FIXED_RATES[currency];
    if (!rate) {
      console.warn(`환율 정보가 없습니다: ${currency}`);
      return amount;
    }

    return Math.round(amount * rate);
  }

  static getExchangeRate(currency: string): number {
    return FIXED_RATES[currency] || 1;
  }

  static getSupportedCurrencies(): string[] {
    return Object.keys(FIXED_RATES);
  }

  static formatCurrency(amount: number, currency: string): string {
    const formatters: { [key: string]: Intl.NumberFormat } = {
      USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
      EUR: new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }),
      JPY: new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }),
      CNY: new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }),
      KRW: new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }),
    };

    const formatter = formatters[currency];
    return formatter ? formatter.format(amount) : `${amount} ${currency}`;
  }
}

// 정적 메서드만 사용하므로 인스턴스는 불필요