import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserResponseDto } from './dto/user.response.dto';

const mockUsersService = {
  list: jest.fn(),
  getById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateRoles: jest.fn(),
  lock: jest.fn(),
  unlock: jest.fn(),
  resetPassword: jest.fn(),
  remove: jest.fn(),
};

const actor = { sub: 'admin1', roles: ['ADMIN'] };

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    }).compile();
    controller = module.get(UsersController);
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('trả PaginatedResult với data map từ UserResponseDto', async () => {
      mockUsersService.list.mockResolvedValue({
        items: [
          {
            _id: { toString: () => 'u1' },
            username: 'staff1',
            roles: ['PICKER'],
            status: 'ACTIVE',
            mustChangePassword: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        total: 1,
      });

      const result = await controller.list({ page: 1, limit: 20 });

      expect(result.items[0]).toBeInstanceOf(UserResponseDto);
      expect(result.pagination).toMatchObject({
        type: 'offset',
        page: 1,
        limit: 20,
        totalItems: 1,
      });
    });
  });

  describe('getById', () => {
    it('trả UserResponseDto — không lộ passwordHash', async () => {
      mockUsersService.getById.mockResolvedValue({
        _id: { toString: () => 'u1' },
        username: 'staff1',
        roles: ['PICKER'],
        status: 'ACTIVE',
        mustChangePassword: false,
        passwordHash: 'secret',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await controller.getById('u1');
      expect(result).toBeInstanceOf(UserResponseDto);
      expect(
        (result as Record<string, unknown>)['passwordHash'],
      ).toBeUndefined();
    });
  });

  describe('create', () => {
    it('gọi service.create với actor từ @CurrentUser', async () => {
      mockUsersService.create.mockResolvedValue({
        _id: { toString: () => 'u2' },
        username: 'new1',
        roles: ['PICKER'],
        mustChangePassword: true,
      });

      await controller.create(
        { username: 'new1', password: 'P@ss1234' },
        actor,
      );

      expect(mockUsersService.create).toHaveBeenCalledWith(
        { username: 'new1', password: 'P@ss1234' },
        actor,
      );
    });
  });

  describe('remove', () => {
    it('gọi service.remove và không trả nội dung', async () => {
      mockUsersService.remove.mockResolvedValue(undefined);
      const result = await controller.remove('u3', actor);
      expect(result).toBeUndefined();
      expect(mockUsersService.remove).toHaveBeenCalledWith('u3', actor);
    });
  });
});
