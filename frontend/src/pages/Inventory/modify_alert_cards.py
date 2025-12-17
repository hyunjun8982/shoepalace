import re

file_path = r"c:/98.슈팔라스/입출고관리시스템/소스코드/shoepalace/frontend/src/pages/Inventory/InventoryListPage.tsx"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 재고 부족 카드 수정
old_low_stock = '''          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <Space>
              <WarningOutlined style={{ fontSize: 20, color: '#fa8c16' }} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#fa8c16', lineHeight: 1.2 }}>재고 부족</div>
                <div style={{ fontSize: 10, color: '#8c8c8c', marginTop: 2, maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {allInventory
                    .filter(item => item.is_low_stock && item.quantity > 0)
                    .slice(0, 5)
                    .map((item) => item.sku_code)
                    .join(', ')}
                  {allInventory.filter(item => item.is_low_stock && item.quantity > 0).length > 5 && ' ...'}
                </div>
              </div>
            </Space>
            <span style={{ fontSize: 20, fontWeight: 'bold', color: '#d46b08' }}>{lowStockCount}개</span>
          </div>'''

new_low_stock = '''          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: '8px'
          }}>
            <WarningOutlined style={{ fontSize: 20, color: '#fa8c16', flexShrink: 0 }} />
            <div style={{ fontSize: 16, fontWeight: 500, color: '#fa8c16', flexShrink: 0 }}>재고 부족</div>
            <div style={{
              display: 'flex',
              gap: '4px',
              flexWrap: 'nowrap',
              overflow: 'hidden',
              flex: 1
            }}>
              {allInventory
                .filter(item => item.is_low_stock && item.quantity > 0)
                .slice(0, 10)
                .map((item, index) => (
                  <Tag
                    key={index}
                    color="orange"
                    style={{
                      margin: 0,
                      fontSize: '11px',
                      flexShrink: 0
                    }}
                  >
                    {item.sku_code}
                  </Tag>
                ))}
              {allInventory.filter(item => item.is_low_stock && item.quantity > 0).length > 10 && (
                <span style={{ fontSize: '11px', color: '#8c8c8c', flexShrink: 0 }}>...</span>
              )}
            </div>
          </div>'''

# 품절 카드 수정
old_out_of_stock = '''          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <Space>
              <CloseCircleOutlined style={{ fontSize: 20, color: '#ff4d4f' }} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#ff4d4f', lineHeight: 1.2 }}>품절</div>
                <div style={{ fontSize: 10, color: '#8c8c8c', marginTop: 2, maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {allInventory
                    .filter(item => (item.available_quantity || 0) <= 0)
                    .slice(0, 5)
                    .map((item) => item.sku_code)
                    .join(', ')}
                  {allInventory.filter(item => (item.available_quantity || 0) <= 0).length > 5 && ' ...'}
                </div>
              </div>
            </Space>
            <span style={{ fontSize: 20, fontWeight: 'bold', color: '#cf1322' }}>{outOfStockCount}개</span>
          </div>'''

new_out_of_stock = '''          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: '8px'
          }}>
            <CloseCircleOutlined style={{ fontSize: 20, color: '#ff4d4f', flexShrink: 0 }} />
            <div style={{ fontSize: 16, fontWeight: 500, color: '#ff4d4f', flexShrink: 0 }}>품절</div>
            <div style={{
              display: 'flex',
              gap: '4px',
              flexWrap: 'nowrap',
              overflow: 'hidden',
              flex: 1
            }}>
              {allInventory
                .filter(item => (item.available_quantity || 0) <= 0)
                .slice(0, 10)
                .map((item, index) => (
                  <Tag
                    key={index}
                    color="red"
                    style={{
                      margin: 0,
                      fontSize: '11px',
                      flexShrink: 0
                    }}
                  >
                    {item.sku_code}
                  </Tag>
                ))}
              {allInventory.filter(item => (item.available_quantity || 0) <= 0).length > 10 && (
                <span style={{ fontSize: '11px', color: '#8c8c8c', flexShrink: 0 }}>...</span>
              )}
            </div>
          </div>'''

content = content.replace(old_low_stock, new_low_stock)
content = content.replace(old_out_of_stock, new_out_of_stock)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("알림 카드 수정 완료")
