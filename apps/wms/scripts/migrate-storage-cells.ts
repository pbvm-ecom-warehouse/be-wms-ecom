import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

/**
 * Chuyển dữ liệu một lần sang mô hình khoang. Script không tạo StockMovement:
 * tổng tồn và lịch sử đã ghi trước đây được giữ nguyên, tồn cũ chỉ được đánh dấu
 * cellId=null để kiểm kê/phân khoang sau qua màn vận hành.
 */
async function main() {
  const uri = process.env.WMS_DATABASE_URL;
  if (!uri) throw new Error('WMS_DATABASE_URL is required');
  const connection = await mongoose.createConnection(uri).asPromise();
  try {
    const inventory = connection.collection('inventory_stocks');
    const grns = connection.collection('goods_receipt_notes');
    const shelves = connection.collection('shelves');
    const racks = connection.collection('racks');
    const cells = connection.collection('storage_cells');
    const rackTemplates = connection.collection('rack_templates');
    const movements = connection.collection('stock_movements');
    const putAwayTasks = connection.collection('put_away_tasks');

    await inventory.updateMany(
      { cellId: { $exists: false } },
      {
        $set: {
          cellId: null,
          packageCount: 0,
        },
      },
    );

    const indexes = await inventory.indexes();
    for (const index of indexes) {
      const key = index.key as Record<string, number>;
      if (
        index.unique &&
        key.itemId === 1 &&
        key.shelfId === 1 &&
        key.lotId === 1 &&
        !('cellId' in key)
      ) {
        await inventory.dropIndex(index.name!);
      }
    }
    await inventory.createIndex(
      { itemId: 1, shelfId: 1, cellId: 1, lotId: 1 },
      { unique: true, name: 'item_shelf_cell_lot_unique' },
    );

    // Bỏ ràng buộc legacy "chỉ 1 tầng staging". Phiên bản mới cho phép cả
    // rack nhận tạm có nhiều tầng và service vẫn chặn staging trải qua 2 rack.
    const shelfIndexes = await shelves.indexes();
    for (const index of shelfIndexes) {
      const key = index.key as Record<string, number>;
      if (
        index.unique &&
        key.isStaging === 1 &&
        Object.keys(key).length === 1
      ) {
        await shelves.dropIndex(index.name!);
      }
    }
    await shelves.createIndex(
      { isStaging: 1, rackId: 1, deletedAt: 1 },
      { name: 'isStaging_1_rackId_1_deletedAt_1' },
    );

    const template = await rackTemplates.findOne({});
    const bayCount = Math.max(1, Number(template?.bayCount ?? 1));
    const levelCount = Math.max(1, Number(template?.levelCount ?? 1));
    const defaultInnerDepth = Math.max(1, Number(template?.depthM ?? 1) * 100);
    const defaultInnerWidth = Math.max(1, Number(template?.widthM ?? 1) * 100);
    const defaultInnerHeight = 100;
    const activeRacks = await racks.find({ deletedAt: null }).toArray();
    const shelvesBeforeRepair = await shelves
      .find({ deletedAt: null })
      .toArray();
    const currentStagingShelf = shelvesBeforeRepair.find(
      (shelf) => shelf.isStaging,
    );
    const preferredStagingRack =
      activeRacks.find(
        (rack) => String(rack.code).toUpperCase() === 'RACK-00',
      ) ??
      activeRacks.find((rack) =>
        String(rack.name ?? '')
          .toLocaleLowerCase('vi')
          .includes('tạm'),
      ) ??
      activeRacks.find(
        (rack) =>
          currentStagingShelf &&
          String(rack._id) === String(currentStagingShelf.rackId),
      );

    if (preferredStagingRack) {
      await shelves.updateMany(
        { deletedAt: null },
        { $set: { isStaging: false, updatedAt: new Date() } },
      );
      await shelves.updateMany(
        { rackId: preferredStagingRack._id, deletedAt: null },
        { $set: { isStaging: true, updatedAt: new Date() } },
      );
    }

    let createdShelves = 0;
    for (const rack of activeRacks) {
      const rackShelves = await shelves
        .find({ rackId: rack._id, deletedAt: null })
        .toArray();
      const isStagingRack =
        preferredStagingRack &&
        String(preferredStagingRack._id) === String(rack._id);
      for (const shelf of rackShelves) {
        await shelves.updateOne(
          { _id: shelf._id },
          {
            $set: {
              code: isStagingRack
                ? `${String(rack.code)}-T${Number(shelf.level)}`
                : shelf.code,
              innerDepth: Number(shelf.innerDepth ?? defaultInnerDepth),
              innerWidth: Number(shelf.innerWidth ?? defaultInnerWidth),
              innerHeight: Number(shelf.innerHeight ?? defaultInnerHeight),
              isStaging: Boolean(isStagingRack),
              updatedAt: new Date(),
            },
          },
        );
      }
      const existingLevels = new Set(
        rackShelves.map((shelf) => Number(shelf.level)),
      );
      for (let level = 1; level <= levelCount; level += 1) {
        if (existingLevels.has(level)) continue;
        await shelves.insertOne({
          _id: new Types.ObjectId(),
          rackId: rack._id,
          level,
          code: `${String(rack.code)}-T${level}`,
          innerDepth: defaultInnerDepth,
          innerWidth: defaultInnerWidth,
          innerHeight: defaultInnerHeight,
          fillFactor: null,
          isStaging: Boolean(isStagingRack),
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        createdShelves += 1;
      }
    }

    const stagingShelfIds = (
      await shelves.find({ deletedAt: null, isStaging: true }).toArray()
    ).map((shelf) => shelf._id);
    if (stagingShelfIds.length > 0) {
      await cells.updateMany(
        { shelfId: { $in: stagingShelfIds }, deletedAt: null },
        { $set: { deletedAt: new Date(), updatedAt: new Date() } },
      );
    }

    const activeShelves = await shelves
      .find({ deletedAt: null, isStaging: false })
      .toArray();
    for (const shelf of activeShelves) {
      const widthPerBay = Number(shelf.innerWidth ?? bayCount) / bayCount;
      const operations = Array.from({ length: bayCount }, (_, index) => {
        const bay = index + 1;
        const code = `${String(shelf.code)}-B${bay}`;
        return {
          updateOne: {
            filter: { shelfId: shelf._id, bay },
            update: {
              $setOnInsert: {
                _id: new Types.ObjectId(),
                rackId: shelf.rackId,
                shelfId: shelf._id,
                level: shelf.level,
                bay,
                code,
                barcode: code,
                status: 'ACTIVE',
                createdAt: new Date(),
              },
              $set: {
                innerDepth: Number(shelf.innerDepth ?? 1),
                innerWidth: widthPerBay,
                innerHeight: Number(shelf.innerHeight ?? 1),
                fillFactor: shelf.fillFactor ?? null,
                deletedAt: null,
                updatedAt: new Date(),
              },
            },
            upsert: true,
          },
        };
      });
      if (operations.length > 0) await cells.bulkWrite(operations);
    }

    let backfilledTaskSources = 0;
    const legacyTasks = await putAwayTasks
      .find({
        $or: [{ sourceShelfId: { $exists: false } }, { sourceShelfId: null }],
      })
      .toArray();
    for (const task of legacyTasks) {
      const receiveMovement = await movements.findOne(
        {
          refType: 'grn',
          refId: task.grnId,
          type: 'RECEIVE',
          quantity: { $gt: 0 },
        },
        { sort: { createdAt: 1 } },
      );
      if (!receiveMovement?.shelfId) continue;
      await putAwayTasks.updateOne(
        { _id: task._id },
        { $set: { sourceShelfId: receiveMovement.shelfId } },
      );
      backfilledTaskSources += 1;
    }

    await grns.updateMany({ status: 'CONFIRMED' }, [
      {
        $set: {
          status: 'APPROVED',
          approvedAt: { $ifNull: ['$approvedAt', '$updatedAt'] },
        },
      },
    ]);

    const unassigned = await inventory.countDocuments({
      cellId: null,
      quantity: { $gt: 0 },
    });
    console.log(
      JSON.stringify(
        {
          stagingRackCode: preferredStagingRack?.code ?? null,
          stagingLevels: stagingShelfIds.length,
          createdShelves,
          migratedShelves: activeShelves.length,
          levelCount,
          bayCount,
          backfilledTaskSources,
          unassignedInventoryRows: unassigned,
          stockMovementsCreated: 0,
        },
        null,
        2,
      ),
    );
  } finally {
    await connection.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
