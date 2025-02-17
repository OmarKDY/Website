export interface SalesSummaryDto {
  cashSalesTotal: number;       // اجمالي مبيعات نقدي
  user: string;                 // مستخدم
  returnTotal: number;          // اجمالي مرتجع
  visaSalesTotal: number;       // اجمالي فيزا
  netCash: number;              // صافي النقدي
  totalDiscount: number;        // الخصم
  netTotal: number;             // الصافي
  drawerBalance: number;        // رصيد الدرج (input by user)
  deficit: number;              // العجز
}