from io import BytesIO
from datetime import datetime
import logging
from weasyprint import HTML, CSS

logger = logging.getLogger(__name__)


def generate_purchase_receipt_pdf(purchase_data: dict, items_data: list) -> BytesIO:
    """weasyprint를 사용하여 입고명세서 PDF 생성"""
    html_content = _create_purchase_receipt_html(purchase_data, items_data)

    try:
        # weasyprint로 HTML을 PDF로 변환
        pdf_bytes = HTML(string=html_content).write_pdf()
        return BytesIO(pdf_bytes)
    except Exception as e:
        logger.error(f"Error converting HTML to PDF with weasyprint: {str(e)}")
        raise


def _create_purchase_receipt_html(purchase_data: dict, items_data: list) -> str:
    """입고명세서 HTML 생성"""
    transaction_no = purchase_data.get("transaction_no", "")
    buyer_name = purchase_data.get("buyer_name", "")
    purchase_date = purchase_data.get("purchase_date", "")
    confirmed_at = purchase_data.get("confirmed_at", "")
    supplier = purchase_data.get("supplier", "-")
    payment_card_info = purchase_data.get("payment_card_info", "")
    total_amount = purchase_data.get("total_amount", 0)
    notes = purchase_data.get("notes", "없음")

    # 상품 목록 HTML 생성
    items_html = ""
    total_qty = 0
    for item in items_data:
        product_name = item.get("product_name", "")
        size = item.get("size", "-")
        quantity = item.get("quantity", 0)
        purchase_price = item.get("purchase_price", 0)
        subtotal = quantity * purchase_price
        total_qty += quantity

        items_html += f"""
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">{product_name}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">{size}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">{quantity}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₩{purchase_price:,.0f}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₩{subtotal:,.0f}</td>
        </tr>
        """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>입고명세서 - {transaction_no}</title>
        <style>
            @font-face {{
                font-family: 'Noto Sans CJK KR';
                src: local('Noto Sans CJK KR');
            }}

            * {{
                margin: 0;
                padding: 0;
            }}
            body {{
                font-family: 'Noto Sans CJK KR', sans-serif;
                color: #333;
                line-height: 1.6;
            }}
            .container {{
                max-width: 900px;
                margin: 0 auto;
                padding: 40px;
            }}
            .header {{
                text-align: center;
                margin-bottom: 40px;
                padding-bottom: 20px;
                border-bottom: 2px solid #1890ff;
            }}
            .header h1 {{
                font-size: 28px;
                font-weight: bold;
                color: #1890ff;
                letter-spacing: 4px;
                margin-bottom: 10px;
            }}
            .header p {{
                color: #666;
                font-size: 12px;
                text-align: right;
            }}
            .section {{
                margin-bottom: 30px;
            }}
            .section-title {{
                font-size: 12px;
                font-weight: bold;
                color: #333;
                margin-bottom: 10px;
                padding-bottom: 8px;
                border-bottom: 2px solid #1890ff;
            }}
            .info-table {{
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 15px;
                font-size: 11px;
            }}
            .info-table td {{
                padding: 6px;
                border-bottom: 1px solid #ccc;
            }}
            .info-table td:nth-child(odd) {{
                font-weight: bold;
                width: 20%;
                background-color: #f5f5f5;
            }}
            .items-table {{
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 15px;
                border: 1px solid #ddd;
                font-size: 11px;
            }}
            .items-table thead tr {{
                background-color: #1890ff;
                color: white;
            }}
            .items-table th {{
                padding: 8px;
                text-align: left;
                font-weight: bold;
                border-bottom: 2px solid #1890ff;
            }}
            .items-table th:nth-child(2),
            .items-table th:nth-child(3) {{
                text-align: center;
            }}
            .items-table th:nth-child(4),
            .items-table th:nth-child(5) {{
                text-align: right;
            }}
            .summary-row {{
                padding: 10px;
                font-weight: bold;
                background-color: #fafafa;
                border-bottom: 1px solid #ddd;
            }}
            .summary-row:last-child {{
                background-color: #f0f0f0;
                border-top: 2px solid #1890ff;
            }}
            .summary {{
                background-color: #f0f0f0;
                padding: 15px;
                border-radius: 4px;
                margin-top: 20px;
                text-align: right;
            }}
            .summary-item {{
                margin-bottom: 6px;
                font-size: 12px;
            }}
            .summary-item strong {{
                font-size: 13px;
                color: #1890ff;
            }}
            .footer {{
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #ccc;
                text-align: center;
                font-size: 12px;
                color: #666;
            }}
            .footer p {{
                margin-bottom: 5px;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>입 고 명 세 서</h1>
                <p>작성일자 : {confirmed_at}</p>
            </div>

            <div class="section">
                <div class="section-title">기본 정보</div>
                <table class="info-table">
                    <tr>
                        <td>거래번호</td>
                        <td>{transaction_no}</td>
                        <td>구매자</td>
                        <td>{buyer_name}</td>
                    </tr>
                    <tr>
                        <td>구매일</td>
                        <td>{purchase_date}</td>
                        <td>입고확인일</td>
                        <td>{confirmed_at}</td>
                    </tr>
                    <tr>
                        <td>구매처</td>
                        <td>{supplier}</td>
                        <td>결제카드</td>
                        <td>{payment_card_info}</td>
                    </tr>
                </table>
            </div>

            <div class="section">
                <div class="section-title">상품 목록</div>
                <table class="items-table">
                    <thead>
                        <tr>
                            <th>상품명</th>
                            <th>사이즈</th>
                            <th>수량</th>
                            <th>구매가</th>
                            <th>합계</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items_html}
                        <tr class="summary-row" style="text-align: right;">
                            <td colspan="2"></td>
                            <td style="text-align: center;">{total_qty}</td>
                            <td>합계</td>
                            <td>₩{total_amount:,.0f}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="summary">
                <div class="summary-item">총 수량: <strong>{total_qty}개</strong></div>
                <div class="summary-item">총 금액: <strong>₩{total_amount:,.0f}</strong></div>
            </div>

        </div>
    </body>
    </html>
    """

    return html
