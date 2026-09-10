from io import BytesIO
import logging
from weasyprint import HTML

logger = logging.getLogger(__name__)


def generate_sale_statement_pdf(summary_data: dict, product_summary: list, sales_data: list) -> BytesIO:
    """weasyprint를 사용하여 판매 거래명세서 PDF 생성

    summary_data: {"sale_count", "total_quantity", "total_amount", "created_date"}
    product_summary: [{"product_name", "product_code", "brand_name",
                       "size_quantities": {size: qty}, "total_quantity", "total_amount"}]
    sales_data: [{"sale_number", "sale_date", "customer_name", "seller_name",
                  "items": [{"product_name", "product_code", "size", "quantity", "price"}]}]
    """
    html_content = _create_sale_statement_html(summary_data, product_summary, sales_data)

    try:
        pdf_bytes = HTML(string=html_content).write_pdf()
        return BytesIO(pdf_bytes)
    except Exception as e:
        logger.error(f"Error converting sale statement HTML to PDF: {str(e)}")
        raise


def _sort_sizes(sizes):
    """사이즈 정렬 (숫자 우선 오름차순)"""
    def key(s):
        try:
            return (0, float(s), "")
        except (ValueError, TypeError):
            return (1, 0, str(s))
    return sorted(sizes, key=key)


def _create_sale_statement_html(summary_data: dict, product_summary: list, sales_data: list) -> str:
    """판매 거래명세서 HTML 생성"""
    sale_count = summary_data.get("sale_count", 0)
    total_quantity = summary_data.get("total_quantity", 0)
    total_amount = summary_data.get("total_amount", 0)
    created_date = summary_data.get("created_date", "")

    # 품목별 사이즈·수량 집계 테이블
    summary_rows = ""
    for p in product_summary:
        size_qty = p.get("size_quantities", {})
        size_text = ", ".join(f"{s}({size_qty[s]})" for s in _sort_sizes(size_qty.keys()))
        brand = p.get("brand_name") or ""
        brand_html = f" <span style='color:#999;font-size:10px;'>[{brand}]</span>" if brand else ""
        summary_rows += f"""
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">{p.get('product_name', '-')}{brand_html}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">{p.get('product_code', '-')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">{size_text}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center; font-weight: bold;">{p.get('total_quantity', 0)}개</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₩{p.get('total_amount', 0):,.0f}</td>
        </tr>
        """

    # 판매 건별 상세
    sales_html = ""
    for sale in sales_data:
        items_rows = ""
        subtotal_qty = 0
        subtotal_amount = 0
        for item in sale.get("items", []):
            qty = item.get("quantity", 0)
            price = item.get("price", 0)
            subtotal = qty * price
            subtotal_qty += qty
            subtotal_amount += subtotal
            items_rows += f"""
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">{item.get('product_name', '-')}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">{item.get('product_code', '-')}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">{item.get('size', '-')}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">{qty}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₩{price:,.0f}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₩{subtotal:,.0f}</td>
            </tr>
            """

        info_cells = ""
        if sale.get("sale_number"):
            info_cells += f"<td>판매번호</td><td>{sale['sale_number']}</td>"
        info_cells += f"<td>판매일</td><td>{sale.get('sale_date', '-')}</td>"
        info_cells2 = ""
        if sale.get("customer_name"):
            info_cells2 += f"<td>고객처</td><td>{sale['customer_name']}</td>"
        if sale.get("seller_name"):
            info_cells2 += f"<td>판매자</td><td>{sale['seller_name']}</td>"
        info_row2 = f"<tr>{info_cells2}</tr>" if info_cells2 else ""

        sales_html += f"""
        <div class="section">
            <table class="info-table">
                <tr>{info_cells}</tr>
                {info_row2}
            </table>
            <table class="items-table">
                <thead>
                    <tr>
                        <th style="width: 28%;">상품명</th>
                        <th style="width: 17%; text-align: center;">품번</th>
                        <th style="width: 12%; text-align: center;">사이즈</th>
                        <th style="width: 10%; text-align: center;">수량</th>
                        <th style="width: 18%; text-align: right;">판매가</th>
                        <th style="width: 15%; text-align: right;">합계</th>
                    </tr>
                </thead>
                <tbody>
                    {items_rows}
                    <tr style="background-color: #fafafa; font-weight: bold;">
                        <td colspan="3" style="padding: 8px; text-align: right;">소계</td>
                        <td style="padding: 8px; text-align: center;">{subtotal_qty}</td>
                        <td colspan="2" style="padding: 8px; text-align: right;">₩{subtotal_amount:,.0f}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>거래명세서</title>
        <style>
            @font-face {{
                font-family: 'Noto Sans CJK KR';
                src: local('Noto Sans CJK KR');
            }}
            * {{ margin: 0; padding: 0; }}
            body {{
                font-family: 'Noto Sans CJK KR', sans-serif;
                color: #333;
                line-height: 1.6;
            }}
            .container {{ max-width: 900px; margin: 0 auto; padding: 40px; }}
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
            .header p {{ color: #666; font-size: 12px; text-align: right; }}
            .section {{ margin-bottom: 30px; }}
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
            .info-table td {{ padding: 6px; border-bottom: 1px solid #ccc; }}
            .info-table td:nth-child(odd) {{
                font-weight: bold;
                width: 15%;
                background-color: #f5f5f5;
            }}
            .items-table {{
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 15px;
                border: 1px solid #ddd;
                font-size: 11px;
            }}
            .items-table thead tr {{ background-color: #1890ff; color: white; }}
            .items-table th {{
                padding: 8px;
                text-align: left;
                font-weight: bold;
                border-bottom: 2px solid #1890ff;
            }}
            .summary {{
                background-color: #f0f0f0;
                padding: 15px;
                border-radius: 4px;
                margin-top: 20px;
                text-align: right;
            }}
            .footer {{
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #ccc;
                text-align: center;
                font-size: 12px;
                color: #666;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>거 래 명 세 서</h1>
                <p>{created_date}</p>
            </div>

            <div class="section">
                <table class="info-table">
                    <tr>
                        <td>판매 건수</td><td>{sale_count}건</td>
                        <td>총 수량</td><td>{total_quantity}개</td>
                    </tr>
                    <tr>
                        <td>총 판매금액</td><td>₩{total_amount:,.0f}</td>
                        <td>작성일</td><td>{created_date}</td>
                    </tr>
                </table>
            </div>

            <div class="section">
                <div class="section-title">품목별 사이즈·수량 집계</div>
                <table class="items-table">
                    <thead>
                        <tr>
                            <th style="width: 30%;">상품명</th>
                            <th style="width: 18%; text-align: center;">품번</th>
                            <th style="width: 30%;">사이즈별 수량</th>
                            <th style="width: 10%; text-align: center;">총 수량</th>
                            <th style="width: 12%; text-align: right;">금액</th>
                        </tr>
                    </thead>
                    <tbody>
                        {summary_rows}
                        <tr style="background-color: #fafafa; font-weight: bold;">
                            <td colspan="3" style="padding: 8px; text-align: right;">합계</td>
                            <td style="padding: 8px; text-align: center;">{total_quantity}개</td>
                            <td style="padding: 8px; text-align: right;">₩{total_amount:,.0f}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {sales_html}

            <div class="summary">
                <div style="font-size: 13px; font-weight: bold;">총 판매 금액: ₩{total_amount:,.0f}</div>
            </div>

            <div class="footer">
                <p>본 명세서는 거래 확인용 문서입니다.</p>
            </div>
        </div>
    </body>
    </html>
    """

    return html
