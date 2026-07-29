import { WmsRole } from '@app/auth';
import { ScrapNoteController } from './scrap-note.controller';
import { StockCountScrapController } from './stock-count-scrap.controller';

const rolesOf = (method: object): WmsRole[] =>
  Reflect.getMetadata('roles', method) as WmsRole[];

describe('Scrap note role contract', () => {
  it('không cho Receiver vào phiếu hủy/kiểm kê', () => {
    expect(rolesOf(ScrapNoteController.prototype.createScrapNote)).toEqual([
      WmsRole.ADMIN,
    ]);
    expect(rolesOf(ScrapNoteController.prototype.listScrapNotes)).toEqual([
      WmsRole.COUNTER,
      WmsRole.MANAGER,
      WmsRole.ADMIN,
    ]);
    expect(rolesOf(ScrapNoteController.prototype.getScrapNote)).not.toContain(
      WmsRole.RECEIVER,
    );
  });

  it('Counter chỉ tạo đề xuất hủy qua dòng Stock Count', () => {
    expect(
      rolesOf(StockCountScrapController.prototype.createFromStockCount),
    ).toEqual([WmsRole.COUNTER, WmsRole.ADMIN]);
  });
});
