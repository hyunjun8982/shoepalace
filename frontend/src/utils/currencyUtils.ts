/**
 * 숫자를 한글 금액으로 변환하는 함수
 * @param amount 금액 (숫자)
 * @returns 한글 금액 문자열
 *
 * 예시:
 * - 1234 -> "일천이백삼십사"
 * - 50000000 -> "오천만"
 * - 5461131781 -> "오십사억 육천백십삼만 천칠백팔십일"
 */
export function numberToKorean(amount: number): string {
  if (amount === 0) return '영';

  const koreanNumbers = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const koreanUnits = ['', '십', '백', '천'];
  const koreanBigUnits = ['', '만', '억', '조', '경'];

  // 소수점 제거 (원 단위까지만)
  const intAmount = Math.round(amount);

  if (intAmount === 0) return '영';

  let result = '';
  let unitIndex = 0;
  let tempAmount = intAmount;

  while (tempAmount > 0) {
    const part = tempAmount % 10000;
    if (part > 0) {
      let partStr = '';

      // 천의 자리
      const thousand = Math.floor(part / 1000);
      if (thousand > 0) {
        if (thousand > 1) partStr += koreanNumbers[thousand];
        partStr += koreanUnits[3];
      }

      // 백의 자리
      const hundred = Math.floor((part % 1000) / 100);
      if (hundred > 0) {
        if (hundred > 1) partStr += koreanNumbers[hundred];
        partStr += koreanUnits[2];
      }

      // 십의 자리
      const ten = Math.floor((part % 100) / 10);
      if (ten > 0) {
        if (ten > 1) partStr += koreanNumbers[ten];
        partStr += koreanUnits[1];
      }

      // 일의 자리
      const one = part % 10;
      if (one > 0) {
        partStr += koreanNumbers[one];
      }

      result = partStr + koreanBigUnits[unitIndex] + result;
    }

    tempAmount = Math.floor(tempAmount / 10000);
    unitIndex++;
  }

  return result;
}

/**
 * 숫자를 간단한 한글 금액으로 변환하는 함수 (만, 억 단위만 사용)
 * @param amount 금액 (숫자)
 * @returns 간단한 한글 금액 문자열
 *
 * 예시:
 * - 50000000 -> "5천만"
 * - 5461131781 -> "54억"
 * - 12345678 -> "1234만"
 */
export function numberToSimpleKorean(amount: number): string {
  const intAmount = Math.round(amount);

  if (intAmount === 0) return '0';

  // 조 단위
  if (intAmount >= 1000000000000) {
    const jo = Math.floor(intAmount / 1000000000000);
    const rest = intAmount % 1000000000000;
    if (rest === 0) return `${jo}조`;

    const uk = Math.floor(rest / 100000000);
    if (uk > 0) {
      return `${jo}조 ${uk}억`;
    }
    return `${jo}조`;
  }

  // 억 단위
  if (intAmount >= 100000000) {
    const uk = Math.floor(intAmount / 100000000);
    const rest = intAmount % 100000000;
    if (rest === 0) return `${uk}억`;

    const man = Math.floor(rest / 10000);
    if (man > 0) {
      return `${uk}억 ${man}만`;
    }
    return `${uk}억`;
  }

  // 만 단위
  if (intAmount >= 10000) {
    const man = Math.floor(intAmount / 10000);
    const rest = intAmount % 10000;
    if (rest === 0) return `${man}만`;

    const chun = Math.floor(rest / 1000);
    if (chun > 0) {
      return `${man}만 ${chun}천`;
    }
    return `${man}만`;
  }

  // 천 단위
  if (intAmount >= 1000) {
    const chun = Math.floor(intAmount / 1000);
    return `${chun}천`;
  }

  return intAmount.toString();
}

/**
 * 금액을 포맷팅하고 한글 금액을 괄호에 표시하는 함수
 * @param amount 금액 (숫자)
 * @param showKorean 한글 표시 여부 (기본값: true)
 * @returns 포맷팅된 금액 문자열
 *
 * 예시:
 * - 5461131781 -> "₩5,461,131,781 (54억 6113만)"
 * - 50000000 -> "₩50,000,000 (5천만)"
 */
export function formatCurrencyWithKorean(amount: number, showKorean: boolean = true): string {
  const intAmount = Math.round(amount);
  const formattedAmount = `₩${intAmount.toLocaleString()}`;

  if (!showKorean) {
    return formattedAmount;
  }

  const koreanAmount = numberToSimpleKorean(intAmount);
  return `${formattedAmount} (${koreanAmount})`;
}

/**
 * 금액을 포맷팅만 하는 함수 (한글 제외)
 * @param amount 금액 (숫자)
 * @returns 포맷팅된 금액 문자열
 */
export function formatCurrency(amount: number): string {
  const intAmount = Math.round(amount);
  return `₩${intAmount.toLocaleString()}`;
}

/**
 * 금액과 한글을 분리해서 반환하는 함수
 * @param amount 금액 (숫자)
 * @returns { amount: string, korean: string }
 *
 * 예시:
 * - formatCurrencyWithKoreanSeparate(5461131781)
 *   -> { amount: "₩5,461,131,781", korean: "54억 6113만" }
 */
export function formatCurrencyWithKoreanSeparate(amount: number): { amount: string; korean: string } {
  const intAmount = Math.round(amount);
  return {
    amount: `₩${intAmount.toLocaleString()}`,
    korean: numberToSimpleKorean(intAmount)
  };
}

/**
 * 금액을 원 단위로 반올림하는 함수
 * @param amount 금액 (숫자)
 * @returns 반올림된 금액
 */
export function roundToWon(amount: number): number {
  return Math.round(amount);
}
