import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { WmsRole } from '@app/auth';
import { CreateUserDto } from './create-user.dto';
import { UpdateUserRoleDto } from './update-user-role.dto';
import { CreateUserResponseDto, UserResponseDto } from './user.response.dto';

describe('WMS user single-role DTOs', () => {
  it('validates one optional role when creating a user', async () => {
    const dto = plainToInstance(CreateUserDto, {
      username: 'nguyen.van.a',
      password: 'P@ssw0rd123!',
      role: WmsRole.RECEIVER,
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an array role when creating a user', async () => {
    const dto = plainToInstance(CreateUserDto, {
      username: 'nguyen.van.a',
      password: 'P@ssw0rd123!',
      role: [WmsRole.RECEIVER],
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });

  it('requires one valid role when updating a user role', async () => {
    const dto = plainToInstance(UpdateUserRoleDto, { role: WmsRole.SHIPPER });
    expect(await validate(dto)).toHaveLength(0);

    const invalidDto = plainToInstance(UpdateUserRoleDto, {
      role: [WmsRole.SHIPPER],
    });
    const errors = await validate(invalidDto);
    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });

  it('rejects assigning the retired PICKER role while keeping legacy enum compatibility', async () => {
    const dto = plainToInstance(UpdateUserRoleDto, { role: WmsRole.PICKER });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('serializes a scalar role in user response DTOs', () => {
    const user = plainToInstance(
      UserResponseDto,
      { _id: { toString: () => 'user-1' }, role: WmsRole.RECEIVER },
      { excludeExtraneousValues: true },
    );
    const createdUser = plainToInstance(
      CreateUserResponseDto,
      { _id: { toString: () => 'user-2' }, role: WmsRole.ADMIN },
      { excludeExtraneousValues: true },
    );

    expect(user).toMatchObject({ id: 'user-1', role: WmsRole.RECEIVER });
    expect(createdUser).toMatchObject({ id: 'user-2', role: WmsRole.ADMIN });
    expect(user).not.toHaveProperty('roles');
    expect(createdUser).not.toHaveProperty('roles');
  });
});
