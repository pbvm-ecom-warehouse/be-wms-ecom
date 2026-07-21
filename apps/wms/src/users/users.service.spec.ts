import { UsersService } from './users.service';
import { UserStatus } from './schemas/user.schema';

const makeUserRepo = () => ({
  findAll: jest.fn(),
  findActiveById: jest.fn(),
  create: jest.fn(),
  updateProfile: jest.fn(),
  updateRoles: jest.fn(),
  updateStatus: jest.fn(),
  updatePassword: jest.fn(),
  softDelete: jest.fn(),
});

const makeRefreshRepo = () => ({
  revokeAllForUser: jest.fn(),
});

// Id giả nhưng hợp lệ dạng Mongo ObjectId (24 hex char) — bắt buộc vì
// UsersService.objectId() validate id bằng Types.ObjectId.isValid() TRƯỚC
// khi gọi vào repo (kể cả repo đã mock), string tùy ý như 'admin1' sẽ bị
// chặn ở bước validate và không bao giờ chạm tới mock.
const ADMIN_ACTOR_ID = '6a5f13c791e8fea26de53bac';
const MANAGER_ACTOR_ID = '6a5f13c791e8fea26de53bad';
const TARGET_ID = '6a5f13c791e8fea26de53bae';
const OTHER_TARGET_ID = '6a5f13c791e8fea26de53baf';
const MISSING_ID = '6a5f13c791e8fea26de53bb0';

const adminActor = { sub: ADMIN_ACTOR_ID, roles: ['ADMIN'] };
const managerActor = { sub: MANAGER_ACTOR_ID, roles: ['MANAGER'] };

