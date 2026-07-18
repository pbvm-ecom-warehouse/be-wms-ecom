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
const ACCENT = '#DC2626';
const ACCENT_LIGHT = '#FEE2E2';
const SLATE = '#64748B';
const SURFACE = '#F8FAFC';
const BORDER = '#E2E8F0';
const WHITE = '#FFFFFF';

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface StockNearExpiryProps {
  sku: string;
  lotNumber: string;
  expiryDate: string; // ISO 8601
}

// Cảnh báo lô hàng sắp hết hạn (UC-N05) — MANAGER nhận theo cron quét hằng ngày.
export function StockNearExpiryEmail({
  sku,
  lotNumber,
  expiryDate,
}: StockNearExpiryProps): ReactElement {
  const expiry = new Date(expiryDate);
  const formatted = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(expiry);
  const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / MS_PER_DAY);

  return (
    <Html lang="vi">
      <Head />
      <Preview>
        Lô {lotNumber} (SKU {sku}) hết hạn {formatted}
      </Preview>
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
              ⏰ Hàng sắp hết hạn
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
              SKU: {sku} — Lô {lotNumber}
            </Text>

            <table
              cellPadding="0"
              cellSpacing="0"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                backgroundColor: ACCENT_LIGHT,
                borderRadius: '8px',
                marginTop: '12px',
              }}
            >
              <tbody>
                <tr>
                  <td style={{ padding: '16px 20px' }}>
                    <Text
                      style={{
                        color: INK,
                        fontSize: '20px',
                        fontWeight: '700',
                        margin: '0',
                        fontFamily: SANS,
                      }}
                    >
                      Hết hạn: {formatted}
                    </Text>
                    <Text
                      style={{
                        color: SLATE,
                        fontSize: '12px',
                        margin: '4px 0 0',
                        fontFamily: SANS,
                      }}
                    >
                      {daysLeft >= 0
                        ? `Còn ${daysLeft} ngày`
                        : `Đã quá hạn ${Math.abs(daysLeft)} ngày`}
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
