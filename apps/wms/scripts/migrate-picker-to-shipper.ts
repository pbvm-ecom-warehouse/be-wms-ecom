import 'dotenv/config';
import mongoose from 'mongoose';

/**
 * Migration idempotent cho rollout Shipper nội bộ.
 * Chỉ đổi role scalar PICKER -> SHIPPER; không đụng lịch sử chứng từ hay GRN.
 */
async function main(): Promise<void> {
  const uri = process.env.WMS_DATABASE_URL;
  if (!uri) throw new Error('WMS_DATABASE_URL is required');

  const connection = await mongoose.createConnection(uri).asPromise();
  try {
    const result = await connection.collection('users').updateMany(
      { role: 'PICKER' },
      {
        $set: { role: 'SHIPPER', updatedAt: new Date() },
      },
    );
    console.log(
      JSON.stringify(
        {
          matched: result.matchedCount,
          migrated: result.modifiedCount,
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
