/**
 * Token DI cho Firebase Admin App.
 *
 * Tách RIÊNG khỏi firebase.module.ts để tránh circular import: trước đây
 * firebase.module import FirebaseService, còn firebase.service import token từ
 * firebase.module → khi Node nạp module trước, token chưa kịp khai báo nên
 * `@Inject(FIREBASE_ADMIN_APP)` nhận undefined → Nest không resolve được.
 * File token không import gì nên không tạo vòng lặp.
 */
export const FIREBASE_ADMIN_APP = Symbol('FIREBASE_ADMIN_APP');
