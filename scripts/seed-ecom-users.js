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
    const userCollection = db.collection('users');

    // 1. Seed ECOM_MANAGER (admin)
    const managerUsername = 'ecom_manager';
    const managerEmail = 'manager@ecom.com';
    const managerPassword = 'ManagerPass123!';
    const managerHash = await bcrypt.hash(managerPassword, 12);

    const existingManager = await userCollection.findOne({ email: managerEmail });
    if (existingManager) {
      console.log(`Manager "${managerEmail}" already exists. Updating...`);
      await userCollection.updateOne(
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
            updatedAt: new Date(),
          },
        }
      );
      console.log('Manager updated.');
    } else {
      console.log(`Creating new Manager "${managerEmail}"...`);
      await userCollection.insertOne({
        username: managerUsername,
        email: managerEmail,
        passwordHash: managerHash,
        name: 'Ecommerce Manager',
        type: 'admin',
        roles: ['ECOM_MANAGER'],
        status: 'ACTIVE',
        mustChangePassword: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('Manager created.');
    }

    // 2. Seed Customer
    const customerEmail = 'customer@ecom.com';
    const customerPassword = 'CustomerPass123!';
    const customerHash = await bcrypt.hash(customerPassword, 12);

    const existingCustomer = await userCollection.findOne({ email: customerEmail });
    if (existingCustomer) {
      console.log(`Customer "${customerEmail}" already exists. Updating...`);
      await userCollection.updateOne(
        { email: customerEmail },
        {
          $set: {
            passwordHash: customerHash,
            name: 'Ecommerce Customer',
            type: 'customer',
            roles: ['customer'],
            status: 'ACTIVE',
            emailVerified: true,
            updatedAt: new Date(),
          },
        }
      );
      console.log('Customer updated.');
    } else {
      console.log(`Creating new Customer "${customerEmail}"...`);
      await userCollection.insertOne({
        email: customerEmail,
        passwordHash: customerHash,
        name: 'Ecommerce Customer',
        type: 'customer',
        roles: ['customer'],
        status: 'ACTIVE',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('Customer created.');
    }

  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed.');
  }
}

seed();
