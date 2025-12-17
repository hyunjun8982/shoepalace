import React, { useState } from 'react';
import { Card, Collapse, Typography, Space, Divider } from 'antd';
import {
  DashboardOutlined,
  ShoppingCartOutlined,
  DollarOutlined,
  InboxOutlined,
  HomeOutlined,
  TeamOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;
const { Panel } = Collapse;

const HelpPage: React.FC = () => {
  return (
    <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <QuestionCircleOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
            <Title level={2}>슈팔라스 사용 가이드</Title>
            <Paragraph style={{ fontSize: 16, color: '#666' }}>
              각 메뉴별 기능과 사용 방법을 확인하세요
            </Paragraph>
          </div>

          <Divider />

          <Collapse defaultActiveKey={['dashboard']} expandIconPosition="end">
            <Panel
              key="dashboard"
              header={
                <Space>
                  <DashboardOutlined style={{ fontSize: 20, color: '#1890ff' }} />
                  <Text strong style={{ fontSize: 16 }}>대시보드</Text>
                </Space>
              }
            >
              <Title level={4}>개요</Title>
              <Paragraph>대시보드는 재고 현황, 판매 통계, 최근 활동 등 주요 정보를 한눈에 확인할 수 있는 메인 화면입니다.</Paragraph>
              
              <Title level={4}>주요 기능</Title>
              <ul>
                <li>실시간 재고 현황 (품절, 재고 부족 알림)</li>
                <li>매출 통계 (일별, 월별)</li>
                <li>최근 구매/판매 내역</li>
                <li>인기 상품 순위</li>
                <li>브랜드별 재고 현황</li>
              </ul>
            </Panel>

            <Panel
              key="products"
              header={
                <Space>
                  <TeamOutlined style={{ fontSize: 20, color: '#52c41a' }} />
                  <Text strong style={{ fontSize: 16 }}>상품 관리</Text>
                </Space>
              }
            >
              <Title level={4}>개요</Title>
              <Paragraph>브랜드별 상품을 등록하고 관리하는 페이지입니다.</Paragraph>
              
              <Title level={4}>주요 기능</Title>
              <ul>
                <li>상품 등록: 브랜드, 상품코드, 이름, 카테고리 입력</li>
                <li>상품 검색: 브랜드, 상품명, 상품코드로 검색</li>
                <li>상품 수정/삭제</li>
                <li>이미지 업로드</li>
              </ul>
            </Panel>

            <Panel
              key="purchases"
              header={
                <Space>
                  <ShoppingCartOutlined style={{ fontSize: 20, color: '#fa8c16' }} />
                  <Text strong style={{ fontSize: 16 }}>구매 관리</Text>
                </Space>
              }
            >
              <Title level={4}>개요</Title>
              <Paragraph>공급업체로부터 상품을 구매한 내역을 관리합니다. 구매 등록 시 재고가 자동으로 증가합니다.</Paragraph>
              
              <Title level={4}>주요 기능</Title>
              <ul>
                <li>구매 등록: 상품, 사이즈, 수량, 구매가 입력</li>
                <li>구매 내역 조회</li>
                <li>거래번호 자동 생성</li>
                <li>영수증 파일 업로드</li>
              </ul>
            </Panel>

            <Panel
              key="sales"
              header={
                <Space>
                  <DollarOutlined style={{ fontSize: 20, color: '#eb2f96' }} />
                  <Text strong style={{ fontSize: 16 }}>판매 관리</Text>
                </Space>
              }
            >
              <Title level={4}>개요</Title>
              <Paragraph>고객에게 상품을 판매한 내역을 관리합니다. 판매 등록 시 재고가 자동으로 감소합니다.</Paragraph>
              
              <Title level={4}>주요 기능</Title>
              <ul>
                <li>판매 등록: 상품, 사이즈, 수량, 판매가 입력</li>
                <li>판매 상태 관리 (대기, 확정, 취소)</li>
                <li>세금계산서/거래명세서 업로드</li>
                <li>수수료 자동 계산</li>
              </ul>
            </Panel>

            <Panel
              key="inventory"
              header={
                <Space>
                  <InboxOutlined style={{ fontSize: 20, color: '#722ed1' }} />
                  <Text strong style={{ fontSize: 16 }}>재고 관리</Text>
                </Space>
              }
            >
              <Title level={4}>개요</Title>
              <Paragraph>상품별 사이즈별 재고 수량을 실시간으로 확인하고 조정할 수 있습니다.</Paragraph>
              
              <Title level={4}>주요 기능</Title>
              <ul>
                <li>재고 조회: 브랜드, 상품명, 사이즈별 검색</li>
                <li>재고 현황: 품절(0개), 재고부족(1-5개), 정상 표시</li>
                <li>재고 조정: 수량 직접 증가/감소</li>
                <li>재고 이력 추적</li>
              </ul>
              
              <Title level={4}>재고 알림</Title>
              <ul>
                <li>품절 알림: 재고가 1개 이상에서 0개로 감소 시</li>
                <li>재고 부족 알림: 재고가 6개 이상에서 5개 이하로 감소 시</li>
              </ul>
            </Panel>

            <Panel
              key="warehouses"
              header={
                <Space>
                  <HomeOutlined style={{ fontSize: 20, color: '#13c2c2' }} />
                  <Text strong style={{ fontSize: 16 }}>창고 관리</Text>
                </Space>
              }
            >
              <Title level={4}>개요</Title>
              <Paragraph>상품을 보관하는 창고를 관리하고, 창고별 재고 현황을 확인할 수 있습니다.</Paragraph>
              
              <Title level={4}>주요 기능</Title>
              <ul>
                <li>창고 등록: 이름, 위치, 연락처</li>
                <li>창고 목록 조회</li>
                <li>창고별 재고 배정</li>
              </ul>
            </Panel>
          </Collapse>

          <Card style={{ background: '#e6f7ff', border: '1px solid #91d5ff', marginTop: 24 }}>
            <Title level={4}>
              <QuestionCircleOutlined /> 추가 도움이 필요하신가요?
            </Title>
            <Paragraph>시스템 사용 중 문의사항이 있으시면 관리자에게 문의해주세요.</Paragraph>
            <Paragraph style={{ marginBottom: 0 }}>
              <Text strong>버전:</Text> 1.0.0 | <Text strong>마지막 업데이트:</Text> 2025-10-20
            </Paragraph>
          </Card>
        </Space>
      </Card>
    </div>
  );
};

export default HelpPage;