describe('UsersService', () => {
  let svc: UsersService;
  let userRepo: ReturnType<typeof makeUserRepo>;
  let refreshRepo: ReturnType<typeof makeRefreshRepo>;

  beforeEach(() => {
    userRepo = makeUserRepo();
    refreshRepo = makeRefreshRepo();
    svc = new UsersService(userRepo as never, refreshRepo as never);
  });

  describe('create — rule leo thang quyền', () => {
    it('MANAGER tạo user với roles chứa ADMIN → throw USER_FORBIDDEN_ADMIN_TARGET', async () => {
      await expect(
        svc.create(
          { username: 'x', password: 'p', roles: ['ADMIN'] },
          managerActor,
        ),
      ).rejects.toMatchObject({ code: 'USER_FORBIDDEN_ADMIN_TARGET' });
      expect(userRepo.create).not.toHaveBeenCalled();
    });

    it('MANAGER tạo user role thường → OK', async () => {
      userRepo.create.mockResolvedValue({ _id: 'u1' });
      await expect(
        svc.create(
          { username: 'x', password: 'p', roles: ['PICKER'] },
          managerActor,
        ),
      ).resolves.toMatchObject({ _id: 'u1' });
    });

    it('ADMIN tạo user role ADMIN → OK', async () => {
      userRepo.create.mockResolvedValue({ _id: 'u1' });
      await expect(
        svc.create(
          { username: 'x', password: 'p', roles: ['ADMIN'] },
          adminActor,
        ),
      ).resolves.toMatchObject({ _id: 'u1' });
    });
  });

  describe('update/lock/unlock/resetPassword — chặn MANAGER thao tác target ADMIN', () => {
    const adminTarget = {
      _id: TARGET_ID,
      roles: ['ADMIN'],
      username: 'admin2',
    };

    it('update: MANAGER sửa user hiện có role ADMIN → throw', async () => {
      userRepo.findActiveById.mockResolvedValue(adminTarget);
      await expect(
        svc.update(TARGET_ID, { name: 'x' }, managerActor),
      ).rejects.toMatchObject({ code: 'USER_FORBIDDEN_ADMIN_TARGET' });
      expect(userRepo.updateProfile).not.toHaveBeenCalled();
    });

    it('lock: MANAGER khóa user ADMIN → throw', async () => {
      userRepo.findActiveById.mockResolvedValue(adminTarget);
      await expect(svc.lock(TARGET_ID, managerActor)).rejects.toMatchObject({
        code: 'USER_FORBIDDEN_ADMIN_TARGET',
      });
      expect(userRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('resetPassword: MANAGER reset password user ADMIN → throw', async () => {
      userRepo.findActiveById.mockResolvedValue(adminTarget);
      await expect(
        svc.resetPassword(TARGET_ID, 'TempP@ss123!', managerActor),
      ).rejects.toMatchObject({ code: 'USER_FORBIDDEN_ADMIN_TARGET' });
    });

    it('ADMIN khóa user ADMIN khác → OK, revoke token', async () => {
      userRepo.findActiveById.mockResolvedValue(adminTarget);
      userRepo.updateStatus.mockResolvedValue({
        _id: TARGET_ID,
        status: UserStatus.LOCKED,
      });
      await svc.lock(TARGET_ID, adminActor);
      expect(refreshRepo.revokeAllForUser).toHaveBeenCalledWith(TARGET_ID);
    });
  });

  describe('lock/unlock — idempotency (gọi lại khi user đã ở đúng trạng thái)', () => {
    const pickerTarget = { _id: TARGET_ID, roles: ['PICKER'] };

    it('lock user đã LOCKED sẵn → vẫn OK, không throw, vẫn revoke token', async () => {
      userRepo.findActiveById.mockResolvedValue({
        ...pickerTarget,
        status: UserStatus.LOCKED,
      });
      userRepo.updateStatus.mockResolvedValue({
        _id: TARGET_ID,
        status: UserStatus.LOCKED,
      });

      await expect(svc.lock(TARGET_ID, adminActor)).resolves.toMatchObject({
        status: UserStatus.LOCKED,
      });
      expect(userRepo.updateStatus).toHaveBeenCalledWith(
        TARGET_ID,
        UserStatus.LOCKED,
        expect.anything(),
      );
      expect(refreshRepo.revokeAllForUser).toHaveBeenCalledWith(TARGET_ID);
    });

    it('unlock user đã ACTIVE sẵn → vẫn OK, không throw', async () => {
      userRepo.findActiveById.mockResolvedValue({
        ...pickerTarget,
        status: UserStatus.ACTIVE,
      });
      userRepo.updateStatus.mockResolvedValue({
        _id: TARGET_ID,
        status: UserStatus.ACTIVE,
      });

      await expect(svc.unlock(TARGET_ID, adminActor)).resolves.toMatchObject({
        status: UserStatus.ACTIVE,
      });
      expect(userRepo.updateStatus).toHaveBeenCalledWith(
        TARGET_ID,
        UserStatus.ACTIVE,
        expect.anything(),
      );
    });
  });

  describe('updateRoles — chặn cả gán mới lẫn target hiện có ADMIN', () => {
    it('MANAGER gán role ADMIN cho user thường → throw', async () => {
      userRepo.findActiveById.mockResolvedValue({
        _id: OTHER_TARGET_ID,
        roles: ['PICKER'],
      });
      await expect(
        svc.updateRoles(OTHER_TARGET_ID, ['ADMIN'], managerActor),
      ).rejects.toMatchObject({ code: 'USER_FORBIDDEN_ADMIN_TARGET' });
    });
  });

  describe('remove', () => {
    it('tự xóa chính mình → throw USER_CANNOT_DELETE_SELF, không query DB', async () => {
      await expect(
        svc.remove(ADMIN_ACTOR_ID, adminActor),
      ).rejects.toMatchObject({ code: 'USER_CANNOT_DELETE_SELF' });
      expect(userRepo.findActiveById).not.toHaveBeenCalled();
    });

    it('MANAGER xóa user ADMIN → throw USER_FORBIDDEN_ADMIN_TARGET', async () => {
      userRepo.findActiveById.mockResolvedValue({
        _id: TARGET_ID,
        roles: ['ADMIN'],
      });
      await expect(svc.remove(TARGET_ID, managerActor)).rejects.toMatchObject({
        code: 'USER_FORBIDDEN_ADMIN_TARGET',
      });
      expect(userRepo.softDelete).not.toHaveBeenCalled();
    });

    it('xóa hợp lệ → gọi softDelete', async () => {
      userRepo.findActiveById.mockResolvedValue({
        _id: TARGET_ID,
        roles: ['PICKER'],
      });
      userRepo.softDelete.mockResolvedValue(true);
      await svc.remove(TARGET_ID, managerActor);
      expect(userRepo.softDelete).toHaveBeenCalledWith(
        TARGET_ID,
        expect.anything(),
      );
    });
  });

  describe('getById', () => {
    it('throw USER_NOT_FOUND khi không tìm thấy', async () => {
      userRepo.findActiveById.mockResolvedValue(null);
      await expect(svc.getById(MISSING_ID)).rejects.toMatchObject({
        code: 'USER_NOT_FOUND',
      });
    });
  });
});
