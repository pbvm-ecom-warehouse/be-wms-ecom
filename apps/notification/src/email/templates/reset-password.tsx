import { ReactElement } from 'react';
import {
  Body,
  Container,
  Heading,
  Html,
  Section,
  Text,
} from '@react-email/components';

// Template đặt lại mật khẩu — hiển thị mã OTP 6 chữ số gửi cho khách hàng.
export function ResetPasswordEmail({ code }: { code: string }): ReactElement {
  return (
    <Html lang="vi">
      <Body>
        <Container>
          <Heading>Đặt lại mật khẩu</Heading>
          <Text>Mã đặt lại mật khẩu của bạn là:</Text>
          <Section>
            <Text style={{ fontSize: 32, letterSpacing: 6, fontWeight: 700 }}>
              {code}
            </Text>
          </Section>
          <Text>
            Mã hết hạn sau 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
