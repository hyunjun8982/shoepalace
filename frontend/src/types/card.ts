export enum CardType {
  CORP = 'corp',
  PERSONAL = 'personal',
}

export enum CardIssuer {
  SHINHAN = 'shinhan',
  KB = 'kb',
  HYUNDAI = 'hyundai',
  SAMSUNG = 'samsung',
  LOTTE = 'lotte',
  HANA = 'hana',
  NH = 'nh',
  WOORI = 'woori',
  SC = 'sc',
  CITI = 'citi',
  OTHER = 'other',
}

export interface Card {
  id: string;
  card_type: CardType | string;
  card_issuer: CardIssuer | string;
  card_number: string;
  owner_name: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CardCreate {
  card_type: string;
  card_issuer: string;
  card_number: string;
  owner_name: string;
  notes?: string;
}

export interface CardUpdate {
  card_type?: string;
  card_issuer?: string;
  card_number?: string;
  owner_name?: string;
  is_active?: boolean;
  notes?: string;
}

export const CARD_ISSUER_LABELS: { [key: string]: string } = {
  shinhan: '신한',
  kb: 'KB국민',
  hyundai: '현대',
  samsung: '삼성',
  lotte: '롯데',
  hana: '하나',
  nh: 'NH농협',
  woori: '우리',
  sc: 'SC제일',
  citi: '씨티',
  other: '기타',
};

export const CARD_TYPE_LABELS: { [key: string]: string } = {
  corp: '법인카드',
  personal: '개인카드',
};
