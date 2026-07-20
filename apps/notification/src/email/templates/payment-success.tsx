import { ReactElement } from 'react';
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

const INK = '#0F172A';
const ACCENT = '#16A34A';
const ACCENT_LIGHT = '#DCFCE7';
const SLATE = '#64748B';
const SURFACE = '#F8FAFC';
const BORDER = '#E2E8F0';
const WHITE = '#FFFFFF';

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";

interface PaymentSuccessProps {
  orderId: string;
  amount: number;
}

const formatVnd = (amount: number): string =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);

// Báo khách hàng thanh toán đơn hàng thành công (payment.success, Ecom → Notification).
export function PaymentSuccessEmail({
  orderId,
  amount,
}: PaymentSuccessProps): ReactElement {
  return (
    <Html lang="vi">
      <Head />
      <Preview>{`Thanh toán thành công — Đơn hàng ${orderId}`}</Preview>
      <Body
        style={{
          backgroundColor: SURFACE,
          fontFamily: SANS,
          margin: '0',
          padding: '32px 16px',
        }}
      >
        <Container
          style={{
            maxWidth: '480px',
            margin: '0 auto',
            backgroundColor: WHITE,
            borderRadius: '12px',
            border: `1px solid ${BORDER}`,
            overflow: 'hidden',
          }}
        >
          <Section style={{ padding: '20px 32px 16px' }}>
            <Text
              style={{
                margin: '0',
                fontSize: '16px',
                fontWeight: '700',
                color: INK,
                fontFamily: SANS,
              }}
            >
              <span style={{ color: ACCENT, marginRight: '6px' }}>●</span>
              MateStock
            </Text>
          </Section>

          <Hr style={{ borderColor: BORDER, margin: '0' }} />

          <Section style={{ padding: '28px 32px 24px' }}>
            <Text
              style={{
                color: ACCENT,
                fontSize: '11px',
                fontWeight: '600',
                letterSpacing: '1.2px',
                textTransform: 'uppercase',
                margin: '0 0 12px',
                fontFamily: SANS,
              }}
            >
              ✅ Thanh toán thành công
            </Text>
            <Text
              style={{
                color: INK,
                fontSize: '22px',
                fontWeight: '700',
                margin: '0 0 6px',
                fontFamily: SANS,
                letterSpacing: '-0.3px',
              }}
            >
              Đơn hàng: {orderId}
            </Text>
            <Text
              style={{
                color: SLATE,
                fontSize: '14px',
                lineHeight: '1.6',
                margin: '0 0 20px',
                fontFamily: SANS,
              }}
            >
              Cảm ơn bạn đã mua hàng tại MateStock. Đơn hàng của bạn đang được
              chuẩn bị để giao.
            </Text>

            <table
              cellPadding="0"
              cellSpacing="0"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                backgroundColor: ACCENT_LIGHT,
                borderRadius: '8px',
              }}
            >
              <tbody>
                <tr>
                  <td style={{ padding: '16px 20px' }}>
                    <Text
                      style={{
                        color: SLATE,
                        fontSize: '12px',
                        margin: '0 0 4px',
                        fontFamily: SANS,
                      }}
                    >
                      Số tiền đã thanh toán
                    </Text>
                    <Text
                      style={{
                        color: INK,
                        fontSize: '24px',
                        fontWeight: '700',
                        margin: '0',
                        fontFamily: SANS,
                      }}
                    >
                      {formatVnd(amount)}
                    </Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Hr style={{ borderColor: BORDER, margin: '0' }} />

          <Section
            style={{ padding: '16px 32px 24px', backgroundColor: SURFACE }}
          >
            <Text
              style={{
                color: '#94A3B8',
                fontSize: '11px',
                margin: '0',
                fontFamily: SANS,
              }}
            >
              © {new Date().getFullYear()} MateStock ·{' '}
              <Link
                href="mailto:support@hoaiphuong.io.vn"
                style={{ color: ACCENT, textDecoration: 'none' }}
              >
                Liên hệ hỗ trợ
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
