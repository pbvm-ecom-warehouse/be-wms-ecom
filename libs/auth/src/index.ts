// libs/auth = CHỈ utilities dùng chung (guard/decorator/interface), KHÔNG business logic.
// Mỗi app tự có module auth riêng (controller/service/jwt.strategy) với secret riêng.
export * from './jwt-payload.interface';
export * from './roles';
export * from './decorators/current-user.decorator';
export * from './decorators/roles.decorator';
export * from './decorators/public.decorator';
export * from './guards/jwt-auth.guard';
export * from './guards/roles.guard';
export * from './guards/customer.guard';

