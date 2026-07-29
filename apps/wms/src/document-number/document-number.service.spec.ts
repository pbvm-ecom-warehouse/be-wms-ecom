import { DocumentNumberService } from './document-number.service';

describe('DocumentNumberService', () => {
  it('tăng sequence atomically và format mã theo ngày', async () => {
    const model = {
      findOneAndUpdate: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ sequence: 7 }),
        }),
      }),
    };
    const service = new DocumentNumberService(model as never);

    await expect(
      service.next('GI', new Date('2026-07-30T08:00:00.000Z')),
    ).resolves.toBe('GI-20260730-0007');
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'GI-20260730' },
      { $inc: { sequence: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  });

  it('không dùng chung sequence giữa hai loại chứng từ', async () => {
    const exec = jest
      .fn()
      .mockResolvedValueOnce({ sequence: 2 })
      .mockResolvedValueOnce({ sequence: 1 });
    const model = {
      findOneAndUpdate: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({ exec }),
      }),
    };
    const service = new DocumentNumberService(model as never);
    const date = new Date('2026-07-30T08:00:00.000Z');

    await expect(service.next('GI', date)).resolves.toBe('GI-20260730-0002');
    await expect(service.next('SHP', date)).resolves.toBe('SHP-20260730-0001');
    expect(model.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      { key: 'SHP-20260730' },
      { $inc: { sequence: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  });
});
