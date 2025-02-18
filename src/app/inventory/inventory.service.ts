import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Inventory } from '@core/domain-classes/inventory';
import { InventoryHistory } from '@core/domain-classes/inventory-history';
import { InventoryHistoryResourceParameter } from '@core/domain-classes/inventory-history-resource-parameter';
import { InventoryResourceParameter } from '@core/domain-classes/inventory-resource-parameter';
import { Observable } from 'rxjs';

interface ProductSearchResponse {
  id: string;      // lowercase to match backend
  name: string;    // lowercase
  barcode: string; // lowercase
  stock: number;   // lowercase
}

interface StockTakingItem{
  productId: string;      // lowercase to match backend
  actualStock: number;   // lowercase
  difference: number;    // lowercase
  warehouseId: string;
}

@Injectable({
  providedIn: 'root'
})
export class InventoryService {
  private apiUrl = 'https://localhost:44380/api';

  constructor(private http: HttpClient) { }

  getInventories(
    resourceParams: InventoryResourceParameter
  ): Observable<HttpResponse<Inventory[]>> {
    const url = 'inventory';
    const customParams = new HttpParams()
      .set('Fields', resourceParams.fields)
      .set('OrderBy', resourceParams.orderBy)
      .set('PageSize', resourceParams.pageSize.toString())
      .set('Skip', resourceParams.skip.toString())
      .set('SearchQuery', resourceParams.searchQuery)
      .set('productName', resourceParams.productName ? resourceParams.productName : '')

    return this.http.get<Inventory[]>(url, {
      params: customParams,
      observe: 'response',
    });

  }

  getInventoriesReport(
    resourceParams: InventoryResourceParameter
  ): Observable<HttpResponse<Inventory[]>> {
    const url = 'inventory';
    const customParams = new HttpParams()
      .set('Fields', resourceParams.fields)
      .set('OrderBy', resourceParams.orderBy)
      .set('PageSize', 0)
      .set('Skip', 0)
      .set('SearchQuery', resourceParams.searchQuery)
      .set('productName', resourceParams.productName ? resourceParams.productName : '')

    return this.http.get<Inventory[]>(url, {
      params: customParams,
      observe: 'response',
    });

  }

  addInventory(inventory: Inventory): Observable<Inventory> {
    const url = 'inventory';
    return this.http.post<Inventory>(url, inventory);
  }

  getInventoryHistories(
    resourceParams: InventoryHistoryResourceParameter
  ): Observable<HttpResponse<InventoryHistory[]>> {
    const url = 'inventory/history';
    const customParams = new HttpParams()
      .set('Fields', resourceParams.fields)
      .set('OrderBy', resourceParams.orderBy)
      .set('PageSize', resourceParams.pageSize.toString())
      .set('Skip', resourceParams.skip.toString())
      .set('SearchQuery', resourceParams.searchQuery)
      .set('productId', resourceParams.productId)

    return this.http.get<InventoryHistory[]>(url, {
      params: customParams,
      observe: 'response',
    });
  }

// Stock Taking Logic

getStockItems(): Observable<any[]> {
  return this.http.get<any[]>(`stocktaking/inventories`);
}

updateStockItems(items: StockTakingItem[]): Observable<any> {
  const payload = items.map(item => ({
    ProductId: item.productId,
    ActualStock: item.actualStock,
    WarehouseId: item.warehouseId, // Add warehouse ID
    Notes: `Stock adjustment - ${item.difference} units`
  }));

  return this.http.put(`stocktaking`, payload);
}

rollbackStockTaking(): Observable<any> {
  return this.http.post(`stocktaking/rollback`, {});
}

searchProductByBarcodeOrName(query: string, warehouseId: string): Observable<ProductSearchResponse[]> {
  return this.http.get<ProductSearchResponse[]>(`stocktaking/search`, { 
    params: { 
      query, 
      warehouseId
    } 
  });
}
getWarehouses(): Observable<{ id: string, name: string }[]> {
  return this.http.get<{ id: string, name: string }[]>(`warehouses`);
}
}
