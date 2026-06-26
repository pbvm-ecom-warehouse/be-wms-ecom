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
const ACCENT = '#2563EB';
const ACCENT_LIGHT = '#EFF6FF';
const SLATE = '#64748B';
const SURFACE = '#F8FAFC';
const BORDER = '#E2E8F0';
const WHITE = '#FFFFFF';

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
const MONO = "'Courier New', Courier, monospace";

// Template xác minh email — OTP dùng HTML table thuần để đảm bảo layout đúng trên mọi email client.
export function VerifyEmail({ code }: { code: string }): ReactElement {
  const digits = code.split('');

  return (
    <Html lang="vi">
      <Head />
      <Preview>Mã xác minh MateStock: {code} — hết hạn sau 10 phút</Preview>
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
          {/* Header */}
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

          {/* Body */}
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
              Xác minh tài khoản
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
              Mã xác nhận của bạn
            </Text>
            <Text
              style={{
                color: SLATE,
                fontSize: '14px',
                lineHeight: '1.6',
                margin: '0 0 24px',
                fontFamily: SANS,
              }}
            >
              Nhập mã này để hoàn tất đăng ký. Mã chỉ dùng một lần.
            </Text>

            {/* OTP — HTML table thuần, email-safe tuyệt đối */}
            <table
              cellPadding="0"
              cellSpacing="0"
              style={{ borderCollapse: 'separate', borderSpacing: '6px' }}
            >
              <tbody>
                <tr>
                  {digits.map((digit, i) => (
                    <td
                      key={i}
                      style={{
                        width: '48px',
                        height: '56px',
                        backgroundColor: ACCENT_LIGHT,
                        border: `2px solid ${ACCENT}`,
                        borderRadius: '8px',
                        textAlign: 'center',
                        verticalAlign: 'middle',
                        fontFamily: MONO,
                        fontSize: '26px',
                        fontWeight: '700',
                        color: INK,
                        lineHeight: '1',
                      }}
                    >
                      {digit}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>

            <Text
              style={{
                color: SLATE,
                fontSize: '13px',
                margin: '20px 0 0',
                fontFamily: SANS,
              }}
            >
              Hết hạn sau{' '}
              <strong style={{ color: INK, fontFamily: SANS }}>10 phút</strong>.
              Mã chỉ dùng được một lần.
            </Text>
          </Section>

          <Hr style={{ borderColor: BORDER, margin: '0' }} />

          {/* Footer */}
          <Section style={{ padding: '16px 32px 24px', backgroundColor: SURFACE }}>
            <Text
              style={{
                color: SLATE,
                fontSize: '12px',
                lineHeight: '1.6',
                margin: '0 0 8px',
                fontFamily: SANS,
              }}
            >
              Nếu bạn không yêu cầu mã này, hãy bỏ qua email — tài khoản của
              bạn vẫn an toàn.
            </Text>
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
