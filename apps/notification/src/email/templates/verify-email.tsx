import { ReactElement } from 'react';
import {
  Body,
  Container,
  Heading,
  Html,
  Section,
  Text,
} from '@react-email/components';

// Template xác minh email — hiển thị mã OTP 6 chữ số gửi cho khách hàng.
export function VerifyEmail({ code }: { code: string }): ReactElement {
  return (
    <Html lang="vi">
      <Body>
        <Container>
          <Heading>Xác minh email</Heading>
          <Text>Mã xác minh của bạn là:</Text>
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
