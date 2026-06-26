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

// ─── Tokens ────────────────────────────────────────────────────────────────
const INK = '#0F172A';
const ACCENT = '#2563EB';
const ACCENT_LIGHT = '#EFF6FF';
const SLATE = '#64748B';
const SURFACE = '#F8FAFC';
const BORDER = '#E2E8F0';
const WHITE = '#FFFFFF';

// Gmail block webfont → dùng system font stack: SF Pro / Segoe UI / Arial
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
    color: ACCENT,
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
  // OTP hiển thị dạng 1 block chữ lớn — đáng tin cậy hơn ô rời trong mọi client
  otpBlock: {
    backgroundColor: ACCENT_LIGHT,
    border: `1.5px solid ${ACCENT}`,
    borderRadius: '10px',
    padding: '20px 24px',
    marginBottom: '20px',
    textAlign: 'center' as const,
  },
  otpLabel: {
    color: SLATE,
    fontSize: '12px',
    fontWeight: '600',
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    margin: '0 0 10px',
  },
  otpCode: {
    color: INK,
    fontSize: '42px',
    fontWeight: '700',
    letterSpacing: '12px',
    margin: '0',
    lineHeight: '1',
    fontFamily: "'Courier New', Courier, monospace",
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
    backgroundColor: ACCENT_LIGHT,
    border: `1.5px solid ${ACCENT}`,
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
    margin: '0',
    lineHeight: '1.5',
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

// Template xác minh email — OTP hiển thị monospace lớn, đáng tin cậy trên mọi client.
export function VerifyEmail({ code }: { code: string }): ReactElement {
  const digits = code.split('');

  return (
    <Html lang="vi">
      <Head />
      <Preview>Mã xác minh MateStock: {code} — hết hạn sau 10 phút</Preview>
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
            <Text style={S.eyebrow}>Xác minh tài khoản</Text>
            <Text style={S.headline}>Mã xác nhận của bạn</Text>
            <Text style={S.subtext}>
              Nhập mã này để hoàn tất đăng ký. Mã chỉ dùng một lần.
            </Text>

            {/* Ô OTP từng chữ số — Row/Column email-safe */}
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
          </Section>

          <Hr style={S.divider} />

          {/* Footer */}
          <Section style={S.footer}>
            <Text style={S.footerText}>
              Nếu bạn không yêu cầu mã này, hãy bỏ qua email — tài khoản của
              bạn vẫn an toàn.
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
