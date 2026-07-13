const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.ECOM_DATABASE_URL;
if (!dbUrl) {
  console.error('Error: ECOM_DATABASE_URL is not defined in .env file.');
  process.exit(1);
}

async function seed() {
  console.log(`Connecting to ECOM Database...`);
  try {
    await mongoose.connect(dbUrl);
    console.log('Connected successfully.');

    const db = mongoose.connection.db;

    // Seed both collections to ensure compatibility with old/new code versions
    const collections = ['users', 'customers'];

    for (const collName of collections) {
      console.log(`\n--- Seeding collection: ${collName} ---`);
      const collection = db.collection(collName);

      // 1. Seed Manager
      const managerUsername = 'ecom_manager';
      const managerEmail = 'manager@ecom.com';
      const managerPassword = 'ManagerPass123!';
      const managerHash = await bcrypt.hash(managerPassword, 12);

      const existingManager = await collection.findOne({ email: managerEmail });
      if (existingManager) {
        console.log(`Manager "${managerEmail}" already exists. Updating in ${collName}...`);
        await collection.updateOne(
          { email: managerEmail },
          {
            $set: {
              username: managerUsername,
              passwordHash: managerHash,
              name: 'Ecommerce Manager',
              type: 'admin',
              roles: ['ECOM_MANAGER'],
              status: 'ACTIVE',
              mustChangePassword: false,
              deletedAt: null,
              updatedAt: new Date(),
            },
          }
        );
      } else {
        console.log(`Creating new Manager "${managerEmail}" in ${collName}...`);
        await collection.insertOne({
          username: managerUsername,
          email: managerEmail,
          passwordHash: managerHash,
          name: 'Ecommerce Manager',
          type: 'admin',
          roles: ['ECOM_MANAGER'],
          status: 'ACTIVE',
          mustChangePassword: false,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // 2. Seed Customer
      const customerEmail = 'customer@ecom.com';
      const customerPassword = 'CustomerPass123!';
      const customerHash = await bcrypt.hash(customerPassword, 12);

      const existingCustomer = await collection.findOne({ email: customerEmail });
      if (existingCustomer) {
        console.log(`Customer "${customerEmail}" already exists. Updating in ${collName}...`);
        await collection.updateOne(
          { email: customerEmail },
          {
            $set: {
              passwordHash: customerHash,
              name: 'Ecommerce Customer',
              type: 'customer',
              roles: ['customer'],
              status: 'ACTIVE',
              emailVerified: true,
              deletedAt: null,
              updatedAt: new Date(),
            },
          }
        );
      } else {
        console.log(`Creating new Customer "${customerEmail}" in ${collName}...`);
        await collection.insertOne({
          email: customerEmail,
          passwordHash: customerHash,
          name: 'Ecommerce Customer',
          type: 'customer',
          roles: ['customer'],
          status: 'ACTIVE',
          emailVerified: true,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDatabase connection closed.');
  }
}

seed();
