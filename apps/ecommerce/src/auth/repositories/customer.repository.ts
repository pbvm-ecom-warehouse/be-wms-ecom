import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer, CustomerStatus } from '../schemas/customer.schema';

export interface CreateCustomerInput {
  email: string;
  passwordHash: string;
  name?: string;
  phone?: string;
}

@Injectable()
export class CustomerRepository {
  constructor(
    @InjectModel(Customer.name) private readonly model: Model<Customer>,
  ) {}

  /** Kiểm tra email đã đăng ký chưa (chỉ lấy _id để nhẹ). */
  findByEmail(email: string) {
    return this.model.findOne({ email }).select('_id').lean().exec();
  }

  /** Tìm khách đang hoạt động theo email, mặc định không kèm passwordHash. */
  findActiveByEmail(email: string, includePasswordHash = false) {
    const q = this.model.findOne({
      email,
      deletedAt: null,
      status: CustomerStatus.ACTIVE,
    });
    return (includePasswordHash ? q.select('+passwordHash') : q).exec();
  }

  findActiveById(id: string) {
    return this.model.findOne({ _id: id, deletedAt: null }).exec();
  }

  create(data: CreateCustomerInput) {
    return this.model.create(data);
  }
}
