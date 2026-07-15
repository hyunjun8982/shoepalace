import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from datetime import datetime
from io import BytesIO
import logging

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self):
        self.smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.sender_email = os.getenv("SENDER_EMAIL", "")
        self.sender_password = os.getenv("SENDER_PASSWORD", "")

        logger.info(f"EmailService initialized: server={self.smtp_server}, email={self.sender_email}, password_len={len(self.sender_password)}")

    def send_purchase_confirmation(
        self,
        recipient_email: str,
        recipient_name: str,
        purchase_data: dict,
        items_data: list,
        pdf_content: BytesIO = None
    ) -> bool:
        """입고명세서를 이메일로 발송 (PDF 첨부)"""
        try:
            if not self.sender_email or not self.sender_password:
                logger.warning("Email credentials not configured")
                return False

            # 이메일 구성
            message = MIMEMultipart()
            message["From"] = self.sender_email
            message["To"] = recipient_email
            message["Subject"] = f"[입고확인] {purchase_data.get('transaction_no', '')} - 입고명세서"

            # HTML 이메일 본문
            html_body = self._create_email_body(recipient_name, purchase_data, items_data)
            message.attach(MIMEText(html_body, "html", "utf-8"))

            # PDF 첨부
            if pdf_content:
                pdf_content.seek(0)
                attachment = MIMEBase("application", "octet-stream")
                attachment.set_payload(pdf_content.read())
                encoders.encode_base64(attachment)
                filename = f"입고명세서_{purchase_data.get('transaction_no', '')}.pdf"
                attachment.add_header(
                    "Content-Disposition",
                    "attachment",
                    filename=("utf-8", "", filename)
                )
                message.attach(attachment)

            # SMTP 전송
            with smtplib.SMTP(self.smtp_server, self.smtp_port, timeout=10) as server:
                server.starttls()
                server.login(self.sender_email, self.sender_password)
                server.send_message(message)

            logger.info(f"Email sent successfully to {recipient_email}")
            return True

        except smtplib.SMTPAuthenticationError:
            logger.error("SMTP authentication failed - check credentials")
            return False
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Error sending email: {str(e)}")
            return False

    def _create_email_body(self, recipient_name: str, purchase_data: dict, items_data: list) -> str:
        """HTML 형식의 이메일 본문 생성"""
        transaction_no = purchase_data.get("transaction_no", "")
        purchase_date = purchase_data.get("purchase_date", "")
        total_amount = purchase_data.get("total_amount", 0)
        confirmed_at = purchase_data.get("confirmed_at", "")
        supplier = purchase_data.get("supplier", "")
        payment_card_info = purchase_data.get("payment_card_info", "")

        # 상품 목록 HTML 생성
        items_html = "<table style='width: 100%; border-collapse: collapse; margin: 15px 0;'>"
        items_html += "<tr style='background-color: #1890ff; color: white;'>"
        items_html += "<th style='border: 1px solid #ddd; padding: 10px; text-align: left;'>상품명</th>"
        items_html += "<th style='border: 1px solid #ddd; padding: 10px; text-align: center;'>사이즈</th>"
        items_html += "<th style='border: 1px solid #ddd; padding: 10px; text-align: center;'>수량</th>"
        items_html += "<th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>구매가</th>"
        items_html += "<th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>소계</th>"
        items_html += "</tr>"

        total_qty = 0
        for item in items_data:
            product_name = item.get("product_name", "")
            size = item.get("size", "-")
            quantity = item.get("quantity", 0)
            purchase_price = item.get("purchase_price", 0)
            subtotal = quantity * purchase_price
            total_qty += quantity

            items_html += "<tr>"
            items_html += f"<td style='border: 1px solid #ddd; padding: 10px;'>{product_name}</td>"
            items_html += f"<td style='border: 1px solid #ddd; padding: 10px; text-align: center;'>{size}</td>"
            items_html += f"<td style='border: 1px solid #ddd; padding: 10px; text-align: center;'>{quantity}</td>"
            items_html += f"<td style='border: 1px solid #ddd; padding: 10px; text-align: right;'>₩{purchase_price:,.0f}</td>"
            items_html += f"<td style='border: 1px solid #ddd; padding: 10px; text-align: right;'>₩{subtotal:,.0f}</td>"
            items_html += "</tr>"

        items_html += "<tr style='background-color: #f5f5f5; font-weight: bold;'>"
        items_html += f"<td colspan='2' style='border: 1px solid #ddd; padding: 10px;'></td>"
        items_html += f"<td style='border: 1px solid #ddd; padding: 10px; text-align: center;'>{total_qty}</td>"
        items_html += f"<td style='border: 1px solid #ddd; padding: 10px; text-align: right;'>합계</td>"
        items_html += f"<td style='border: 1px solid #ddd; padding: 10px; text-align: right;'>₩{total_amount:,.0f}</td>"
        items_html += "</tr>"
        items_html += "</table>"

        return f"""
        <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {{ font-family: Arial, sans-serif; color: #333; }}
                    .container {{ max-width: 700px; margin: 0 auto; padding: 20px; }}
                    .header {{ background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }}
                    .header h1 {{ margin: 0; color: #1890ff; }}
                    .section {{ margin-bottom: 25px; }}
                    .section h2 {{ margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #333; border-bottom: 2px solid #1890ff; padding-bottom: 10px; }}
                    .info-row {{ display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e0e0e0; }}
                    .info-label {{ font-weight: bold; min-width: 150px; }}
                    .info-value {{ text-align: right; flex: 1; }}
                    .footer {{ background-color: #f5f5f5; padding: 15px; border-radius: 5px; font-size: 12px; color: #666; text-align: center; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>입고명세서</h1>
                        <p>입고 확인이 완료되었습니다.</p>
                    </div>

                    <div class="section">
                        <h2>기본 정보</h2>
                        <div class="info-row">
                            <span class="info-label">거래번호:</span>
                            <span class="info-value">{transaction_no}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">구매자:</span>
                            <span class="info-value">{recipient_name}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">구매일:</span>
                            <span class="info-value">{purchase_date}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">입고확인일:</span>
                            <span class="info-value">{confirmed_at}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">구매처:</span>
                            <span class="info-value">{supplier}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">결제카드:</span>
                            <span class="info-value">{payment_card_info}</span>
                        </div>
                    </div>

                    <div class="section">
                        <h2>상품 목록</h2>
                        {items_html}
                    </div>

                    <div class="footer">
                        <p>첨부된 PDF 파일에서 더 자세한 입고명세서를 확인하실 수 있습니다.</p>
                        <p>문의사항은 담당자에게 연락주시기 바랍니다.</p>
                    </div>
                </div>
            </body>
        </html>
        """


email_service = EmailService()
