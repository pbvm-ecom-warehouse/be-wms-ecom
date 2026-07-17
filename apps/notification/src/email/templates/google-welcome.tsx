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

export function GoogleWelcomeEmail({ password }: { password: string }): ReactElement {
  return (
    <Html lang="vi">
      <Head />
      <Preview>Chào mừng bạn đến với MateStock — Mật khẩu đăng nhập của bạn</Preview>
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
              Đăng ký qua Google thành công
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
              Chào mừng bạn đến với MateStock
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
              Bạn đã đăng ký tài khoản thành công thông qua Google. Dưới đây là mật khẩu ngẫu nhiên được tạo tự động cho tài khoản của bạn để bạn có thể dùng để đăng nhập trực tiếp (bằng email và mật khẩu) nếu cần:
            </Text>

            {/* Password Box */}
            <Section
              style={{
                padding: '16px',
                backgroundColor: ACCENT_LIGHT,
                border: `1px dashed ${ACCENT}`,
                borderRadius: '8px',
                textAlign: 'center',
                margin: '0 0 24px',
              }}
            >
              <Text
                style={{
                  fontFamily: MONO,
                  fontSize: '18px',
                  fontWeight: '700',
                  color: INK,
                  margin: '0',
                }}
              >
                {password}
              </Text>
            </Section>

            <Text
              style={{
                color: SLATE,
                fontSize: '13px',
                margin: '20px 0 0',
                fontFamily: SANS,
              }}
            >
              Chúng tôi khuyên bạn nên đổi mật khẩu này sau khi đăng nhập trực tiếp lần đầu tiên để đảm bảo tính bảo mật.
            </Text>
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
              Cảm ơn bạn đã lựa chọn dịch vụ của chúng tôi.
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
