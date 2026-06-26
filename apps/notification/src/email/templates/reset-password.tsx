import { ReactElement } from 'react';
import {
  Body,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';

// ─── Tokens (cùng design system với verify-email) ──────────────────────────
const INK = '#0F172A';
const ACCENT = '#2563EB';
const SLATE = '#64748B';
const SURFACE = '#F8FAFC';
const BORDER = '#E2E8F0';
const WHITE = '#FFFFFF';
const WARN = '#DC2626';
const WARN_LIGHT = '#FFF5F5';
const WARN_BORDER = '#FECACA';

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";

// ─── Styles ────────────────────────────────────────────────────────────────
const S = {
  body: {
    backgroundColor: SURFACE,
    fontFamily: FONT,
    margin: '0',
    padding: '32px 16px',
  },
  wrapper: {
    maxWidth: '520px',
    margin: '0 auto',
    backgroundColor: WHITE,
    borderRadius: '12px',
    border: `1px solid ${BORDER}`,
    overflow: 'hidden' as const,
  },
  header: {
    padding: '22px 36px 18px',
    backgroundColor: WHITE,
  },
  brandDot: {
    color: ACCENT,
    fontSize: '22px',
    fontWeight: '900',
    display: 'inline',
    margin: '0 5px 0 0',
    lineHeight: '1',
    verticalAlign: 'middle',
  },
  brandName: {
    color: INK,
    fontSize: '17px',
    fontWeight: '700',
    display: 'inline',
    margin: '0',
    letterSpacing: '-0.3px',
    verticalAlign: 'middle',
  },
  divider: {
    borderColor: BORDER,
    borderTopWidth: '1px',
    margin: '0',
  },
  content: {
    padding: '32px 36px 28px',
  },
  eyebrow: {
    color: WARN,
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '1.2px',
    textTransform: 'uppercase' as const,
    margin: '0 0 14px',
  },
  headline: {
    color: INK,
    fontSize: '24px',
    fontWeight: '700',
    letterSpacing: '-0.4px',
    margin: '0 0 8px',
    lineHeight: '1.25',
  },
  subtext: {
    color: SLATE,
    fontSize: '15px',
    lineHeight: '1.6',
    margin: '0 0 28px',
  },
  digitRow: {
    marginBottom: '20px',
  },
  digitCell: {
    width: '56px',
    padding: '0 4px',
    textAlign: 'center' as const,
  },
  digitBox: {
    backgroundColor: WARN_LIGHT,
    border: `1.5px solid ${WARN}`,
    borderRadius: '8px',
    padding: '14px 0',
    display: 'block',
  },
  digitChar: {
    color: INK,
    fontSize: '26px',
    fontWeight: '700',
    fontFamily: "'Courier New', Courier, monospace",
    margin: '0',
    lineHeight: '1',
  },
  expiry: {
    color: SLATE,
    fontSize: '13px',
    margin: '0 0 20px',
    lineHeight: '1.5',
  },
  warningBox: {
    backgroundColor: WARN_LIGHT,
    border: `1px solid ${WARN_BORDER}`,
    borderRadius: '8px',
    padding: '12px 16px',
  },
  warningText: {
    color: WARN,
    fontSize: '13px',
    lineHeight: '1.5',
    margin: '0',
  },
  footer: {
    padding: '18px 36px 26px',
    backgroundColor: SURFACE,
  },
  footerText: {
    color: SLATE,
    fontSize: '13px',
    lineHeight: '1.6',
    margin: '0 0 10px',
  },
  footerMeta: {
    color: '#94A3B8',
    fontSize: '12px',
    margin: '0',
  },
  footerLink: {
    color: ACCENT,
    textDecoration: 'none',
  },
} as const;

// Template đặt lại mật khẩu — ô OTP đỏ phân biệt với verify-email.
export function ResetPasswordEmail({ code }: { code: string }): ReactElement {
  const digits = code.split('');

  return (
    <Html lang="vi">
      <Head />
      <Preview>Đặt lại mật khẩu MateStock: {code} — hết hạn sau 10 phút</Preview>
      <Body style={S.body}>
        <Container style={S.wrapper}>
          {/* Header */}
          <Section style={S.header}>
            <Text style={S.brandDot}>●</Text>
            <Text style={S.brandName}>MateStock</Text>
          </Section>

          <Hr style={S.divider} />

          {/* Nội dung */}
          <Section style={S.content}>
            <Text style={S.eyebrow}>Đặt lại mật khẩu</Text>
            <Text style={S.headline}>Mã xác nhận bảo mật</Text>
            <Text style={S.subtext}>
              Bạn vừa yêu cầu đặt lại mật khẩu. Nhập mã bên dưới để tiếp tục.
            </Text>

            {/* Ô OTP đỏ — phân biệt với email xác minh */}
            <Section style={S.digitRow}>
              <Row>
                {digits.map((digit, i) => (
                  <Column key={i} style={S.digitCell}>
                    <Section style={S.digitBox}>
                      <Text style={S.digitChar}>{digit}</Text>
                    </Section>
                  </Column>
                ))}
              </Row>
            </Section>

            <Text style={S.expiry}>
              Hết hạn sau <strong style={{ color: INK }}>10 phút</strong>. Mã
              chỉ dùng được một lần.
            </Text>

            {/* Cảnh báo bảo mật */}
            <Section style={S.warningBox}>
              <Text style={S.warningText}>
                Không chia sẻ mã này với bất kỳ ai — kể cả nhân viên MateStock.
              </Text>
            </Section>
          </Section>

          <Hr style={S.divider} />

          {/* Footer */}
          <Section style={S.footer}>
            <Text style={S.footerText}>
              Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này —
              tài khoản của bạn vẫn an toàn. Nếu lo ngại,{' '}
              <Link href="mailto:support@hoaiphuong.io.vn" style={S.footerLink}>
                liên hệ hỗ trợ
              </Link>{' '}
              ngay.
            </Text>
            <Text style={S.footerMeta}>
              © {new Date().getFullYear()} MateStock ·{' '}
              <Link href="mailto:support@hoaiphuong.io.vn" style={S.footerLink}>
                Liên hệ hỗ trợ
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
