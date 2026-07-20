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
const ACCENT = '#D97706';
const ACCENT_LIGHT = '#FEF3C7';
const SLATE = '#64748B';
const SURFACE = '#F8FAFC';
const BORDER = '#E2E8F0';
const WHITE = '#FFFFFF';

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";

interface StockLowAlertProps {
  sku: string;
  warehouseId: string;
  available: number;
  minQuantity: number;
}

// Cảnh báo tồn kho thấp (UC-N04) — MANAGER nhận khi available < minQuantity.
export function StockLowAlertEmail({
  sku,
  warehouseId,
  available,
  minQuantity,
}: StockLowAlertProps): ReactElement {
  const percent =
    minQuantity > 0 ? Math.round((available / minQuantity) * 100) : 0;

  return (
    <Html lang="vi">
      <Head />
      <Preview>{`Tồn kho thấp — SKU ${sku}: còn ${available}/${minQuantity}`}</Preview>
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
              ⚠️ Tồn kho thấp
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
              SKU: {sku}
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
              Kho <strong style={{ color: INK }}>{warehouseId}</strong> đang có
              tồn dưới ngưỡng tối thiểu.
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
                        color: INK,
                        fontSize: '28px',
                        fontWeight: '700',
                        margin: '0',
                        fontFamily: SANS,
                      }}
                    >
                      {available} / {minQuantity}
                    </Text>
                    <Text
                      style={{
                        color: SLATE,
                        fontSize: '12px',
                        margin: '4px 0 0',
                        fontFamily: SANS,
                      }}
                    >
                      Còn {percent}% so với ngưỡng tối thiểu
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
