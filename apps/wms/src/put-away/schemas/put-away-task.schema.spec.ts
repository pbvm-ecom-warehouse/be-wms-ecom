import { Types } from 'mongoose';
import { PutAwayTaskSchema, PutAwayTaskStatus } from './put-away-task.schema';

describe('PutAwayTaskSchema', () => {
  it('mặc định status = PENDING khi tạo mới', () => {
    const Model = require('mongoose').model(
      'PutAwayTaskTest',
      PutAwayTaskSchema,
    );
    const doc = new Model({
      grnId: new Types.ObjectId(),
      items: [
        {
          itemId: new Types.ObjectId(),
          lotId: null,
          quantity: 20,
          remainingQty: 20,
        },
      ],
      createdBy: new Types.ObjectId(),
    });
    expect(doc.status).toBe(PutAwayTaskStatus.PENDING);
    expect(doc.items).toHaveLength(1);
    expect(doc.items[0].remainingQty).toBe(20);
  });

  it('collection name là put_away_tasks', () => {
    expect(PutAwayTaskSchema.get('collection')).toBe('put_away_tasks');
  });
});
