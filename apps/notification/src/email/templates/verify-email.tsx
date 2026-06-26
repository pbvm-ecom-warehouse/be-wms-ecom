import { ReactElement } from 'react';
import {
  Body,
  Column,
  Container,
  Font,
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
const ACCENT_LIGHT = '#DBEAFE';
const SLATE = '#64748B';
const SURFACE = '#F8FAFC';
const BORDER = '#E2E8F0';
const WHITE = '#FFFFFF';

// ─── Styles ────────────────────────────────────────────────────────────────
const S = {
  body: {
    backgroundColor: SURFACE,
    fontFamily: "'Inter', Arial, sans-serif",
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
    padding: '24px 40px 20px',
  },
  brandMark: {
    display: 'inline',
    color: ACCENT,
    fontSize: '20px',
    margin: '0 6px 0 0',
    lineHeight: '1',
  },
  brandName: {
    display: 'inline',
    color: INK,
    fontSize: '18px',
    fontWeight: '800',
    letterSpacing: '-0.5px',
    margin: '0',
  },
  divider: {
    borderColor: BORDER,
    borderTopWidth: '1px',
    margin: '0',
  },
  content: {
    padding: '36px 40px 32px',
  },
  eyebrow: {
    color: ACCENT,
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '1.5px',
    textTransform: 'uppercase' as const,
    margin: '0 0 12px',
  },
  headline: {
    color: INK,
    fontSize: '26px',
    fontWeight: '800',
    letterSpacing: '-0.5px',
    margin: '0 0 8px',
    lineHeight: '1.2',
  },
  subtext: {
    color: SLATE,
    fontSize: '15px',
    lineHeight: '1.6',
    margin: '0 0 32px',
  },
  otpWrapper: {
    marginBottom: '28px',
  },
  otpCell: {
    width: '60px',
    height: '64px',
    border: `2px solid ${ACCENT}`,
    borderRadius: '8px',
    backgroundColor: ACCENT_LIGHT,
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    padding: '0 4px',
  },
  otpDigit: {
    color: INK,
    fontSize: '28px',
    fontWeight: '800',
    letterSpacing: '0',
    margin: '14px 0',
    lineHeight: '1',
  },
  expiry: {
    color: SLATE,
    fontSize: '13px',
    margin: '0',
  },
  footer: {
    padding: '20px 40px 28px',
    backgroundColor: SURFACE,
  },
  footerText: {
    color: SLATE,
    fontSize: '13px',
    lineHeight: '1.6',
    margin: '0 0 12px',
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

// Template xác minh email — mã OTP 6 chữ số hiển thị dạng ô riêng biệt.
export function VerifyEmail({ code }: { code: string }): ReactElement {
  const digits = code.split('');

  return (
    <Html lang="vi">
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Arial"
          webFont={{
            url: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Arial"
          webFont={{
            url: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fAZ9hiJ-Ek-_EeA.woff2',
            format: 'woff2',
          }}
          fontWeight={800}
          fontStyle="normal"
        />
      </Head>
      <Preview>Mã xác minh MateStock của bạn: {code} — hết hạn sau 10 phút</Preview>
      <Body style={S.body}>
        <Container style={S.wrapper}>
          {/* Header */}
          <Section style={S.header}>
            <Text style={S.brandMark}>●</Text>
            <Text style={S.brandName}>MateStock</Text>
          </Section>

          <Hr style={S.divider} />

          {/* Nội dung chính */}
          <Section style={S.content}>
            <Text style={S.eyebrow}>Xác minh tài khoản</Text>
            <Text style={S.headline}>Mã xác nhận của bạn</Text>
            <Text style={S.subtext}>
              Nhập mã này để hoàn tất đăng ký. Mã chỉ dùng một lần.
            </Text>

            {/* Ô OTP — mỗi chữ số trong một ô riêng */}
            <Section style={S.otpWrapper}>
              <Row>
                {digits.map((digit, i) => (
                  <Column key={i} style={S.otpCell}>
                    <Text style={S.otpDigit}>{digit}</Text>
                  </Column>
                ))}
              </Row>
            </Section>

            <Text style={S.expiry}>
              Hết hạn sau <strong style={{ color: INK }}>10 phút</strong>.
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
