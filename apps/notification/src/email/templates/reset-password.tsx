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
const SLATE = '#64748B';
const SURFACE = '#F8FAFC';
const BORDER = '#E2E8F0';
const WHITE = '#FFFFFF';
const WARN = '#DC2626';
const WARN_LIGHT = '#FFF5F5';
const WARN_BORDER = '#FECACA';

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
const MONO = "'Courier New', Courier, monospace";

// Template đặt lại mật khẩu — ô OTP đỏ phân biệt với verify-email.
export function ResetPasswordEmail({ code }: { code: string }): ReactElement {
  const digits = code.split('');

  return (
    <Html lang="vi">
      <Head />
      <Preview>
        Đặt lại mật khẩu MateStock: {code} — hết hạn sau 10 phút
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
                color: WARN,
                fontSize: '11px',
                fontWeight: '600',
                letterSpacing: '1.2px',
                textTransform: 'uppercase',
                margin: '0 0 12px',
                fontFamily: SANS,
              }}
            >
              Đặt lại mật khẩu
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
              Mã xác nhận bảo mật
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
              Bạn vừa yêu cầu đặt lại mật khẩu. Nhập mã bên dưới để tiếp tục.
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
                        backgroundColor: WARN_LIGHT,
                        border: `2px solid ${WARN}`,
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
                margin: '20px 0 16px',
                fontFamily: SANS,
              }}
            >
              Hết hạn sau{' '}
              <strong style={{ color: INK, fontFamily: SANS }}>10 phút</strong>.
              Mã chỉ dùng được một lần.
            </Text>

            {/* Cảnh báo bảo mật */}
            <table cellPadding="0" cellSpacing="0" style={{ width: '100%' }}>
              <tbody>
                <tr>
                  <td
                    style={{
                      backgroundColor: WARN_LIGHT,
                      border: `1px solid ${WARN_BORDER}`,
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontFamily: SANS,
                      fontSize: '13px',
                      color: WARN,
                      lineHeight: '1.5',
                    }}
                  >
                    Không chia sẻ mã này với bất kỳ ai — kể cả nhân viên
                    MateStock.
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Hr style={{ borderColor: BORDER, margin: '0' }} />

          {/* Footer */}
          <Section
            style={{ padding: '16px 32px 24px', backgroundColor: SURFACE }}
          >
            <Text
              style={{
                color: SLATE,
                fontSize: '12px',
                lineHeight: '1.6',
                margin: '0 0 8px',
                fontFamily: SANS,
              }}
            >
              Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này — tài
              khoản của bạn vẫn an toàn. Nếu lo ngại,{' '}
              <Link
                href="mailto:support@hoaiphuong.io.vn"
                style={{ color: ACCENT, textDecoration: 'none' }}
              >
                liên hệ hỗ trợ
              </Link>{' '}
              ngay.
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
