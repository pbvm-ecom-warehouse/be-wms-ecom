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

// Configurable inputs via CLI arguments
const adminUsername = process.argv[2] || 'ecom_manager';
const adminEmail = process.argv[3] || 'manager@ecom.com';
const adminPassword = process.argv[4] || 'ManagerPass123!';
const adminName = process.argv[5] || 'Ecommerce Manager';

async function seed() {
  console.log(`Connecting to ECOM Database...`);
  try {
    await mongoose.connect(dbUrl);
    console.log('Connected successfully.');

    const db = mongoose.connection.db;
    const adminCollection = db.collection('admin_users');

    // Check existing ecom admin
    const existing = await adminCollection.findOne({ username: adminUsername });
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    if (existing) {
      console.log(`Admin user "${adminUsername}" already exists. Updating...`);
      await adminCollection.updateOne(
        { username: adminUsername },
        {
          $set: {
            email: adminEmail,
            passwordHash,
            name: adminName,
            status: 'ACTIVE',
            mustChangePassword: false,
            updatedAt: new Date(),
          },
        }
      );
      console.log('Updated successfully.');
    } else {
      console.log(`Creating new admin user "${adminUsername}"...`);
      await adminCollection.insertOne({
        username: adminUsername,
        email: adminEmail,
        passwordHash,
        name: adminName,
        status: 'ACTIVE',
        mustChangePassword: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('Created successfully.');
    }
  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed.');
  }
}

seed();
